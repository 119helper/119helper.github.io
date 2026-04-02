import { useState, useEffect, useMemo } from 'react';
import { fetchAnnualFireStats } from '../services/apiClient';
import type { AnnualFireStatsResponse } from '../services/apiClient';

const YEARS = Array.from({ length: 10 }, (_, i) => String(2024 - i));

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
  const [year, setYear] = useState('2024');
  const [data, setData] = useState<AnnualFireStatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    fetchAnnualFireStats(year)
      .then(res => {
        if (!cancelled) setData(res);
      })
      .catch(err => {
        if (!cancelled) setError(err.message || '데이터를 불러올 수 없습니다.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [year]);

  // 바 차트 최대값
  const maxSido = useMemo(() => data ? Math.max(...data.bySido.map(d => d.count), 1) : 1, [data]);
  const maxMonth = useMemo(() => data ? Math.max(...data.byMonth.map(d => d.count), 1) : 1, [data]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface font-headline flex items-center gap-2">
            <span className="material-symbols-outlined text-error" style={{ fontVariationSettings: "'FILL' 1" }}>local_fire_department</span>
            연간 화재통계
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">
            소방청 연간화재통계 · <span className="text-primary font-semibold">{year}년</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={year}
            onChange={e => setYear(e.target.value)}
            className="bg-surface-container text-on-surface text-sm rounded-xl px-3 py-2 border border-outline-variant/20 focus:outline-none focus:border-primary font-bold"
          >
            {YEARS.map(y => (
              <option key={y} value={y}>{y}년</option>
            ))}
          </select>
          <button
            onClick={() => { setData(null); setError(null); setLoading(true); fetchAnnualFireStats(year).then(setData).catch(e => setError(e.message)).finally(() => setLoading(false)); }}
            className="flex items-center gap-2 px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20"
          >
            <span className="material-symbols-outlined text-lg">refresh</span>
            새로고침
          </button>
          {data && (
            <button
              onClick={() => {
                const rows: string[][] = [['구분', '항목', '값']];
                rows.push(['요약', '총 화재', String(data.summary.totalFires)]);
                rows.push(['요약', '사망', String(data.summary.totalDeaths)]);
                rows.push(['요약', '부상', String(data.summary.totalInjuries)]);
                rows.push(['요약', '재산피해', String(data.summary.totalPropertyDamage)]);
                data.bySido.forEach(d => rows.push(['시도별', d.name, String(d.count)]));
                data.byFireType.forEach(d => rows.push(['화재유형', d.name, String(d.count)]));
                data.byPlace.forEach(d => rows.push(['장소별', d.name, String(d.count)]));
                data.byCause.forEach(d => rows.push(['발화요인', d.name, String(d.count)]));
                data.byMonth.forEach(d => rows.push(['월별', d.month, String(d.count)]));
                data.casualtiesBySido.forEach(d => rows.push(['인명피해', d.name, `사망${d.deaths}/부상${d.injuries}`]));
                const csv = '\uFEFF' + rows.map(r => r.join(',')).join('\n');
                const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = `화재통계_${year}년.csv`;
                a.click();
              }}
              className="flex items-center gap-2 px-4 py-2 bg-secondary text-on-secondary rounded-xl text-sm font-bold hover:bg-secondary/90 transition-colors"
            >
              <span className="material-symbols-outlined text-lg">download</span>
              CSV
            </button>
          )}
        </div>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex flex-col items-center gap-4 py-16">
          <div className="w-10 h-10 border-3 border-primary/30 border-t-primary rounded-full animate-spin" />
          <div className="text-sm text-on-surface-variant">
            <span className="font-bold text-primary">{year}년</span> 화재통계 데이터 집계 중...
          </div>
          <p className="text-xs text-on-surface-variant/60">대량 데이터 처리로 최대 30초 소요될 수 있습니다</p>
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <div className="p-6 rounded-2xl bg-error/10 border border-error/30">
          <div className="flex items-start gap-3">
            <span className="material-symbols-outlined text-error text-2xl mt-0.5">cloud_off</span>
            <div className="flex-1">
              <h3 className="font-bold text-error text-lg">연간화재통계 API 연결 실패</h3>
              <p className="text-sm text-on-surface-variant mt-1">{error}</p>
              <p className="text-xs text-on-surface-variant/60 mt-2">
                API 서비스 승인 대기 중이거나 공공데이터 서버 점검 중입니다.
              </p>
              <button
                onClick={() => setYear(y => y)}
                className="mt-4 flex items-center gap-2 px-4 py-2 bg-error/20 text-error rounded-xl text-sm font-bold hover:bg-error/30 transition-colors"
              >
                <span className="material-symbols-outlined text-base">refresh</span>
                다시 시도
              </button>
            </div>
          </div>
        </div>
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
              { label: '재산피해', value: `${formatNumber(data.summary.totalPropertyDamage)}원`, icon: 'payments', color: 'text-primary' },
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
              <div className="flex items-end gap-1.5 h-40">
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
                {data.casualtiesBySido.slice(0, 17).map((row, i) => (
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
    <div className="flex items-center gap-6">
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
      <div className="flex-1 space-y-1.5">
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
