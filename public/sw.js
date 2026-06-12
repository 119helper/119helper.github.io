/*
 * 119 Helper — 서비스 워커 (오프라인 지원)
 *
 * 전략:
 *   - HTML(네비게이션): network-first → 끊기면 캐시된 셸 (항상 앱이 뜸, 최신 우선)
 *   - 해시된 정적 자산(JS/CSS/이미지/폰트): cache-first (불변 자산)
 *   - 외부 API(Cloudflare Worker 등): network-only (앱이 localStorage 캐시로 폴백)
 *
 * 설치형 앱이 아니라 "오프라인에서도 죽지 않는 웹"이 목표.
 * CACHE_VERSION을 올리면 이전 캐시는 activate 시 정리되고,
 * 페이지에는 'SW_UPDATED' 메시지로 새 버전을 알린다.
 */

const CACHE_VERSION = 'v1';
const SHELL_CACHE = `119-shell-${CACHE_VERSION}`;
const ASSET_CACHE = `119-assets-${CACHE_VERSION}`;
const APP_CACHES = [SHELL_CACHE, ASSET_CACHE];

// 오프라인에서도 최소한 앱 셸이 뜨도록 미리 캐시할 항목
const PRECACHE_URLS = ['/', '/index.html', '/favicon.svg', '/manifest.json'];

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
        keys.filter((key) => !APP_CACHES.includes(key)).map((key) => caches.delete(key))
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

function isAssetRequest(url) {
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

  // 해시된 정적 자산: cache-first (없으면 받아서 캐시)
  if (isAssetRequest(url)) {
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
          // 자산이 캐시에도 네트워크에도 없으면 그대로 실패
          return cached || Response.error();
        }
      })()
    );
  }
});
