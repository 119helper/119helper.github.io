/*
 * 설정 — 관할 지역 오프라인 데이터 섹션
 *
 * 신호가 좋을 때(소방서 와이파이 등) 관할 지역의 소화전·공중화장실·대피소
 * 데이터를 미리 받아두면, 출동 중 신호가 끊겨도 시설 조회가 동작한다.
 */

import { useEffect, useState } from 'react';
import {
  downloadRegionData, clearRegionData, getRegionStatus, isOfflineDataSupported,
  type DownloadProgress, type OfflineRegionStatus,
} from '../services/offlineRegion';
import { formatDatasetDate, formatFreshnessSourceDate, getDatasetFreshness, isFreshnessExpired, type DatasetFreshness } from '../services/dataFreshness';

export default function OfflineDataSection({ city, cityNames }: {
  city: string;
  cityNames: Record<string, string>;
}) {
  const [status, setStatus] = useState<OfflineRegionStatus | null>(() => getRegionStatus());
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const [freshnessItems, setFreshnessItems] = useState<Array<{ id: string; meta: DatasetFreshness }>>([]);

  useEffect(() => {
    let alive = true;
    Promise.all(
      ['hydrants', 'restrooms', 'civil', 'tsunami'].map(async id => ({
        id,
        meta: await getDatasetFreshness(id, city),
      }))
    ).then(items => {
      if (!alive) return;
      setFreshnessItems(items.filter((item): item is { id: string; meta: DatasetFreshness } => item.meta !== null));
    });
    return () => { alive = false; };
  }, [city]);

  if (!isOfflineDataSupported()) return null;

  const cityLabel = cityNames[city] || city;

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    setProgress(null);
    try {
      const result = await downloadRegionData(city, setProgress);
      setStatus(result);
      if (result.failedCount > 0) {
        setError(`${result.failedCount}개 파일을 받지 못했습니다. 신호가 좋은 곳에서 다시 시도하세요.`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '다운로드에 실패했습니다.');
    } finally {
      setDownloading(false);
      setProgress(null);
    }
  };

  const handleClear = async () => {
    await clearRegionData();
    setStatus(null);
    setError('');
  };

  return (
    <div className="space-y-3">
      <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
        <span className="material-symbols-outlined text-primary text-lg">download_for_offline</span>
        오프라인 현장 데이터
      </span>
      <p className="text-[11px] leading-5 text-on-surface-variant">
        신호가 좋을 때 <span className="font-bold text-on-surface">{cityLabel}</span> 지역의
        소화전·공중화장실·대피소 데이터를 미리 받아둡니다.
        출동 중 통신이 끊겨도 시설 조회가 동작합니다. (약 5~10MB)
      </p>

      {status && !downloading && (
        <div className="flex items-center gap-2 rounded-xl bg-surface-container px-3 py-2 text-xs text-on-surface-variant">
          <span className="material-symbols-outlined text-base text-secondary">check_circle</span>
          <span>
            <span className="font-bold text-on-surface">{cityNames[status.city] || status.city}</span> 데이터
            {' '}{status.fileCount}개 파일 · {new Date(status.downloadedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 저장
          </span>
        </div>
      )}

      {freshnessItems.length > 0 && (
        <div className="space-y-1 rounded-xl bg-surface-container px-3 py-2 text-[11px] text-on-surface-variant">
          {freshnessItems.map(({ id, meta }) => {
            const expired = isFreshnessExpired(meta);
            return (
              <div key={id} className="flex items-center justify-between gap-2">
                <span className="font-medium text-on-surface">{meta.label}</span>
                <span className={expired ? 'font-bold text-amber-400' : ''}>
                  {formatFreshnessSourceDate(meta)} · 생성 {formatDatasetDate(meta.generatedAt)}
                  {expired ? ' · 갱신 필요' : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {downloading && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-on-surface-variant">
            <span className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base animate-spin text-primary">progress_activity</span>
              {progress ? `${progress.done}/${progress.total} — ${progress.currentLabel}` : '파일 목록 확인 중…'}
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-container">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: progress ? `${Math.round((progress.done / progress.total) * 100)}%` : '5%' }}
            />
          </div>
        </div>
      )}

      {error && (
        <p className="text-[11px] text-amber-400">{error}</p>
      )}

      <div className="flex gap-2">
        <button
          type="button"
          onClick={handleDownload}
          disabled={downloading}
          className="flex-1 rounded-xl bg-primary/10 px-3 py-2 text-sm font-bold text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
        >
          {status?.city === city ? '최신 데이터로 업데이트' : `${cityLabel} 데이터 받기`}
        </button>
        {status && (
          <button
            type="button"
            onClick={handleClear}
            disabled={downloading}
            className="rounded-xl bg-surface-container px-3 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-50"
          >
            삭제
          </button>
        )}
      </div>
    </div>
  );
}
