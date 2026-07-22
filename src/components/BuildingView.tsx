import { useCallback, useEffect, useState, useRef, type FormEvent } from 'react';
import { fetchBuildingRegister, type BuildingRegisterInfo } from '../services/buildingApi';
import { fetchFireObjectAccom, fetchFireObjectFireSys, isStaleDataError, type PaginatedItemsResponse } from '../services/apiClient';
import { loadStoredJson, removeStoredJson, saveStoredJson } from '../services/privacySettings';
import type { BuildingWorkspaceState, FireObjectAccom, FireObjectFireSys } from '../types/buildingWorkspace';

interface RecentSearchItem {
  address: string;
  params?: {
    sigunguCd: string;
    bjdongCd: string;
    platGbCd: string;
    bun: string;
    ji: string;
    sido: string;
    address_name: string;
  };
}

const isRecentSearchItem = (value: unknown): value is RecentSearchItem => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<RecentSearchItem>;
  if (typeof candidate.address !== 'string') return false;
  if (candidate.params === undefined) return true;
  return typeof candidate.params === 'object' && candidate.params !== null
    && typeof candidate.params.sigunguCd === 'string'
    && typeof candidate.params.bjdongCd === 'string'
    && typeof candidate.params.platGbCd === 'string'
    && typeof candidate.params.bun === 'string'
    && typeof candidate.params.ji === 'string'
    && typeof candidate.params.sido === 'string'
    && typeof candidate.params.address_name === 'string';
};

const loadRecentSearches = (): RecentSearchItem[] => {
  return loadStoredJson<RecentSearchItem[]>('119helper-building-recent', [], parsed => {
    if (!Array.isArray(parsed)) return [];

    return parsed.map((v): RecentSearchItem | null => {
      if (typeof v === 'string') return { address: v };
      return isRecentSearchItem(v) ? v : null;
    }).filter((v): v is RecentSearchItem => v !== null).slice(0, 10);
  });
};

interface BuildingViewProps {
  initialAddress?: string;
  workspace: BuildingWorkspaceState;
  onWorkspaceChange: (patch: Partial<BuildingWorkspaceState>) => void;
}

