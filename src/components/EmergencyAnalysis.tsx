import { useState, useEffect } from 'react';
import { fetchEmergencyStats, fetchEmergencyInfo } from '../services/apiClient';

/* ─── 타입 정의 ─── */
interface ActivityStats {
  dispatchCnt: number;
  transferCnt: number;
  transferPrsnCnt: number;
}

interface DispatchTypeItem {
  dispatchType: string;
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
  accidentPlace: string;
  dispatchCnt: number;
  transferCnt: number;
  transferPrsnCnt: number;
}

interface VehicleItem {
  vhcleNo: string;
  vhcleKnd: string;
  vhcleSttus: string;
}

/* ─── 구급정보 상세 타입 ─── */
interface ActivityDetailItem {
  arriveYmd: string;    // 현장도착년월일
  arriveHh: string;     // 현장도착시
  arriveMm: string;     // 현장도착분
  distKm: string;       // 현장과의거리(km)
  returnYmd: string;    // 귀소년월일
  returnHh: string;     // 귀소시
  returnMm: string;     // 귀소분
  sidoNm: string;       // 시도
  fireStnNm: string;    // 소방서
  safeCnterNm: string;  // 출동안전센터
}

interface TransferItem {
  occrrPlce: string;    // 사고발생장소
  occrrType: string;    // 발생유형
  sidoNm: string;
  fireStnNm: string;
}

interface FirstAidItem {
  ptntAge: string;      // 환자연령
  ptntSex: string;      // 환자성별
  emrgFirstaidCd: string; // 응급처치코드
  sidoNm: string;
  fireStnNm: string;
}

/* ─── 색상 팔레트 ─── */
const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#64748b',
];

