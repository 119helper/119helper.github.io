import { useState } from 'react';
import { fetchBuildingRegister, type BuildingRegisterInfo } from '../services/buildingApi';

export default function BuildingView() {
  const [address, setAddress] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [bldgInfo, setBldgInfo] = useState<(BuildingRegisterInfo & { searchedAddress?: string }) | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = () => {
    if (!address.trim()) return;
    setIsLoading(true);
    setErrorMsg('');
    setBldgInfo(null);
    setHasSearched(true);

    if (!window.kakao?.maps?.services) {
      setErrorMsg('카카오 주소검색(Geocoder) 서비스 로드 실패. [새로고침] 해주세요.');
      setIsLoading(false);
      return;
    }

    const geocoder = new window.kakao.maps.services.Geocoder();
    geocoder.addressSearch(address, async (result: any, status: any) => {
      if (status === window.kakao.maps.services.Status.OK && result[0]) {
        const item = result[0];
        // 지번 주소 객체가 우선(대장 조회용), 없으면 도로명 주소
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
        // 산(임야) 여부, V2 API는 mountain_yn을 내려줌.
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
      } else {
        setErrorMsg('입력하신 주소를 지도에서 찾을 수 없습니다.');
        setIsLoading(false);
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSearch();
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

      {hasSearched && !isLoading && !bldgInfo && !errorMsg && (
        <p className="text-on-surface-variant text-sm mt-4 italic">조회를 완료했지만 데이터가 응답되지 않았습니다.</p>
      )}
    </div>
  );
}
