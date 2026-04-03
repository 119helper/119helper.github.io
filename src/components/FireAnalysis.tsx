import { useState, useEffect, useCallback } from 'react';
import { fetchFireInfo } from '../services/apiClient';

/* ─── 색상 팔레트 ─── */
const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
  '#ec4899', '#f43f5e', '#64748b', '#84cc16',
];

/* ─── 날짜 헬퍼 ─── */
function getRecentYears(count: number): string[] {
  const years: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    years.push(String(now.getFullYear() - i));
  }
  return years;
}

function getDateRange(year: string): { searchStDt: string; searchEdDt: string } {
  return {
    searchStDt: `${year}0101`,
    searchEdDt: `${year}1231`,
  };
}

/* ─── 도넛 차트 ─── */
function DonutChart({ data, labelKey, valueKey, title }: { data: any[]; labelKey: string; valueKey: string; title: string }) {
  const total = data.reduce((s, d) => s + (Number(d[valueKey]) || 0), 0);
  if (total === 0) return <EmptyState icon="donut_large" text={`${title} 데이터 없음`} />;

  const slices = data.filter(d => Number(d[valueKey]) > 0).reduce((acc: any[], d, i) => {
    const val = Number(d[valueKey]) || 0;
    const pct = (val / total) * 100;
    const start = acc.length > 0 ? acc[acc.length - 1].start + acc[acc.length - 1].pct : 0;
    acc.push({ label: d[labelKey], value: val, pct, start, color: PALETTE[i % PALETTE.length] });
    return acc;
  }, []);

  const gradient = slices.map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`).join(', ');

  return (
    <div className="flex items-center gap-6">
      <div style={{ width: 150, height: 150, borderRadius: '50%', background: `conic-gradient(${gradient})`, position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: '28%', borderRadius: '50%', backgroundColor: 'var(--md-sys-color-surface-container-lowest, #1a1a2e)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="text-center">
            <p className="text-base font-extrabold text-on-surface">{total.toLocaleString()}</p>
            <p className="text-[8px] text-on-surface-variant">총 건수</p>
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-1 max-h-[170px] overflow-y-auto pr-2">
        {slices.filter(s => s.pct >= 0.5).map(s => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span style={{ backgroundColor: s.color, width: 8, height: 8, borderRadius: 2, flexShrink: 0 }} />
            <span className="text-on-surface-variant truncate flex-1">{s.label}</span>
            <span className="font-bold text-on-surface tabular-nums">{s.value.toLocaleString()}</span>
            <span className="text-on-surface-variant/60 w-10 text-right">{s.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── 수평 바 차트 ─── */
function HBarChart({ data, labelKey, valueKey }: { data: any[]; labelKey: string; valueKey: string }) {
  const max = Math.max(...data.map(d => Number(d[valueKey]) || 0), 1);
  if (data.length === 0) return <EmptyState icon="bar_chart" text="데이터 없음" />;

  return (
    <div className="space-y-1.5">
      {data.slice(0, 12).map((d, i) => {
        const val = Number(d[valueKey]) || 0;
        const pct = (val / max) * 100;
        return (
          <div key={d[labelKey] || i} className="flex items-center gap-2">
            <span className="text-[11px] text-on-surface-variant w-20 text-right truncate">{d[labelKey]}</span>
            <div className="flex-1 h-5 bg-surface-container rounded overflow-hidden relative">
              <div className="h-full rounded transition-all duration-700 ease-out"
                style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${PALETTE[i % PALETTE.length]}aa, ${PALETTE[i % PALETTE.length]})` }} />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-on-surface">
                {val.toLocaleString()}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ─── 빈 상태 ─── */
function EmptyState({ icon, text }: { icon: string; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-on-surface-variant/40">
      <span className="material-symbols-outlined text-3xl mb-2">{icon}</span>
      <p className="text-xs">{text}</p>
      <p className="text-[10px] mt-1">해당 연도에 데이터가 아직 제공되지 않았습니다.</p>
    </div>
  );
}

/* ─── 로딩 스켈레톤 ─── */
function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex gap-2"><div className="w-20 h-4 bg-surface-container rounded" /><div className="flex-1 h-5 bg-surface-container rounded" style={{ width: `${80 - i * 12}%` }} /></div>
      ))}
    </div>
  );
}

