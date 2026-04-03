import React, { useState, useEffect, useCallback } from 'react';
import { getERRealTimeBeds, getERMessages, getERSevereIllness, CITY_TO_SIDO, type ERRealTimeData, type ERMessage, type ERSevereIllness } from '../services/erApi';

/* ─── 중증질환 필드 한글 매핑 ─── */
const SEVERE_LABELS: Record<string, string> = {
  MKioskTy1: 'ST분절 상승 심근경색',
  MKioskTy2: '뇌경색 (급성기)',
  MKioskTy3: '뇌출혈',
  MKioskTy4: '복부손상 (외상)',
  MKioskTy5: '사지접합 (외상)',
  MKioskTy6: '장중첩',
  MKioskTy7: '화상',
  MKioskTy8: '소아중증외상',
  MKioskTy9: '대동맥질환',
  MKioskTy10: '전 연령 응급',
  MKioskTy11: '뇌동맥류 / SAH',
  MKioskTy12: '급성 관상동맥',
  MKioskTy13: '고위험 임산부',
  MKioskTy14: '소아',
  MKioskTy15: '스트로크 체계',
  MKioskTy16: '외상소생술',
  MKioskTy17: '대동맥 응급',
  MKioskTy18: '담도계질환',
  MKioskTy19: '복막염',
  MKioskTy20: '장폐색',
  MKioskTy21: '중증 폐질환',
  MKioskTy22: '중증 화상',
  MKioskTy23: '지주막하 출혈',
  MKioskTy24: '급성 동맥폐색',
  MKioskTy25: '중증 패혈증',
  MKioskTy26: '뇌혈관질환',
  MKioskTy27: '신생아',
  MKioskTy28: '산부인과 응급',
};

/** Msg 키는 해당 질환의 상세 메시지이므로 숨김 */
const SEVERE_SKIP_KEYS = new Set(['dutyName', 'hpid', 'dutyEmclsName', 'dutyAddr', 'dutyTel3', 'phpid', 'rnum', 'wgs84Lat', 'wgs84Lon']);

function isMsgKey(key: string): boolean {
  return /Msg$/.test(key);
}

interface ERViewProps {
  city: string;
}

