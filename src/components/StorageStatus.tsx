import { useEffect, useState, useSyncExternalStore } from 'react';
import { getPendingStorageCount, retryPendingStorage, STORAGE_STATUS_EVENT } from '../services/privacySettings';

function subscribe(notify: () => void) {
  window.addEventListener(STORAGE_STATUS_EVENT, notify);
  return () => window.removeEventListener(STORAGE_STATUS_EVENT, notify);
}

export default function StorageStatus() {
  const count = useSyncExternalStore(subscribe, getPendingStorageCount);
  const [retried, setRetried] = useState(false);
  useEffect(() => {
    if (!count) return;
    const guard = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [count]);
  if (!count && !retried) return null;
  return (
    <div role={count ? 'alert' : 'status'} className="shrink-0 border-b border-amber-500/30 bg-surface-container px-4 py-3 text-sm text-on-surface">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-bold">{count ? `기기에 저장하지 못한 자료 ${count}종` : '기기에 저장했습니다.'}</p>
        {count > 0 ? <button type="button" className="min-h-11 rounded-lg bg-primary px-3 font-bold text-on-primary" onClick={() => setRetried(retryPendingStorage())}>저장 다시 시도</button>
          : <button type="button" className="min-h-11 px-3" onClick={() => setRetried(false)}>닫기</button>}
      </div>
      {count > 0 && <p className="mt-1 text-xs">내용은 이 탭에 임시 보관 중입니다. 저장 공간을 확보하고 다시 시도하세요. 탭을 닫거나 새로고침하면 임시 내용이 사라집니다.</p>}
    </div>
  );
}
