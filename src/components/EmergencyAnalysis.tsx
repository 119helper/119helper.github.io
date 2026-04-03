import { useState, useEffect, useCallback } from 'react';
import { fetchEmergencyStats, fetchEmergencyInfo } from '../services/apiClient';

/* ─── 타입 정의 ─── */
interface ActivityStats {
  dispatchCnt: number;    // 출동건수
  transferCnt: number;    // 이송건수
  transferPrsnCnt: number; // 이송환자수
}

interface DispatchTypeItem {
  dispatchType: string;   // 출동유형
  dispatchCnt: number;
  transferCnt: number;
  transferPrsnCnt: number;
}

interface AgeGroupItem {
  ageGroup: string;
  dispatchCnt: number;
  transferCnt: number;
  transferPrsnCnt: number;
}

interface LocationItem {
  accidentPlace: string;  // 사고장소
  dispatchCnt: number;
  transferCnt: number;
  transferPrsnCnt: number;
}

interface VehicleItem {
  vhcleNo: string;       // 차량호수
  vhcleKnd: string;      // 차량구분
  vhcleSttus: string;    // 차량상태
}

/* ─── 색상 팔레트 ─── */
const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#64748b',
];

/* ─── 월 선택 헬퍼 ─── */
function getRecentMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

function formatYm(ym: string): string {
  return `${ym.slice(0, 4)}년 ${parseInt(ym.slice(4))}월`;
}

/* ─── 도넛 차트 (순수 CSS) ─── */
function DonutChart({ data, labelKey, valueKey }: { data: any[]; labelKey: string; valueKey: string }) {
  const total = data.reduce((s, d) => s + (d[valueKey] || 0), 0);
  if (total === 0) return <EmptyState icon="donut_large" text="데이터 없음" />;

  const slices = data.reduce((acc: any[], d, i) => {
    const pct = (d[valueKey] / total) * 100;
    const start = acc.length > 0 ? acc[acc.length - 1].start + acc[acc.length - 1].pct : 0;
    acc.push({ label: d[labelKey], value: d[valueKey], pct, start, color: CHART_COLORS[i % CHART_COLORS.length] });
    return acc;
  }, []);

  const gradient = slices.map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`).join(', ');

  return (
    <div className="flex items-center gap-6">
      <div
        style={{
          width: 160, height: 160, borderRadius: '50%',
          background: `conic-gradient(${gradient})`,
          position: 'relative',
        }}
      >
        <div style={{
          position: 'absolute', inset: '30%', borderRadius: '50%',
          backgroundColor: 'var(--md-sys-color-surface-container-lowest, #1a1a2e)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="text-center">
            <p className="text-lg font-extrabold text-on-surface">{total.toLocaleString()}</p>
            <p className="text-[9px] text-on-surface-variant">총 건수</p>
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-1.5 max-h-[180px] overflow-y-auto pr-2">
        {slices.filter(s => s.pct >= 1).map(s => (
          <div key={s.label} className="flex items-center gap-2 text-xs">
            <span style={{ backgroundColor: s.color, width: 10, height: 10, borderRadius: 2, flexShrink: 0 }} />
            <span className="text-on-surface-variant truncate flex-1">{s.label}</span>
            <span className="font-bold text-on-surface tabular-nums">{s.value.toLocaleString()}</span>
            <span className="text-on-surface-variant w-10 text-right">{s.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── 수평 바 차트 (순수 CSS) ─── */
function HBarChart({ data, labelKey, valueKey }: { data: any[]; labelKey: string; valueKey: string }) {
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  if (data.length === 0) return <EmptyState icon="bar_chart" text="데이터 없음" />;

  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const pct = ((d[valueKey] || 0) / max) * 100;
        return (
          <div key={d[labelKey] || i} className="flex items-center gap-3">
            <span className="text-xs text-on-surface-variant w-16 text-right truncate">{d[labelKey]}</span>
            <div className="flex-1 h-6 bg-surface-container rounded-md overflow-hidden relative">
              <div
                className="h-full rounded-md transition-all duration-700 ease-out"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${CHART_COLORS[i % CHART_COLORS.length]}cc, ${CHART_COLORS[i % CHART_COLORS.length]})`,
                }}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface">
                {(d[valueKey] || 0).toLocaleString()}
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
    <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant/50">
      <span className="material-symbols-outlined text-4xl mb-2">{icon}</span>
      <p className="text-sm">{text}</p>
      <p className="text-xs mt-1">해당 기간에 데이터가 아직 제공되지 않았습니다.</p>
    </div>
  );
}