/* ─── 시도 목록 ─── */
const SIDO_LIST = [
  '전체', '서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종',
  '경기', '강원', '충북', '충남', '전북', '전남', '경북', '경남', '제주',
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

/* ═════════════════════════════════════════════
   대응시간 분석 카드
   ═════════════════════════════════════════════ */
function ResponseTimeSection({ data }: { data: ActivityDetailItem[] }) {
  if (data.length === 0) return <EmptyState icon="timer" text="대응시간 데이터 없음" />;

  // 대응시간 계산 (현장도착시:분)
  const responseTimes = data
    .filter(d => d.arriveHh && d.arriveMm)
    .map(d => parseInt(d.arriveHh) * 60 + parseInt(d.arriveMm))
    .filter(t => t > 0 && t < 120); // 2시간 이상은 이상치 제거

  const distances = data
    .map(d => parseFloat(d.distKm))
    .filter(d => d > 0 && d < 100); // 100km 이상은 이상치 제거

  // 귀소시간 계산
  const returnTimes = data
    .filter(d => d.returnHh && d.returnMm && d.arriveHh && d.arriveMm)
    .map(d => {
      const arrive = parseInt(d.arriveHh) * 60 + parseInt(d.arriveMm);
      const ret = parseInt(d.returnHh) * 60 + parseInt(d.returnMm);
      return ret > arrive ? ret - arrive : 0;
    })
    .filter(t => t > 0 && t < 480); // 8시간 이상은 이상치 제거

  const avgResponse = responseTimes.length > 0
    ? (responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length).toFixed(1)
    : '-';
  const avgDistance = distances.length > 0
    ? (distances.reduce((a, b) => a + b, 0) / distances.length).toFixed(1)
    : '-';
  const avgTurnAround = returnTimes.length > 0
    ? (returnTimes.reduce((a, b) => a + b, 0) / returnTimes.length).toFixed(0)
    : '-';

  // 대응시간 분포 (5분 단위 히스토그램)
  const timeHistogram: { label: string; count: number }[] = [];
  const bins = [5, 10, 15, 20, 30, 60, 120];
  let prevBin = 0;
  for (const bin of bins) {
    const count = responseTimes.filter(t => t >= prevBin && t < bin).length;
    timeHistogram.push({ label: `${prevBin}-${bin}분`, count });
    prevBin = bin;
  }

  // 거리 분포
  const distHistogram: { label: string; count: number }[] = [];
  const distBins = [1, 3, 5, 10, 20, 50, 100];
  let prevDist = 0;
  for (const bin of distBins) {
    const count = distances.filter(d => d >= prevDist && d < bin).length;
    distHistogram.push({ label: `${prevDist}-${bin}km`, count });
    prevDist = bin;
  }

  // 소방서별 평균 대응시간
  const stationTimes = new Map<string, { total: number; count: number }>();
  data.forEach(d => {
    const stn = d.fireStnNm || '미상';
    const time = d.arriveHh && d.arriveMm ? parseInt(d.arriveHh) * 60 + parseInt(d.arriveMm) : 0;
    if (time > 0 && time < 120) {
      const prev = stationTimes.get(stn) || { total: 0, count: 0 };
      stationTimes.set(stn, { total: prev.total + time, count: prev.count + 1 });
    }
  });
  const stationAvg = Array.from(stationTimes.entries())
    .map(([name, v]) => ({ name, avg: v.total / v.count, count: v.count }))
    .sort((a, b) => a.avg - b.avg);

  return (
    <div className="space-y-6">
      {/* KPI 카드 3개 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border border-blue-500/20 rounded-xl p-5 text-center">
          <span className="material-symbols-outlined text-3xl text-blue-400 mb-2 block">timer</span>
          <p className="text-3xl font-extrabold text-on-surface font-headline tabular-nums">{avgResponse}<span className="text-sm text-on-surface-variant ml-1">분</span></p>
          <p className="text-xs text-on-surface-variant mt-1">평균 현장 대응시간</p>
          <p className="text-[10px] text-on-surface-variant/60 mt-0.5">{responseTimes.length}건 기준</p>
        </div>
        <div className="bg-gradient-to-br from-amber-500/10 to-amber-600/5 border border-amber-500/20 rounded-xl p-5 text-center">
          <span className="material-symbols-outlined text-3xl text-amber-400 mb-2 block">straighten</span>
          <p className="text-3xl font-extrabold text-on-surface font-headline tabular-nums">{avgDistance}<span className="text-sm text-on-surface-variant ml-1">km</span></p>
          <p className="text-xs text-on-surface-variant mt-1">평균 현장 거리</p>
          <p className="text-[10px] text-on-surface-variant/60 mt-0.5">{distances.length}건 기준</p>
        </div>
        <div className="bg-gradient-to-br from-green-500/10 to-green-600/5 border border-green-500/20 rounded-xl p-5 text-center">
          <span className="material-symbols-outlined text-3xl text-green-400 mb-2 block">update</span>
          <p className="text-3xl font-extrabold text-on-surface font-headline tabular-nums">{avgTurnAround}<span className="text-sm text-on-surface-variant ml-1">분</span></p>
          <p className="text-xs text-on-surface-variant mt-1">평균 출동→귀소</p>
          <p className="text-[10px] text-on-surface-variant/60 mt-0.5">{returnTimes.length}건 기준</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 대응시간 히스토그램 */}
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-blue-400">schedule</span>
            대응시간 분포
          </h3>
          <HBarChart data={timeHistogram} labelKey="label" valueKey="count" />
        </section>

        {/* 거리 히스토그램 */}
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-amber-400">map</span>
            현장 거리 분포
          </h3>
          <HBarChart data={distHistogram} labelKey="label" valueKey="count" />
        </section>
      </div>

      {/* 소방서별 평균 대응시간 TOP 15 */}
      {stationAvg.length > 0 && (
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-purple-400">leaderboard</span>
            소방서별 평균 대응시간 (빠른 순)
          </h3>
          <div className="space-y-1.5">
            {stationAvg.slice(0, 15).map((s) => {
              const maxAvg = Math.max(...stationAvg.slice(0, 15).map(x => x.avg), 1);
              const pct = (s.avg / maxAvg) * 100;
              const isGood = s.avg <= 7;
              const isOk = s.avg <= 12;
              const barColor = isGood ? '#22c55e' : isOk ? '#eab308' : '#ef4444';
              return (
                <div key={s.name} className="flex items-center gap-2">
                  <span className="text-[11px] text-on-surface-variant w-20 text-right truncate">{s.name}</span>
                  <div className="flex-1 h-5 bg-surface-container rounded overflow-hidden relative">
                    <div className="h-full rounded transition-all duration-700"
                      style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${barColor}88, ${barColor})` }} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-on-surface">
                      {s.avg.toFixed(1)}분
                    </span>
                  </div>
                  <span className="text-[10px] text-on-surface-variant w-12 text-right tabular-nums">{s.count}건</span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-on-surface-variant/60 mt-3 flex items-center gap-3">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" /> 7분 이내</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> 7~12분</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" /> 12분 초과</span>
          </p>
        </section>
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════
   환자 이송/처치 분석 섹션
   ═════════════════════════════════════════════ */
function PatientSection({
  transfers, firstAids
}: { transfers: TransferItem[]; firstAids: FirstAidItem[] }) {
  // 발생유형별 집계
  const typeMap = new Map<string, number>();
  transfers.forEach(t => {
    const type = t.occrrType || '미상';
    typeMap.set(type, (typeMap.get(type) || 0) + 1);
  });
  const typeData = Array.from(typeMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // 사고장소별 집계
  const placeMap = new Map<string, number>();
  transfers.forEach(t => {
    const place = t.occrrPlce || '미상';
    placeMap.set(place, (placeMap.get(place) || 0) + 1);
  });
  const placeData = Array.from(placeMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // 성별 분포
  const sexMap = new Map<string, number>();
  firstAids.forEach(f => {
    const sex = f.ptntSex || '미상';
    sexMap.set(sex, (sexMap.get(sex) || 0) + 1);
  });
  const sexData = Array.from(sexMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  // 연령대 분포
  const ageMap = new Map<string, number>();
  firstAids.forEach(f => {
    const age = parseInt(f.ptntAge);
    let group = '미상';
    if (!isNaN(age)) {
      if (age < 10) group = '0~9세';
      else if (age < 20) group = '10대';
      else if (age < 30) group = '20대';
      else if (age < 40) group = '30대';
      else if (age < 50) group = '40대';
      else if (age < 60) group = '50대';
      else if (age < 70) group = '60대';
      else if (age < 80) group = '70대';
      else group = '80세+';
    }
    ageMap.set(group, (ageMap.get(group) || 0) + 1);
  });
  const ageOrder = ['0~9세', '10대', '20대', '30대', '40대', '50대', '60대', '70대', '80세+', '미상'];
  const ageData = ageOrder
    .filter(g => ageMap.has(g))
    .map(label => ({ label, count: ageMap.get(label) || 0 }));

  // 응급처치 코드별 집계
  const aidMap = new Map<string, number>();
  firstAids.forEach(f => {
    const code = f.emrgFirstaidCd || '미상';
    aidMap.set(code, (aidMap.get(code) || 0) + 1);
  });
  const aidData = Array.from(aidMap.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);

  const hasTransfers = transfers.length > 0;
  const hasAids = firstAids.length > 0;

  if (!hasTransfers && !hasAids) return <EmptyState icon="medical_information" text="환자 데이터 없음" />;

  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-4 text-center">
          <p className="text-2xl font-extrabold text-on-surface tabular-nums">{transfers.length.toLocaleString()}</p>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">이송 건수</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-4 text-center">
          <p className="text-2xl font-extrabold text-on-surface tabular-nums">{firstAids.length.toLocaleString()}</p>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">응급처치 건수</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-4 text-center">
          <p className="text-2xl font-extrabold text-on-surface tabular-nums">{typeData.length}</p>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">발생유형 종류</p>
        </div>
        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-4 text-center">
          <p className="text-2xl font-extrabold text-on-surface tabular-nums">{aidData.length}</p>
          <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mt-1">처치코드 종류</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 발생유형별 */}
        {hasTransfers && (
          <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-red-400">emergency</span>
              발생유형별 이송
            </h3>
            <DonutChart data={typeData.slice(0, 10)} labelKey="label" valueKey="count" />
          </section>
        )}

        {/* 사고장소별 */}
        {hasTransfers && (
          <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-orange-400">location_on</span>
              사고장소별 이송
            </h3>
            <HBarChart data={placeData.slice(0, 10)} labelKey="label" valueKey="count" />
          </section>
        )}

        {/* 연령대 분포 */}
        {hasAids && ageData.length > 0 && (
          <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-blue-400">group</span>
              환자 연령대 분포
            </h3>
            <HBarChart data={ageData} labelKey="label" valueKey="count" />
          </section>
        )}

        {/* 성별 + 처치코드 */}
        {hasAids && (
          <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
            <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-base text-green-400">medical_services</span>
              성별 분포 & 주요 처치코드
            </h3>
            <div className="space-y-4">
              {/* 성별 바 */}
              <div className="flex gap-2">
                {sexData.map((s, i) => {
                  const total = sexData.reduce((a, b) => a + b.count, 0);
                  const pct = total > 0 ? (s.count / total * 100) : 0;
                  return (
                    <div key={s.label} className="text-center" style={{ flex: pct }}>
                      <div className="h-8 rounded-lg mb-1" style={{ backgroundColor: CHART_COLORS[i + 3] }} />
                      <p className="text-[10px] font-bold text-on-surface">{s.label}</p>
                      <p className="text-[9px] text-on-surface-variant">{pct.toFixed(1)}% · {s.count.toLocaleString()}건</p>
                    </div>
                  );
                })}
              </div>
              {/* 처치코드 TOP 5 */}
              <div className="border-t border-outline-variant/10 pt-3">
                <p className="text-[10px] text-on-surface-variant uppercase tracking-widest mb-2 font-bold">주요 응급처치 코드</p>
                <div className="space-y-1">
                  {aidData.slice(0, 5).map((a, i) => (
                    <div key={a.label} className="flex items-center gap-2 text-xs">
                      <span className="w-5 h-5 rounded bg-surface-container flex items-center justify-center text-[10px] font-bold text-on-surface-variant">{i + 1}</span>
                      <span className="text-on-surface flex-1 truncate">{a.label}</span>
                      <span className="font-bold text-on-surface tabular-nums">{a.count.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

/* ═══════ 뷰 모드 ═══════ */
type ViewMode = 'stats' | 'response-time' | 'patient';

/* ═══════ 메인 컴포넌트 ═══════ */
export default function EmergencyAnalysis() {
  const months = getRecentMonths(24);
  const [selectedMonth, setSelectedMonth] = useState(months[1] || months[0]);
  const [selectedSido, setSelectedSido] = useState('전체');
  const [viewMode, setViewMode] = useState<ViewMode>('stats');
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<string | null>(null);

  // 통계 데이터
  const [activity, setActivity] = useState<ActivityStats>({ dispatchCnt: 0, transferCnt: 0, transferPrsnCnt: 0 });
  const [dispatchTypes, setDispatchTypes] = useState<DispatchTypeItem[]>([]);
  const [ageGroups, setAgeGroups] = useState<AgeGroupItem[]>([]);
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [vehicles, setVehicles] = useState<VehicleItem[]>([]);

  // 구급정보 상세 데이터
  const [activityDetails, setActivityDetails] = useState<ActivityDetailItem[]>([]);
  const [transfers, setTransfers] = useState<TransferItem[]>([]);
  const [firstAids, setFirstAids] = useState<FirstAidItem[]>([]);

  const fetchAll = async () => {
    const statsParams: Record<string, string> = { reqYm: selectedMonth };
    const infoParams: Record<string, string> = { reportYm: selectedMonth };
    if (selectedSido !== '전체') {
      statsParams.sido = selectedSido;
      infoParams.sido = selectedSido;
    }

    try {
      const results = await Promise.allSettled([
        // 기존 통계
        fetchEmergencyStats('activity', statsParams),
        fetchEmergencyStats('dispatch-type', statsParams),
        fetchEmergencyStats('age', statsParams),
        fetchEmergencyStats('location', statsParams),
        fetchEmergencyInfo('vehicles', selectedSido !== '전체' ? { sido: selectedSido } : {}),
        // 구급정보 상세 (새로 추가)
        fetchEmergencyInfo('activity', infoParams),
        fetchEmergencyInfo('transfer', infoParams),
        fetchEmergencyInfo('first-aid', infoParams),
      ]);

      const allFailed = results.every(r => r.status === 'rejected');
      if (allFailed) {
        const firstErr = (results[0] as PromiseRejectedResult).reason;
        setApiError(firstErr?.message || '구급 API에 연결할 수 없습니다.');
        setLoading(false);
        return;
      }

      // 119구급활동현황 (통계)
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

      // 구급활동 상세 (대응시간/거리)
      if (results[5].status === 'fulfilled') {
        const items = results[5].value?.items || [];
        setActivityDetails(items.map((it: any) => ({
          arriveYmd: it.arriveYmd || it.현장도착년월 || '',
          arriveHh: it.arriveHh || it.현장도착시 || '',
          arriveMm: it.arriveMm || it.현장도착분 || '',
          distKm: it.distKm || it.현장과의거리 || '0',
          returnYmd: it.returnYmd || it.귀소년월 || '',
          returnHh: it.returnHh || it.귀소시 || '',
          returnMm: it.returnMm || it.귀소분 || '',
          sidoNm: it.sidoNm || it.시도본부 || '',
          fireStnNm: it.fireStnNm || it.출동소방서 || '',
          safeCnterNm: it.safeCnterNm || it.출동안전센터 || '',
        })));
      }

      // 환자이송정보
      if (results[6].status === 'fulfilled') {
        const items = results[6].value?.items || [];
        setTransfers(items.map((it: any) => ({
          occrrPlce: it.occrrPlce || it.사고발생장소 || '미상',
          occrrType: it.occrrType || it.발생유형 || '미상',
          sidoNm: it.sidoNm || '',
          fireStnNm: it.fireStnNm || '',
        })));
      }

      // 응급처치정보
      if (results[7].status === 'fulfilled') {
        const items = results[7].value?.items || [];
        setFirstAids(items.map((it: any) => ({
          ptntAge: it.ptntAge || it.환자연령 || '',
          ptntSex: it.ptntSex || it.환자성별 || '미상',
          emrgFirstaidCd: it.emrgFirstaidCd || it.응급처치코드 || '미상',
          sidoNm: it.sidoNm || '',
          fireStnNm: it.fireStnNm || '',
        })));
      }

      setApiError(null);
    } catch (e: any) {
      console.error('구급 데이터 조회 오류:', e);
      setApiError(e?.message || '알 수 없는 오류가 발생했습니다.');
    }

    setLoading(false);
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { fetchAll(); }, [selectedMonth, selectedSido]);

  const transferRate = activity.dispatchCnt > 0
    ? ((activity.transferCnt / activity.dispatchCnt) * 100).toFixed(1)
    : '0';

  const hasAnyData = activity.dispatchCnt > 0 || dispatchTypes.length > 0 || ageGroups.length > 0;

  const VIEW_TABS: { id: ViewMode; label: string; icon: string }[] = [
    { id: 'stats', label: '출동 통계', icon: 'bar_chart' },
    { id: 'response-time', label: '대응시간 분석', icon: 'timer' },
    { id: 'patient', label: '환자 이송/처치', icon: 'medical_information' },
  ];

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
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={selectedSido}
            onChange={e => {
              setLoading(true);
              setApiError(null);
              setSelectedSido(e.target.value);
            }}
            className="bg-surface-container border border-outline-variant/20 text-on-surface px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
          >
            {SIDO_LIST.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
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

      {/* 뷰 모드 탭 */}
      <div className="flex gap-1 bg-surface-container border border-outline-variant/10 rounded-lg p-1">
        {VIEW_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setViewMode(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-bold transition-all flex-1 justify-center ${
              viewMode === tab.id
                ? 'bg-primary text-on-primary shadow-md shadow-primary/20'
                : 'text-on-surface-variant hover:bg-surface-container-high/50'
            }`}
          >
            <span
              className="material-symbols-outlined text-lg"
              style={viewMode === tab.id ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {tab.icon}
            </span>
            <span className="hidden sm:inline">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 요약 카드 4장 (모든 뷰에서 표시) */}
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

      {/* 데이터가 아예 없을 때 안내 */}
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

      {/* ═══ 뷰 모드별 콘텐츠 ═══ */}

      {/* 1. 출동 통계 (기존) */}
      {viewMode === 'stats' && (
        <>
          {/* 차트 영역 */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
              <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-purple-400">donut_large</span>
                출동유형별 분포
              </h3>
              {loading ? <LoadingSkeleton /> : (
                <DonutChart data={dispatchTypes} labelKey="dispatchType" valueKey="dispatchCnt" />
              )}
            </section>

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
                  {locations.map((loc, i) => (
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
                  ))}
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
        </>
      )}

      {/* 2. 대응시간 분석 (새로 추가) */}
      {viewMode === 'response-time' && (
        loading ? <LoadingSkeleton /> : <ResponseTimeSection data={activityDetails} />
      )}

      {/* 3. 환자 이송/처치 (새로 추가) */}
      {viewMode === 'patient' && (
        loading ? <LoadingSkeleton /> : <PatientSection transfers={transfers} firstAids={firstAids} />
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