export default function BuildingView({ initialAddress = '', workspace, onWorkspaceChange }: BuildingViewProps) {
  const normalizedInitialAddress = initialAddress.trim();
  const { address, errorMsg, warningMsg, bldgInfo, hasSearched, fireAccom, fireSys, fireError } = workspace;
  const [isLoading, setIsLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>(loadRecentSearches);
  const [fireLoading, setFireLoading] = useState(false);
  const requestSeqRef = useRef(0);
  const appliedInitialAddressRef = useRef('');
  const updateWorkspace = useCallback((patch: Partial<BuildingWorkspaceState>) => {
    onWorkspaceChange(patch);
  }, [onWorkspaceChange]);

  useEffect(() => {
    return () => {
      requestSeqRef.current += 1;
    };
  }, []);

  useEffect(() => {
    if (!normalizedInitialAddress) {
      appliedInitialAddressRef.current = '';
      return;
    }
    if (appliedInitialAddressRef.current === normalizedInitialAddress) return;

    appliedInitialAddressRef.current = normalizedInitialAddress;
    if (!address.trim()) {
      updateWorkspace({ address: normalizedInitialAddress });
    }
  }, [address, normalizedInitialAddress, updateWorkspace]);

  const runSearch = (target: string | RecentSearchItem, forceRefresh = false) => {
    const isObj = typeof target === 'object';
    const targetAddress = isObj ? target.address : target;
    const targetParams = isObj ? target.params : undefined;

    if (!targetAddress.trim()) return;

    const seq = ++requestSeqRef.current;
    setIsLoading(true);
    setFireLoading(false);
    updateWorkspace({
      address: targetAddress,
      errorMsg: '',
      warningMsg: '',
      bldgInfo: null,
      hasSearched: true,
      fireAccom: [],
      fireSys: [],
      fireError: '',
    });

    const fetchApis = async (parsed: NonNullable<typeof targetParams>) => {
      let apiRes: BuildingRegisterInfo | null = null;
      let buildingError = '';
      let buildingWarning = '';
      try {
        apiRes = await fetchBuildingRegister(parsed.sigunguCd, parsed.bjdongCd, parsed.platGbCd, parsed.bun, parsed.ji, forceRefresh);
      } catch (e: unknown) {
        if (seq !== requestSeqRef.current) return;
        if (isStaleDataError(e)) {
          apiRes = e.cachedData as BuildingRegisterInfo;
          const timeStr = e.cachedAt ? new Date(e.cachedAt).toLocaleTimeString() : '';
          buildingWarning = `${e.message}${timeStr ? ` (성공: ${timeStr})` : ''}`;
        } else {
          buildingError = '정부 건축물대장 API 허브 연동 중 오류 발생';
        }
      }

      if (seq !== requestSeqRef.current) return;

      if (apiRes) {
        updateWorkspace({
          bldgInfo: { ...apiRes, searchedAddress: parsed.address_name },
          warningMsg: buildingWarning,
        });
        setRecentSearches(prev => {
          const newItem: RecentSearchItem = { address: targetAddress, params: parsed };
          const updated = [newItem, ...prev.filter(item => item.address !== targetAddress)].slice(0, 10);
          saveStoredJson('119helper-building-recent', updated);
          return updated;
        });
      } else {
        updateWorkspace({
          errorMsg: buildingError || '해당 주소에 등록된 건축물대장 표제건물 정보를 찾을 수 없습니다.',
        });
      }
      
      if (seq === requestSeqRef.current) {
        setIsLoading(false);
      }

      // 소방시설 정보 조회
      const sido = parsed.sido;
      if (sido) {
        if (seq === requestSeqRef.current) {
          setFireLoading(true);
        }
        try {
          const [accomRes, sysRes] = await Promise.allSettled([
            fetchFireObjectAccom(sido, '50', '1', forceRefresh),
            fetchFireObjectFireSys(sido, '50', '1', forceRefresh),
          ]);
          
          if (seq !== requestSeqRef.current) return;

          let hasFireError = false;
          const fireNotices: string[] = [];
          let nextFireAccom: FireObjectAccom[] = [];
          let nextFireSys: FireObjectFireSys[] = [];

          if (accomRes.status === 'fulfilled') {
            nextFireAccom = accomRes.value.items || [];
          } else if (isStaleDataError(accomRes.reason)) {
            const cached = accomRes.reason.cachedData as PaginatedItemsResponse<FireObjectAccom>;
            nextFireAccom = cached.items || [];
            const t = accomRes.reason.cachedAt ? ` (성공: ${new Date(accomRes.reason.cachedAt).toLocaleTimeString()})` : '';
            fireNotices.push(`${accomRes.reason.message}${t}`);
          } else {
            hasFireError = true;
            console.warn('[BuildingView] fire accom failed:', accomRes.reason);
          }

          if (sysRes.status === 'fulfilled') {
            nextFireSys = sysRes.value.items || [];
          } else if (isStaleDataError(sysRes.reason)) {
            const cached = sysRes.reason.cachedData as PaginatedItemsResponse<FireObjectFireSys>;
            nextFireSys = cached.items || [];
            const t = sysRes.reason.cachedAt ? ` (성공: ${new Date(sysRes.reason.cachedAt).toLocaleTimeString()})` : '';
            fireNotices.push(`${sysRes.reason.message}${t}`);
          } else {
            hasFireError = true;
            console.warn('[BuildingView] fire sys failed:', sysRes.reason);
          }

          if (hasFireError) {
            fireNotices.push('일부 소방시설 정보를 불러오지 못했습니다.');
          }
          updateWorkspace({
            fireAccom: nextFireAccom,
            fireSys: nextFireSys,
            fireError: [...new Set(fireNotices)].join(' '),
          });
        } finally {
          if (seq === requestSeqRef.current) {
            setFireLoading(false);
          }
        }
      }
    };

    if (targetParams) {
      fetchApis(targetParams);
      return;
    }

    // 오프라인/카카오API 방어: 최근 검색 기록 중 주소가 정확히 일치하는 캐시가 있으면 카카오 지오코더 우회
    const cachedTarget = recentSearches.find(r => r.address === targetAddress && r.params);
    if (cachedTarget && cachedTarget.params) {
      fetchApis(cachedTarget.params);
      return;
    }

    const services = window.kakao?.maps?.services;
    if (!services) {
      if (seq !== requestSeqRef.current) return;
      updateWorkspace({ errorMsg: '카카오 주소검색(Geocoder) 서비스 로드 실패. [새로고침] 해주세요.' });
      setIsLoading(false);
      return;
    }

    const geocoder = new services.Geocoder();
    geocoder.addressSearch(targetAddress, (result, status) => {
      if (seq !== requestSeqRef.current) return;

      if (status === services.Status.OK && result[0]) {
        const item = result[0];
        const addrObj = item.address;

        if (!addrObj || !addrObj.b_code) {
          updateWorkspace({ errorMsg: '상세 지번(법정동 코드)을 파악할 수 없는 주소입니다.' });
          setIsLoading(false);
          return;
        }

        const bCode = addrObj.b_code as string;
        if (bCode.length < 10) {
           updateWorkspace({ errorMsg: '올바른 법정동 코드를 추출할 수 없습니다.' });
           setIsLoading(false);
           return;
        }
        
        const sigunguCd = bCode.substring(0, 5);
        const bjdongCd = bCode.substring(5, 10);
        const platGbCd = (addrObj.mountain_yn === 'Y' || addrObj.san_yn === 'Y') ? '1' : '0';
        const bun = addrObj.main_address_no || '';
        const ji = addrObj.sub_address_no || '0';

        if (!bun) {
           updateWorkspace({ errorMsg: '정확히 번지가 기재되지 않은 주소입니다. (예: 번지까지 입력 필요)' });
           setIsLoading(false);
           return;
        }

        const parsedParams = {
          sigunguCd,
          bjdongCd,
          platGbCd,
          bun,
          ji,
          sido: addrObj.region_1depth_name || '',
          address_name: addrObj.address_name
        };

        fetchApis(parsedParams);
      } else {
        if (seq !== requestSeqRef.current) return;
        updateWorkspace({ errorMsg: '입력하신 주소를 지도에서 찾을 수 없습니다.' });
        setIsLoading(false);
      }
    });
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    runSearch(address);
  };

  const YnBadge = ({ val, label }: { val?: string; label: string }) => {
    const isY = val === 'Y' || val === '1';
    return (
      <div className={`px-3 py-2 rounded-lg border text-center ${isY ? 'bg-green-500/10 border-green-500/30' : 'bg-surface-container border-outline-variant/20'}`}>
        <p className="text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">{label}</p>
        <p className={`mt-0.5 text-sm font-extrabold ${isY ? 'text-green-700 dark:text-green-300' : 'text-on-surface-variant'}`}>{isY ? '설치' : '미설치'}</p>
      </div>
    );
  };

  return (
    <div className="space-y-6" aria-busy={isLoading || fireLoading}>
      <h2 className="text-2xl md:text-3xl font-extrabold text-on-surface font-headline flex items-center gap-2">
        <span className="material-symbols-outlined text-4xl text-purple-700 dark:text-purple-300">apartment</span>
        건축물대장 현장 검색
      </h2>
      <p className="text-sm text-on-surface-variant font-medium">단순 주소만 입력하면 지번 변환 후 국토부 대장을 끌어옵니다.</p>
      {normalizedInitialAddress && (
        <div className="flex max-w-2xl flex-wrap items-center justify-between gap-2 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <span aria-hidden="true" className="material-symbols-outlined text-lg text-primary">assignment</span>
            <div className="min-w-0">
              <p className="text-xs font-extrabold text-primary">진행 중인 출동 주소</p>
              <p className="truncate text-sm text-on-surface">{normalizedInitialAddress}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={address.trim() === normalizedInitialAddress}
            onClick={() => updateWorkspace({ address: normalizedInitialAddress })}
            className="shrink-0 rounded-lg bg-surface-container-lowest px-3 py-2 text-xs font-extrabold text-on-surface hover:bg-surface-container-high disabled:text-primary"
          >
            {address.trim() === normalizedInitialAddress ? '적용됨' : '주소 적용'}
          </button>
        </div>
      )}
      <form className="flex max-w-2xl flex-col gap-3 sm:flex-row" onSubmit={handleSubmit}>
        <input
          aria-label="건축물 주소"
          type="text"
          value={address}
          onChange={event => updateWorkspace({ address: event.target.value })}
          autoComplete="street-address"
          enterKeyHint="search"
          placeholder="도로명 또는 지번 입력 (예: 서울특별시 종로구 세종대로 209)"
          className="min-w-0 flex-1 rounded-xl border border-outline-variant/30 bg-surface-container px-4 py-3 text-sm font-bold text-on-surface shadow-sm placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/50 transition-all"
        />
        <div className="flex gap-3 sm:shrink-0">
          <button
            type="submit"
            disabled={isLoading || !address.trim()}
            className="flex min-h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-xl bg-primary px-6 py-3 font-bold text-on-primary shadow-md transition-all hover:bg-primary/80 active:scale-95 disabled:opacity-50 sm:flex-none"
          >
            {isLoading ? <span aria-hidden="true" className="material-symbols-outlined animate-spin text-[20px]">progress_activity</span> : <span aria-hidden="true" className="material-symbols-outlined text-[20px]">search</span>}
            검색
          </button>
          {bldgInfo && (
            <button
              type="button"
              aria-label="건축물대장 데이터 강제 새로고침"
              onClick={() => runSearch(address, true)}
              disabled={isLoading || !address.trim()}
              className="flex min-h-12 min-w-12 items-center justify-center rounded-xl bg-error/10 px-4 py-3 font-bold text-error shadow-sm transition-all hover:bg-error/20 active:scale-95 disabled:opacity-50"
              title="새로고침 (강제 데이터 갱신)"
            >
              <span aria-hidden="true" className={`material-symbols-outlined text-[20px] ${isLoading ? 'animate-spin' : ''}`}>refresh</span>
            </button>
          )}
        </div>
      </form>

      {errorMsg && (
        <div role="alert" className="flex max-w-2xl items-center gap-3 rounded-xl border border-error/20 bg-error/10 p-4">
          <span aria-hidden="true" className="material-symbols-outlined text-error">error</span>
          <p className="text-sm font-bold text-error">{errorMsg}</p>
        </div>
      )}

      {warningMsg && (
        <div role="status" className="flex max-w-2xl items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <span aria-hidden="true" className="material-symbols-outlined text-amber-700 dark:text-amber-300">warning</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-amber-900 dark:text-amber-200">최신 데이터 갱신 실패</p>
            <p className="mt-1 text-xs text-amber-800 dark:text-amber-200/80">{warningMsg} 마지막으로 성공한 데이터를 표시 중입니다.</p>
          </div>
        </div>
      )}

      {!hasSearched && recentSearches.length > 0 && (
        <div className="max-w-2xl bg-surface-container border border-outline-variant/10 rounded-2xl p-5 md:p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4 border-b border-outline-variant/10 pb-3">
            <h3 className="text-on-surface font-bold flex items-center gap-2">
              <span className="material-symbols-outlined text-primary text-[20px]">history</span>
              최근 조회 기록
            </h3>
            <button 
              type="button"
              onClick={() => { setRecentSearches([]); removeStoredJson('119helper-building-recent'); }}
              className="text-xs text-on-surface-variant hover:text-error transition-colors font-medium border border-transparent hover:border-error/30 px-2 py-1 rounded-md"
            >
              기록 삭제
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {recentSearches.map((term, i) => (
              <button
                type="button"
                key={i}
                onClick={() => runSearch(term)}
                className="bg-surface-container-lowest border border-outline-variant/20 hover:border-primary/50 px-3 py-1.5 rounded-lg text-sm text-on-surface transition-all flex items-center gap-1.5 group shadow-sm hover:shadow-md hover:-translate-y-0.5"
              >
                <span className="material-symbols-outlined text-[14px] text-outline-variant group-hover:text-primary transition-colors">schedule</span>
                {term.address}
              </button>
            ))}
          </div>
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
            <span aria-hidden="true" className="material-symbols-outlined text-3xl text-orange-700 dark:text-orange-300">local_fire_department</span>
            <div>
              <h3 className="text-lg font-extrabold text-on-surface">시·도 단위 숙박시설 소방시설 참고</h3>
              <p className="text-xs text-on-surface-variant">해당 건물이 아닌, 검색 지역 내 공개 데이터 일부를 표시합니다. 검색한 건물의 소방시설 정보와 직접 일치하지 않을 수 있습니다.</p>
            </div>
          </div>
          
          {fireLoading && (
            <div className="flex items-center gap-3 py-8 justify-center">
              <span className="material-symbols-outlined animate-spin text-primary">progress_activity</span>
              <span className="text-on-surface-variant text-sm">소방시설 정보 조회 중...</span>
            </div>
          )}

          {fireError && (
            <div role="status" className="flex items-center gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
              <span aria-hidden="true" className="material-symbols-outlined text-amber-700 dark:text-amber-300">info</span>
              <p className="text-sm font-medium text-amber-900 dark:text-amber-200">{fireError}</p>
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
