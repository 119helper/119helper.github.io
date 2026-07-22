import { useState, useEffect } from 'react';
import { fetchPrivateAmbulances, type PrivateAmbulance } from '../services/ambulanceApi';
import { CITY_TO_SIDO } from '../services/erApi';
import { useAppFeedback } from '../contexts/FeedbackContext';

const SMS_TEMPLATE = "[119 Helper 안내]\n요청하신 민간 이송업체(사설 구급차) 연락처입니다.\n\n업체명: {name}\n연락처: {tel}\n\n* 본 정보는 국립중앙의료원 정식 등록 업체 정보입니다.";

export default function PrivateAmbulanceView({ city }: { city: string }) {
  const { showNotice } = useAppFeedback();
  const [ambulances, setAmbulances] = useState<PrivateAmbulance[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = async (force: boolean) => {
    setLoading(true);
    const data = await fetchPrivateAmbulances(city, force);
    setAmbulances(data);
    setLoading(false);
  };

  useEffect(() => {
    loadData(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city]);

  const handleShare = async (item: PrivateAmbulance) => {
    const text = SMS_TEMPLATE.replace('{name}', item.dutyName).replace('{tel}', item.onrTel);
    
    // 모바일 기기라면 바로 SMS 공유 다이얼로그 호출, 아니라면 클립보드 복사
    if (/Android|iPhone|iPad/i.test(navigator.userAgent)) {
      window.open(`sms:?body=${encodeURIComponent(text)}`);
    } else {
      try {
        await navigator.clipboard.writeText(text);
        showNotice({ message: '연락처와 안내 문구를 복사했습니다. 문자 작성 화면에 붙여넣어 주세요.', tone: 'success' });
      } catch {
        showNotice({ message: '연락처를 복사하지 못했습니다.', tone: 'error' });
      }
    }
  };

  const filtered = ambulances.filter(a => 
    a.dutyName.includes(searchTerm) || a.dutyAddr.includes(searchTerm)
  );

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 flex gap-3 items-start">
        <span className="material-symbols-outlined text-primary mt-0.5">info</span>
        <div>
          <h3 className="font-bold text-primary mb-1">비응급 환자 사설 구급차 연계 가이드</h3>
          <p className="text-sm text-on-surface-variant leading-relaxed">
            단순 주취자, 거동불편자, 병원 간 단순 이송 등 119 구급차 출동 요건에 해당하지 않는 비응급 환자 발생 시, 
            보호자에게 국가 정식 등록 이송업체(사설 구급차) 정보를 안내할 수 있습니다.
          </p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h3 className="text-lg font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined">airport_shuttle</span>
            {CITY_TO_SIDO[city] || '서울특별시'} 등록 구급차
            <span className="bg-surface-variant text-on-surface-variant px-2 py-0.5 rounded-full text-xs ml-2">
              총 {ambulances.length}건
            </span>
          </h3>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-lg">search</span>
        <input
          aria-label="사설 구급차 업체 검색"
              type="text" 
              placeholder="업체명 또는 주소 검색"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-surface-container-lowest border border-outline-variant/30 text-on-surface placeholder-on-surface-variant/50 rounded-xl pl-10 pr-4 py-2 focus:outline-none focus:border-primary/50 transition-colors"
            />
          </div>
          <button 
            onClick={() => loadData(true)}
            disabled={loading}
            className="p-2.5 rounded-xl bg-surface-container-low text-on-surface hover:bg-surface-container-high transition-colors flex items-center shadow-sm disabled:opacity-50 shrink-0"
            title="새로고침"
          >
            <span className={`material-symbols-outlined ${loading ? 'animate-spin' : ''}`}>refresh</span>
          </button>
        </div>
      </div>

      {loading && ambulances.length === 0 ? (
         <div className="flex flex-col items-center justify-center py-20 text-on-surface-variant">
           <span className="material-symbols-outlined text-4xl animate-spin text-primary mb-4">progress_activity</span>
           <p>사설 구급차 정보를 조회하고 있습니다...</p>
         </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-surface-container-lowest rounded-xl border border-dashed border-outline-variant/30 text-on-surface-variant">
           <span className="material-symbols-outlined text-4xl opacity-50 mb-2">search_off</span>
           <p>검색된 업체가 없거나 관할 지역에 등록된 정보가 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((item, idx) => (
            <div key={`${item.dutyName}-${idx}`} className="bg-surface-container-lowest border border-outline-variant/20 rounded-xl p-5 flex flex-col justify-between hover:border-primary/30 transition-colors group">
              <div>
                <div className="flex justify-between items-start mb-2">
                  <h4 className="font-extrabold text-lg text-on-surface">{item.dutyName}</h4>
                  <span className="bg-surface-container text-on-surface-variant px-2 py-0.5 rounded text-xs ml-2 shrink-0 font-mono">
                    {item.carSeq}
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant mb-4 flex items-start gap-1">
                  <span className="material-symbols-outlined text-[16px] shrink-0 mt-0.5">location_on</span>
                  {item.dutyAddr}
                </p>
                <div className="flex items-center gap-3 text-sm mb-6">
                  <div className="flex items-center gap-1.5 bg-green-500/10 text-green-600 dark:text-green-400 px-3 py-1.5 rounded-lg font-mono font-bold">
                    <span className="material-symbols-outlined text-[16px]">call</span>
                    {item.onrTel}
                  </div>
                  <div className="text-on-surface-variant text-xs">대표: {item.onrNam}</div>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 pt-3 border-t border-outline-variant/10">
                <a 
                  href={`tel:${item.onrTel}`}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-surface-container border border-outline-variant/10 text-on-surface font-bold text-sm hover:bg-surface-container-high transition-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">phone_in_talk</span>
                  전화 걸기
                </a>
                <button 
                  onClick={() => handleShare(item)}
                  className="flex items-center justify-center gap-2 py-2.5 rounded-lg bg-primary text-on-primary font-bold text-sm shadow-md shadow-primary/20 hover:brightness-110 active:scale-95 transition-all"
                >
                  <span className="material-symbols-outlined text-[18px]">share</span>
                  문자 공유
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
