/*
 * 서비스 워커 등록 + 업데이트 감지
 *
 * - 운영(PROD) 빌드에서만 등록한다 (개발 중엔 캐시가 방해됨).
 * - 새 버전이 대기 상태가 되면 onUpdateReady 콜백으로 페이지에 알린다.
 * - applyUpdate()를 호출하면 대기 SW를 활성화하고 페이지를 새로고침한다.
 */

let waitingWorker: ServiceWorker | null = null;
let updateRequested = false;

export function registerServiceWorker(onUpdateReady: () => void) {
  if (!import.meta.env.PROD) return;
  if (!('serviceWorker' in navigator)) return;

  const register = () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // 이미 대기 중인 새 SW가 있으면 즉시 알림
        if (registration.waiting && navigator.serviceWorker.controller) {
          waitingWorker = registration.waiting;
          onUpdateReady();
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            // 새 SW가 설치 완료됐고, 이미 제어 중인 SW가 있으면 = 업데이트
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              waitingWorker = installing;
              onUpdateReady();
            }
          });
        });
      })
      .catch((err) => {
        console.warn('[SW] 등록 실패:', err);
      });
  };

  // 새 SW가 제어권을 가져오면 한 번만 새로고침
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // 최초 설치의 clients.claim()은 사용자가 입력 중인 화면을 새로고침하지 않는다.
    // 명시적으로 업데이트 버튼을 누른 경우에만 새 번들로 전환한다.
    if (!updateRequested || refreshing) return;
    refreshing = true;
    window.location.reload();
  });

  if (document.readyState === 'loading') {
    window.addEventListener('load', register, { once: true });
  } else {
    register();
  }
}

export function applyUpdate() {
  if (waitingWorker) {
    updateRequested = true;
    waitingWorker.postMessage('SKIP_WAITING');
  } else {
    window.location.reload();
  }
}
