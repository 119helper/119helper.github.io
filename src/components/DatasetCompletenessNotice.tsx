import {
  getDatasetCompletenessNotices,
  type DatasetFreshness,
} from '../services/dataFreshness';

export default function DatasetCompletenessNotice({
  meta,
  align = 'left',
}: {
  meta: DatasetFreshness;
  align?: 'left' | 'right';
}) {
  const notices = getDatasetCompletenessNotices(meta);
  if (notices.length === 0) return null;

  return (
    <div className={`mt-1 space-y-0.5 text-[11px] ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {notices.map(notice => (
        <p
          key={`${notice.tone}:${notice.text}`}
          className={notice.tone === 'warning'
            ? 'font-bold text-amber-700 dark:text-amber-300'
            : 'text-on-surface-variant'}
        >
          {notice.text}
        </p>
      ))}
    </div>
  );
}
