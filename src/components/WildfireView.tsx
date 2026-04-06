import React, { useEffect, useState } from 'react';
import { fetchWildfires, type WildfireItem } from '../services/wildfireApi';

export const WildfireView: React.FC = () => {
  const [fires, setFires] = useState<WildfireItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const loadData = async () => {
    setIsLoading(true);
    const data = await fetchWildfires('200', '1');
    setFires(data);
    setLastUpdated(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setIsLoading(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const ongoing = fires.filter(f => f.isOngoing);
  const extinguished = fires.filter(f => !f.isOngoing);
  
  const totalDamage = fires.reduce((acc, curr) => acc + (curr.damageArea || 0), 0);

  return (
    <div className="p-4 safe-area-bottom pb-20 max-w-7xl mx-auto animate-fade-in">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-on-background flex items-center">
            <span className="material-symbols-outlined text-error mr-2">local_fire_department</span>
            산불 실시간 현황
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">행정안전부 산불정보 (최근 200건)</p>
        </div>
        <button 
          onClick={loadData}
          className="p-2 rounded-full bg-surface-variant text-on-surface hover:bg-surface-tint hover:text-white transition-colors flex items-center shadow-sm"
          title="새로고침"
        >
          <span className={`material-symbols-outlined ${isLoading ? 'animate-spin' : ''}`}>refresh</span>
        </button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface p-4 rounded-xl shadow-md border border-outline-variant/30 flex flex-col justify-center items-center">
          <span className="text-sm text-on-surface-variant font-medium">현재 진화 중</span>
          <span className="text-3xl font-bold text-error mt-1">{ongoing.length}건</span>
        </div>
        <div className="bg-surface p-4 rounded-xl shadow-md border border-outline-variant/30 flex flex-col justify-center items-center">
          <span className="text-sm text-on-surface-variant font-medium">최근 진화 완료</span>
          <span className="text-3xl font-bold text-primary mt-1">{extinguished.length}건</span>
        </div>
        <div className="bg-surface p-4 rounded-xl shadow-md border border-outline-variant/30 flex flex-col justify-center items-center">
          <span className="text-sm text-on-surface-variant font-medium">추정 피해 면적</span>
          <span className="text-3xl font-bold text-tertiary mt-1">{totalDamage.toLocaleString()}ha</span>
        </div>
        <div className="bg-surface p-4 rounded-xl shadow-md border border-outline-variant/30 flex flex-col justify-center items-center text-center">
          <span className="text-sm text-on-surface-variant font-medium">마지막 업데이트</span>
          <span className="text-lg font-bold text-on-background mt-1">{lastUpdated || '-'}</span>
        </div>
      </div>

      <h3 className="text-lg font-bold text-on-background mb-4">현재 화재 및 최근 완료 목록</h3>
      
      {isLoading && fires.length === 0 ? (
        <div className="flex justify-center py-10">
          <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
        </div>
      ) : fires.length === 0 ? (
        <div className="text-center py-10 text-on-surface-variant bg-surface rounded-xl shadow-inner">
          <span className="material-symbols-outlined text-4xl mb-2 opacity-50">forest</span>
          <p>조회된 산불 정보가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {fires.map((fire) => (
            <div key={fire.id} className={`p-4 rounded-xl shadow-md flex flex-col sm:flex-row sm:items-center justify-between border-l-4 ${fire.isOngoing ? 'bg-error/10 border-error' : 'bg-surface border-secondary'}`}>
              <div className="mb-2 sm:mb-0">
                <div className="flex items-center">
                  {fire.isOngoing ? (
                    <span className="px-2 py-0.5 bg-error text-white text-xs font-bold rounded-full mr-2 animate-pulse">진화중</span>
                  ) : (
                    <span className="px-2 py-0.5 bg-secondary text-white text-xs font-bold rounded-full mr-2">진화완료</span>
                  )}
                  <h4 className="font-bold text-on-background">{fire.address}</h4>
                </div>
                <div className="text-sm text-on-surface-variant mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  <span className="flex items-center"><span className="material-symbols-outlined text-base mr-1">schedule</span> 발생: {fire.occurredAt}</span>
                  {!fire.isOngoing && fire.extinguishedAt && (
                    <span className="flex items-center"><span className="material-symbols-outlined text-base mr-1">done_all</span> 완료: {fire.extinguishedAt}</span>
                  )}
                  {fire.damageArea > 0 && (
                    <span className="flex items-center"><span className="material-symbols-outlined text-base mr-1">landscape</span> 피해: {fire.damageArea}ha</span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  className="px-3 py-1.5 bg-primary/10 text-primary hover:bg-primary/20 rounded-lg text-sm font-medium transition-colors"
                  onClick={() => {
                    if (fire.lat && fire.lng) {
                      window.open(`https://map.kakao.com/link/map/산불위치,${fire.lat},${fire.lng}`, '_blank');
                    } else {
                      window.open(`https://map.kakao.com/?q=${encodeURIComponent(fire.address)}`, '_blank');
                    }
                  }}
                >
                  지도 보기
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
