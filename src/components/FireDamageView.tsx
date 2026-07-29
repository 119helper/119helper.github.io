import { useState, useEffect, useCallback } from 'react';
import {
  fetchAnnualFireStats,
  fetchAnnualFireYears,
  fetchFireDamage,
  type AnnualFireStatsResponse,
  type AnnualFireYearsResponse,
  type FireDamageItem,
  type FireDamageResponse,
  isStaleDataError,
} from '../services/apiClient';

/* ─── 색상 팔레트 ─── */
const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#f43f5e', '#64748b', '#84cc16',
];

/* ─── 시도 목록 ─── */
const SIDO_LIST = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시', '대전광역시', '울산광역시',
  '세종특별자치시', '경기도', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도',
  '전라남도', '경상북도', '경상남도', '제주특별자치도',
];

/* ─── 유틸 ─── */
function num(v: unknown): number { return Number.parseInt(String(v ?? ''), 10) || 0; }

function formatDate(raw: string): string {
  if (!raw || raw.length < 8) return raw || '-';
  return `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
}

function formatAmount(amt: number): string {
  if (amt >= 100000) return `${(amt / 1000).toFixed(0)}백만원`;
  if (amt >= 1000) return `${(amt / 1000).toFixed(1)}백만원`;
  if (amt > 0) return `${amt}천원`;
  return '-';
}

/* ─── 빈 상태 ─── */
function EmptyState({ icon, text, sub }: { icon: string; text: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant/40">
      <span className="material-symbols-outlined text-4xl mb-3">{icon}</span>
      <p className="text-sm font-medium">{text}</p>
      {sub && <p className="text-[10px] mt-1 max-w-sm text-center">{sub}</p>}
    </div>
  );
}

/* ─── 요약 카드 ─── */
function StatCard({ icon, iconColor, label, value, sub }: {
  icon: string; iconColor: string; label: string; value: string | number; sub?: string;
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 relative overflow-hidden group">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">{label}</p>
        <span className={`material-symbols-outlined text-xl ${iconColor} group-hover:scale-110 transition-transform`}>{icon}</span>
      </div>
      <p className="text-2xl font-extrabold text-on-surface mt-2 font-headline tabular-nums">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {sub && <p className="text-[10px] text-on-surface-variant mt-0.5">{sub}</p>}
    </div>
  );
}

/* ─── 스켈레톤 ─── */
function TableSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="flex gap-3">
          <div className="w-20 h-5 bg-surface-container rounded" />
          <div className="flex-1 h-5 bg-surface-container rounded" style={{ width: `${90 - i * 8}%` }} />
          <div className="w-16 h-5 bg-surface-container rounded" />
          <div className="w-12 h-5 bg-surface-container rounded" />
          <div className="w-16 h-5 bg-surface-container rounded" />
        </div>
      ))}
    </div>
  );
}

/* ─── 지역별 집계 바 차트 ─── */
function RegionBarChart({ data }: { data: { name: string; count: number; damage: number }[] }) {
  const max = Math.max(...data.map(d => d.count), 1);
  return (
    <div className="space-y-1.5">
      {data.slice(0, 15).map((d, i) => {
        const pct = (d.count / max) * 100;
        return (
          <div key={d.name} className="flex items-center gap-2">
            <span className="text-[11px] text-on-surface-variant w-24 text-right truncate">{d.name}</span>
            <div className="flex-1 h-5 bg-surface-container rounded overflow-hidden relative">
              <div className="h-full rounded transition-all duration-700 ease-out"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${PALETTE[i % PALETTE.length]}aa, ${PALETTE[i % PALETTE.length]})` }} />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-on-surface">
                {d.count.toLocaleString()}건
              </span>
            </div>
            <span className="text-[10px] text-on-surface-variant w-20 text-right tabular-nums">
              {formatAmount(d.damage)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function RegionalMonthlySummaryView() {
  const [coverage, setCoverage] = useState<AnnualFireYearsResponse | null>(null);
  const [year, setYear] = useState('');
  const [selectedSido, setSelectedSido] = useState('전체');
  const [data, setData] = useState<AnnualFireStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetchAnnualFireYears()
      .then(result => {
        if (!active) return;
        setCoverage(result);
        const years = result.regionalMonthlyYears
          ?? result.periods?.filter(period => period.regionalMonthlyAvailable).map(period => period.year)
          ?? [];
        setYear(current => current || years[0] || '');
        if (years.length === 0) {
          setError('공개 시도·월 집계 스냅샷이 없습니다.');
          setLoading(false);
        }
      })
      .catch(reason => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : '집계 제공연도 조회 실패');
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const loadStats = useCallback(async (forceRefresh = false) => {
    if (!year) return;
    setLoading(true);
    setError(null);
    setWarning(null);
    let result: AnnualFireStatsResponse | undefined;
    try {
      result = await fetchAnnualFireStats(year, forceRefresh);
    } catch (reason: unknown) {
      if (isStaleDataError(reason)) {
        result = reason.cachedData as AnnualFireStatsResponse;
        setWarning(`${reason.message} 마지막으로 성공한 집계를 표시합니다.`);
      } else {
        setError(reason instanceof Error ? reason.message : 'NFDS 시도·월 집계 조회 실패');
      }
    }
    if (result) {
      setData(result);
      setSelectedSido(current => (
        current === '전체' || result.bySido.some(row => row.name === current) ? current : '전체'
      ));
    }
    setLoading(false);
  }, [year]);

  useEffect(() => { void loadStats(); }, [loadStats]);

  const regionalYears = coverage?.regionalMonthlyYears
    ?? coverage?.periods?.filter(period => period.regionalMonthlyAvailable).map(period => period.year)
    ?? [];
  const monthlyRows = (data?.byMonth ?? []).map(month => {
    const regional = selectedSido === '전체'
      ? month
      : month.bySido?.find(row => row.name === selectedSido);
    return {
      month: month.month,
      count: regional?.count ?? 0,
      deaths: regional?.deaths ?? 0,
      injuries: regional?.injuries ?? 0,
      propertyDamage: regional?.propertyDamage ?? 0,
    };
  });
  const selectedSummary = selectedSido === '전체' && data
    ? data.summary
    : monthlyRows.reduce((summary, row) => ({
      totalFires: summary.totalFires + row.count,
      totalDeaths: summary.totalDeaths + row.deaths,
      totalInjuries: summary.totalInjuries + row.injuries,
      totalCasualties: summary.totalCasualties + row.deaths + row.injuries,
      totalPropertyDamage: summary.totalPropertyDamage + row.propertyDamage,
    }), {
      totalFires: 0,
      totalDeaths: 0,
      totalInjuries: 0,
      totalCasualties: 0,
      totalPropertyDamage: 0,
    });
  const regionData = (data?.bySido ?? []).map(row => ({
    name: row.name,
    count: row.count,
    damage: row.propertyDamage ?? 0,
  }));
  const maxMonth = Math.max(...monthlyRows.map(row => row.count), 1);
  const period = coverage?.periods?.find(item => item.year === year);
  const regionalRange = regionalYears.length > 0
    ? `${regionalYears.at(-1)}~${regionalYears[0]} 시도·월 집계`
    : '공개연도 확인 중';
  const hasIntegratedCityTransition = data?.bySido.some(
    row => row.name === '전남광주통합특별시',
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="ui-page-title">
            <span className="material-symbols-outlined ui-page-title-icon">query_stats</span>
            지역별 화재피해
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">
            소방청 NFDS 공개 조회 결과 · 시도×월 공식 집계
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            aria-label="최신 화재피해 연도"
            value={year}
            onChange={event => setYear(event.target.value)}
            className="bg-surface-container border border-outline-variant/20 text-on-surface px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
          >
            {regionalYears.map(item => {
              const itemPeriod = coverage?.periods?.find(periodItem => periodItem.year === item);
              return (
                <option key={item} value={item}>
                  {item}년{itemPeriod?.coverageType === 'partial' ? ` 누계 (${itemPeriod.dataThrough})` : ''}
                </option>
              );
            })}
          </select>
          <select
            aria-label="최신 화재피해 지역"
            value={selectedSido}
            onChange={event => setSelectedSido(event.target.value)}
            disabled={!data}
            className="bg-surface-container border border-outline-variant/20 text-on-surface px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary disabled:opacity-50"
          >
            <option value="전체">전국</option>
            {data?.bySido.map(row => <option key={row.name} value={row.name}>{row.name}</option>)}
          </select>
          <button
            onClick={() => loadStats(true)}
            disabled={loading || !year}
            className="bg-error/10 text-error px-4 py-2 rounded-lg text-sm font-bold hover:bg-error/20 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
            새로고침
          </button>
        </div>
      </div>

      <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-primary/25 bg-primary/5 px-4 py-3 text-sm text-on-surface-variant">
        <span className="material-symbols-outlined text-lg text-primary">public</span>
        <strong className="text-on-surface">요청서 없이 공개 NFDS로 확보</strong>
        <span>· {regionalRange}</span>
        {period?.coverageType === 'partial' && (
          <strong className="text-amber-700 dark:text-amber-300">· {period.dataThrough}까지 누계</strong>
        )}
        <span>· 개별 사고 주소·관할서는 포함하지 않음</span>
        <a
          href={data?.sourceUrl ?? coverage?.sourceUrl ?? 'https://www.nfds.go.kr/stat/general.do'}
          target="_blank"
          rel="noreferrer"
          className="font-bold text-primary hover:underline"
        >
          공식 원문
        </a>
      </div>

      {hasIntegratedCityTransition && (
        <div className="rounded-xl border border-tertiary/25 bg-tertiary-container/20 px-4 py-3 text-sm text-on-surface-variant">
          2026년 행정구역 전환 때문에 ‘광주광역시’, ‘전라남도’, ‘전남광주통합특별시’가 월별 원문에서
          별도 항목으로 나타납니다. 합쳐 추정하지 않고 NFDS 분류를 그대로 보존했습니다.
        </div>
      )}

      {warning && (
        <div className="rounded-xl border border-yellow-500/30 bg-yellow-900/20 p-4 text-sm text-yellow-200">
          {warning}
        </div>
      )}
      {error && !loading && (
        <div className="rounded-xl border border-error/30 bg-error-container/30 p-6 text-center">
          <span className="material-symbols-outlined text-4xl text-error/60 mb-2 block">cloud_off</span>
          <p className="font-bold text-on-surface">NFDS 집계를 불러오지 못했습니다</p>
          <p className="text-sm text-error/80 mt-1">{error}</p>
        </div>
      )}
      {loading && <TableSkeleton />}

      {data && !loading && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon="local_fire_department"
              iconColor="text-red-400"
              label={`${selectedSido === '전체' ? '전국' : selectedSido} 화재 건수`}
              value={selectedSummary.totalFires}
              sub={data.coverageType === 'partial' ? `${data.dataThrough}까지 누계` : `${year}년 완결`}
            />
            <StatCard icon="skull" iconColor="text-red-600" label="사망자" value={selectedSummary.totalDeaths} sub="시도·월 공식 집계" />
            <StatCard icon="personal_injury" iconColor="text-orange-400" label="부상자" value={selectedSummary.totalInjuries} sub="시도·월 공식 집계" />
            <StatCard
              icon="payments"
              iconColor="text-amber-400"
              label="재산 피해"
              value={formatAmount(selectedSummary.totalPropertyDamage)}
              sub="NFDS 원자료 천원 단위"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
              <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-red-400">map</span>
                {year}년 시도별 누적 현황
              </h3>
              <RegionBarChart data={regionData} />
            </section>

            <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
              <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-orange-400">calendar_month</span>
                {selectedSido === '전체' ? '전국' : selectedSido} 월별 화재 추이
              </h3>
              <div className="flex items-end gap-1.5 h-44 overflow-x-auto pb-2">
                {monthlyRows.map((row, index) => (
                  <div key={row.month} className="flex-1 min-w-8 h-full flex flex-col justify-end items-center gap-1">
                    <span className="text-[9px] font-bold text-on-surface-variant">
                      {row.count > 0 ? row.count.toLocaleString() : ''}
                    </span>
                    <div
                      className="w-full rounded-t transition-all duration-500"
                      style={{
                        height: `${Math.max((row.count / maxMonth) * 100, 2)}%`,
                        backgroundColor: PALETTE[index % PALETTE.length],
                        opacity: row.count > 0 ? 0.9 : 0.2,
                      }}
                    />
                    <span className="text-[9px] text-on-surface-variant">{row.month}</span>
                  </div>
                ))}
              </div>
            </section>
          </div>

          <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
            <div className="p-5 border-b border-outline-variant/10">
              <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-primary">table_chart</span>
                시도·월 공식 집계
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-surface-container/50">
                    <th className="px-5 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">월</th>
                    <th className="px-3 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">화재</th>
                    <th className="px-3 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">사망</th>
                    <th className="px-3 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">부상</th>
                    <th className="px-5 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">재산피해</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-outline-variant/10">
                  {monthlyRows.map(row => (
                    <tr key={row.month}>
                      <td className="px-5 py-3 font-bold text-on-surface">{row.month}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{row.count.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-red-400">{row.deaths.toLocaleString()}</td>
                      <td className="px-3 py-3 text-right tabular-nums text-orange-400">{row.injuries.toLocaleString()}</td>
                      <td className="px-5 py-3 text-right tabular-nums text-on-surface-variant">{formatAmount(row.propertyDamage)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

/* ═══════ 메인 컴포넌트 ═══════ */
function IncidentDetailView() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [items, setItems] = useState<FireDamageItem[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [coverage, setCoverage] = useState({
    availableFrom: '2019-01',
    availableTo: '2023-12',
    sourceUrl: 'https://www.data.go.kr/data/15142972/openapi.do',
  });
  const [page, setPage] = useState(1);
  const [selectedSido, setSelectedSido] = useState('서울특별시');
  const PAGE_SIZE = 50;

  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    setWarning(null);

    let res: FireDamageResponse | undefined;
    try {
      const params: Record<string, string> = {
        pageNo: String(page),
        numOfRows: String(PAGE_SIZE),
        sidoNm: selectedSido,
      };
      res = await fetchFireDamage(params, forceRefresh);
    } catch (e: unknown) {
      if (isStaleDataError(e)) {
        res = e.cachedData as FireDamageResponse;
        const t = e.cachedAt ? new Date(e.cachedAt).toLocaleTimeString() : '';
        setWarning(`${e.message}${t ? ` (성공: ${t})` : ''}`);
      } else {
        setError(e instanceof Error ? e.message : '데이터 조회 실패');
        setItems([]);
        setLoading(false);
        return;
      }
    }

    if (res?.error) {
      setError(res.error);
      setItems([]);
      setTotalCount(0);
    } else if (res) {
      setItems(res.items || []);
      setTotalCount(res.totalCount || 0);
      setCoverage(current => ({
        availableFrom: res.availableFrom ?? current.availableFrom,
        availableTo: res.availableTo ?? current.availableTo,
        sourceUrl: res.sourceUrl ?? current.sourceUrl,
      }));
    }
    
    setLoading(false);
  }, [page, selectedSido]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // 집계 계산
  const summary = items.reduce(
    (acc, it) => ({
      fires: acc.fires + 1,
      deaths: acc.deaths + num(it.deadPercnt),
      injuries: acc.injuries + num(it.injrdprPercnt),
      damage: acc.damage + num(it.prptDmgSbttAmt),
    }),
    { fires: 0, deaths: 0, injuries: 0, damage: 0 }
  );

  // 지역별 집계 (법정동 → 시도/구군 추출)
  const regionMap = new Map<string, { count: number; damage: number }>();
  items.forEach(it => {
    const addr = it.lawAddrName || '기타';
    const parts = addr.split(' ');
    const region = parts.length >= 2 ? `${parts[0]} ${parts[1]}` : parts[0];
    const prev = regionMap.get(region) || { count: 0, damage: 0 };
    regionMap.set(region, { count: prev.count + 1, damage: prev.damage + num(it.prptDmgSbttAmt) });
  });
  const regionData = Array.from(regionMap.entries())
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.count - a.count);

  // 소방서별 집계
  const stationMap = new Map<string, number>();
  items.forEach(it => {
    const stn = it.gutFsttOgidNm || '미상';
    stationMap.set(stn, (stationMap.get(stn) || 0) + 1);
  });
  const stationData = Array.from(stationMap.entries())
    .map(([name, count]) => ({ name, count, damage: 0 }))
    .sort((a, b) => b.count - a.count);

  const maxPage = Math.ceil(totalCount / PAGE_SIZE) || 1;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="ui-page-title">
            <span className="material-symbols-outlined ui-page-title-icon">map</span>
            지역별 화재피해
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">소방청 화재 조사 완료 건별 데이터 · 공식 제공범위 2019~2023</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            aria-label="화재피해 지역"
            value={selectedSido}
            onChange={e => { setSelectedSido(e.target.value); setPage(1); }}
            className="bg-surface-container border border-outline-variant/20 text-on-surface px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
          >
            {SIDO_LIST.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={() => fetchData(true)} disabled={loading}
            className="bg-error/10 text-error px-4 py-2 rounded-lg text-sm font-bold hover:bg-error/20 transition-colors flex items-center gap-2 disabled:opacity-50">
            <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
            새로고침
          </button>
        </div>
      </div>

      <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-tertiary/25 bg-tertiary-container/20 px-4 py-3 text-sm text-on-surface-variant">
        <span className="material-symbols-outlined text-lg text-tertiary">date_range</span>
        <strong className="text-on-surface">원 API 공식 제공범위 {coverage.availableFrom}~{coverage.availableTo}</strong>
        <span>· 2024년 이후 건별 자료는 공급기관이 제공하지 않아 0건으로 대체하지 않음</span>
        <span>· 2024~2026 시도·월 집계는 위 ‘시도·월 집계’ 탭에서 제공</span>
        <a
          href={coverage.sourceUrl}
          target="_blank"
          rel="noreferrer"
          className="font-bold text-primary hover:underline"
        >
          공식 원문
        </a>
      </div>

      {/* 요약 카드 */}
      {!loading && !error && items.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon="local_fire_department" iconColor="text-red-400" label="화재 건수" value={totalCount} sub={`현재 페이지: ${items.length}건`} />
          <StatCard icon="skull" iconColor="text-red-600" label="사망자" value={summary.deaths} sub="현재 페이지 기준" />
          <StatCard icon="personal_injury" iconColor="text-orange-400" label="부상자" value={summary.injuries} sub="현재 페이지 기준" />
          <StatCard icon="payments" iconColor="text-amber-400" label="재산 피해"
            value={formatAmount(summary.damage)} sub="천원 단위 합계" />
        </div>
      )}

      {/* API 에러 */}
      {!loading && error && items.length === 0 && (
        <div className="bg-error-container/30 border border-error/30 rounded-xl p-6 text-center">
          <span className="material-symbols-outlined text-5xl text-error/60 mb-3 block">cloud_off</span>
          <h3 className="text-lg font-bold text-on-surface mb-2">화재피해 API 연결 실패</h3>
          <p className="text-sm text-error/80 max-w-lg mx-auto mb-1">{error}</p>
          <button onClick={() => fetchData(true)}
            className="mt-4 bg-error/15 text-error px-5 py-2 rounded-lg text-sm font-bold hover:bg-error/25 transition-colors inline-flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">refresh</span>
            다시 시도
          </button>
        </div>
      )}

      {/* Warning */}
      {!loading && warning && (
        <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-xl p-4 flex items-start gap-3">
          <span className="material-symbols-outlined text-yellow-400">warning</span>
          <div className="flex-1">
            <p className="text-sm font-bold text-yellow-300">최신 데이터 갱신 실패</p>
            <p className="text-xs text-yellow-200/80 mt-1">{warning} 마지막으로 성공한 데이터를 표시 중입니다.</p>
          </div>
        </div>
      )}

      {/* 로딩 */}
      {loading && <TableSkeleton />}

      {/* 데이터 없음 */}
      {!loading && !error && items.length === 0 && (
        <EmptyState icon="search_off" text="조회된 화재 데이터가 없습니다"
          sub={`원 API 제공범위(${coverage.availableFrom}~${coverage.availableTo}) 안에서 선택 지역의 조회 결과가 없습니다.`} />
      )}

      {/* 차트 영역 2열 */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 지역별 화재 */}
          <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-red-400">location_on</span>
              지역별 화재 현황
            </h3>
            <RegionBarChart data={regionData} />
          </section>

          {/* 소방서별 출동 */}
          <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-blue-400">fire_truck</span>
              소방서별 출동 현황
            </h3>
            <RegionBarChart data={stationData} />
          </section>
        </div>
      )}

      {/* 상세 테이블 */}
      {!loading && items.length > 0 && (
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-outline-variant/10 flex items-center justify-between">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-orange-400">table_rows</span>
              개별 화재 건 목록
            </h3>
            <p className="text-xs text-on-surface-variant tabular-nums">
              전체 {totalCount.toLocaleString()}건 · 페이지 {page}/{maxPage}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-surface-container/50">
                  <th className="px-5 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">발생일자</th>
                  <th className="px-3 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">주소</th>
                  <th className="px-3 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">출동소방서</th>
                  <th className="px-3 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">사망</th>
                  <th className="px-3 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">부상</th>
                  <th className="px-5 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">재산피해</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/10">
                {items.map((it, i) => (
                  <tr key={i} className="hover:bg-surface-container/30 transition-colors">
                    <td className="px-5 py-3 text-sm tabular-nums text-on-surface">{formatDate(it.ocrnYmdhh)}</td>
                    <td className="px-3 py-3 text-sm text-on-surface max-w-[240px] truncate">{it.lawAddrName || '-'}</td>
                    <td className="px-3 py-3 text-sm text-on-surface-variant">{it.gutFsttOgidNm || '-'}</td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums">
                      {num(it.deadPercnt) > 0
                        ? <span className="text-red-400 font-bold">{it.deadPercnt}</span>
                        : <span className="text-on-surface-variant/40">-</span>}
                    </td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums">
                      {num(it.injrdprPercnt) > 0
                        ? <span className="text-orange-400 font-medium">{it.injrdprPercnt}</span>
                        : <span className="text-on-surface-variant/40">-</span>}
                    </td>
                    <td className="px-5 py-3 text-right text-sm tabular-nums text-on-surface-variant">
                      {num(it.prptDmgSbttAmt) > 0 ? formatAmount(num(it.prptDmgSbttAmt)) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 페이지네이션 */}
          {maxPage > 1 && (
            <div className="p-4 border-t border-outline-variant/10 flex items-center justify-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                className="px-3 py-1.5 rounded-lg text-sm font-bold bg-surface-container hover:bg-surface-container-high disabled:opacity-30 transition-colors">
                ← 이전
              </button>
              <span className="text-sm text-on-surface-variant tabular-nums px-3">
                {page} / {maxPage}
              </span>
              <button onClick={() => setPage(p => Math.min(maxPage, p + 1))} disabled={page >= maxPage}
                className="px-3 py-1.5 rounded-lg text-sm font-bold bg-surface-container hover:bg-surface-container-high disabled:opacity-30 transition-colors">
                다음 →
              </button>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

export default function FireDamageView() {
  const [mode, setMode] = useState<'regional-summary' | 'incident-detail'>('regional-summary');

  return (
    <div className="space-y-5">
      <div
        role="tablist"
        aria-label="지역별 화재피해 자료 유형"
        className="inline-flex rounded-xl border border-outline-variant/20 bg-surface-container p-1"
      >
        <button
          role="tab"
          aria-selected={mode === 'regional-summary'}
          onClick={() => setMode('regional-summary')}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
            mode === 'regional-summary'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          2024~2026 시도·월 집계
        </button>
        <button
          role="tab"
          aria-selected={mode === 'incident-detail'}
          onClick={() => setMode('incident-detail')}
          className={`rounded-lg px-4 py-2 text-sm font-bold transition-colors ${
            mode === 'incident-detail'
              ? 'bg-primary text-on-primary shadow-sm'
              : 'text-on-surface-variant hover:text-on-surface'
          }`}
        >
          2019~2023 개별 건
        </button>
      </div>

      {mode === 'regional-summary' ? <RegionalMonthlySummaryView /> : <IncidentDetailView />}
    </div>
  );
}
