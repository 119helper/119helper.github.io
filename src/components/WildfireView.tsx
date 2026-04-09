import React, { useEffect, useState } from 'react';
import { fetchWildfires, type WildfireItem } from '../services/wildfireApi';
import { latLngToGrid, getUltraShortNow, parseCurrentWeather, type CurrentWeather } from '../services/weatherApi';

export const WildfireView: React.FC<{ cityName?: string }> = ({ cityName }) => {
  const [fires, setFires] = useState<WildfireItem[]>([]);
  const [filterMode, setFilterMode] = useState<'all' | 'local'>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [windInfo, setWindInfo] = useState<Record<string, CurrentWeather>>({});

  const loadData = async (forceRefresh = false) => {
    setIsLoading(true);
    const data = await fetchWildfires('200', '1', forceRefresh);
    setFires(data);
    setLastUpdated(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    setIsLoading(false);

    // 진화중인 산불에 대해 실시간 바람 데이터 로드
    const ongoingFires = data.filter(f => f.isOngoing && f.lat && f.lng);
    ongoingFires.forEach(async (f) => {
      try {
        const grid = latLngToGrid(f.lat!, f.lng!);
        const items = await getUltraShortNow(grid.nx, grid.ny);
        if (items.length > 0) {
          const weather = parseCurrentWeather(items);
          setWindInfo(prev => ({ ...prev, [f.id]: weather }));
        }
      } catch (err) {
        console.error('Failed to fetch wind for fire', f.id, err);
      }
    });
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => loadData(true), 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const displayFires = filterMode === 'local' && cityName
    ? fires.filter(f => {
        if (cityName === '광주') {
          return f.address.includes('광주광역시') || (f.address.includes('광주') && !f.address.includes('경기'));
        }
        return f.address.includes(cityName);
      })
    : fires;

  const ongoing = displayFires.filter(f => f.isOngoing);
  const extinguished = displayFires.filter(f => !f.isOngoing);
  
  const totalDamage = displayFires.reduce((acc, curr) => acc + (curr.damageArea || 0), 0);

  // 확산 방향 예측 도우미 (반대 방향)
  const getSpreadDirection = (windDirText: string) => {
    const oppMap: Record<string, string> = {
      '북': '남', '북북동': '남남서', '북동': '남서', '동북동': '서남서',
      '동': '서', '동남동': '서북서', '남동': '북서', '남남동': '북북서',
      '남': '북', '남남서': '북북동', '남서': '북동', '서남서': '동북동',
      '서': '동', '서북서': '동남동', '북서': '남동', '북북서': '남남동',
    };
    return oppMap[windDirText] || '알 수 없음';
  };

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
        <div className="flex flex-col sm:flex-row items-end sm:items-center gap-3">
          {cityName && (
            <div className="flex bg-surface-container rounded-lg p-1 shadow-inner">
              <button 
                onClick={() => setFilterMode('all')}
                className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-bold transition-all ${filterMode === 'all' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                전국
              </button>
              <button 
                onClick={() => setFilterMode('local')}
                className={`px-3 py-1.5 rounded-md text-xs sm:text-sm font-bold transition-all flex items-center gap-1 ${filterMode === 'local' ? 'bg-primary text-on-primary shadow-sm' : 'text-on-surface-variant hover:text-on-surface'}`}
              >
                <span className="material-symbols-outlined text-[14px]">location_on</span>
                {cityName} 한정
              </button>
            </div>
          )}
          <button 
            onClick={() => loadData(true)}
            className="p-2 rounded-full bg-surface-variant text-on-surface hover:bg-surface-tint hover:text-white transition-colors flex items-center shadow-sm"
            title="새로고침"
          >
            <span className={`material-symbols-outlined ${isLoading ? 'animate-spin' : ''}`}>refresh</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-surface p-4 rounded-xl shadow-md border border-outline-variant/30 flex flex-col justify-center items-center">
          <span className="text-sm text-on-surface-variant font-medium">현재 진화 중</span>
          <span className="text-3xl font-bold text-error mt-1">
            {isLoading && fires.length === 0 ? <span className="text-on-surface-variant animate-pulse">---</span> : `${ongoing.length}건`}
          </span>
        </div>
        <div className="bg-surface p-4 rounded-xl shadow-md border border-outline-variant/30 flex flex-col justify-center items-center">
          <span className="text-sm text-on-surface-variant font-medium">최근 진화 완료</span>
          <span className="text-3xl font-bold text-primary mt-1">
            {isLoading && fires.length === 0 ? <span className="text-on-surface-variant animate-pulse">---</span> : `${extinguished.length}건`}
          </span>
        </div>
        <div className="bg-surface p-4 rounded-xl shadow-md border border-outline-variant/30 flex flex-col justify-center items-center">
          <span className="text-sm text-on-surface-variant font-medium">추정 피해 면적</span>
          <span className="text-3xl font-bold text-tertiary mt-1">
            {isLoading && fires.length === 0 ? <span className="text-on-surface-variant animate-pulse">---</span> : `${totalDamage.toLocaleString()}ha`}
          </span>
        </div>
        <div className="bg-surface p-4 rounded-xl shadow-md border border-outline-variant/30 flex flex-col justify-center items-center text-center">
          <span className="text-sm text-on-surface-variant font-medium">마지막 업데이트</span>
          <span className="text-lg font-bold text-on-background mt-1">{lastUpdated || '-'}</span>
        </div>
      </div>

      <h3 className="text-lg font-bold text-on-background mb-4">현재 화재 및 최근 완료 목록</h3>
      
      {isLoading && fires.length === 0 ? (
        /* ── 스켈레톤 로딩 (초기 로드) ── */
        <div className="animate-pulse space-y-6">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="bg-surface-container rounded-xl p-4 h-24" />
            ))}
          </div>
          <div className="flex items-center gap-3 py-2">
            <div className="h-4 bg-surface-container rounded w-40" />
          </div>
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-surface-container rounded-xl p-5 h-28" />
            ))}
          </div>
        </div>
      ) : displayFires.length === 0 ? (
        <div className="text-center py-10 text-on-surface-variant bg-surface rounded-xl shadow-inner">
          <span className="material-symbols-outlined text-4xl mb-2 opacity-50">forest</span>
          <p>조회된 산불 정보가 없습니다.</p>
          <p className="text-xs mt-1 opacity-60">현재 진행 중인 산불이 없거나, 해당 지역 데이터가 없습니다.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {displayFires.map((fire) => (
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
                {/* 실시간 바람 (진화 중일 때만 표시) */}
                {fire.isOngoing && windInfo[fire.id] && (
                  <div className="mt-3 inline-flex flex-col bg-surface-variant p-2.5 rounded-lg border border-error/20">
                    <div className="flex items-center text-xs font-bold text-on-background mb-1 drop-shadow-sm">
                      <span className="material-symbols-outlined text-sm mr-1">air</span> 
                      현장 실시간 바람 분석
                    </div>
                    <div className="text-sm">
                      현재 <span className="font-extrabold text-blue-400">{windInfo[fire.id].windDirection}풍 {windInfo[fire.id].windSpeed}m/s</span>
                      {windInfo[fire.id].windSpeed >= 5 ? ' (강풍주의)' : ''}
                    </div>
                    <div className="text-sm mt-0.5 flex items-center">
                      <span className="material-symbols-outlined text-sm text-error mr-1 animate-pulse">local_fire_department</span>
                      AI 예측: 불길이 <span className="font-bold text-error mx-1 underline underline-offset-2">{getSpreadDirection(windInfo[fire.id].windDirection)}쪽</span>으로 확산 위험
                    </div>
                  </div>
                )}
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
