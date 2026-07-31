import {
  getDatasetCompletenessNotices,
  type DatasetFreshness,
} from '../services/dataFreshness';

export default function DatasetCompletenessNotice({
  meta,
  align = 'left',
  collapsible = false,
}: {
  meta: DatasetFreshness;
  align?: 'left' | 'right';
  collapsible?: boolean;
}) {
  const notices = getDatasetCompletenessNotices(meta);
  if (notices.length === 0) return null;

  const noticeItems = notices.map(notice => (
    <p
      key={`${notice.tone}:${notice.text}`}
      className={notice.tone === 'warning'
        ? 'font-bold text-amber-700 dark:text-amber-300'
        : 'text-on-surface-variant'}
    >
      {notice.text}
    </p>
  ));

  if (collapsible) {
    return (
      <details className={`mt-1 text-[11px] ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <summary className="inline-flex cursor-pointer select-none items-center gap-1 font-bold text-on-surface-variant hover:text-on-surface">
          자료 범위·검증 상세
          <span className="font-normal">({notices.length}건)</span>
        </summary>
        <div className="mt-1 space-y-0.5 rounded-lg bg-surface-container/60 px-3 py-2">
          {noticeItems}
        </div>
      </details>
    );
  }

  return (
    <div className={`mt-1 space-y-0.5 text-[11px] ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {noticeItems}
    </div>
  );
}
