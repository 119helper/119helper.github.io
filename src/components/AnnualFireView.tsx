import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { fetchAnnualFireStats, fetchAnnualFireYears, isStaleDataError } from '../services/apiClient';
import type { AnnualFireStatsResponse, AnnualFireYearsResponse } from '../services/apiClient';
import DataStatePanel from './DataStatePanel';

const FALLBACK_YEARS = Array.from({ length: 12 }, (_, i) => String(new Date().getFullYear() - i));

const csvEscape = (value: unknown) => {
  const text = String(value ?? '');
  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
};

const COLORS = [
  '#4f8cff', '#34d399', '#f59e0b', '#ef4444', '#a78bfa',
  '#f472b6', '#06b6d4', '#84cc16', '#fb923c', '#e879f9',
  '#22d3ee', '#facc15', '#f87171', '#818cf8', '#2dd4bf',
];

function formatNumber(n: number): string {
  if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
  if (n >= 10_000) return `${(n / 10_000).toFixed(1)}만`;
  return n.toLocaleString();
}

export default function AnnualFireView() {
  const [year, setYear] = useState(FALLBACK_YEARS[0]);
  const [years, setYears] = useState<string[]>(FALLBACK_YEARS);
  const [coverage, setCoverage] = useState<AnnualFireYearsResponse | null>(null);
  const [coverageStatus, setCoverageStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [data, setData] = useState<AnnualFireStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const requestSeqRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    fetchAnnualFireYears()
      .then(res => {
        if (cancelled) return;
        setCoverageStatus('success');
        if (res.years.length === 0) return;
        setCoverage(res);
        setYears(res.years);
        setYear(res.latestYear ?? res.years[0]);
      })
      .catch(err => {
        if (cancelled) return;
        setCoverageStatus('error');
        console.warn('[AnnualFireView] supported years failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const getErrorMessage = (err: unknown) => {
    return err instanceof Error ? err.message : '데이터를 불러올 수 없습니다.';
  };

  const loadStats = useCallback(async (forceRefresh = false) => {
    const seq = ++requestSeqRef.current;

    setLoading(true);
    setError(null);
    setWarning(null);

    try {
      const res = await fetchAnnualFireStats(year, forceRefresh);
      if (seq !== requestSeqRef.current) return;
      setData(res);
    } catch (err) {
      if (seq !== requestSeqRef.current) return;
      if (isStaleDataError(err)) {
        setData(err.cachedData as AnnualFireStatsResponse);
        const t = err.cachedAt ? new Date(err.cachedAt).toLocaleTimeString() : '';
        setWarning(`${err.message}${t ? ` (성공: ${t})` : ''}`);
      } else {
        setError(getErrorMessage(err));
      }
    } finally {
      if (seq === requestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [year]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // 바 차트 최대값
  const maxSido = useMemo(() => data ? Math.max(...data.bySido.map(d => d.count), 1) : 1, [data]);
  const maxMonth = useMemo(() => data ? Math.max(...data.byMonth.map(d => d.count), 1) : 1, [data]);
  const latestCompleteYear = coverage?.latestCompleteYear
    ?? coverage?.periods
      ?.filter(period => period.coverageType === 'complete')
      .map(period => period.year)
      .sort((a, b) => Number(b) - Number(a))[0]
    ?? (data?.coverageType === 'complete' ? data.year : null);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="ui-page-title">
            <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
            연간 화재통계
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">
            소방청 화재통계 · <span className="text-primary font-semibold">{year}년</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            aria-label="화재통계 연도"
            value={year}
            onChange={e => setYear(e.target.value)}
            className="bg-surface-container text-on-surface text-sm rounded-xl px-3 py-2 border border-outline-variant/20 focus:outline-none focus:border-primary font-bold"
          >
            {years.map(y => {
              const period = coverage?.periods?.find(item => item.year === y);
              return (
                <option key={y} value={y}>
                  {y}년{period?.coverageType === 'partial' ? ` 누계 (${period.dataThrough})` : ''}
                </option>
              );
            })}
          </select>
          <button
            onClick={() => loadStats(true)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
            새로고침
          </button>
          {data && (
            <button
              onClick={() => {
                const rows: string[][] = [['구분', '항목', '값']];
                rows.push(['메타데이터', '자료구분', data.coverageType === 'partial' ? '연중 누계' : '연간 확정']);
                rows.push(['메타데이터', '자료기준일', data.dataThrough ?? `${year}-12-31`]);
                rows.push(['메타데이터', '출처', data.sourceName ?? '소방청 연간화재통계']);
                rows.push(['요약', '총 화재', String(data.summary.totalFires)]);
                rows.push(['요약', '사망', String(data.summary.totalDeaths)]);
                rows.push(['요약', '부상', String(data.summary.totalInjuries)]);
                rows.push(['요약', '재산피해(원)', String(data.summary.totalPropertyDamage * (data.propertyDamageUnit === 'thousandWon' ? 1_000 : 1))]);
                data.bySido.forEach(d => rows.push(['시도별', d.name, String(d.count)]));
                data.byFireType.forEach(d => rows.push(['화재유형', d.name, String(d.count)]));
                data.byPlace.forEach(d => rows.push(['장소별', d.name, String(d.count)]));
                data.byCause.forEach(d => rows.push(['발화요인', d.name, String(d.count)]));
                data.byMonth.forEach(d => rows.push(['월별', d.month, String(d.count)]));
                data.casualtiesBySido.forEach(d => rows.push(['인명피해', d.name, `사망${d.deaths}/부상${d.injuries}`]));
                const csv = '\uFEFF' + rows.map(r => r.map(csvEscape).join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `화재통계_${year}년.csv`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 0);
              }}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-on-secondary rounded-xl text-sm font-bold hover:bg-secondary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">download</span>
              CSV
            </button>
          )}
        </div>
      </div>

      <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-on-surface-variant">
        <span className="material-symbols-outlined text-lg text-primary">database</span>
        {latestCompleteYear ? (
          <strong className="text-on-surface">공식 완결연도 {latestCompleteYear}년</strong>
        ) : coverageStatus === 'loading' ? (
          <strong className="text-on-surface">공식 완결연도 확인 중</strong>
        ) : (
          <strong className="text-amber-700 dark:text-amber-300">공식 완결연도 미확인</strong>
        )}
        {coverageStatus === 'error' && <span>· 제공 연도 목록을 불러오지 못함</span>}
        {coverage?.latestDataThrough && <span>· 최신 누계 {coverage.latestDataThrough} 기준</span>}
        {data?.coverageType === 'partial' && data.dataThrough && (
          <strong className="text-amber-700 dark:text-amber-300">· 현재 화면은 {data.dataThrough}까지 누계</strong>
        )}
        {data?.regionalClassification && data.regionalClassification.unclassifiedCount > 0 && (
          <span>· 지역 미분류 {data.regionalClassification.unclassifiedCount.toLocaleString()}건 포함</span>
        )}
        <span>· 공식 제공범위 밖 연도는 임의 생성하지 않음</span>
        <a
          href={data?.sourceUrl ?? coverage?.sourceUrl ?? 'https://www.data.go.kr/data/15060386/fileData.do'}
          target="_blank"
          rel="noreferrer"
          className="font-bold text-primary hover:underline"
        >
          공식 원문
        </a>
      </div>

      {/* Loading */}
      {loading && (
        <DataStatePanel
          tone="loading"
          icon="progress_activity"
          title={`${year}년 화재통계 집계 중`}
          description="공식 원본 데이터가 큰 경우 최대 30초 정도 걸릴 수 있습니다."
        />
      )}

      {/* Error */}
      {error && !loading && !data && (
        <DataStatePanel
          tone="error"
          icon="cloud_off"
          title="연간 화재통계를 불러오지 못했습니다"
          description={error}
          action={{ label: '다시 시도', icon: 'refresh', onClick: () => loadStats(true) }}
        />
      )}

      {/* Warning */}
      {!loading && warning && (
        <DataStatePanel
          tone="guidance"
          icon="history"
          title="저장된 최근 통계를 표시 중입니다"
          description={`${warning} 마지막으로 성공한 통계를 계속 표시합니다.`}
        />
      )}

      {/* Data Display */}
      {data && !loading && (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: '총 화재 건수', value: formatNumber(data.summary.totalFires), icon: 'local_fire_department', color: 'text-error' },
              { label: '사망', value: `${data.summary.totalDeaths}명`, icon: 'person_off', color: 'text-error' },
              { label: '부상', value: `${data.summary.totalInjuries}명`, icon: 'personal_injury', color: 'text-tertiary' },
              { label: '인명피해 합계', value: `${data.summary.totalCasualties}명`, icon: 'group', color: 'text-on-surface' },
              {
                label: '재산피해액',
                value: `${formatNumber(data.summary.totalPropertyDamage * (data.propertyDamageUnit === 'thousandWon' ? 1_000 : 1))}원`,
                icon: 'payments',
                color: 'text-primary',
              },
            ].map(card => (
              <div key={card.label} className="bg-surface-container rounded-2xl p-4 border border-outline-variant/10">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`material-symbols-outlined ${card.color} text-lg`} style={{ fontVariationSettings: "'FILL' 1" }}>{card.icon}</span>
                  <span className="text-[10px] text-on-surface-variant font-bold uppercase">{card.label}</span>
                </div>
                <p className="text-2xl font-extrabold text-on-surface font-headline">{card.value}</p>
              </div>
            ))}
          </div>

          {/* Charts Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* 시도별 화재 건수 */}
            <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10">
              <h3 className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg">map</span>
                시도별 화재 발생 건수
              </h3>
              <div className="space-y-2">
                {data.bySido.slice(0, 10).map((item, i) => (
                  <div key={item.name} className="flex items-center gap-3">
                    <span className="text-xs text-on-surface-variant w-16 text-right font-medium truncate">{item.name}</span>
                    <div className="flex-1 h-6 bg-surface-container-high rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500 flex items-center justify-end pr-2"
                        style={{
                          width: `${(item.count / maxSido) * 100}%`,
                          backgroundColor: COLORS[i % COLORS.length],
                          minWidth: '2rem',
                        }}
                      >
                        <span className="text-[10px] font-bold text-white drop-shadow">{item.count.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* 화재 유형별 도넛 차트 */}
            <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10">
              <h3 className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-error text-lg">donut_small</span>
                화재 유형별 분포
              </h3>
              <DonutChart data={data.byFireType} />
            </div>

            {/* 월별 화재 발생 추이 */}
            <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10">
              <h3 className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-lg">calendar_month</span>
                월별 화재 발생 추이
              </h3>
              <div className="overflow-x-auto custom-scrollbar pb-2">
                <div className="flex items-end gap-1.5 h-40 min-w-[300px]">
                  {data.byMonth.map((item, i) => (
                    <div key={item.month} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[9px] font-bold text-on-surface-variant">{item.count > 0 ? item.count.toLocaleString() : ''}</span>
                      <div
                        className="w-full rounded-t-lg transition-all duration-500"
                        style={{
                          height: `${Math.max((item.count / maxMonth) * 100, 2)}%`,
                          backgroundColor: COLORS[i % COLORS.length],
                          opacity: item.count > 0 ? 1 : 0.2,
                        }}
                      />
                      <span className="text-[9px] text-on-surface-variant font-medium">{item.month}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* 장소별 분포 */}
            <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10">
              <h3 className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-tertiary text-lg">location_on</span>
                화재 장소별 분포
              </h3>
              <DonutChart data={data.byPlace} />
            </div>
          </div>

          {/* 발화요인 TOP */}
          <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10">
            <h3 className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-error text-lg">bolt</span>
              발화요인 TOP {data.byCause.length}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {data.byCause.map((item, i) => {
                const max = data.byCause[0]?.count || 1;
                return (
                  <div key={item.name} className="flex items-center gap-3 p-3 rounded-xl bg-surface-container-high/50">
                    <span className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white" style={{ backgroundColor: COLORS[i % COLORS.length] }}>
                      {i + 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-on-surface truncate">{item.name}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex-1 h-1.5 bg-surface-container-highest rounded-full">
                          <div className="h-full rounded-full" style={{ width: `${(item.count / max) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                        </div>
                        <span className="text-xs font-bold text-on-surface-variant">{item.count.toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 시도별 인명피해 테이블 */}
          <div className="bg-surface-container rounded-2xl p-5 border border-outline-variant/10 overflow-x-auto">
            <h3 className="text-sm font-bold text-on-surface mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-error text-lg">emergency</span>
              시도별 인명피해 현황
            </h3>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-outline-variant/20">
                  <th className="text-left py-2 px-3 text-on-surface-variant font-bold text-xs">시도</th>
                  <th className="text-right py-2 px-3 text-on-surface-variant font-bold text-xs">사망</th>
                  <th className="text-right py-2 px-3 text-on-surface-variant font-bold text-xs">부상</th>
                  <th className="text-right py-2 px-3 text-on-surface-variant font-bold text-xs">합계</th>
                </tr>
              </thead>
              <tbody>
                {data.casualtiesBySido.map((row, i) => (
                  <tr key={row.name} className={`border-b border-outline-variant/10 ${i % 2 ? 'bg-surface-container-high/30' : ''}`}>
                    <td className="py-2.5 px-3 font-medium text-on-surface">{row.name}</td>
                    <td className="py-2.5 px-3 text-right text-error font-bold">{row.deaths}</td>
                    <td className="py-2.5 px-3 text-right text-tertiary font-bold">{row.injuries}</td>
                    <td className="py-2.5 px-3 text-right font-extrabold text-on-surface">{row.deaths + row.injuries}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════ 도넛 차트 컴포넌트 ═══════
function DonutChart({ data }: { data: { name: string; count: number }[] }) {
  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) return <p className="text-sm text-on-surface-variant text-center py-8">데이터 없음</p>;

  const top5 = data.slice(0, 5);
  const otherCount = data.slice(5).reduce((s, d) => s + d.count, 0);
  const chartData = otherCount > 0 ? [...top5, { name: '기타', count: otherCount }] : top5;

  const slices = chartData.reduce<Array<{ name: string; count: number; pct: number; startAngle: number; endAngle: number; color: string }>>((acc, d, i) => {
    const pct = d.count / total;
    const startAngle = acc.length > 0 ? acc[acc.length - 1].endAngle : 0;
    const endAngle = startAngle + pct * 360;
    acc.push({ ...d, pct, startAngle, endAngle, color: COLORS[i % COLORS.length] });
    return acc;
  }, []);

  const r = 70, cx = 90, cy = 90, inner = 40;

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg viewBox="0 0 180 180" className="w-36 h-36 shrink-0">
        {slices.map(s => {
          if (s.pct < 0.001) return null;
          const large = s.pct > 0.5 ? 1 : 0;
          const sr = (s.startAngle - 90) * Math.PI / 180;
          const er = (s.endAngle - 90) * Math.PI / 180;
          const x1o = cx + r * Math.cos(sr), y1o = cy + r * Math.sin(sr);
          const x2o = cx + r * Math.cos(er), y2o = cy + r * Math.sin(er);
          const x1i = cx + inner * Math.cos(er), y1i = cy + inner * Math.sin(er);
          const x2i = cx + inner * Math.cos(sr), y2i = cy + inner * Math.sin(sr);
          const d = `M${x1o},${y1o} A${r},${r} 0 ${large},1 ${x2o},${y2o} L${x1i},${y1i} A${inner},${inner} 0 ${large},0 ${x2i},${y2i} Z`;
          return <path key={s.name} d={d} fill={s.color} opacity={0.85} className="hover:opacity-100 transition-opacity" />;
        })}
        <text x={cx} y={cy - 4} textAnchor="middle" className="fill-on-surface text-lg font-extrabold">{total.toLocaleString()}</text>
        <text x={cx} y={cy + 12} textAnchor="middle" className="fill-on-surface-variant text-[9px] font-medium">총 건수</text>
      </svg>
      <div className="flex-1 w-full space-y-1.5 max-h-[160px] overflow-y-auto">
        {chartData.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
            <span className="text-xs text-on-surface truncate flex-1">{d.name}</span>
            <span className="text-xs font-bold text-on-surface-variant">{((d.count / total) * 100).toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