/* ─── 메인 컴포넌트 ─── */
export default function EmergencyAnalysis() {
  const months = getRecentMonths(24);
  const [selectedMonth, setSelectedMonth] = useState(months[1] || months[0]); // 지난달 기본
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // 데이터 상태
  const [activity, setActivity] = useState<ActivityStats>({ dispatchCnt: 0, transferCnt: 0, transferPrsnCnt: 0 });
  const [dispatchTypes, setDispatchTypes] = useState<DispatchTypeItem[]>([]);
  const [ageGroups, setAgeGroups] = useState<AgeGroupItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [vehicles, setVehicles] = useState<VehicleItem[]>([]);

  const fetchAll = useCallback(async () => {
    const params = { reqYm: selectedMonth };

    try {
      const results = await Promise.allSettled([
        fetchEmergencyStats('activity', params),
        fetchEmergencyStats('dispatch-type', params),
        fetchEmergencyStats('age', params),
        fetchEmergencyStats('location', params),
        fetchEmergencyInfo('vehicles', {}),
      ]);

      // 전체 실패 여부 확인
      const allFailed = results.every(r => r.status === 'rejected');
      if (allFailed) {
        const firstErr = (results[0] as PromiseRejectedResult).reason;
        setApiError(firstErr?.message || '구급통계 API에 연결할 수 없습니다.');
        setLoading(false);
        return;
      }

      // 119구급활동현황
      if (results[0].status === 'fulfilled') {
        const items = results[0].value?.items || [];
        const totals: ActivityStats = { dispatchCnt: 0, transferCnt: 0, transferPrsnCnt: 0 };
        items.forEach((it: any) => {
          totals.dispatchCnt += parseInt(it.dispatchCnt || it.출동건수 || '0');
          totals.transferCnt += parseInt(it.transferCnt || it.이송건수 || '0');
          totals.transferPrsnCnt += parseInt(it.transferPrsnCnt || it.이송환자수 || '0');
        });
        setActivity(totals);
      }

      // 출동유형별
      if (results[1].status === 'fulfilled') {
        const items = results[1].value?.items || [];
        setDispatchTypes(items.map((it: any) => ({
          dispatchType: it.dispatchType || it.출동유형 || '기타',
          dispatchCnt: parseInt(it.dispatchCnt || it.출동건수 || '0'),
          transferCnt: parseInt(it.transferCnt || it.이송건수 || '0'),
          transferPrsnCnt: parseInt(it.transferPrsnCnt || it.이송환자수 || '0'),
        })).filter((it: DispatchTypeItem) => it.dispatchCnt > 0));
      }

      // 연령별
      if (results[2].status === 'fulfilled') {
        const items = results[2].value?.items || [];
        setAgeGroups(items.map((it: any) => ({
          ageGroup: it.ageGroup || it.연령대 || '미상',
          dispatchCnt: parseInt(it.dispatchCnt || it.출동건수 || '0'),
          transferCnt: parseInt(it.transferCnt || it.이송건수 || '0'),
          transferPrsnCnt: parseInt(it.transferPrsnCnt || it.이송환자수 || '0'),
        })).filter((it: AgeGroupItem) => it.transferPrsnCnt > 0));
      }

      // 사고장소별
      if (results[3].status === 'fulfilled') {
        const items = results[3].value?.items || [];
        setLocations(items.map((it: any) => ({
          accidentPlace: it.accidentPlace || it.사고장소 || '기타',
          dispatchCnt: parseInt(it.dispatchCnt || it.출동건수 || '0'),
          transferCnt: parseInt(it.transferCnt || it.이송건수 || '0'),
          transferPrsnCnt: parseInt(it.transferPrsnCnt || it.이송환자수 || '0'),
        })).filter((it: LocationItem) => it.dispatchCnt > 0));
      }

      // 구급차량
      if (results[4].status === 'fulfilled') {
        const items = results[4].value?.items || [];
        setVehicles(items.map((it: any) => ({
          vhcleNo: it.vhcleNo || it.차량호수 || '-',
          vhcleKnd: it.vhcleKnd || it.차량구분 || '-',
          vhcleSttus: it.vhcleSttus || it.차량상태 || '-',
        })));
      }
    } catch (e: any) {
      console.error('구급 데이터 조회 오류:', e);
      setApiError(e?.message || '알 수 없는 오류가 발생했습니다.');
    }

    setLoading(false);
  }, [selectedMonth, setApiError, setLoading]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const transferRate = activity.dispatchCnt > 0
    ? ((activity.transferCnt / activity.dispatchCnt) * 100).toFixed(1)
    : '0';

  const hasAnyData = activity.dispatchCnt > 0 || dispatchTypes.length > 0 || ageGroups.length > 0;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface font-headline">🚑 구급 출동 분석</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            소방청 구급통계·구급정보 서비스 · 전국 데이터
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedMonth}
            onChange={e => {
              setLoading(true);
              setApiError(null);
              setSelectedMonth(e.target.value);
            }}
            className="bg-surface-container border border-outline-variant/20 text-on-surface px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
          >
            {months.map(m => (
              <option key={m} value={m}>{formatYm(m)}</option>
            ))}
          </select>
          <button
            onClick={() => {
              setLoading(true);
              setApiError(null);
              fetchAll();
            }}
            disabled={loading}
            className="bg-primary/10 text-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/20 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
            새로고침
          </button>
        </div>
      </div>

      {/* 요약 카드 4장 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon="ambulance" iconColor="text-red-400" label="출동 건수"
          value={activity.dispatchCnt} loading={loading}
        />
        <SummaryCard
          icon="local_shipping" iconColor="text-blue-400" label="이송 건수"
          value={activity.transferCnt} loading={loading}
        />
        <SummaryCard
          icon="personal_injury" iconColor="text-amber-400" label="이송 환자수"
          value={activity.transferPrsnCnt} loading={loading}
        />
        <SummaryCard
          icon="percent" iconColor="text-green-400" label="이송률"
          value={transferRate} suffix="%" loading={loading}
        />
      </div>

      {/* API 에러 배너 */}
      {!loading && apiError && (
        <div className="bg-error-container/30 border border-error/30 rounded-xl p-6 text-center">
          <span className="material-symbols-outlined text-5xl text-error/60 mb-3 block">cloud_off</span>
          <h3 className="text-lg font-bold text-on-surface mb-2">구급통계 API 연결 실패</h3>
          <p className="text-sm text-error/80 max-w-lg mx-auto mb-1">{apiError}</p>
          <p className="text-xs text-on-surface-variant max-w-lg mx-auto mb-4">
            공공데이터포털에서 API 서비스 신청 후 승인까지 최대 1~2일이 소요될 수 있습니다.<br />
            이미 승인된 API라면 공공데이터 서버 일시 장애일 수 있으니 잠시 후 다시 시도해주세요.
          </p>
          <button
            onClick={() => {
              setLoading(true);
              setApiError(null);
              fetchAll();
            }}
            className="bg-error/15 text-error px-5 py-2 rounded-lg text-sm font-bold hover:bg-error/25 transition-colors inline-flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg">refresh</span>
            다시 시도
          </button>
        </div>
      )}

      {/* 데이터가 아예 없을 때 안내 (API는 정상이지만 데이터 미제공) */}
      {!loading && !apiError && !hasAnyData && (
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-8 text-center">
          <span className="material-symbols-outlined text-5xl text-on-surface-variant/30 mb-3 block">info</span>
          <h3 className="text-lg font-bold text-on-surface mb-2">
            {formatYm(selectedMonth)} 데이터가 아직 없습니다
          </h3>
          <p className="text-sm text-on-surface-variant max-w-lg mx-auto">
            소방청 구급통계 데이터는 통상 2~3개월 전 데이터까지만 제공됩니다.
            월 선택 드롭다운에서 더 이전 달을 선택해 보세요.
          </p>
        </div>
      )}

      {/* 차트 영역 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 출동유형별 도넛 */}
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-purple-400">donut_large</span>
            출동유형별 분포
          </h3>
          {loading ? <LoadingSkeleton /> : (
            <DonutChart data={dispatchTypes} labelKey="dispatchType" valueKey="dispatchCnt" />
          )}
        </section>

        {/* 연령별 바 차트 */}
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-blue-400">bar_chart</span>
            연령별 이송환자
          </h3>
          {loading ? <LoadingSkeleton /> : (
            <HBarChart data={ageGroups} labelKey="ageGroup" valueKey="transferPrsnCnt" />
          )}
        </section>
      </div>

      {/* 사고장소 테이블 */}
      <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
        <div className="p-6 border-b border-outline-variant/10">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-orange-400">location_on</span>
            사고장소별 이송환자 현황
          </h3>
        </div>
        {loading ? (
          <div className="p-6"><LoadingSkeleton /></div>
        ) : locations.length === 0 ? (
          <EmptyState icon="location_on" text="사고장소별 데이터 없음" />
        ) : (
          <table className="w-full">
            <thead>
              <tr className="bg-surface-container/50">
                <th className="px-5 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">사고장소</th>
                <th className="px-3 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">출동건수</th>
                <th className="px-3 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">이송건수</th>
                <th className="px-5 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest">이송환자수</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10">
              {locations.map((loc, i) => {
                return (
                  <tr key={i} className="hover:bg-surface-container/30 transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full flex-shrink-0"
                          style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
                        />
                        <span className="text-sm font-medium text-on-surface">{loc.accidentPlace}</span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums font-bold text-on-surface">
                      {loc.dispatchCnt.toLocaleString()}
                    </td>
                    <td className="px-3 py-3 text-right text-sm tabular-nums text-on-surface-variant">
                      {loc.transferCnt.toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-right text-sm tabular-nums text-on-surface-variant">
                      {loc.transferPrsnCnt.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* 구급차량 현황 */}
      {vehicles.length > 0 && (
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-red-400">fire_truck</span>
            구급차량 현황
            <span className="text-[10px] bg-surface-container px-2 py-0.5 rounded text-on-surface-variant font-normal normal-case">
              {vehicles.length}대
            </span>
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {vehicles.slice(0, 30).map((v, i) => {
              const statusColor = v.vhcleSttus.includes('가용') || v.vhcleSttus.includes('대기')
                ? 'bg-green-500/10 border-green-500/20 text-green-400'
                : v.vhcleSttus.includes('출동') || v.vhcleSttus.includes('운행')
                ? 'bg-red-500/10 border-red-500/20 text-red-400'
                : 'bg-amber-500/10 border-amber-500/20 text-amber-400';
              return (
                <div key={i} className={`rounded-lg border px-3 py-2.5 ${statusColor}`}>
                  <p className="text-xs font-bold">{v.vhcleNo}</p>
                  <p className="text-[10px] mt-0.5 opacity-80">{v.vhcleKnd}</p>
                  <p className="text-[10px] mt-0.5 font-medium">{v.vhcleSttus}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

/* ─── 요약 카드 서브 컴포넌트 ─── */
function SummaryCard({ icon, iconColor, label, value, suffix, loading }: {
  icon: string; iconColor: string; label: string; value: number | string; suffix?: string; loading: boolean;
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 relative overflow-hidden group">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">{label}</p>
        <span className={`material-symbols-outlined text-xl ${iconColor} group-hover:scale-110 transition-transform`}>{icon}</span>
      </div>
      <p className="text-3xl font-extrabold text-on-surface mt-2 font-headline tabular-nums">
        {loading ? (
          <span className="text-sm font-medium animate-pulse text-on-surface-variant">조회 중...</span>
        ) : (
          <>{typeof value === 'number' ? value.toLocaleString() : value}{suffix && <span className="text-lg text-on-surface-variant ml-0.5">{suffix}</span>}</>
        )}
      </p>
    </div>
  );
}

/* ─── 로딩 스켈레톤 ─── */
function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-16 h-4 bg-surface-container rounded" />
          <div className="flex-1 h-6 bg-surface-container rounded" style={{ width: `${70 - i * 10}%` }} />
        </div>
      ))}
    </div>
  );
}
