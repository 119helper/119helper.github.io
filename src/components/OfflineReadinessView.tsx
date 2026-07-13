import { useEffect, useState } from 'react';
import {
  clearRegionData,
  downloadRegionData,
  getRegionStatus,
  getVerifiedRegionStatus,
  isOfflineDataSupported,
  type DownloadProgress,
  type OfflineRegionStatus,
} from '../services/offlineRegion';
import {
  formatDatasetDate,
  formatFreshnessSourceDate,
  getDatasetFreshness,
  isFreshnessExpired,
  type DatasetFreshness,
} from '../services/dataFreshness';

interface OfflineReadinessViewProps {
  city: string;
  cityLabel: string;
}

const DATASETS = [
  { id: 'hydrants', label: '소화전' },
  { id: 'waterTowers', label: '급수탑/저수조' },
  { id: 'civil', label: '민방위 대피시설' },
  { id: 'tsunami', label: '지진해일 대피소' },
  { id: 'restrooms', label: '공중화장실' },
];

export default function OfflineReadinessView({ city, cityLabel }: OfflineReadinessViewProps) {
  const [status, setStatus] = useState<OfflineRegionStatus | null>(() => getRegionStatus());
  const [freshness, setFreshness] = useState<Array<{ id: string; label: string; meta: DatasetFreshness | null }>>([]);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');
  const supported = isOfflineDataSupported();

  useEffect(() => {
    let alive = true;
    Promise.all(DATASETS.map(async dataset => ({
      ...dataset,
      meta: await getDatasetFreshness(dataset.id, city),
    }))).then(items => {
      if (alive) setFreshness(items);
    });
    getVerifiedRegionStatus().then(result => {
      if (alive) setStatus(result);
    });
    return () => { alive = false; };
  }, [city]);

  const readiness = (() => {
    if (!supported) return { label: '지원 안 됨', cls: 'text-red-400 bg-red-500/10 border-red-500/30', icon: 'block' };
    if (!status) return { label: '미다운로드', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: 'download' };
    if (status.city !== city) return { label: '다른 지역 저장됨', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: 'sync_problem' };
    if (status.verified === false) return { label: '재확인 필요', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: 'sync' };
    if (status.failedCount > 0) return { label: '일부 실패', cls: 'text-amber-400 bg-amber-500/10 border-amber-500/30', icon: 'warning' };
    return { label: '준비 완료', cls: 'text-green-400 bg-green-500/10 border-green-500/30', icon: 'check_circle' };
  })();

  const handleDownload = async () => {
    setDownloading(true);
    setError('');
    setProgress(null);
    try {
      const result = await downloadRegionData(city, setProgress);
      setStatus(result);
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
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface font-headline">오프라인 현장 점검</h2>
          <p className="text-sm text-on-surface-variant mt-1">출동 전 관할 데이터가 기기에 준비되어 있는지 확인합니다.</p>
        </div>
      </div>

      <div className={`rounded-xl border p-5 ${readiness.cls}`}>
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-3xl" style={{ fontVariationSettings: "'FILL' 1" }}>{readiness.icon}</span>
            <div>
              <div className="text-sm font-bold text-on-surface-variant">현재 지역: {cityLabel}</div>
              <div className="text-2xl font-extrabold text-on-surface">{readiness.label}</div>
            </div>
          </div>
          {status && (
            <div className="text-right text-xs text-on-surface-variant">
              <div>{status.fileCount}개 파일 저장</div>
              <div>{new Date(status.downloadedAt).toLocaleString('ko-KR')}</div>
            </div>
          )}
        </div>
      </div>

      {!supported && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
          이 브라우저는 Cache API를 지원하지 않아 오프라인 데이터 저장을 사용할 수 없습니다.
        </div>
      )}

      {supported && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-on-surface">지역 데이터</h3>
            <div className="flex gap-2">
              {status && (
                <button
                  type="button"
                  onClick={handleClear}
                  disabled={downloading}
                  className="rounded-lg bg-surface-container px-3 py-2 text-sm font-bold text-on-surface-variant hover:bg-surface-container-high transition-colors disabled:opacity-50"
                >
                  삭제
                </button>
              )}
              <button
                type="button"
                onClick={handleDownload}
                disabled={downloading}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-on-primary hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {status?.city === city ? '최신 데이터로 업데이트' : `${cityLabel} 데이터 받기`}
              </button>
            </div>
          </div>

          {downloading && (
            <div className="space-y-2">
              <div className="text-xs text-on-surface-variant">
                {progress ? `${progress.done}/${progress.total} · ${progress.currentLabel}` : '파일 목록 확인 중'}
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-container">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: progress ? `${Math.round((progress.done / progress.total) * 100)}%` : '6%' }}
                />
              </div>
            </div>
          )}

          {error && <p className="text-sm text-amber-400">{error}</p>}
        </div>
      )}

      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-3">
        <h3 className="text-lg font-bold text-on-surface">데이터 기준일</h3>
        <div className="space-y-2">
          {freshness.map(item => {
            const expired = item.meta ? isFreshnessExpired(item.meta) : false;
            return (
              <div key={item.id} className="flex items-center justify-between gap-3 rounded-lg bg-surface-container px-3 py-2">
                <div className="font-bold text-sm text-on-surface">{item.meta?.label ?? item.label}</div>
                <div className={`text-xs text-right ${expired ? 'text-amber-400 font-bold' : 'text-on-surface-variant'}`}>
                  {item.meta
                    ? `${formatFreshnessSourceDate(item.meta)} · 생성 ${formatDatasetDate(item.meta.generatedAt)}${expired ? ' · 갱신 필요' : ''}`
                    : '기준일 정보 없음'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
