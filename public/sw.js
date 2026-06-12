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

const CACHE_VERSION = 'v2';
const SHELL_CACHE = `119-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `119-assets-${CACHE_VERSION}`;
const DATA_CACHE = '119-data-v1'; // 버전 독립 — 받아둔 관할 데이터 보존
const KEEP_CACHES = [SHELL_CACHE, ASSET_CACHE, DATA_CACHE];

// 오프라인에서도 최소한 앱 셸이 뜨도록 미리 캐시할 항목
// 폰트 포함: 아이콘이 폰트 기반(Material Symbols)이라 없으면 오프라인 UI가 깨짐
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/favicon.svg',
  '/manifest.json',
  '/fonts/material-symbols-outlined.woff2',
  '/fonts/inter-latin.woff2',
  '/fonts/manrope-latin.woff2',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      // 일부가 실패해도 설치가 막히지 않도록 개별 처리
      Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url)))
    )
  );
  // 새 SW가 즉시 대기 상태로 진입 (waiting) — 활성화는 사용자 동작 또는 다음 로드에서
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !KEEP_CACHES.includes(key)).map((key) => caches.delete(key))
      );
      await self.clients.claim();
    })()
  );
});

// 페이지가 즉시 갱신을 요청하면 대기 중인 SW를 활성화
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') {
    self.skipWaiting();
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
          const cache = await caches.open(SHELL_CACHE);
          cache.put('/index.html', fresh.clone());
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
        const cached = await cache.match(request);
        if (cached) return cached;
        try {
          const fresh = await fetch(request);
          if (fresh.ok) cache.put(request, fresh.clone());
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
        const cached = await cache.match(request);

        const revalidate = fetch(request)
          .then((fresh) => {
            if (fresh.ok) cache.put(request, fresh.clone());
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