export default function ERDashboard({ city }: ERViewProps) {
  const [erData, setErData] = useState<ERRealTimeData[]>([]);
  const [messages, setMessages] = useState<ERMessage[]>([]);
  const [severeData, setSevereData] = useState<Record<string, ERSevereIllness>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState('');

  const fetchER = useCallback(async () => {
    setLoading(true);
    try {
      const sido = CITY_TO_SIDO[city] || '서울특별시';
      const [beds, msgs, severe] = await Promise.all([
        getERRealTimeBeds(sido),
        getERMessages(sido),
        getERSevereIllness(sido)
      ]);
      
      setErData(beds);
      setMessages(msgs);
      
      const sMap: Record<string, ERSevereIllness> = {};
      severe.forEach(item => {
        if (item.hpid) sMap[item.hpid] = item;
      });
      setSevereData(sMap);

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

  // 가용 병상 합산 (응급실 + 입원실)
  const totalErAvailable = erData.reduce((sum, er) => sum + (parseInt(er.hvec) || 0), 0);
  const totalWardAvailable = erData.reduce((sum, er) => sum + (parseInt(er.hvgc) || 0), 0);
  const totalAvailable = totalErAvailable + totalWardAvailable;



  /* 메시지 분류 라벨 */
  function getMsgTypeLabel(msg: ERMessage): string {
    if (msg.symTypMna && msg.symTypMna.trim()) return msg.symTypMna.trim();
    if (msg.symTypMain && msg.symTypMain.trim()) return msg.symTypMain.trim();
    return '응급실 알림';
  }

  const [noticeOpen, setNoticeOpen] = useState(false);

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

      {/* 긴급 알림 Ticker — 통계 카드 위에 배치 + 접기/열기 */}
      {messages.length > 0 && (
        <div className="bg-error/10 border border-error/30 rounded-xl overflow-hidden">
          <button
            onClick={() => setNoticeOpen(!noticeOpen)}
            className="w-full p-4 flex items-center gap-4 hover:bg-error/5 transition-colors"
          >
            <div className="bg-error/20 p-2 rounded-full">
              <span className="material-symbols-outlined text-error text-xl block">campaign</span>
            </div>
            <h3 className="text-error font-extrabold flex-1 text-left">
              응급실 긴급 공지사항
              <span className="ml-2 text-xs font-mono text-error/60">{messages.length}건</span>
            </h3>
            <span className={`material-symbols-outlined text-error/60 transition-transform duration-200 ${noticeOpen ? 'rotate-180' : ''}`}>
              expand_more
            </span>
          </button>
          {noticeOpen && (
            <div className="px-4 pb-4 space-y-3 max-h-48 overflow-y-auto custom-scrollbar">
              {messages.map((msg, i) => (
                <div key={i} className="text-sm bg-surface-container-lowest/50 p-3 rounded-lg border border-outline-variant/5">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="font-extrabold text-on-surface text-base">{msg.dutyName}</span>
                    <span className="px-2 py-0.5 bg-error/20 text-error rounded text-[10px] font-bold">{getMsgTypeLabel(msg)}</span>
                  </div>
                  <p className="text-on-surface-variant font-medium leading-relaxed">{msg.symOutCon || msg.symTypMain || '상세 내용 없음'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 text-center">
          <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">조회 병원</p>
          <p className="text-3xl font-extrabold text-on-surface mt-1">{erData.length}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 text-center">
          <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">응급실 가용</p>
          <p className={`text-3xl font-extrabold mt-1 ${totalErAvailable > 10 ? 'text-secondary' : totalErAvailable > 0 ? 'text-amber-400' : 'text-error'}`}>{totalErAvailable}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 text-center">
          <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">입원실 가용</p>
          <p className={`text-3xl font-extrabold mt-1 ${totalWardAvailable > 5 ? 'text-blue-400' : totalWardAvailable > 0 ? 'text-amber-400' : 'text-on-surface-variant'}`}>{totalWardAvailable}</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 text-center">
          <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">가용 합계</p>
          <p className={`text-3xl font-extrabold mt-1 ${totalAvailable > 10 ? 'text-secondary' : totalAvailable > 0 ? 'text-amber-400' : 'text-error'}`}>{totalAvailable}</p>
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
                const isExpanded = expandedRow === er.phpid;
                const severe = severeData[er.phpid];

                return (
                  <React.Fragment key={er.phpid || i}>
                    <tr onClick={() => setExpandedRow(isExpanded ? null : er.phpid)} className="hover:bg-surface-container/30 transition-colors cursor-pointer group">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold text-on-surface group-hover:text-primary transition-colors">{er.dutyName}</p>
                          {severe && (
                            <span className="material-symbols-outlined text-[14px] text-primary" title="중증질환 수용정보 클릭하여 확인">
                              {isExpanded ? 'expand_less' : 'expand_more'}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-on-surface-variant truncate max-w-[280px] mt-0.5">{er.dutyAddr}</p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {avail < 0 ? (
                          <span 
                            title="현재 대기 중인 환자 수입니다."
                            className="text-lg font-extrabold text-error cursor-help border-b border-dashed border-error pb-0.5"
                          >
                            대기 {Math.abs(avail)}석
                          </span>
                        ) : (
                          <span 
                            title="현재 사용 가능한 잔여 병상 수입니다."
                            className={`text-lg font-extrabold cursor-help border-b border-dashed pb-0.5 ${avail > 3 ? 'text-secondary border-secondary' : avail > 0 ? 'text-amber-400 border-amber-400' : 'text-error border-error'}`}
                          >
                            잔여 {avail}석
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-sm text-on-surface-variant font-mono">{parseInt(er.hvgc) || 0}</td>
                      <td className="px-3 py-3 text-center">{er.hvoc === 'Y' ? <span className="text-green-400 font-bold">●</span> : <span className="text-outline">—</span>}</td>
                      <td className="px-3 py-3 text-center">{er.hvs01 === 'Y' ? <span className="text-green-400 font-bold">●</span> : <span className="text-outline">—</span>}</td>
                      <td className="px-3 py-3 text-center">{er.hvs02 === 'Y' ? <span className="text-green-400 font-bold">●</span> : <span className="text-outline">—</span>}</td>
                      <td className="px-3 py-3 text-center">{er.hvs37 === 'Y' || er.hvs38 === 'Y' ? <span className="text-green-400 font-bold">●</span> : <span className="text-outline">—</span>}</td>
                      <td className="px-4 py-3 text-right">
                        <a href={`tel:${er.dutyTel3}`} onClick={(e) => e.stopPropagation()} className="text-sm text-primary font-mono hover:underline">{er.dutyTel3}</a>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-surface-container/20">
                        <td colSpan={8} className="px-5 py-4 border-t border-outline-variant/10">
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-primary text-sm">local_hospital</span>
                              <span className="text-xs font-bold text-on-surface uppercase tracking-widest">중증질환자 수용 가능 현황</span>
                            </div>
                            {severe ? (
                              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-7 gap-2 mt-1">
                                {Object.entries(severe)
                                  .filter(([key]) => !SEVERE_SKIP_KEYS.has(key) && !isMsgKey(key))
                                  .sort(([a], [b]) => {
                                    const numA = parseInt(a.replace(/\D/g, '')) || 0;
                                    const numB = parseInt(b.replace(/\D/g, '')) || 0;
                                    return numA - numB;
                                  })
                                  .map(([key, rawVal]) => {
                                    const label = SEVERE_LABELS[key] || key;
                                    const val = (rawVal || '').trim();
                                    const isY = val === 'Y';
                                    const isN = val === 'N';
                                    const hasSpecialMsg = val.length > 0 && !isY && !isN;

                                    let colorClass: string;
                                    let statusIcon: string;
                                    let statusText: string;

                                    if (isY) {
                                      colorClass = 'bg-green-500/10 border-green-500/30';
                                      statusIcon = '●';
                                      statusText = '수용 가능';
                                    } else if (isN) {
                                      colorClass = 'bg-error/10 border-error/30';
                                      statusIcon = '✕';
                                      statusText = '불가';
                                    } else if (hasSpecialMsg) {
                                      colorClass = 'bg-amber-500/10 border-amber-500/30';
                                      statusIcon = '⚠';
                                      statusText = val;
                                    } else {
                                      colorClass = 'bg-surface-container border-outline-variant/20';
                                      statusIcon = '—';
                                      statusText = '정보없음';
                                    }

                                    return (
                                      <div key={key} className={`text-[11px] px-2 py-2 rounded-lg border ${colorClass} flex flex-col items-center gap-1 text-center`}>
                                        <span className="text-[10px] text-on-surface-variant leading-tight font-medium">{label}</span>
                                        <span className={`text-sm font-bold ${isY ? 'text-green-400' : isN ? 'text-error' : hasSpecialMsg ? 'text-amber-400' : 'text-outline'}`}>
                                          {statusIcon}
                                        </span>
                                        <span className={`text-[9px] ${isY ? 'text-green-400/80' : isN ? 'text-error/80' : 'text-on-surface-variant/60'}`}>
                                          {statusText}
                                        </span>
                                      </div>
                                    );
                                  })}
                              </div>
                            ) : (
                              <div className="text-sm text-on-surface-variant bg-surface-container/30 px-4 py-3 rounded-lg inline-block">
                                수용정보 데이터가 제공되지 않는 의료기관입니다.
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

