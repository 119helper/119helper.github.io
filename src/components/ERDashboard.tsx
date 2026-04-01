import { useState, useEffect, useCallback } from 'react';
import { getERRealTimeBeds, CITY_TO_SIDO, type ERRealTimeData } from '../services/erApi';

interface ERViewProps {
  city: string;
}

export default function ERDashboard({ city }: ERViewProps) {
  const [erData, setErData] = useState<ERRealTimeData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState('');

  const fetchER = useCallback(async () => {
    setLoading(true);
    try {
      const sido = CITY_TO_SIDO[city] || '서울특별시';
      const data = await getERRealTimeBeds(sido);
      setErData(data);
      setLastUpdate(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      console.error('ER fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [city]);

  useEffect(() => { fetchER(); }, [fetchER]);
  useEffect(() => {
    const interval = setInterval(fetchER, 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchER]);

  const totalAvailable = erData.reduce((sum, er) => sum + (parseInt(er.hvec) || 0), 0);
  const totalBeds = erData.reduce((sum, er) => sum + (parseInt(er.hpbdn) || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface font-headline">🏥 응급실 실시간 현황</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            국립중앙의료원 실시간 가용병상 API · <span className="text-primary font-bold">{CITY_TO_SIDO[city] || '서울특별시'}</span>
            {lastUpdate && <span className="ml-2 text-on-surface-variant">· 갱신 {lastUpdate}</span>}
          </p>
        </div>
        <button onClick={fetchER} disabled={loading} className="bg-primary/10 text-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/20 transition-colors flex items-center gap-2 disabled:opacity-50">
          <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
          새로고침
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 text-center">
          <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">조회 병원</p>
          <p className="text-3xl font-extrabold text-on-surface mt-1">{erData.length}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 text-center">
          <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">가용 병상 합계</p>
          <p className={`text-3xl font-extrabold mt-1 ${totalAvailable > 10 ? 'text-secondary' : totalAvailable > 0 ? 'text-amber-400' : 'text-error'}`}>{totalAvailable}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 text-center">
          <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">전체 병상</p>
          <p className="text-3xl font-extrabold text-on-surface mt-1">{totalBeds}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 text-center">
          <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">가용률</p>
          <p className="text-3xl font-extrabold text-primary mt-1">{totalBeds > 0 ? Math.round(totalAvailable / totalBeds * 100) : 0}%</p>
        </div>
      </div>

      {/* Table */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
        {loading && erData.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <span className="material-symbols-outlined animate-spin text-primary text-2xl mr-3">refresh</span>
            <span className="text-on-surface-variant">응급실 데이터 로딩 중...</span>
          </div>
        ) : erData.length === 0 ? (
          <div className="text-center py-20 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl mb-2 block">local_hospital</span>
            데이터가 없습니다. API 키를 확인하세요.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-surface-container/50">
                <th className="px-5 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">병원명</th>
                <th className="px-3 py-3 text-center text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">응급 병상</th>
                <th className="px-3 py-3 text-center text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">입원실</th>
                <th className="px-3 py-3 text-center text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">수술실</th>
                <th className="px-3 py-3 text-center text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">CT</th>
                <th className="px-3 py-3 text-center text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">MRI</th>
                <th className="px-3 py-3 text-center text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">외상</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">전화</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {erData.map((er, i) => {
                const avail = parseInt(er.hvec) || 0;
                return (
                  <tr key={i} className="hover:bg-surface-container/30 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-sm font-bold text-on-surface">{er.dutyName}</p>
                      <p className="text-[10px] text-on-surface-variant truncate max-w-[280px]">{er.dutyAddr}</p>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {avail < 0 ? (
                        <span 
                          title="현재 대기 중인 환자 수입니다."
                          className="text-lg font-extrabold text-error cursor-help border-b border-dashed border-error pb-0.5"
                        >
                          대기 {Math.abs(avail)}명
                        </span>
                      ) : (
                        <span 
                          title="현재 사용 가능한 잔여 병상 수입니다."
                          className={`text-lg font-extrabold cursor-help border-b border-dashed pb-0.5 ${avail > 3 ? 'text-secondary border-secondary' : avail > 0 ? 'text-amber-400 border-amber-400' : 'text-error border-error'}`}
                        >
                          {avail} 병상
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-center text-sm text-on-surface-variant">{parseInt(er.hvgc) || 0}</td>
                    <td className="px-3 py-3 text-center">{er.hvoc === 'Y' ? <span className="text-green-400">●</span> : <span className="text-outline">—</span>}</td>
                    <td className="px-3 py-3 text-center">{er.hvs01 === 'Y' ? <span className="text-green-400">●</span> : <span className="text-outline">—</span>}</td>
                    <td className="px-3 py-3 text-center">{er.hvs02 === 'Y' ? <span className="text-green-400">●</span> : <span className="text-outline">—</span>}</td>
                    <td className="px-3 py-3 text-center">{er.hvs37 === 'Y' || er.hvs38 === 'Y' ? <span className="text-green-400">●</span> : <span className="text-outline">—</span>}</td>
                    <td className="px-4 py-3 text-right">
                      <a href={`tel:${er.dutyTel3}`} className="text-sm text-primary font-mono hover:underline">{er.dutyTel3}</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
