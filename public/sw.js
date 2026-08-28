/*
 * 119 Helper — 서비스 워커 (오프라인 지원)
 *
 * 캐시 구조:
 *   - SHELL  (버전 종속): HTML·favicon·manifest·폰트 — 설치 시 프리캐시
 *   - ASSET  (버전 종속): /assets/(해시된 JS/CSS)·/fonts/ — cache-first (불변)
 *   - DATA   (버전 독립): /firewater/·/data/ 등 정적 데이터 JSON·이미지
 *                         — stale-while-revalidate (캐시 즉시 응답 + 백그라운드 갱신)
 *                         관할 오프라인 데이터가 들어가므로 앱 버전 올려도 보존된다.
 *
 * 전략:
 *   - HTML(네비게이션): network-first → 끊기면 캐시된 셸
 *   - 외부 API(Cloudflare Worker 등): network-only (앱이 localStorage 캐시로 폴백)
 *
 * 주의: /firewater/ 등 데이터 JSON은 해시가 없어 cache-first로 두면
 * 영영 갱신되지 않는다 (소화전 데이터는 매달 갱신됨). 반드시 SWR로.
 */

const CACHE_VERSION = 'v6';
const SHELL_CACHE = `119-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `119-assets-${CACHE_VERSION}`;
const DATA_CACHE = '119-data-v2'; // 좌표 정밀도 계약 v2 — 이전 무표시 JSON과 분리
const KEEP_CACHES = [SHELL_CACHE, ASSET_CACHE, DATA_CACHE];
const DATA_CACHE_MAX_ENTRIES = 800;
const DATA_CACHE_PRUNE_COUNT = 80;

function isLegacyImagePath(pathname) {
  return pathname === '/images/safety_equipment.png'
    || pathname === '/images/Gemini_Generated_Image_swyu86swyu86swyu.png'
    || /^\/images\/regions\/[^/]+\.png$/i.test(pathname)
    || /^\/images\/weather\/[^/]+\.png$/i.test(pathname)
    || /^\/images\/tools\/Gemini_Generated_Image_[^/]+\.png$/i.test(pathname)
    || /^\/images\/tools\/bg_(?:building|checklist|er|hazmat|shelter|timer|water|wildfire)\.png$/i.test(pathname);
}

async function removeLegacyImagesFromDataCache() {
  const cache = await caches.open(DATA_CACHE);
  const requests = await cache.keys();
  await Promise.all(
    requests
      .filter((request) => isLegacyImagePath(new URL(request.url).pathname))
      .map((request) => cache.delete(request))
  );
}

// 오프라인에서도 최소한 앱 셸이 뜨도록 미리 캐시할 항목
// 폰트 포함: 아이콘이 폰트 기반(Material Symbols)이라 없으면 오프라인 UI가 깨짐
const PRECACHE_URLS = [
  '/favicon.svg',
  '/manifest.json',
  '/theme-init.js',
  '/fonts/material-symbols-outlined.woff2',
  '/fonts/inter-latin.woff2',
  '/fonts/manrope-latin.woff2',
];

async function precacheAppShell() {
  const shellCache = await caches.open(SHELL_CACHE);

  // HTML은 둘 중 하나라도 빠지면 오프라인 진입을 보장할 수 없으므로 설치를 재시도한다.
  await Promise.all(['/', '/index.html'].map((url) => shellCache.add(url)));
  await Promise.allSettled(PRECACHE_URLS.map((url) => shellCache.add(url)));

  // Vite 해시가 붙은 현재 빌드의 진입 JS/CSS도 설치 완료 전에 캐시한다.
  // 페이지 첫 렌더의 fetch 캐시에만 의존하면, 느린 기기에서 즉시 오프라인 전환 시
  // HTML만 뜨고 앱 번들이 없어 백지 화면이 될 수 있다.
  const indexResponse = await shellCache.match('/index.html');
  if (!indexResponse) throw new Error('index.html precache missing');
  const html = await indexResponse.text();
  const entryAssets = [...html.matchAll(/(?:src|href)="(\/assets\/[^"?#]+)"/g)]
    .map((match) => match[1]);
  if (entryAssets.length === 0) throw new Error('entry assets not found');

  const assetCache = await caches.open(ASSET_CACHE);
  await Promise.all([...new Set(entryAssets)].map((url) => assetCache.add(url)));
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheAppShell());
  // 주의: 여기서 skipWaiting()을 호출하면 새 배포가 사용자 작업 중에
  // 화면을 강제 새로고침시킨다(현장 입력 유실 위험). 대신 새 SW는 waiting 상태로
  // 남고, 사용자가 "업데이트" 버튼을 눌렀을 때(applyUpdate → SKIP_WAITING)만 적용한다.
  // 기존 활성 SW가 없는 첫 방문에는 waiting 없이 바로 활성화되므로 영향 없다.
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !KEEP_CACHES.includes(key)).map((key) => caches.delete(key))
      );
      await removeLegacyImagesFromDataCache();
      await self.clients.claim();
    })()
  );
});

// 페이지가 즉시 갱신을 요청하면 대기 중인 SW를 활성화
function loadedAssetUrl(value) {
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin && url.pathname.startsWith('/assets/')
      ? url.href
      : null;
  } catch {
    return null;
  }
}

async function cacheLoadedAssets(values) {
  const urls = [...new Set(values.map(loadedAssetUrl).filter(Boolean))];
  const cache = await caches.open(ASSET_CACHE);
  const results = await Promise.allSettled(urls.map(async (url) => {
    const request = new Request(url, { credentials: 'same-origin' });
    if (await cache.match(request, { ignoreVary: true })) return;
    const response = await fetch(request);
    if (!response.ok) throw new Error(`${new URL(url).pathname}: HTTP ${response.status}`);
    await cache.put(request, response);
  }));
  const failures = results.filter(result => result.status === 'rejected');
  if (failures.length > 0) {
    throw new Error(`핵심 자산 ${failures.length}/${urls.length}개 캐시 실패`);
  }
}

self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }
  if (event.data?.type === 'CACHE_LOADED_ASSETS' && Array.isArray(event.data.urls)) {
    const caching = cacheLoadedAssets(event.data.urls)
      .then(() => event.ports[0]?.postMessage({ ok: true }))
      .catch(error => {
        console.warn('[SW] loaded asset cache failed:', error);
        event.ports[0]?.postMessage({
          ok: false,
          message: error instanceof Error ? error.message : String(error),
        });
      });
    event.waitUntil(caching);
  }
});

// 해시된 불변 자산 (내용이 바뀌면 파일명도 바뀜) — cache-first 안전
function isImmutableAsset(url) {
  return url.pathname.startsWith('/assets/') || url.pathname.startsWith('/fonts/');
}

// 해시 없는 정적 파일 (데이터 JSON·이미지 등) — SWR 필수
function isStaticFile(url) {
  return /\.(?:js|mjs|css|woff2?|ttf|otf|png|jpe?g|svg|webp|gif|ico|json)$/i.test(url.pathname);
}

async function pruneDataCache(cache) {
  const requests = await cache.keys();
  if (requests.length <= DATA_CACHE_MAX_ENTRIES) return;
  const removeCount = Math.min(DATA_CACHE_PRUNE_COUNT, requests.length - DATA_CACHE_MAX_ENTRIES + DATA_CACHE_PRUNE_COUNT);
  await Promise.all(requests.slice(0, removeCount).map((request) => cache.delete(request)));
}

async function safeCachePut(cacheName, request, response) {
  const cache = await caches.open(cacheName);
  try {
    await cache.put(request, response.clone());
    if (cacheName === DATA_CACHE) {
      await pruneDataCache(cache);
    }
  } catch (err) {
    if (cacheName === DATA_CACHE) {
      try {
        const requests = await cache.keys();
        await Promise.all(requests.slice(0, DATA_CACHE_PRUNE_COUNT).map((entry) => cache.delete(entry)));
        await cache.put(request, response.clone());
      } catch (retryErr) {
        console.warn('[SW] cache put failed after prune:', retryErr);
      }
    } else {
      console.warn('[SW] cache put failed:', err);
    }
  }
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // GET 외(POST 등)는 그대로 통과
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 외부 오리진(API Worker, 카카오 등)은 SW가 건드리지 않음 → 네트워크 직행
  // (앱이 자체 localStorage 캐시로 오프라인 폴백을 처리)
  if (url.origin !== self.location.origin) return;

  // 네비게이션(HTML): network-first, 실패 시 캐시된 셸
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          event.waitUntil(safeCachePut(SHELL_CACHE, '/index.html', fresh.clone()));
          return fresh;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (
            (await cache.match('/index.html')) ||
            (await cache.match('/')) ||
            new Response('오프라인 상태이며 캐시된 앱이 없습니다.', {
              status: 503,
              headers: { 'Content-Type': 'text/plain; charset=utf-8' },
            })
          );
        }
      })()
    );
    return;
  }

  // 해시된 불변 자산: cache-first
  if (isImmutableAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(ASSET_CACHE);
        // Vite preview/CDN은 Vary: Origin을 붙일 수 있다. 설치 중 cache.add()와
        // 브라우저의 실제 모듈 요청은 Origin 헤더가 달라 기본 match가 실패한다.
        // 해시 URL 자산은 URL 자체가 버전이므로 Vary를 무시해도 안전하다.
        // 폰트는 설치 시 SHELL_CACHE에 들어가므로 전체 캐시에서 찾는다.
        const cached = await caches.match(request, { ignoreVary: true });
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) event.waitUntil(safeCachePut(ASSET_CACHE, request, fresh.clone()));
          return fresh;
        } catch {
          return Response.error();
        }
      })()
    );
    return;
  }

  // 그 외 정적 파일(데이터 JSON·이미지): stale-while-revalidate
  // 캐시가 있으면 즉시 응답하고 백그라운드에서 갱신 (오프라인이면 캐시만)
  if (isStaticFile(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(DATA_CACHE);
        const cached = await caches.match(request, { ignoreVary: true });

        const revalidate = fetch(request)
          .then(async (fresh) => {
            if (fresh.ok) {
              await safeCachePut(DATA_CACHE, request, fresh.clone());
            }
            return fresh;
          })
          .catch(() => null);

        if (cached) {
          event.waitUntil(revalidate);
          return cached;
        }

        const fresh = await revalidate;
        return fresh || Response.error();
      })()
    );
  }
});