/* ─── 요약 카드 ─── */
function StatCard({ icon, iconColor, label, value, sub, loading }: {
  icon: string; iconColor: string; label: string; value: string | number; sub?: string; loading: boolean;
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 relative overflow-hidden group">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">{label}</p>
        <span className={`material-symbols-outlined text-xl ${iconColor} group-hover:scale-110 transition-transform`}>{icon}</span>
      </div>
      {loading ? (
        <p className="text-sm font-medium animate-pulse text-on-surface-variant mt-2">조회 중...</p>
      ) : (
        <>
          <p className="text-2xl font-extrabold text-on-surface mt-2 font-headline tabular-nums">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </p>
          {sub && <p className="text-[10px] text-on-surface-variant mt-0.5">{sub}</p>}
        </>
      )}
    </div>
  );
}

/* ═══════ 메인 컴포넌트 ═══════ */
export default function FireAnalysis() {
  const years = getRecentYears(6);
  const [selectedYear, setSelectedYear] = useState(years[1] || years[0]); // 작년 기본
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // 데이터 상태
  const [summary, setSummary] = useState({ total: 0, death: 0, injury: 0, propertyDmg: 0, selfExtinguish: 0, falseReport: 0 });
  const [causeData, setCauseData] = useState<any[]>([]);
  const [placeData, setPlaceData] = useState<any[]>([]);
  const [sidoData, setSidoData] = useState<any[]>([]);
  const [buildingData, setBuildingData] = useState<any[]>([]);
  const [casualtyData, setCasualtyData] = useState<any[]>([]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setApiError(null);
    const range = getDateRange(selectedYear);

    try {
      const results = await Promise.allSettled([
        fetchFireInfo('sido-summary', range),   // 0: 시도단위 화재발생현황
        fetchFireInfo('cause', range),          // 1: 발화요인별
        fetchFireInfo('place', range),          // 2: 화재장소별
        fetchFireInfo('sido-casualty', range),  // 3: 시도별 인명피해
        fetchFireInfo('building', range),       // 4: 건물구조별
        fetchFireInfo('property', range),       // 5: 재산피해
      ]);

      // 전체 실패 여부 확인
      const allFailed = results.every(r => r.status === 'rejected');
      if (allFailed) {
        const firstErr = (results[0] as PromiseRejectedResult).reason;
        setApiError(firstErr?.message || '화재정보 API에 연결할 수 없습니다.');
        setLoading(false);
        return;
      }

      // 시도 요약 → 전국 합산
      if (results[0].status === 'fulfilled') {
        const items = results[0].value?.items || [];
        let total = 0, death = 0, injury = 0, propertyDmg = 0, selfExtinguish = 0, falseReport = 0;
        const sidoArr: any[] = [];
        items.forEach((it: any) => {
          const fires = num(it.fireCnt || it.화재접수건수);
          const d = num(it.deathCnt || it.사망자수);
          const inj = num(it.injuryCnt || it.부상자수);
          const prop = num(it.realEstateDmg || it.부동산피해금액) + num(it.movablePropertyDmg || it.동산피해금액);
          const self = num(it.selfExtinguishCnt || it.자체진화건);
          const fal = num(it.falseReportCnt || it.허위신고건수);
          total += fires; death += d; injury += inj; propertyDmg += prop; selfExtinguish += self; falseReport += fal;
          if (it.sidoNm || it.시도명) {
            sidoArr.push({ name: it.sidoNm || it.시도명, fires, death: d, injury: inj, property: prop });
          }
        });
        setSummary({ total, death, injury, propertyDmg, selfExtinguish, falseReport });
        setSidoData(sidoArr.sort((a, b) => b.fires - a.fires));
      }

      // 발화요인별
      if (results[1].status === 'fulfilled') {
        const items = results[1].value?.items || [];
        setCauseData(items.map((it: any) => ({
          cause: it.igntnFctrNm || it.발화요인 || '기타',
          count: num(it.fireCnt || it.화재건수),
        })).filter((x: any) => x.count > 0).sort((a: any, b: any) => b.count - a.count));
      }

      // 화재장소별
      if (results[2].status === 'fulfilled') {
        const items = results[2].value?.items || [];
        setPlaceData(items.map((it: any) => ({
          place: it.firePlceNm || it.화재장소 || '기타',
          count: num(it.fireCnt || it.화재건수),
        })).filter((x: any) => x.count > 0).sort((a: any, b: any) => b.count - a.count));
      }

      // 시도별 인명피해
      if (results[3].status === 'fulfilled') {
        const items = results[3].value?.items || [];
        setCasualtyData(items.map((it: any) => ({
          sido: it.sidoNm || it.시도명 || '기타',
          death: num(it.deathCnt || it.사망자수),
          injury: num(it.injuryCnt || it.부상자수),
        })).filter((x: any) => (x.death + x.injury) > 0).sort((a: any, b: any) => (b.death + b.injury) - (a.death + a.injury)));
      }

      // 건물구조별
      if (results[4].status === 'fulfilled') {
        const items = results[4].value?.items || [];
        setBuildingData(items.map((it: any) => ({
          structure: it.bldgStrcNm || it.건물구조 || '기타',
          count: num(it.fireCnt || it.화재건수),
        })).filter((x: any) => x.count > 0).sort((a: any, b: any) => b.count - a.count));
      }

      // 재산피해 — 합산은 위에서 이미 처리
    } catch (e: any) {
      console.error('화재 데이터 조회 오류:', e);
      setApiError(e?.message || '알 수 없는 오류가 발생했습니다.');
    }

    setLoading(false);
  }, [selectedYear]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const hasAnyData = summary.total > 0 || causeData.length > 0 || placeData.length > 0;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface font-headline">🔥 화재 분석</h2>
          <p className="text-sm text-on-surface-variant mt-1">소방청 화재정보서비스 · 전국 데이터</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedYear}
            onChange={e => setSelectedYear(e.target.value)}
            className="bg-surface-container border border-outline-variant/20 text-on-surface px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
          >
            {years.map(y => <option key={y} value={y}>{y}년</option>)}
          </select>
          <button onClick={fetchAll} disabled={loading}
            className="bg-error/10 text-error px-4 py-2 rounded-lg text-sm font-bold hover:bg-error/20 transition-colors flex items-center gap-2 disabled:opacity-50">
            <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
            새로고침
          </button>
        </div>
      </div>

      {/* 요약 카드 6장 */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard icon="local_fire_department" iconColor="text-red-400" label="화재 발생" value={summary.total} loading={loading} />
        <StatCard icon="skull" iconColor="text-red-600" label="사망자" value={summary.death} loading={loading} />
        <StatCard icon="personal_injury" iconColor="text-orange-400" label="부상자" value={summary.injury} loading={loading} />
        <StatCard icon="payments" iconColor="text-amber-400" label="재산 피해"
          value={summary.propertyDmg > 100000000 ? `${(summary.propertyDmg / 100000000).toFixed(1)}억` : `${(summary.propertyDmg / 10000).toFixed(0)}만`}
          sub="원" loading={loading} />
        <StatCard icon="fire_extinguisher" iconColor="text-green-400" label="자체 진화" value={summary.selfExtinguish} loading={loading} />
        <StatCard icon="report" iconColor="text-gray-400" label="허위 신고" value={summary.falseReport} loading={loading} />
      </div>

      {/* API 에러 배너 */}
      {!loading && apiError && (
        <div className="bg-error-container/30 border border-error/30 rounded-xl p-6 text-center">
          <span className="material-symbols-outlined text-5xl text-error/60 mb-3 block">cloud_off</span>
          <h3 className="text-lg font-bold text-on-surface mb-2">화재정보 API 연결 실패</h3>
          <p className="text-sm text-error/80 max-w-lg mx-auto mb-1">{apiError}</p>
          <p className="text-xs text-on-surface-variant max-w-lg mx-auto mb-4">
            공공데이터포털에서 API 서비스 신청 후 승인까지 최대 1~2일이 소요될 수 있습니다.<br />
            이미 승인된 API라면 공공데이터 서버 일시 장애일 수 있으니 잠시 후 다시 시도해주세요.
          </p>
          <button onClick={fetchAll}
            className="bg-error/15 text-error px-5 py-2 rounded-lg text-sm font-bold hover:bg-error/25 transition-colors inline-flex items-center gap-2">
            <span className="material-symbols-outlined text-lg">refresh</span>
            다시 시도
          </button>
        </div>
      )}

      {/* 데이터 없을 때 (API 정상이지만 데이터 미제공) */}
      {!loading && !apiError && !hasAnyData && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-8 text-center">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3 block">info</span>
          <h3 className="text-lg font-bold text-on-surface mb-2">{selectedYear}년 화재 데이터가 아직 없습니다</h3>
          <p className="text-sm text-on-surface-variant max-w-lg mx-auto">
            소방청 화재 통계는 보통 전년도까지의 데이터를 제공합니다. 연도 선택에서 더 이전 연도를 선택해 보세요.
          </p>
        </div>
      )}

      {/* 차트 영역 2×2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 발화요인별 */}
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-orange-400">whatshot</span>
            발화요인별 분포
          </h3>
          {loading ? <Skeleton /> : <DonutChart data={causeData} labelKey="cause" valueKey="count" title="발화요인" />}
        </section>

        {/* 화재장소별 */}
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-red-400">location_on</span>
            화재장소별 현황
          </h3>
          {loading ? <Skeleton /> : <HBarChart data={placeData} labelKey="place" valueKey="count" />}
        </section>

        {/* 건물구조별 */}
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-blue-400">apartment</span>
            건물구조별 화재
          </h3>
          {loading ? <Skeleton /> : <HBarChart data={buildingData} labelKey="structure" valueKey="count" />}
        </section>

        {/* 시도별 인명피해 */}
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-purple-400">emergency</span>
            시도별 인명피해
          </h3>
          {loading ? <Skeleton /> : casualtyData.length === 0 ? (
            <EmptyState icon="emergency" text="인명피해 데이터 없음" />
          ) : (
            <div className="space-y-1.5 max-h-[240px] overflow-y-auto">
              {casualtyData.map((d) => (
                <div key={d.sido} className="flex items-center gap-3 text-xs">
                  <span className="text-on-surface-variant w-14 text-right">{d.sido}</span>
                  <div className="flex-1 flex gap-1">
                    {d.death > 0 && (
                      <div className="h-5 rounded bg-red-500/80 flex items-center justify-center px-2 text-[9px] font-bold text-white"
                        style={{ width: `${Math.max((d.death / (d.death + d.injury)) * 100, 15)}%` }}>
                        사망 {d.death}
                      </div>
                    )}
                    {d.injury > 0 && (
                      <div className="h-5 rounded bg-orange-500/60 flex items-center justify-center px-2 text-[9px] font-bold text-white"
                        style={{ width: `${Math.max((d.injury / (d.death + d.injury)) * 100, 15)}%` }}>
                        부상 {d.injury}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 시도별 화재 발생 테이블 */}
      {sidoData.length > 0 && (
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
          <div className="p-6 border-b border-outline-variant/10">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-cyan-400">map</span>
              시도별 화재 발생 현황
            </h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-surface-container/50">
                <th className="px-5 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">시도</th>
                <th className="px-3 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">화재건수</th>
                <th className="px-3 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">사망</th>
                <th className="px-3 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">부상</th>
                <th className="px-5 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">재산피해(만원)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {sidoData.map((d, i) => (
                <tr key={i} className="hover:bg-surface-container/30 transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: PALETTE[i % PALETTE.length] }} />
                      <span className="text-sm font-medium text-on-surface">{d.name}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums font-bold text-on-surface">{d.fires.toLocaleString()}</td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums text-red-400 font-medium">{d.death > 0 ? d.death : '-'}</td>
                  <td className="px-3 py-3 text-right text-sm tabular-nums text-orange-400">{d.injury > 0 ? d.injury : '-'}</td>
                  <td className="px-5 py-3 text-right text-sm tabular-nums text-on-surface-variant">{Math.round(d.property / 10000).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}

/* ─── 헬퍼 ─── */
function num(v: any): number {
  return parseInt(v) || 0;
}
