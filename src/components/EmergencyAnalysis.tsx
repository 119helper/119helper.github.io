import { useState } from 'react';
import {
  formatYm,
  SIDO_LIST,
  useEmergencyAnalysisData,
  type ActivityDetailItem,
  type FirstAidItem,
  type TransferItem,
  type ViewMode,
} from '../hooks/useEmergencyAnalysisData';
import DataStatePanel from './DataStatePanel';

/* ─── 색상 팔레트 ─── */
const CHART_COLORS = [
  '#6366f1', '#8b5cf6', '#a855f7', '#ec4899', '#f43f5e',
  '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4',
  '#3b82f6', '#64748b',
];

/* ─── 도넛 차트 (순수 CSS) ─── */
interface DonutSlice {
  label: string;
  value: number;
  pct: number;
  start: number;
  color: string;
}

function getChartNumber(value: unknown): number {
  return Number(value) || 0;
}

function getChartLabel(value: unknown): string {
  return String(value ?? '');
}

function DonutChart<T extends object>({ data, labelKey, valueKey }: { data: T[]; labelKey: keyof T & string; valueKey: keyof T & string }) {
  const total = data.reduce((s, d) => s + getChartNumber(d[valueKey]), 0);
  if (total === 0) return <EmptyState icon="donut_large" text="데이터 없음" />;

  const slices = data.reduce<DonutSlice[]>((acc, d, i) => {
    const value = getChartNumber(d[valueKey]);
    const pct = (value / total) * 100;
    const start = acc.length > 0 ? acc[acc.length - 1].start + acc[acc.length - 1].pct : 0;
    acc.push({ label: getChartLabel(d[labelKey]), value, pct, start, color: CHART_COLORS[i % CHART_COLORS.length] });
    return acc;
  }, []);

  const gradient = slices.map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`).join(', ');

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <div
        style={{
          width: 160, height: 160, borderRadius: '50%',
          background: `conic-gradient(${gradient})`,
          position: 'relative',
        }}
      >
        <div style={{
          position: 'absolute', inset: '30%', borderRadius: '50%',
          backgroundColor: 'var(--color-surface-container-lowest, #060a14)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div className="text-center">
            <p className="text-lg font-extrabold text-on-surface">{total.toLocaleString()}</p>
            <p className="text-xs text-on-surface-variant">총 건수</p>
          </div>
        </div>
      </div>
      <div className="flex-1 w-full space-y-1.5 max-h-[180px] overflow-y-auto pr-2">
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
function HBarChart<T extends object>({ data, labelKey, valueKey }: { data: T[]; labelKey: keyof T & string; valueKey: keyof T & string }) {
  const max = Math.max(...data.map(d => getChartNumber(d[valueKey])), 1);
  if (data.length === 0) return <EmptyState icon="bar_chart" text="데이터 없음" />;

  return (
    <div className="space-y-2">
      {data.map((d, i) => {
        const value = getChartNumber(d[valueKey]);
        const label = getChartLabel(d[labelKey]);
        const pct = (value / max) * 100;
        return (
          <div key={label || i} className="flex items-center gap-3">
            <span className="text-xs text-on-surface-variant w-16 text-right truncate">{label}</span>
            <div className="flex-1 h-6 bg-surface-container rounded-md overflow-hidden relative">
              <div
                className="h-full rounded-md transition-all duration-700 ease-out"
                style={{
                  width: `${pct}%`,
                  background: `linear-gradient(90deg, ${CHART_COLORS[i % CHART_COLORS.length]}cc, ${CHART_COLORS[i % CHART_COLORS.length]})`,
                }}
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-on-surface">
                {value.toLocaleString()}
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
    <div className="flex flex-col items-center justify-center py-12 text-on-surface-variant">
      <span className="material-symbols-outlined text-4xl mb-2">{icon}</span>
      <p className="text-sm">{text}</p>
      <p className="text-xs mt-1">해당 기간에 데이터가 아직 제공되지 않았습니다.</p>
    </div>
  );
}

/* ─── 로딩 스켈레톤 ─── */
function Skeleton() {
  return (
    <div className="space-y-2 animate-pulse w-full">
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-16 h-4 bg-surface-container rounded" />
          <div className="flex-1 h-6 bg-surface-container rounded" style={{ width: `${80 - i * 12}%` }} />
        </div>
      ))}
    </div>
  );
}

/* ═════════════════════════════════════════════
   출동거리·시간대 분석 (원 API가 실제 제공하는 필드만 사용)
   ═════════════════════════════════════════════ */
function ActivityDistanceSection({ data }: { data: ActivityDetailItem[] }) {
  if (data.length === 0) return <EmptyState icon="route" text="출동거리 데이터 없음" />;

  const distances = data
    .map(item => Number.parseFloat(item.distanceKm))
    .filter(distance => distance >= 0 && distance < 100);
  const avgDistance = distances.length
    ? (distances.reduce((sum, distance) => sum + distance, 0) / distances.length).toFixed(1)
    : '-';

  const distBins = [1, 3, 5, 10, 20, 50, 100];
  let previousDistance = 0;
  const distHistogram = distBins.map(limit => {
    const result = {
      label: `${previousDistance}-${limit}km`,
      count: distances.filter(distance => distance >= previousDistance && distance < limit).length,
    };
    previousDistance = limit;
    return result;
  });

  const hourGroups = [
    { label: '00-05시', from: 0, to: 6 },
    { label: '06-11시', from: 6, to: 12 },
    { label: '12-17시', from: 12, to: 18 },
    { label: '18-23시', from: 18, to: 24 },
  ].map(group => ({
    label: group.label,
    count: data.filter(item => {
      const hour = Number.parseInt(item.activityHour, 10);
      return hour >= group.from && hour < group.to;
    }).length,
  }));

  const placeCounts = new Map<string, number>();
  data.forEach(item => {
    const place = item.occurrencePlace || '미상';
    placeCounts.set(place, (placeCounts.get(place) ?? 0) + 1);
  });
  const placeData = Array.from(placeCounts, ([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-4 text-sm text-on-surface-variant">
        원 API는 출동년월·출동시·현장 이동거리만 제공하며 현장 도착 소요시간과 귀소시간은 제공하지 않습니다.
        따라서 제공되지 않는 시간을 계산하지 않고 실제 필드만 분석합니다.
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-5 text-center">
          <span className="material-symbols-outlined mb-2 block text-3xl text-amber-700 dark:text-amber-300">straighten</span>
          <p className="text-3xl font-extrabold text-on-surface">{avgDistance}<span className="ml-1 text-sm text-on-surface-variant">km</span></p>
          <p className="mt-1 text-xs text-on-surface-variant">평균 현장 이동거리</p>
        </div>
        <div className="rounded-xl border border-blue-500/20 bg-blue-500/10 p-5 text-center">
          <span className="material-symbols-outlined mb-2 block text-3xl text-blue-700 dark:text-blue-300">dataset</span>
          <p className="text-3xl font-extrabold text-on-surface">{data.length.toLocaleString()}<span className="ml-1 text-sm text-on-surface-variant">건</span></p>
          <p className="mt-1 text-xs text-on-surface-variant">선택 소방서 조회 건수</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-on-surface-variant">
            <span className="material-symbols-outlined text-base">route</span>현장 거리 분포
          </h3>
          <HBarChart data={distHistogram} labelKey="label" valueKey="count" />
        </section>
        <section className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-on-surface-variant">
            <span className="material-symbols-outlined text-base">schedule</span>출동 시간대
          </h3>
          <HBarChart data={hourGroups} labelKey="label" valueKey="count" />
        </section>
        <section className="rounded-xl border border-outline-variant/10 bg-surface-container-lowest p-6">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-on-surface-variant">
            <span className="material-symbols-outlined text-base">location_on</span>사고 발생장소
          </h3>
          <HBarChart data={placeData} labelKey="label" valueKey="count" />
        </section>
      </div>
    </div>
  );
}

/* ═════════════════════════════════════════════
   환자 이송/처치 분석 섹션
   ═════════════════════════════════════════════ */
function PatientSection({
  transfers, firstAids, loading
}: { transfers: TransferItem[]; firstAids: FirstAidItem[]; loading?: boolean }) {
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
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-red-700 dark:text-red-300">emergency</span>
            발생유형별 이송
          </h3>
          {loading ? <Skeleton /> : hasTransfers ? <DonutChart data={typeData.slice(0, 10)} labelKey="label" valueKey="count" /> : <EmptyState icon="donut_large" text="데이터 없음" />}
        </section>

        {/* 사고장소별 */}
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-orange-700 dark:text-orange-300">location_on</span>
            사고장소별 이송
          </h3>
          {loading ? <Skeleton /> : hasTransfers ? <HBarChart data={placeData.slice(0, 10)} labelKey="label" valueKey="count" /> : <EmptyState icon="bar_chart" text="데이터 없음" />}
        </section>

        {/* 연령대 분포 */}
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-blue-700 dark:text-blue-300">group</span>
            환자 연령대 분포
          </h3>
          {loading ? <Skeleton /> : hasAids && ageData.length > 0 ? <HBarChart data={ageData} labelKey="label" valueKey="count" /> : <EmptyState icon="group" text="데이터 없음" />}
        </section>

        {/* 성별 + 처치코드 */}
        <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-green-700 dark:text-green-300">medical_services</span>
            성별 분포 & 주요 처치코드
          </h3>
          {loading ? <Skeleton /> : hasAids ? (
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
          ) : <EmptyState icon="medical_services" text="데이터 없음" />}
        </section>
      </div>
    </div>
  );
}

/* ═══════ 메인 컴포넌트 ═══════ */
export default function EmergencyAnalysis() {
  const {
    months,
    latestAvailableYm,
    availabilityCheckedAt,
    selectedMonth,
    selectedSido,
    fireStations,
    selectedStation,
    viewMode,
    setViewMode,
    loading,
    apiError,
    warning,
    activity,
    dispatchTypes,
    ageGroups,
    locations,
    vehicles,
    activityDetails,
    transfers,
    firstAids,
    selectMonth,
    selectSido,
    selectStation,
    refresh,
  } = useEmergencyAnalysisData();

  const transferRate = activity.dispatchCnt > 0
    ? ((activity.transferCnt / activity.dispatchCnt) * 100).toFixed(1)
    : '0';

  const hasAnyData = activity.dispatchCnt > 0 || dispatchTypes.length > 0 || ageGroups.length > 0;

  const VIEW_TABS: { id: ViewMode; label: string; icon: string }[] = [
    { id: 'stats', label: '출동 통계', icon: 'bar_chart' },
    { id: 'response-time', label: '출동거리 분석', icon: 'route' },
    { id: 'patient', label: '환자 이송/처치', icon: 'medical_information' },
    { id: 'search', label: '상세 내역 검색', icon: 'search' },
  ];

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="ui-page-title">
            <span className="material-symbols-outlined ui-page-title-icon">emergency</span>
            구급 출동 분석
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">
            소방청 구급통계·구급정보 서비스 · 지역별 공식 데이터
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            aria-label="구급 출동 분석 지역"
            value={selectedSido}
            onChange={e => selectSido(e.target.value)}
            className="bg-surface-container border border-outline-variant/20 text-on-surface px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
          >
            {SIDO_LIST.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <select
            aria-label="구급 출동 분석 기준 월"
            value={selectedMonth}
            onChange={e => selectMonth(e.target.value)}
            className="bg-surface-container border border-outline-variant/20 text-on-surface px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
          >
            {months.map(m => (
              <option key={m} value={m}>{formatYm(m)}</option>
            ))}
          </select>
          <select
            aria-label="구급 상세 조회 소방서"
            value={selectedStation}
            onChange={event => selectStation(event.target.value)}
            className="bg-surface-container border border-outline-variant/20 text-on-surface px-3 py-2 rounded-lg text-sm focus:outline-none focus:border-primary"
          >
            <option value="">상세용 소방서 선택</option>
            {fireStations.map(station => (
              <option key={station} value={station}>{station}</option>
            ))}
          </select>
          <button
            onClick={() => refresh(true)}
            disabled={loading}
            className="bg-primary/10 text-primary px-4 py-2 rounded-lg text-sm font-bold hover:bg-primary/20 transition-colors flex items-center gap-2 disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
            새로고침
          </button>
        </div>
      </div>

      <div role="status" className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-on-surface-variant">
        <span className="material-symbols-outlined text-lg text-primary">event_available</span>
        <strong className="text-on-surface">공식 월간통계 최신 제공월 {formatYm(latestAvailableYm)}</strong>
        {Number(latestAvailableYm.slice(0, 4)) < new Date().getFullYear() && (
          <span>· {new Date().getFullYear()}년 월간통계는 원 API에서 아직 확인되지 않음</span>
        )}
        {availabilityCheckedAt && (
          <span>· {new Date(availabilityCheckedAt).toLocaleDateString('ko-KR')} 자동 확인</span>
        )}
        <a
          href="https://www.data.go.kr/data/15099428/openapi.do"
          target="_blank"
          rel="noreferrer"
          className="font-bold text-primary hover:underline"
        >
          공식 원문
        </a>
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
          icon="ambulance" iconColor="text-red-700 dark:text-red-300" label="출동 건수"
          value={activity.dispatchCnt} loading={loading}
        />
        <SummaryCard
          icon="local_shipping" iconColor="text-blue-700 dark:text-blue-300" label="이송 건수"
          value={activity.transferCnt} loading={loading}
        />
        <SummaryCard
          icon="personal_injury" iconColor="text-amber-700 dark:text-amber-300" label="이송 환자수"
          value={activity.transferPrsnCnt} loading={loading}
        />
        <SummaryCard
          icon="percent" iconColor="text-green-700 dark:text-green-300" label="이송률"
          value={transferRate} suffix="%" loading={loading}
        />
      </div>

      {/* API 에러 배너 */}
      {!loading && apiError && !hasAnyData && (
        <div className="bg-error-container/30 border border-error/30 rounded-xl p-6 text-center">
          <span className="material-symbols-outlined text-5xl text-error/60 mb-3 block">cloud_off</span>
          <h3 className="text-lg font-bold text-on-surface mb-2">구급통계 API 연결 실패</h3>
          <p className="text-sm text-error/80 max-w-lg mx-auto mb-1">{apiError}</p>
          <button
            onClick={() => refresh()}
            className="bg-error/15 text-error px-5 py-2 rounded-lg text-sm font-bold hover:bg-error/25 transition-colors inline-flex items-center gap-2 mt-4"
          >
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
            <p className="text-xs text-yellow-200/80 mt-1">{warning} 마지막으로 성공한 통계를 표시 중입니다.</p>
          </div>
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
            원 API 최신 제공월은 {formatYm(latestAvailableYm)}입니다.
            이 범위 안의 빈 결과는 지역 본부명과 응답 계약을 자동 검사하며, 실제 0건이면 그대로 표시합니다.
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
                <span className="material-symbols-outlined text-base text-purple-700 dark:text-purple-300">donut_large</span>
                출동유형별 분포
              </h3>
              {loading ? <LoadingSkeleton /> : (
                <DonutChart data={dispatchTypes} labelKey="dispatchType" valueKey="dispatchCnt" />
              )}
            </section>

            <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
              <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-blue-700 dark:text-blue-300">bar_chart</span>
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
                <span className="material-symbols-outlined text-base text-orange-700 dark:text-orange-300">location_on</span>
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
          {loading ? (
            <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
              <LoadingSkeleton />
            </section>
          ) : vehicles.length > 0 && (
            <section className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6">
              <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="material-symbols-outlined text-base text-red-700 dark:text-red-300">fire_truck</span>
                소방차량 기준정보
                <span className="text-[10px] bg-surface-container px-2 py-0.5 rounded text-on-surface-variant font-normal normal-case">
                  {vehicles.length}대
                </span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
                {vehicles.slice(0, 30).map((v, i) => {
                  const statusColor = v.vhcleSttus.includes('가용') || v.vhcleSttus.includes('대기')
                    ? 'bg-green-500/10 border-green-500/20 text-green-700 dark:text-green-300'
                    : v.vhcleSttus.includes('출동') || v.vhcleSttus.includes('운행')
                    ? 'bg-red-500/10 border-red-500/20 text-red-700 dark:text-red-300'
                    : 'bg-amber-500/10 border-amber-500/20 text-amber-700 dark:text-amber-300';
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

      {/* 2. 출동거리 분석 */}
      {viewMode === 'response-time' && (
        !selectedStation ? (
          <DataStatePanel
            icon="domain"
            tone="guidance"
            title="상세 분석할 소방서를 선택하세요"
            description="소방청 구급정보 원 API는 지역 전체가 아니라 출동소방서 조건을 필수로 요구합니다."
          />
        ) : loading ? <LoadingSkeleton /> : <ActivityDistanceSection data={activityDetails} />
      )}

      {/* 3. 환자 이송/처치 (새로 추가) */}
      {viewMode === 'patient' && (
        !selectedStation ? (
          <DataStatePanel
            icon="domain"
            tone="guidance"
            title="환자 상세를 조회할 소방서를 선택하세요"
            description="개인 식별정보 없이 선택 소방서·월 기준의 공식 집계 필드만 조회합니다."
          />
        ) : loading ? <LoadingSkeleton /> : <PatientSection transfers={transfers} firstAids={firstAids} />
      )}

      {/* 4. 상세 내역 검색 (새로 추가) */}
      {viewMode === 'search' && (
        !selectedStation ? (
          <DataStatePanel
            icon="domain"
            tone="guidance"
            title="상세 내역을 조회할 소방서를 선택하세요"
            description="상단의 소방서 선택 후 원 API가 제공하는 출동·이송·처치 항목을 검색할 수 있습니다."
          />
        ) : loading ? <LoadingSkeleton /> : <SearchSection transfers={transfers} firstAids={firstAids} activityDetails={activityDetails} />
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

/* ─── 상세 내역 검색 컴퓨넌트 ─── */
function SearchSection({ transfers, firstAids, activityDetails }: { transfers: TransferItem[]; firstAids: FirstAidItem[]; activityDetails: ActivityDetailItem[] }) {
  const [searchTerm, setSearchTerm] = useState('');
  const [dataType, setDataType] = useState<'transfer' | 'firstAid' | 'activity'>('transfer');

  const getTransferData = () => {
    return transfers.filter(t => 
      t.fireStnNm.includes(searchTerm) || 
      t.occrrPlce.includes(searchTerm) || 
      t.occrrType.includes(searchTerm) || 
      t.sidoNm.includes(searchTerm)
    );
  };

  const getFirstAidData = () => {
    return firstAids.filter(f => 
      f.fireStnNm.includes(searchTerm) || 
      f.ptntAge.includes(searchTerm) || 
      f.emrgFirstaidCd.includes(searchTerm) || 
      f.sidoNm.includes(searchTerm)
    );
  };

  const getActivityData = () => {
    return activityDetails.filter(a => 
      a.fireStnNm.includes(searchTerm) || 
      a.sidoNm.includes(searchTerm) || 
      a.activityYm.includes(searchTerm) ||
      a.occurrencePlace.includes(searchTerm) ||
      a.symptom.includes(searchTerm)
    );
  };

  const dataMap = {
    transfer: getTransferData(),
    firstAid: getFirstAidData(),
    activity: getActivityData()
  };

  const currentData = dataMap[dataType];

  const getCommonLocation = (item: TransferItem | FirstAidItem | ActivityDetailItem) => {
    return `${item.sidoNm} ${item.fireStnNm}`;
  };

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden flex flex-col">
      <div className="p-6 border-b border-outline-variant/10 bg-surface-container/20 space-y-4">
        <div className="flex flex-col md:flex-row justify-between gap-4 md:items-center">
          <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest flex items-center gap-2">
            <span className="material-symbols-outlined text-base text-teal-400">search</span>
            상세 내역 검색
          </h3>
          <div className="flex gap-2">
            {(['transfer', 'firstAid', 'activity'] as const).map(type => (
              <button
                key={type}
                onClick={() => { setDataType(type); setSearchTerm(''); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                  dataType === type 
                    ? 'bg-primary text-on-primary' 
                    : 'bg-surface-container border border-outline-variant/20 hover:bg-surface-container-high text-on-surface-variant'
                }`}
              >
                {type === 'transfer' ? '이송 정보' : type === 'firstAid' ? '응급 통계' : '출동 상세'}
              </button>
            ))}
          </div>
        </div>
        
        {/* 검색창 */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant/50">search</span>
          <input
            aria-label="구급 출동 상세 검색"
            type="text"
            placeholder="소방서, 사고유형, 지역, 특징 등을 검색하세요..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full bg-surface-container border border-outline-variant/20 focus:border-primary text-on-surface pl-10 pr-4 py-3 rounded-lg text-sm transition-colors outline-none"
          />
        </div>
      </div>

      {currentData.length === 0 ? (
        <div className="p-12 text-center text-on-surface-variant/70">
          <span className="material-symbols-outlined text-4xl mb-2 opacity-50">search_off</span>
          <p>검색된 결과가 없습니다.</p>
        </div>
      ) : (
        <div className="overflow-x-auto max-h-[600px] overflow-y-auto">
          <table className="w-full relative">
            <thead className="sticky top-0 bg-surface-container/90 backdrop-blur z-10 border-b border-outline-variant/10 shadow-sm">
              <tr>
                <th className="px-5 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap">소방서/센터</th>
                {dataType === 'transfer' && (
                  <>
                    <th className="px-5 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap">사고발생지역</th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap">발생유형</th>
                  </>
                )}
                {dataType === 'firstAid' && (
                  <>
                    <th className="px-5 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap">환자 연령/성별</th>
                    <th className="px-5 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap">응급처치 결과</th>
                  </>
                )}
                {dataType === 'activity' && (
                  <>
                    <th className="px-5 py-3 text-left text-[10px] font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap">출동년월/시간·발생장소</th>
                    <th className="px-5 py-3 text-right text-[10px] font-bold text-on-surface-variant uppercase tracking-widest whitespace-nowrap">출동 거리</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-outline-variant/10 text-sm">
              {currentData.slice(0, 200).map((item, i) => (
                <tr key={i} className="hover:bg-surface-container/30 transition-colors">
                  <td className="px-5 py-3 font-medium text-on-surface flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary/70"></span>
                    {getCommonLocation(item)}
                  </td>
                  
                  {dataType === 'transfer' && (
                    <>
                      <td className="px-5 py-3 text-on-surface-variant">{(item as TransferItem).occrrPlce || '-'}</td>
                      <td className="px-5 py-3">
                        <span className="bg-surface-container-high px-2 py-1 rounded text-xs text-on-surface">{(item as TransferItem).occrrType || '-'}</span>
                      </td>
                    </>
                  )}
                  
                  {dataType === 'firstAid' && (
                    <>
                      <td className="px-5 py-3 text-on-surface-variant">
                        {(item as FirstAidItem).ptntAge || '미상'} / {(item as FirstAidItem).ptntSex || '-'}
                      </td>
                      <td className="px-5 py-3">
                         <span className="bg-secondary/10 text-secondary px-2 py-1 rounded text-xs">{(item as FirstAidItem).emrgFirstaidCd || '-'}</span>
                      </td>
                    </>
                  )}
                  
                  {dataType === 'activity' && (
                    <>
                      <td className="px-5 py-3 text-on-surface-variant">
                        <div className="flex flex-wrap gap-3">
                          <span className="flex items-center gap-1 text-xs"><span className="material-symbols-outlined text-[14px]">schedule</span> {(item as ActivityDetailItem).activityYm} · {(item as ActivityDetailItem).activityHour}시</span>
                          <span className="text-xs opacity-70">{(item as ActivityDetailItem).occurrencePlace} · {(item as ActivityDetailItem).symptom}</span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-on-surface font-medium">
                        {(item as ActivityDetailItem).distanceKm ? `${(item as ActivityDetailItem).distanceKm} km` : '-'}
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {currentData.length > 200 && (
            <div className="p-4 text-center text-xs text-on-surface-variant/50 bg-surface-container-lowest">
              성능을 위해 최대 200개의 검색 결과만 표시됩니다.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
