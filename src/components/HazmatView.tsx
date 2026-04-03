import { useState, useMemo } from 'react';
import { HAZMAT_FACILITY_DATA, HAZMAT_DATA_INFO, type HazmatFacilityStats } from '../data/hazmatFacilities';

/* ─── 색상 팔레트 ─── */
const PALETTE = [
  '#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6',
  '#06b6d4', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7',
];

/* ─── 도넛 차트 (순수 CSS) ─── */
function DonutChart({ slices, total }: { slices: { label: string; value: number; color: string }[]; total: number }) {
  if (total === 0) return <p className="text-xs text-on-surface-variant text-center py-8">데이터 없음</p>;

  const segments = slices.filter(s => s.value > 0).reduce((acc: any[], s, i) => {
    const pct = (s.value / total) * 100;
    const start = acc.length > 0 ? acc[acc.length - 1].start + acc[acc.length - 1].pct : 0;
    acc.push({ ...s, pct, start, color: s.color || PALETTE[i % PALETTE.length] });
    return acc;
  }, []);

  const gradient = segments.map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`).join(', ');

  return (
    <div className="flex items-center gap-4">
      <div style={{ width: 120, height: 120, borderRadius: '50%', background: `conic-gradient(${gradient})`, position: 'relative', flexShrink: 0 }}>
        <div style={{ position: 'absolute', inset: '28%', borderRadius: '50%', backgroundColor: 'var(--color-surface-container-lowest, #060a14)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div className="text-center">
            <p className="text-sm font-extrabold text-on-surface">{total.toLocaleString()}</p>
            <p className="text-[8px] text-on-surface-variant">총계</p>
          </div>
        </div>
      </div>
      <div className="flex-1 space-y-1 max-h-[140px] overflow-y-auto pr-2">
        {segments.map(s => (
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

export default function HazmatView() {
  const [selectedDept, setSelectedDept] = useState<string>('합계');

  const allDepts = HAZMAT_FACILITY_DATA.filter(d => d.fireDept !== '합계');
  const summary = HAZMAT_FACILITY_DATA.find(d => d.fireDept === '합계')!;
  const selected: HazmatFacilityStats = HAZMAT_FACILITY_DATA.find(d => d.fireDept === selectedDept) || summary;

  // 대분류 도넛 데이터
  const categorySlices = useMemo(() => [
    { label: '제조소', value: selected.manufacturing, color: '#ef4444' },
    { label: '취급소 (주유)', value: selected.handling.gasStation, color: '#f97316' },
    { label: '취급소 (판매)', value: selected.handling.sales, color: '#eab308' },
    { label: '취급소 (이송)', value: selected.handling.transfer, color: '#84cc16' },
    { label: '취급소 (일반)', value: selected.handling.general, color: '#22c55e' },
    { label: '저장소 (옥내)', value: selected.storage.indoor, color: '#14b8a6' },
    { label: '저장소 (옥외탱크)', value: selected.storage.outdoorTank, color: '#06b6d4' },
    { label: '저장소 (옥내탱크)', value: selected.storage.indoorTank, color: '#3b82f6' },
    { label: '저장소 (지하탱크)', value: selected.storage.underground, color: '#6366f1' },
    { label: '저장소 (이동탱크)', value: selected.storage.mobile, color: '#8b5cf6' },
    { label: '저장소 (옥외)', value: selected.storage.outdoor, color: '#a855f7' },
  ], [selected]);

  // 소방서별 바 차트 데이터
  const sortedDepts = useMemo(() =>
    [...allDepts].sort((a, b) => b.total - a.total),
  [allDepts]);

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface font-headline">⚠️ 위험물시설 현황</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            경상북도 위험물제조소등 설치현황 · KOSIS 통계 ({HAZMAT_DATA_INFO.dataYear}년 기준)
          </p>
        </div>
        <select
          value={selectedDept}
          onChange={e => setSelectedDept(e.target.value)}
          className="bg-surface-container border border-outline-variant/20 text-on-surface px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
        >
          <option value="합계">전체 (합계)</option>
          {allDepts.map(d => (
            <option key={d.fireDept} value={d.fireDept}>{d.fireDept}</option>
          ))}
        </select>
      </div>

      {/* 요약 카드 5장 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <SummaryCard icon="factory" iconColor="text-red-400" label="총 시설" value={selected.total} />
        <SummaryCard icon="precision_manufacturing" iconColor="text-orange-400" label="제조소" value={selected.manufacturing} />
        <SummaryCard icon="local_gas_station" iconColor="text-amber-400" label="취급소" value={selected.handling.subtotal} sub={`주유 ${selected.handling.gasStation} · 일반 ${selected.handling.general}`} />
        <SummaryCard icon="warehouse" iconColor="text-blue-400" label="저장소" value={selected.storage.subtotal} sub={`옥외탱크 ${selected.storage.outdoorTank} · 이동 ${selected.storage.mobile}`} />
        <SummaryCard icon="local_fire_department" iconColor="text-purple-400" label="관할 소방서" value={selectedDept === '합계' ? allDepts.length : 1} sub={selectedDept === '합계' ? '경상북도 전체' : selectedDept} />
      </div>

      {/* 차트 + 테이블 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 시설유형별 분포 도넛 */}
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-orange-400">donut_large</span>
            시설유형별 분포 — {selected.fireDept}
          </h3>
          <DonutChart slices={categorySlices} total={selected.total} />
        </section>

        {/* 소방서별 시설 수 바 차트 */}
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-blue-400">bar_chart</span>
            소방서별 위험물시설 수
          </h3>
          <div className="space-y-1.5 max-h-[280px] overflow-y-auto pr-2">
            {sortedDepts.map((d, i) => {
              const pct = (d.total / (sortedDepts[0]?.total || 1)) * 100;
              return (
                <button
                  key={d.fireDept}
                  onClick={() => setSelectedDept(d.fireDept)}
                  className={`w-full flex items-center gap-2 text-left rounded transition-colors ${selectedDept === d.fireDept ? 'bg-primary/10' : 'hover:bg-surface-container/50'}`}
                >
                  <span className="text-[11px] text-on-surface-variant w-24 text-right truncate px-1">{d.fireDept.replace('소방서', '')}</span>
                  <div className="flex-1 h-5 bg-surface-container rounded overflow-hidden relative">
                    <div className="h-full rounded transition-all duration-700 ease-out"
                      style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${PALETTE[i % PALETTE.length]}88, ${PALETTE[i % PALETTE.length]})` }} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-on-surface">
                      {d.total.toLocaleString()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* 전체 데이터 테이블 */}
      <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-outline-variant/10 flex items-center justify-between">
          <h3 className="text-sm font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-orange-400 text-lg">table_chart</span>
            소방서별 상세 현황
          </h3>
          <span className="text-[10px] text-on-surface-variant">
            출처: {HAZMAT_DATA_INFO.source} | 데이터 갱신: {HAZMAT_DATA_INFO.lastDownloaded}
          </span>
        </div>
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-surface-container border-b border-outline-variant/10">
                <th className="text-left px-3 py-2 font-bold text-on-surface-variant sticky left-0 bg-surface-container z-10">소방서</th>
                <th className="text-right px-3 py-2 font-bold text-on-surface-variant">총계</th>
                <th className="text-right px-3 py-2 font-bold text-red-400">제조</th>
                <th className="text-right px-3 py-2 font-bold text-amber-400">주유</th>
                <th className="text-right px-3 py-2 font-bold text-green-400">일반취급</th>
                <th className="text-right px-3 py-2 font-bold text-blue-400">옥외탱크</th>
                <th className="text-right px-3 py-2 font-bold text-purple-400">이동탱크</th>
                <th className="text-right px-3 py-2 font-bold text-cyan-400">옥내</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/5">
              {HAZMAT_FACILITY_DATA.map(d => (
                <tr
                  key={d.fireDept}
                  onClick={() => setSelectedDept(d.fireDept)}
                  className={`cursor-pointer transition-colors ${
                    d.fireDept === '합계' ? 'bg-surface-container/50 font-bold' :
                    selectedDept === d.fireDept ? 'bg-primary/10' : 'hover:bg-surface-container/30'
                  }`}
                >
                  <td className="px-3 py-2 text-on-surface font-bold sticky left-0 bg-inherit z-10">{d.fireDept}</td>
                  <td className="px-3 py-2 text-right text-on-surface tabular-nums">{d.total.toLocaleString()}</td>
                  <td className="px-3 py-2 text-right text-red-400 tabular-nums">{d.manufacturing}</td>
                  <td className="px-3 py-2 text-right text-amber-400 tabular-nums">{d.handling.gasStation}</td>
                  <td className="px-3 py-2 text-right text-green-400 tabular-nums">{d.handling.general}</td>
                  <td className="px-3 py-2 text-right text-blue-400 tabular-nums">{d.storage.outdoorTank}</td>
                  <td className="px-3 py-2 text-right text-purple-400 tabular-nums">{d.storage.mobile}</td>
                  <td className="px-3 py-2 text-right text-cyan-400 tabular-nums">{d.storage.indoor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

/* ─── 요약 카드 ─── */
function SummaryCard({ icon, iconColor, label, value, sub }: {
  icon: string; iconColor: string; label: string; value: number; sub?: string;
}) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 group relative overflow-hidden">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest font-bold text-on-surface-variant">{label}</p>
        <span className={`material-symbols-outlined text-xl ${iconColor} group-hover:scale-110 transition-transform`}>{icon}</span>
      </div>
      <p className="text-2xl font-extrabold text-on-surface mt-2 font-headline tabular-nums">{value.toLocaleString()}</p>
      {sub && <p className="text-[10px] text-on-surface-variant mt-0.5">{sub}</p>}
    </div>
  );
}
