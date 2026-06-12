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

export default function ConnectivityStatus() {
  const [offline, setOffline] = useState(() => !navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const goOnline = () => setOffline(false);
    const goOffline = () => setOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);

    registerServiceWorker(() => setUpdateReady(true));

    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (!offline && !updateReady) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[1000] flex flex-col items-center gap-2 p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pointer-events-none">
      {updateReady && (
        <div className="pointer-events-auto flex items-center gap-3 rounded-full bg-primary px-4 py-2 text-sm font-bold text-on-primary shadow-lg">
          <span className="material-symbols-outlined text-base">system_update</span>
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
      {offline && (
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-amber-500/95 px-4 py-2 text-sm font-bold text-amber-950 shadow-lg">
          <span className="material-symbols-outlined text-base">cloud_off</span>
          <span>오프라인 · 실시간 정보는 마지막 저장값으로 표시됩니다</span>
        </div>
      )}
    </div>
  );
}
