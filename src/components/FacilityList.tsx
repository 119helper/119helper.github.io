import { useState, useMemo } from 'react';
import type { FireFacility } from '../data/mockData';
import type { CityIndex } from '../services/fireWaterApi';
import KakaoMap from './KakaoMap';

interface Props {
  data: FireFacility[];
  title: string;
  icon: string;
  typeLabel: string;
  city: string;
  isLoading?: boolean;
  // 분할 도시용 props
  cityIndex?: CityIndex | null;
  selectedDistrict?: string | null;
  onDistrictChange?: (district: string) => void;
}

const PAGE_SIZE = 50;

export default function FacilityList({
  data, title, icon, typeLabel, city, isLoading = false,
  cityIndex, selectedDistrict, onDistrictChange
}: Props) {
  const [search, setSearch] = useState('');
  const [filterDistrict, setFilterDistrict] = useState('전체');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  // 분할 도시 여부 판단
  const isSplit = !!cityIndex && !!onDistrictChange;

  // 분할 도시: 로드된 데이터 내에서 필터링
  // 비분할 도시: 기존대로 전체 데이터에서 필터링
  const districts = isSplit
    ? Object.keys(cityIndex.districts).sort()
    : Array.from(new Set(data.map(d => d.district))).sort();

  const filtered = useMemo(() => {
    return data.filter(item => {
      const matchSearch = !search || item.address.includes(search) || item.id.includes(search);
      // 분할 도시에서는 이미 구별로 로드했으므로 filterDistrict는 비분할 도시용
      const matchDistrict = isSplit || filterDistrict === '전체' || item.district === filterDistrict;
      return matchSearch && matchDistrict;
    });
  }, [data, search, filterDistrict, isSplit]);

  // 페이지네이션
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 검색/필터 변경 시 페이지 리셋
  const handleSearchChange = (val: string) => { setSearch(val); setPage(1); };
  const handleFilterChange = (val: string) => { setFilterDistrict(val); setPage(1); };

  const statusColor = (status: string) => {
    switch (status) {
      case '정상': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case '점검필요': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30';
      case '고장': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
    }
  };

  const statusDot = (status: string) => {
    switch (status) {
      case '정상': return 'bg-green-400';
      case '점검필요': return 'bg-yellow-400';
      case '고장': return 'bg-red-400 animate-pulse';
      default: return 'bg-gray-400';
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl md:text-2xl font-extrabold text-on-surface font-headline">{icon} {title}</h2>
          <p className="text-sm text-on-surface-variant mt-1">{typeLabel} 위치 정보</p>
        </div>
        <div className="flex items-center gap-3">
          {isLoading ? (
            <span className="text-sm text-on-surface-variant font-bold animate-pulse">데이터 로딩 중...</span>
          ) : (
            <span className="text-sm text-on-surface-variant">
              {isSplit && !selectedDistrict
                ? <>총 <span className="font-bold text-primary">{cityIndex.total.toLocaleString()}</span>건 (구를 선택해주세요)</>
                : <>총 <span className="font-bold text-primary">{filtered.length.toLocaleString()}</span>건</>
              }
            </span>
          )}
        </div>
      </div>

      {/* 분할 도시: 구/군 선택 카드 */}
      {isSplit && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="material-symbols-outlined text-primary text-lg">location_city</span>
            <h3 className="text-sm font-bold text-on-surface">구/군 선택</h3>
            {selectedDistrict && (
              <span className="text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full font-bold ml-auto">
                {selectedDistrict} · {cityIndex.districts[selectedDistrict]?.toLocaleString()}건
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {districts.map(d => (
              <button
                key={d}
                onClick={() => onDistrictChange!(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  selectedDistrict === d
                    ? 'bg-primary text-on-primary shadow-lg shadow-primary/20 scale-105'
                    : 'bg-surface-container hover:bg-surface-container-high text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {d}
                <span className={`ml-1.5 text-[10px] ${selectedDistrict === d ? 'text-on-primary/70' : 'text-on-surface-variant/50'}`}>
                  {cityIndex.districts[d]?.toLocaleString()}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 구 선택 전 안내 (분할 도시에서 아직 구 미선택) */}
      {isSplit && !selectedDistrict && !isLoading && (
        <div className="bg-tertiary-container/20 border border-tertiary/20 rounded-xl p-8 text-center">
          <span className="material-symbols-outlined text-5xl text-tertiary/60 mb-3 block">touch_app</span>
          <h3 className="text-lg font-bold text-on-surface mb-2">구/군을 선택해 주세요</h3>
          <p className="text-sm text-on-surface-variant max-w-lg mx-auto">
            데이터가 <span className="font-bold text-primary">{cityIndex.total.toLocaleString()}</span>건으로 많아
            구/군별로 분할되어 있습니다.<br />
            위에서 보고 싶은 구/군을 선택하면 해당 지역의 {typeLabel} 정보를 빠르게 불러옵니다.
          </p>
        </div>
      )}

      {/* 데이터가 로드된 경우에만 지도 + 리스트 표시 */}
      {(data.length > 0 || (!isSplit && !isLoading)) && (
        <>
          {/* KakaoMap — 현재 페이지 마커만 표시 (성능) */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden relative">
            <KakaoMap data={paged} city={city} height="300px" selectedId={selectedId} />
            {/* Status overlay */}
            <div className="absolute top-4 left-4 z-10 bg-surface-container-lowest/90 backdrop-blur-sm p-3 rounded-xl border border-outline-variant/20">
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-green-400"></span>
                  <span className="text-on-surface-variant">정상 {data.filter(d => d.status === '정상').length.toLocaleString()}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                  <span className="text-on-surface-variant">점검필요 {data.filter(d => d.status === '점검필요').length}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400"></span>
                  <span className="text-on-surface-variant">고장 {data.filter(d => d.status === '고장').length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-3 flex-col sm:flex-row">
            <input
              type="text"
              value={search}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="주소 또는 ID로 검색..."
              className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            {/* 비분할 도시용 필터 (분할 도시에서는 이미 구별로 로드) */}
            {!isSplit && (
              <select
                value={filterDistrict}
                onChange={(e) => handleFilterChange(e.target.value)}
                className="bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <option value="전체">전체</option>
                {districts.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            )}
          </div>

          {/* Pagination info */}
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-on-surface-variant">
                {((page - 1) * PAGE_SIZE + 1).toLocaleString()}~{Math.min(page * PAGE_SIZE, filtered.length).toLocaleString()} / {filtered.length.toLocaleString()}건
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage(1)}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg hover:bg-surface-container transition-colors disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-sm">first_page</span>
                </button>
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="p-1.5 rounded-lg hover:bg-surface-container transition-colors disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                </button>
                <span className="px-3 py-1 text-on-surface font-bold text-xs">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg hover:bg-surface-container transition-colors disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
                <button
                  onClick={() => setPage(totalPages)}
                  disabled={page === totalPages}
                  className="p-1.5 rounded-lg hover:bg-surface-container transition-colors disabled:opacity-30"
                >
                  <span className="material-symbols-outlined text-sm">last_page</span>
                </button>
              </div>
            </div>
          )}

          {/* List — 페이지네이션된 데이터만 렌더링 */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-surface-container/50">
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">ID</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">유형</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">주소</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">관할구</th>
                    <th className="px-6 py-4 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">상태</th>
                    <th className="px-6 py-4 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">좌표</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {paged.map(item => (
                    <tr
                      key={item.id}
                      onClick={() => setSelectedId(prev => prev === item.id ? null : item.id)}
                      className={`cursor-pointer transition-colors ${
                        selectedId === item.id
                          ? 'bg-primary/10 ring-1 ring-inset ring-primary/30'
                          : 'hover:bg-surface-container/30'
                      }`}
                    >
                      <td className="px-6 py-4 font-mono text-sm font-bold text-primary">{item.id}</td>
                      <td className="px-6 py-4 text-sm text-on-surface">{item.type}</td>
                      <td className="px-6 py-4 text-sm text-on-surface">{item.address}</td>
                      <td className="px-6 py-4 text-sm text-on-surface-variant">{item.district}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusColor(item.status)}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${statusDot(item.status)}`}></span>
                          {item.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right text-xs text-on-surface-variant font-mono">
                        {item.lat.toFixed(4)}, {item.lng.toFixed(4)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile card list */}
            <div className="md:hidden divide-y divide-outline-variant/10">
              {paged.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelectedId(prev => prev === item.id ? null : item.id)}
                  className={`w-full text-left p-4 transition-colors ${
                    selectedId === item.id ? 'bg-primary/10' : 'hover:bg-surface-container/30'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-sm font-bold text-primary">{item.id}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusColor(item.status)}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${statusDot(item.status)}`}></span>
                      {item.status}
                    </span>
                  </div>
                  <p className="text-sm text-on-surface">{item.address}</p>
                  <p className="text-xs text-on-surface-variant mt-0.5">{item.type} · {item.district}</p>
                </button>
              ))}
            </div>

            {isLoading && (
              <div className="p-12 text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl animate-spin text-primary">progress_activity</span>
                <p className="mt-2 font-bold animate-pulse">공공데이터 불러오는 중...</p>
              </div>
            )}

            {!isLoading && data.length > 0 && filtered.length === 0 && (
              <div className="p-12 text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl opacity-30">search_off</span>
                <p className="mt-2">검색 결과가 없습니다</p>
              </div>
            )}
          </div>

          {/* Bottom pagination (duplicated for convenience) */}
          {filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-1">
              <button
                onClick={() => setPage(1)}
                disabled={page === 1}
                className="p-2 rounded-lg hover:bg-surface-container transition-colors disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-sm">first_page</span>
              </button>
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg hover:bg-surface-container transition-colors disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-sm">chevron_left</span>
              </button>
              <span className="px-4 py-2 text-on-surface font-bold text-sm">
                {page} / {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg hover:bg-surface-container transition-colors disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-sm">chevron_right</span>
              </button>
              <button
                onClick={() => setPage(totalPages)}
                disabled={page === totalPages}
                className="p-2 rounded-lg hover:bg-surface-container transition-colors disabled:opacity-30"
              >
                <span className="material-symbols-outlined text-sm">last_page</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
