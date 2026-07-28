import React, { useState, useEffect, useCallback, useId, useRef } from 'react';
import { getERRealTimeBeds, getERMessages, getERSevereIllness, CITY_TO_SIDO, type ERRealTimeData, type ERMessage, type ERSevereIllness } from '../services/erApi';
import { getStaleAt } from '../services/apiClient';
import StaleBadge from './StaleBadge';

import PrivateAmbulanceView from './PrivateAmbulanceView';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';

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
  const [activeTab, setActiveTab] = useState<'er' | 'ambulance'>('er');
  
  const [erData, setErData] = useState<ERRealTimeData[]>([]);
  const [messages, setMessages] = useState<ERMessage[]>([]);
  const [severeData, setSevereData] = useState<Record<string, ERSevereIllness>>({});
  const [expandedRow, setExpandedRow] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState('');
  const [staleAt, setStaleAt] = useState<number | null>(null);
  const [loadError, setLoadError] = useState('');
  const [supplementalWarning, setSupplementalWarning] = useState('');
  const [noticePopupId, setNoticePopupId] = useState<string | null>(null);
  const requestSeqRef = useRef(0);
  const noticeDialogTitleId = useId();
  const noticeReturnFocusRef = useRef<HTMLElement | null>(null);
  const noticeDialogRef = useDialogAccessibility<HTMLDivElement>(Boolean(noticePopupId), () => setNoticePopupId(null), noticeReturnFocusRef);

  const fetchER = useCallback(async (forceRefresh = false) => {
    const seq = ++requestSeqRef.current;
    setLoading(true);
    setLoadError('');
    setSupplementalWarning('');
    setExpandedRow(null);
    try {
      const sido = CITY_TO_SIDO[city] || '서울특별시';
      const [bedsResult, messagesResult, severeResult] = await Promise.allSettled([
        getERRealTimeBeds(sido, '', forceRefresh),
        getERMessages(sido, '', forceRefresh),
        getERSevereIllness(sido, '', forceRefresh),
      ]);
      if (seq !== requestSeqRef.current) return;

      if (bedsResult.status === 'rejected') throw bedsResult.reason;

      const beds = bedsResult.value;
      const bedNames = new Set(beds.map(item => item.dutyName));
      const bedHpids = new Set(beds.map(item => item.phpid).filter(Boolean));
      const msgs = messagesResult.status === 'fulfilled'
        ? messagesResult.value.filter(item => bedNames.has(item.dutyName))
        : [];
      const severe = severeResult.status === 'fulfilled'
        ? severeResult.value.filter(item => bedHpids.has(item.hpid))
        : [];

      setErData(beds);
      setMessages(msgs);
      setStaleAt(getStaleAt(beds));

      if (messagesResult.status === 'rejected' || severeResult.status === 'rejected') {
        setSupplementalWarning('병상 현황은 조회됐지만 공지 또는 중증질환 수용정보 일부를 불러오지 못했습니다.');
      }
      
      const sMap: Record<string, ERSevereIllness> = {};
      severe.forEach(item => {
        if (item.hpid) sMap[item.hpid] = item;
      });
      setSevereData(sMap);

      setLastUpdate(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      if (seq !== requestSeqRef.current) return;
      console.error('ER fetch error:', e);
      setErData([]);
      setMessages([]);
      setSevereData({});
      setStaleAt(null);
      setLoadError(e instanceof Error ? e.message : '응급실 데이터를 불러오지 못했습니다.');
    } finally {
      if (seq === requestSeqRef.current) setLoading(false);
    }
  }, [city]);

  useEffect(() => { void fetchER(false); }, [fetchER]);
  useEffect(() => {
    const interval = setInterval(() => { void fetchER(true); }, 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchER]);

  // 가용 병상 합산 (응급실 + 입원실)
  const totalErAvailable = erData.reduce((sum, er) => sum + (parseInt(er.hvec) || 0), 0);
  const totalWardAvailable = erData.reduce((sum, er) => sum + (parseInt(er.hvgc) || 0), 0);
  const totalAvailable = totalErAvailable + totalWardAvailable;



  /* 메시지 분류 라벨 */
  function getMsgTypeLabel(msg: ERMessage): string {
    if (msg.symBlkMsgTyp && msg.symBlkMsgTyp.trim()) return msg.symBlkMsgTyp.trim();
    if (msg.symTypMna && msg.symTypMna.trim()) return msg.symTypMna.trim();
    if (msg.symTypMain && msg.symTypMain.trim()) return msg.symTypMain.trim();
    return '응급실 알림';
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface font-headline">🚑 구급/응급 안내</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            실시간 응급실 가용 현황 및 비응급 사설 구급차 안내 · <span className="text-primary font-bold">{CITY_TO_SIDO[city] || '서울특별시'}</span>
          </p>
        </div>
      </div>

      <div className="flex gap-2 bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-1.5 overflow-x-auto">
        <button
          onClick={() => setActiveTab('er')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'er'
              ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
              : 'text-on-surface-variant hover:bg-surface-container-high/50'
          }`}
        >
          <span className="material-symbols-outlined text-lg" style={activeTab === 'er' ? { fontVariationSettings: "'FILL' 1" } : undefined}>local_hospital</span>
          실시간 응급실 현황
        </button>
        <button
          onClick={() => setActiveTab('ambulance')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
            activeTab === 'ambulance'
              ? 'bg-secondary text-on-secondary shadow-lg shadow-secondary/20'
              : 'text-on-surface-variant hover:bg-surface-container-high/50'
          }`}
        >
          <span className="material-symbols-outlined text-lg" style={activeTab === 'ambulance' ? { fontVariationSettings: "'FILL' 1" } : undefined}>airport_shuttle</span>
          사설 구급차(이송단) 정보
        </button>
      </div>

      {activeTab === 'er' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-end gap-2">
            <StaleBadge at={staleAt} />
            <button onClick={() => { void fetchER(true); }} disabled={loading} className="bg-primary/10 text-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/20 transition-colors flex items-center gap-2 disabled:opacity-50">
              <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
              {lastUpdate && <span className="hidden sm:inline font-normal opacity-80 mr-1">{lastUpdate}</span>}
              새로고침
            </button>
          </div>

          {loadError && (
            <div role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-bold text-error">응급실 현황을 불러오지 못했습니다.</p>
                <p className="text-xs text-on-surface-variant mt-1 truncate">{loadError}</p>
              </div>
              <button type="button" onClick={() => { void fetchER(true); }} className="shrink-0 rounded-lg bg-error/15 px-3 py-2 text-sm font-bold text-error hover:bg-error/20">
                다시 시도
              </button>
            </div>
          )}

          {supplementalWarning && (
            <div role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-on-surface">
              {supplementalWarning}
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
        ) : loadError ? (
          <div className="text-center py-20 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl mb-2 block text-error">cloud_off</span>
            위의 다시 시도 버튼을 눌러 주세요.
          </div>
        ) : erData.length === 0 ? (
          <div className="text-center py-20 text-on-surface-variant">
            <span className="material-symbols-outlined text-4xl mb-2 block">local_hospital</span>
            현재 선택한 지역에서 제공되는 응급실 데이터가 없습니다.
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-surface-container/50">
                <th className="px-5 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">병원명</th>
                <th className="px-3 py-3 text-center text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">응급 병상</th>
                <th className="px-3 py-3 text-center text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">입원실</th>
                <th className="px-4 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">전화</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {[...erData]
                .sort((a, b) => (parseInt(b.hvec) || 0) - (parseInt(a.hvec) || 0))
                .map((er, i) => {
                const avail = parseInt(er.hvec) || 0;
                const isExpanded = expandedRow === er.phpid;
                const severe = severeData[er.phpid];

                return (
                  <React.Fragment key={er.phpid || i}>
                    <tr className="hover:bg-surface-container/30 transition-colors group">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={event => {
                              noticeReturnFocusRef.current = event.currentTarget;
                              setNoticePopupId(er.dutyName);
                            }}
                            className="text-left text-sm font-bold text-on-surface hover:text-primary hover:underline transition-colors"
                            title="공지사항 보기"
                          >
                            {er.dutyName}
                          </button>
                          {messages.filter(m => m.dutyName === er.dutyName).length > 0 && (
                            <button
                              type="button"
                              aria-label={`${er.dutyName} 공지사항 보기`}
                              onClick={event => {
                                noticeReturnFocusRef.current = event.currentTarget;
                                setNoticePopupId(er.dutyName);
                              }}
                              className="flex h-8 w-8 items-center justify-center text-error animate-pulse hover:scale-110 transition-transform"
                              title="공지사항 보기"
                            >
                              <span aria-hidden="true" className="material-symbols-outlined text-[14px]">campaign</span>
                            </button>
                          )}
                          {severe && (
                            <button
                              type="button"
                              aria-label={`${er.dutyName} 중증질환 수용정보 ${isExpanded ? '접기' : '펼치기'}`}
                              onClick={() => setExpandedRow(isExpanded ? null : er.phpid)}
                              className="flex h-8 w-8 items-center justify-center text-primary hover:bg-primary/10 rounded-full ml-1 transition-colors"
                              title="중증질환 수용정보 확인"
                            >
                              <span aria-hidden="true" className="material-symbols-outlined text-[18px]">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                            </button>
                          )}
                        </div>
                        <p className="text-[10px] text-on-surface-variant truncate max-w-[280px] mt-0.5">{er.dutyAddr}</p>
                      </td>
                      <td className="px-3 py-3 text-center">
                        {avail < 0 ? (
                          <span 
                            title="현재 대기 중인 환자 수입니다."
                            className="text-lg font-extrabold text-error bg-error/10 px-3 py-0.5 rounded-full cursor-help"
                          >
                            대기 {Math.abs(avail)}석
                          </span>
                        ) : avail === 0 ? (
                          <span 
                            title="잔여 병상이 없습니다."
                            className="text-lg font-extrabold text-on-surface-variant/50 cursor-help"
                          >
                            잔여 0석
                          </span>
                        ) : (
                          <span 
                            title="현재 사용 가능한 잔여 병상 수입니다."
                            className={`text-lg font-extrabold cursor-help border-b border-dashed pb-0.5 ${avail > 3 ? 'text-secondary border-secondary' : 'text-amber-400 border-amber-400'}`}
                          >
                            잔여 {avail}석
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-center text-sm text-on-surface-variant font-mono">{parseInt(er.hvgc) || 0}</td>
                      <td className="px-4 py-3 text-right">
                        <a href={`tel:${er.dutyTel3}`} className="text-sm text-primary font-mono hover:underline">{er.dutyTel3}</a>
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr className="bg-surface-container/20">
                        <td colSpan={4} className="px-5 py-4 border-t border-outline-variant/10">
                          <div className="flex flex-col gap-3">
                            <div className="flex items-center gap-2">
                              <span className="material-symbols-outlined text-primary text-sm">local_hospital</span>
                              <span className="text-xs font-bold text-on-surface uppercase tracking-widest">수용 가능 현황 및 공지사항</span>
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

      {/* 팝업 모달 */}
      {noticePopupId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={() => setNoticePopupId(null)}>
          <div ref={noticeDialogRef} role="dialog" aria-modal="true" aria-labelledby={noticeDialogTitleId} tabIndex={-1} className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between">
              <h3 id={noticeDialogTitleId} className="text-lg font-bold text-on-surface flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">local_hospital</span>
                {noticePopupId}
              </h3>
              <button type="button" aria-label="응급실 공지 닫기" onClick={() => setNoticePopupId(null)} className="flex h-11 w-11 items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors bg-surface-container rounded-full">
                <span aria-hidden="true" className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
              <h4 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-error">campaign</span>
                긴급 공지사항
              </h4>
              {messages.filter(m => m.dutyName === noticePopupId).length > 0 ? (
                messages.filter(m => m.dutyName === noticePopupId).map((msg, idx) => (
                  <div key={idx} className="bg-error/10 border border-error/30 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                       <span className="px-2 py-1 bg-error/20 text-error rounded text-[10px] font-bold">{getMsgTypeLabel(msg)}</span>
                    </div>
                    <p className="text-sm text-error/90 font-medium leading-relaxed whitespace-pre-wrap">
                      {msg.symBlkMsg || msg.symOutCon || msg.symTypMain || '상세 내용 없음'}
                    </p>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 bg-surface-container/30 rounded-xl text-on-surface-variant">
                   <span className="material-symbols-outlined text-3xl mb-2 opacity-50 block">check_circle</span>
                   발령된 특이 공지사항이 없습니다.
                </div>
              )}
            </div>
          </div>
        </div>
      )}
        </div>
      ) : (
        <PrivateAmbulanceView city={city} />
      )}
    </div>
  );
}

