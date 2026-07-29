import { useState, useEffect } from 'react';
import { fetchConsumerHazards, type HazardItem } from '../services/consumerHazardApi';
import { getStaleAt } from '../services/apiClient';
import StaleBadge from './StaleBadge';

export default function ConsumerHazardView() {
  const [hazards, setHazards] = useState<HazardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [staleAt, setStaleAt] = useState<number | null>(null);

  const loadData = async (force: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchConsumerHazards(force);
      setHazards(data);
      setStaleAt(getStaleAt(data));
    } catch (err) {
      setError(err instanceof Error ? err.message : '위해정보 API를 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData(false);
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-outline-variant/20 pb-4">
        <div>
          <h2 className="ui-page-title">
            <span className="material-symbols-outlined text-orange-700 dark:text-orange-300">warning</span>
            소비자 위해 정보 동향
            <StaleBadge at={staleAt} />
          </h2>
          <p className="text-on-surface-variant text-sm mt-1">한국소비자원 기반 일상생활 위해 및 안전사고 통계</p>
        </div>
        <button 
          onClick={() => loadData(true)}
          disabled={loading}
          className="p-2 rounded-full bg-surface-variant text-on-surface hover:bg-surface-tint hover:text-white transition-colors flex items-center shadow-sm disabled:opacity-50"
          title="새로고침"
        >
          <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`}>refresh</span>
        </button>
      </div>

      {error && (
        <div role="alert" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-300">
          <span>한국소비자원 위해정보를 불러오지 못했습니다. {error}</span>
          <button
            type="button"
            onClick={() => loadData(true)}
            disabled={loading}
            className="shrink-0 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
          >
            다시 시도
          </button>
        </div>
      )}

      {loading && hazards.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
          <span className="material-symbols-outlined text-4xl animate-spin mb-4 text-orange-700 dark:text-orange-300">progress_activity</span>
          <p>최신 위해 정보 통계를 불러오는 중입니다...</p>
        </div>
      ) : hazards.length === 0 ? (
        <div className="col-span-full py-16 text-center text-on-surface-variant bg-surface-container-lowest rounded-xl border border-dashed border-outline-variant/20">
          <span className="material-symbols-outlined text-4xl mb-2 opacity-50">search_off</span>
          <p>{error ? 'API 연결을 복구한 뒤 다시 시도해 주세요.' : '조회 결과가 0건입니다.'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {hazards.map((item) => (
            <div 
              key={item.id} 
              className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-5 hover:border-orange-500/30 transition-colors"
            >
              <div className="flex justify-between items-start mb-3">
                <span className="bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2.5 py-1 rounded-md text-xs font-bold">
                  {item.occurrencePlace === '해당없음' ? '장소미상' : item.occurrencePlace}
                </span>
                <span className="text-xs text-on-surface-variant">{item.receiveDay}</span>
              </div>
              
              <h3 className="font-bold text-on-surface text-lg mb-1 leading-snug">
                {item.itemMinor === '-' ? item.itemMiddle : item.itemMinor}
              </h3>
              <p className="text-xs text-on-surface-variant mb-4">{item.itemMajor} &gt; {item.itemMiddle}</p>
              
              <div className="space-y-2 text-sm">
                <div className="flex gap-2">
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant">personal_injury</span>
                  <span className="text-on-surface font-medium border-b border-orange-500/30 pb-0.5">
                    {item.injuryReason}
                  </span>
                </div>
                
                <div className="flex gap-2">
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant">healing</span>
                  <span className="text-on-surface">
                    {item.injurySymptoms === '해당없음' ? '증상불상' : item.injurySymptoms} 
                    {item.injuryPart !== '해당없음' && ` (${item.injuryPart})`}
                  </span>
                </div>
                
                <div className="flex gap-2 text-xs text-on-surface-variant mt-2 pt-2 border-t border-outline-variant/10">
                  <span className="material-symbols-outlined text-[14px]">face</span>
                  대상: 나이 {item.age ? `${item.age}세` : '미상'}, 성별 {item.gender}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
