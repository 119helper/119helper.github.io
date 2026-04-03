import { useState } from 'react';
import { fetchBuildingRegister, type BuildingRegisterInfo } from '../services/buildingApi';
import { fetchFireObjectAccom, fetchFireObjectFireSys } from '../services/apiClient';

interface FireObjectAccom {
  bldNm?: string;
  ctprvn?: string;
  signgu?: string;
  bjdong?: string;
  rdnmadr?: string;
  lnmadr?: string;
  flrCo?: string;
  useAprDe?: string;
  spclObjNm?: string;
  rn?: string;
  [key: string]: any;
}

interface FireObjectFireSys {
  bldNm?: string;
  ctprvn?: string;
  signgu?: string;
  rdnmadr?: string;
  sprinklerInstlYn?: string;
  outdoorHydrantInstlYn?: string;
  indoorHydrantInstlYn?: string;
  autoFirAlrmInstlYn?: string;
  flrCo?: string;
  [key: string]: any;
}

export default function BuildingView() {
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [bldgInfo, setBldgInfo] = useState<(BuildingRegisterInfo & { searchedAddress?: string }) | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  // 소방시설 정보
  const [fireAccom, setFireAccom] = useState<FireObjectAccom[]>([]);
  const [fireSys, setFireSys] = useState<FireObjectFireSys[]>([]);
  const [fireLoading, setFireLoading] = useState(false);
  const [fireError, setFireError] = useState('');

  const handleSearch = () => {
    if (!address.trim()) return;
    setIsLoading(true);
    setErrorMsg('');
    setBldgInfo(null);
    setHasSearched(true);
    setFireAccom([]);
    setFireSys([]);
    setFireError('');

    if (!window.kakao?.maps?.services) {
      setErrorMsg('카카오 주소검색(Geocoder) 서비스 로드 실패. [새로고침] 해주세요.');
      setIsLoading(false);
      return;
    }

    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.addressSearch(address, async (result: any, status: any) => {
      if (status === window.kakao.maps.services.Status.OK && result[0]) {
        const item = result[0];
        const addrObj = item.address;

        if (!addrObj || !addrObj.b_code) {
          setErrorMsg('상세 지번(법정동 코드)을 파악할 수 없는 주소입니다.');
          setIsLoading(false);
          return;
        }

        const bCode = addrObj.b_code as string;
        if (bCode.length < 10) {
           setErrorMsg('올바른 법정동 코드를 추출할 수 없습니다.');
           setIsLoading(false);
           return;
        }
        
        const sigunguCd = bCode.substring(0, 5);
        const bjdongCd = bCode.substring(5, 10);
        const platGbCd = (addrObj.mountain_yn === 'Y' || addrObj.san_yn === 'Y') ? '1' : '0';
        const bun = addrObj.main_address_no || '';
        const ji = addrObj.sub_address_no || '0';

        if (!bun) {
           setErrorMsg('정확히 번지가 기재되지 않은 주소입니다. (예: 번지까지 입력 필요)');
           setIsLoading(false);
           return;
        }

        try {
          const apiRes = await fetchBuildingRegister(sigunguCd, bjdongCd, platGbCd, bun, ji);
          if (apiRes) {
            setBldgInfo({ ...apiRes, searchedAddress: addrObj.address_name });
          } else {
            setErrorMsg('해당 주소에 등록된 건축물대장 표제건물 정보를 찾을 수 없습니다.');
          }
        } catch {
          setErrorMsg('정부 건축물대장 API 허브 연동 중 오류 발생');
        }
        setIsLoading(false);

        // 소방시설 정보 조회 (지역명 추출)
        const sido = addrObj.region_1depth_name || '';
        if (sido) {
          setFireLoading(true);
          try {
            const [accomRes, sysRes] = await Promise.allSettled([
              fetchFireObjectAccom(sido, '50'),
              fetchFireObjectFireSys(sido, '50'),
            ]);
            if (accomRes.status === 'fulfilled') setFireAccom(accomRes.value.items || []);
            if (sysRes.status === 'fulfilled') setFireSys(sysRes.value.items || []);
          } catch {
            setFireError('소방시설 정보 조회 실패 — API 승인 대기 중일 수 있습니다.');
          }
          setFireLoading(false);
        }
      } else {
        setErrorMsg('입력하신 주소를 지도에서 찾을 수 없습니다.');
        setIsLoading(false);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
  };

  const YnBadge = ({ val, label }: { val?: string; label: string }) => {
    const isY = val === 'Y' || val === '1';
    return (
      <div className={`px-3 py-2 rounded-lg border text-center ${isY ? 'bg-green-500/10 border-green-500/30' : 'bg-surface-container border-outline-variant/20'}`}>
        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{label}</p>
        <p className={`text-sm font-extrabold mt-0.5 ${isY ? 'text-green-400' : 'text-outline'}`}>{isY ? '설치' : '미설치'}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl md:text-3xl font-extrabold text-on-surface font-headline flex items-center gap-2">
        <span className="material-symbols-outlined text-4xl text-purple-400">apartment</span>
        건축물대장 현장 검색
      </h2>
      <p className="text-sm text-on-surface-variant font-medium">단순 주소만 입력하면 지번 변환 후 국토부 대장을 끌어옵니다.</p>
      <div className="flex gap-3 max-w-2xl">
        <input
          type="text"
          value={address}
          onChange={e => setAddress(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="도로명 또는 지번 입력 (예: 서울특별시 종로구 세종대로 209)"
          className="flex-1 bg-surface-container border border-outline-variant/30 rounded-xl px-4 py-3 text-on-surface shadow-sm placeholder:text-outline text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all font-bold"
        />
        <button 
          onClick={handleSearch}
          disabled={isLoading || !address.trim()}
          className="bg-primary text-on-primary px-6 py-3 rounded-xl font-bold hover:bg-primary/80 transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-2"
        >
          {isLoading ? <span className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span> : <span className="material-symbols-outlined text-[20px]">search</span>}
          검색
        </button>
      </div>

      {errorMsg && (
        <div className="max-w-2xl p-4 bg-error/10 border border-error/20 rounded-xl flex items-center gap-3">
          <span className="material-symbols-outlined text-error">error</span>
          <p className="text-sm font-bold text-error">{errorMsg}</p>
        </div>
      )}

      {bldgInfo && !isLoading && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 md:p-8 space-y-6 max-w-4xl shadow-xl shadow-surface-container/10">
          <div className="border-b border-outline-variant/10 pb-4">
            <h3 className="text-xl md:text-2xl font-extrabold text-on-surface mb-1 text-primary">
              {bldgInfo.bldNm || '건물명 없음 (미등재/일반건축물)'}
            </h3>
            <p className="text-sm font-bold text-on-surface-variant tracking-wide">
              {bldgInfo.searchedAddress}
            </p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 md:gap-5">
            {[
              { label: '주요 구조', value: bldgInfo.strctCdNm || '미분류' },
              { label: '층수', value: `지하 ${bldgInfo.ugrndFlrCnt || 0}층 / 지상 ${bldgInfo.grndFlrCnt || 0}층` },
              { label: '주 용도', value: bldgInfo.mainPurpsCdNm || '확인불가' },
              { label: '연면적', value: bldgInfo.totArea ? `${bldgInfo.totArea} ㎡` : '확인불가' },
              { label: '건축면적', value: bldgInfo.archArea ? `${bldgInfo.archArea} ㎡` : '확인불가' },
              { label: '건폐 / 용적률', value: `${bldgInfo.bcRat || 0}% / ${bldgInfo.vlRat || 0}%` },
              { label: '준공(사용승인)일', value: bldgInfo.useAprDay ? `${bldgInfo.useAprDay.substring(0,4)}년 ${bldgInfo.useAprDay.substring(4,6)}월 ${bldgInfo.useAprDay.substring(6,8)}일` : '미상' },
            ].map(item => (
              <div key={item.label} className="bg-surface-container hover:bg-surface-container-high transition-colors rounded-xl p-4 border border-outline-variant/5">
                <p className="text-[11px] font-bold text-on-surface-variant uppercase tracking-widest">{item.label}</p>
                <p className="text-base font-extrabold text-on-surface mt-1 border-b border-transparent">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 소방시설 정보 섹션 */}
      {hasSearched && !isLoading && (fireSys.length > 0 || fireAccom.length > 0 || fireLoading || fireError) && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-6 md:p-8 space-y-5 max-w-4xl shadow-xl shadow-surface-container/10">
          <div className="flex items-center gap-3 border-b border-outline-variant/10 pb-4">
            <span className="material-symbols-outlined text-3xl text-orange-400">local_fire_department</span>
            <div>
              <h3 className="text-lg font-extrabold text-on-surface">숙박시설 소방시설 현황</h3>
              <p className="text-xs text-on-surface-variant">해당 지역 특정소방대상물(숙박시설)의 스프링클러 등 소방시설 설치 현황</p>
            </div>
          </div>
          
          {fireLoading && (
            <div className="flex items-center gap-3 py-8 justify-center">
              <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
              <span className="text-on-surface-variant text-sm">소방시설 정보 조회 중...</span>
            </div>
          )}

          {fireError && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-center gap-3">
              <span className="material-symbols-outlined text-amber-400">info</span>
              <p className="text-sm font-medium text-amber-300">{fireError}</p>
            </div>
          )}

          {fireSys.length > 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                조회 결과 · {fireSys.length}건
              </p>
              <div className="space-y-3 max-h-[400px] overflow-y-auto custom-scrollbar">
                {fireSys.slice(0, 20).map((sys, i) => (
                  <div key={i} className="bg-surface-container rounded-xl p-4 border border-outline-variant/10">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="text-sm font-extrabold text-on-surface">{sys.bldNm || '이름 미등록'}</p>
                        <p className="text-[11px] text-on-surface-variant mt-0.5">{sys.rdnmadr || sys.lnmadr || `${sys.ctprvn} ${sys.signgu}`}</p>
                        {sys.flrCo && <p className="text-[11px] text-on-surface-variant">지상 {sys.flrCo}층</p>}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <YnBadge val={sys.sprinklerInstlYn} label="스프링클러" />
                      <YnBadge val={sys.indoorHydrantInstlYn} label="옥내소화전" />
                      <YnBadge val={sys.outdoorHydrantInstlYn} label="옥외소화전" />
                      <YnBadge val={sys.autoFirAlrmInstlYn} label="자동화재탐지" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {fireAccom.length > 0 && fireSys.length === 0 && (
            <div className="space-y-3">
              <p className="text-xs font-bold text-on-surface-variant uppercase tracking-widest">
                숙박시설 목록 · {fireAccom.length}건
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {fireAccom.slice(0, 10).map((acc, i) => (
                  <div key={i} className="bg-surface-container rounded-lg p-3 border border-outline-variant/10">
                    <p className="text-sm font-bold text-on-surface">{acc.bldNm || acc.spclObjNm || '이름 미등록'}</p>
                    <p className="text-[11px] text-on-surface-variant">{acc.rdnmadr || acc.lnmadr || `${acc.ctprvn} ${acc.signgu}`}</p>
                    {acc.flrCo && <p className="text-[10px] text-on-surface-variant/60">지상 {acc.flrCo}층</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!fireLoading && !fireError && fireSys.length === 0 && fireAccom.length === 0 && (
            <div className="text-center py-6 text-on-surface-variant">
              <span className="material-symbols-outlined text-3xl mb-2 block text-outline">pending</span>
              <p className="text-sm">해당 지역 소방시설 데이터가 아직 제공되지 않습니다.</p>
              <p className="text-xs text-on-surface-variant/60 mt-1">API 승인 직후에는 데이터 활성화에 시간이 소요될 수 있습니다.</p>
            </div>
          )}
        </div>
      )}

      {hasSearched && !isLoading && !bldgInfo && !errorMsg && (
        <p className="text-on-surface-variant text-sm mt-4 italic">조회를 완료했지만 데이터가 응답되지 않았습니다.</p>
      )}
    </div>
  );
}
