/*
 * 연결 상태 표시 + 앱 업데이트 토스트
 *
 *  - 오프라인이 되면 하단에 배지를 띄운다 ("오프라인 · 일부 실시간 정보 제한").
 *  - 새 버전 SW가 준비되면 "새 버전 있음 · 새로고침" 토스트를 띄운다.
 *
 * 이 컴포넌트는 앱의 ErrorBoundary 바깥(main.tsx)에 두어,
 * 본 화면이 죽더라도 연결/업데이트 안내는 계속 보이게 한다.
 */

import { useEffect, useState } from 'react';
import { registerServiceWorker, applyUpdate } from '../utils/registerServiceWorker';
import { useNetworkStatus } from '../hooks/useNetworkStatus';

const UNSTABLE_NOTICE_DURATION_MS = 8_000;

export default function ConnectivityStatus() {
  const networkStatus = useNetworkStatus();
  const offline = networkStatus.state === 'offline';
  const unstable = networkStatus.state === 'unstable';
  const [updateReady, setUpdateReady] = useState(false);
  const [networkNoticeDismissed, setNetworkNoticeDismissed] = useState(false);

  useEffect(() => {
    registerServiceWorker(() => setUpdateReady(true));
  }, []);

  useEffect(() => {
    setNetworkNoticeDismissed(false);
    if (!unstable || offline) return;

    const timeoutId = window.setTimeout(() => {
      setNetworkNoticeDismissed(true);
    }, UNSTABLE_NOTICE_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [offline, unstable]);

  const showUpdateNotice = updateReady && !offline && !unstable;
  const showNetworkNotice = !networkNoticeDismissed && (offline || unstable);

  if (!showUpdateNotice && !showNetworkNotice) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 flex flex-col items-center gap-2 p-2 sm:p-3 lg:bottom-0 lg:pb-[calc(0.75rem+env(safe-area-inset-bottom))]" role="status" aria-live="polite">
      {showUpdateNotice && (
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary shadow-lg">
          <span aria-hidden="true" className="material-symbols-outlined text-base">system_update</span>
          <span>새 버전이 있습니다.</span>
          <button
            type="button"
            onClick={applyUpdate}
            className="rounded-full bg-on-primary/20 px-3 py-1 text-xs font-bold hover:bg-on-primary/30"
          >
            새로고침
          </button>
        </div>
      )}
      {showNetworkNotice && (offline ? (
        <div aria-label="오프라인. 실시간 정보는 마지막 저장값으로 표시됩니다" className="pointer-events-auto flex min-h-12 max-w-[calc(100vw-1rem)] items-center gap-2 rounded-full bg-amber-500/95 px-3 py-2 text-sm font-bold text-amber-950 shadow-lg sm:px-4">
          <span aria-hidden="true" className="material-symbols-outlined text-base">cloud_off</span>
          <span aria-hidden="true" className="sm:hidden">오프라인</span>
          <span aria-hidden="true" className="hidden sm:inline">오프라인 · 실시간 정보는 마지막 저장값으로 표시됩니다</span>
          <button type="button" onClick={() => setNetworkNoticeDismissed(true)} aria-label="오프라인 안내 닫기" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-amber-950/10">
            <span aria-hidden="true" className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      ) : unstable && (
        <div aria-label="연결 불안정. 일부 정보가 마지막 저장값일 수 있습니다" className="pointer-events-auto flex min-h-12 max-w-[calc(100vw-1rem)] items-center gap-2 rounded-full bg-amber-500/95 px-3 py-2 text-sm font-bold text-amber-950 shadow-lg sm:px-4">
          <span aria-hidden="true" className="material-symbols-outlined text-base">signal_disconnected</span>
          <span aria-hidden="true" className="sm:hidden">연결 불안정</span>
          <span aria-hidden="true" className="hidden sm:inline">연결 불안정 · 일부 정보가 마지막 저장값일 수 있습니다</span>
          <button type="button" onClick={() => setNetworkNoticeDismissed(true)} aria-label="연결 불안정 안내 닫기" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full hover:bg-amber-950/10">
            <span aria-hidden="true" className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      ))}
    </div>
  );
}
