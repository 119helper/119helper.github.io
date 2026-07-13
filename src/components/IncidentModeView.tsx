import { useEffect, useMemo, useState } from 'react';
import AviationSafetyCard from './AviationSafetyCard';
import { CITY_GRIDS, getUltraShortNow, parseCurrentWeather, type CurrentWeather } from '../services/weatherApi';
import { CITY_TO_SIDO, getERRealTimeBeds, type ERRealTimeData } from '../services/erApi';
import { useIncidentSession } from '../hooks/useIncidentSession';
import { useActivitySession } from '../hooks/useActivitySession';
import { useTimer } from '../contexts/TimerContext';
import { formatDuration } from '../utils/activityReport';
import { ACTIVITY_PRESETS } from '../data/activityStages';
import type { CityIndex } from '../services/fireWaterApi';
import type { FireFacility } from '../data/mockData';
import type { NavigateTarget } from '../types/navigation';
import { loadStoredJson } from '../services/privacySettings';
import { appendActivityEvent, startActivityFromIncident } from '../services/activitySession';
import {
  EMPTY_INCIDENT_SESSION,
  type IncidentSession,
  type IncidentType,
} from '../services/incidentSession';
import IncidentCloseReviewDialog from './IncidentCloseReviewDialog';

const INCIDENT_TYPES: Array<{ id: IncidentType; label: string; icon: string }> = [
  { id: 'fire', label: '화재', icon: 'local_fire_department' },
  { id: 'ems', label: '구급', icon: 'ambulance' },
  { id: 'rescue', label: '구조', icon: 'emergency' },
  { id: 'support', label: '지원', icon: 'support_agent' },
];

interface IncidentModeViewProps {
  city: string;
  cityLabel: string;
  fireFacilities: FireFacility[];
  isLoadingFacilities: boolean;
  cityIndex: CityIndex | null;
  onNavigate: (tab: NavigateTarget | string, subId?: string) => void;
}

function readCount(key: string): number {
  return loadStoredJson<unknown[]>(key, [], parsed => Array.isArray(parsed) ? parsed : []).length;
}

export default function IncidentModeView({
  city,
  cityLabel,
  fireFacilities,
  isLoadingFacilities,
  cityIndex,
  onNavigate,
}: IncidentModeViewProps) {
  const [session, setSession] = useIncidentSession();
  const [draft, setDraft] = useState<IncidentSession>(EMPTY_INCIDENT_SESSION);
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [erList, setErList] = useState<ERRealTimeData[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [closeReviewOpen, setCloseReviewOpen] = useState(false);
  const [activitySession] = useActivitySession(session.type);
  const { timers, stopwatchRunning, stopwatchElapsed } = useTimer();

  useEffect(() => {
    if (!session.active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session.active]);

  useEffect(() => {
    let alive = true;
    const grid = CITY_GRIDS[city] || CITY_GRIDS.seoul;
    const sido = CITY_TO_SIDO[city] || '서울특별시';

    setLoading(true);
    Promise.allSettled([
      getUltraShortNow(grid.nx, grid.ny),
      getERRealTimeBeds(sido),
    ]).then(([weatherResult, erResult]) => {
      if (!alive) return;
      if (weatherResult.status === 'fulfilled' && weatherResult.value.length > 0) {
        setWeather(parseCurrentWeather(weatherResult.value));
      } else {
        setWeather(null);
      }
      if (erResult.status === 'fulfilled') {
        setErList(erResult.value);
      } else {
        setErList([]);
      }
    }).finally(() => {
      if (alive) setLoading(false);
    });

    return () => { alive = false; };
  }, [city]);

  const hydrantsCount = cityIndex
    ? (cityIndex.hydrants ?? cityIndex.total)
    : fireFacilities.filter(f => f.type === '소화전' || f.type === '비상소화장치').length;
  const waterCount = cityIndex
    ? (cityIndex.waterTowers ?? 0)
    : fireFacilities.filter(f => f.type === '급수탑' || f.type === '저수조').length;

  const activeTimers = timers.filter(t => t.isRunning || t.remaining < t.totalSeconds);
  const triageCount = readCount('119helper-triage-patients');
  const preplanCount = readCount('119helper-preplans');
  const elapsed = session.active ? now - session.startedAt : 0;
  const typeMeta = INCIDENT_TYPES.find(t => t.id === session.type) ?? INCIDENT_TYPES[0];
  const activityPreset = ACTIVITY_PRESETS.find(preset => preset.id === session.type) ?? ACTIVITY_PRESETS[0];
  const hasRecentIncident = !session.active
    && Boolean(session.title)
    && session.startedAt > 0
    && Boolean(session.endedAt && session.endedAt >= session.startedAt);

  const erSummary = useMemo(() => {
    const erBeds = erList.reduce((sum, er) => sum + (parseInt(er.hvec) || 0), 0);
    return { hospitals: erList.length, erBeds };
  }, [erList]);

  const startSession = () => {
    const startedAt = Date.now();
    const next: IncidentSession = {
      ...draft,
      active: true,
      title: draft.title.trim() || `${cityLabel} ${INCIDENT_TYPES.find(t => t.id === draft.type)?.label ?? '출동'}`,
      address: draft.address.trim(),
      startedAt,
      endedAt: undefined,
      note: draft.note.trim(),
      snapshot: {
        capturedAt: startedAt,
        cityLabel,
        temperature: weather?.temperature ?? null,
        humidity: weather?.humidity ?? null,
        windSpeed: weather?.windSpeed ?? null,
        erHospitals: erSummary.hospitals,
        erBeds: erSummary.erBeds,
        hydrants: hydrantsCount,
        waterSources: waterCount,
      },
    };
    setCloseReviewOpen(false);
    setSession(next);
    startActivityFromIncident({
      type: next.type,
      title: next.title,
      note: next.note,
      startedAt,
    });
  };

  const closeSession = () => {
    setCloseReviewOpen(true);
  };

  const finalizeSession = () => {
    const endedAt = Date.now();
    appendActivityEvent('상황판 종료', endedAt);
    setSession({ ...session, active: false, endedAt });
    setDraft(EMPTY_INCIDENT_SESSION);
    setCloseReviewOpen(false);
  };

  const openIncidentTool = (tab: NavigateTarget | string, label: string, subId?: string) => {
    appendActivityEvent(`${label} 열람`);
    onNavigate(tab, subId);
  };

  if (!session.active) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface font-headline">출동 상황판</h2>
          <p className="text-sm text-on-surface-variant mt-1">출동 중 필요한 핵심 화면과 현장 정보를 한 곳에서 열어둡니다.</p>
        </div>

        {hasRecentIncident && session.endedAt && (
          <section
            role="region"
            aria-label="최근 종료 출동"
            className="overflow-hidden rounded-xl border border-primary/20 bg-surface-container-lowest"
          >
            <div className="flex items-start gap-3 border-b border-outline-variant/15 bg-primary/5 px-5 py-4">
              <span
                aria-hidden="true"
                className="material-symbols-outlined flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-2xl text-primary"
                style={{ fontVariationSettings: "'FILL' 1" }}
              >
                {typeMeta.icon}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-bold text-primary">최근 종료 · {typeMeta.label} 출동</p>
                <h3 className="mt-1 truncate text-lg font-extrabold text-on-surface">{session.title}</h3>
                {session.address && <p className="mt-1 truncate text-xs text-on-surface-variant">{session.address}</p>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 px-5 py-4">
              <div className="rounded-lg bg-surface-container px-3 py-2.5">
                <p className="text-[11px] font-bold text-on-surface-variant">종료 시각</p>
                <p className="mt-1 text-sm font-extrabold text-on-surface">
                  {new Date(session.endedAt).toLocaleString('ko-KR', {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </p>
              </div>
              <div className="rounded-lg bg-surface-container px-3 py-2.5">
                <p className="text-[11px] font-bold text-on-surface-variant">출동 시간</p>
                <p className="mt-1 font-mono text-sm font-extrabold text-on-surface">
                  {formatDuration(session.endedAt - session.startedAt)}
                </p>
              </div>
            </div>
            <div className="px-5 pb-5">
              <button
                type="button"
                onClick={() => openIncidentTool('activity-log', '활동기록')}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-extrabold text-on-primary hover:bg-primary/90"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-lg">description</span>
                활동 기록·보고서 열기
              </button>
            </div>
          </section>
        )}

        <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {INCIDENT_TYPES.map(type => (
              <button
                key={type.id}
                type="button"
                onClick={() => setDraft(prev => ({ ...prev, type: type.id }))}
                className={`rounded-xl border px-3 py-3 text-sm font-bold transition-colors flex flex-col items-center gap-1 ${
                  draft.type === type.id
                    ? 'bg-primary/10 border-primary text-primary'
                    : 'bg-surface-container border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'
                }`}
              >
                <span className="material-symbols-outlined text-xl">{type.icon}</span>
                {type.label}
              </button>
            ))}
          </div>

          <label htmlFor="incident-title" className="block text-sm font-bold text-on-surface space-y-2">
            <span>출동 제목</span>
            <input
              id="incident-title"
              type="text"
              value={draft.title}
              onChange={e => setDraft(prev => ({ ...prev, title: e.target.value }))}
              placeholder="예: ○○동 상가 화재"
              className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 font-normal"
            />
          </label>
          <label htmlFor="incident-address" className="block text-sm font-bold text-on-surface space-y-2">
            <span>주소 또는 집결 위치 <span className="font-normal text-on-surface-variant">(선택)</span></span>
            <input
              id="incident-address"
              type="text"
              value={draft.address}
              onChange={e => setDraft(prev => ({ ...prev, address: e.target.value }))}
              placeholder="주소를 입력하세요"
              className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 font-normal"
            />
          </label>
          <label htmlFor="incident-note" className="block text-sm font-bold text-on-surface space-y-2">
            <span>초기 상황 및 위험요소</span>
            <textarea
              id="incident-note"
              value={draft.note}
              onChange={e => setDraft(prev => ({ ...prev, note: e.target.value }))}
              placeholder="신고 내용, 위험요소, 현장 메모"
              rows={3}
              className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 font-normal"
            />
          </label>

          <button
            type="button"
            onClick={startSession}
            className="w-full bg-primary text-on-primary rounded-xl px-4 py-3 font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined">play_arrow</span>
            출동 상황판 시작
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <InfoCard icon="apartment" label="저장 대상물" value={`${preplanCount}건`} />
          <InfoCard icon="groups" label="분류 환자" value={`${triageCount}명`} />
          <InfoCard icon="location_city" label="관심 지역" value={cityLabel} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>{typeMeta.icon}</span>
            <span className="text-xs font-bold text-primary uppercase tracking-widest">{typeMeta.label} 출동</span>
          </div>
          <h2 className="text-2xl font-extrabold text-on-surface font-headline mt-1">{session.title}</h2>
          <p className="text-sm text-on-surface-variant mt-1">
            {session.address || cityLabel} · 시작 {new Date(session.startedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
        <button
          type="button"
          onClick={closeSession}
          className="border border-error/30 bg-error/10 text-error px-4 py-2 rounded-lg text-sm font-bold hover:bg-error/15 transition-colors"
        >
          상황 종료
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <InfoCard icon="timer" label="경과 시간" value={formatDuration(elapsed)} mono />
        <InfoCard icon="fire_hydrant" label="소화전" value={isLoadingFacilities ? '조회 중' : `${hydrantsCount.toLocaleString()}개`} />
        <InfoCard icon="water_pump" label="급수탑/저수조" value={isLoadingFacilities ? '조회 중' : `${waterCount.toLocaleString()}개`} />
        <InfoCard icon="local_hospital" label="응급실 병상" value={loading ? '조회 중' : `${erSummary.erBeds} / ${erSummary.hospitals}곳`} />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-4">
          <h3 className="text-lg font-bold text-on-surface">현장 브리핑</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Metric label="기온" value={weather ? `${weather.temperature}°C` : '--'} />
            <Metric label="습도" value={weather ? `${weather.humidity}%` : '--'} />
            <Metric label="풍향/풍속" value={weather ? `${weather.windDirection} ${weather.windSpeed}m/s` : '--'} />
          </div>
          {session.note && (
            <div className="rounded-xl bg-surface-container px-4 py-3 text-sm leading-6 text-on-surface">
              {session.note}
            </div>
          )}
          {session.snapshot && (
            <div className="rounded-xl border border-outline-variant/15 bg-surface-container/60 px-4 py-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-xs font-bold text-on-surface">출동 시작 기준 스냅샷</span>
                <span className="text-[10px] text-on-surface-variant">
                  {new Date(session.snapshot.capturedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant leading-5">
                {session.snapshot.temperature == null ? '기상 미확인' : `${session.snapshot.temperature}°C · 습도 ${session.snapshot.humidity}% · 풍속 ${session.snapshot.windSpeed}m/s`}
                {' · '}응급실 {session.snapshot.erHospitals}곳/{session.snapshot.erBeds}병상
                {' · '}소화전 {session.snapshot.hydrants.toLocaleString()}개
              </p>
            </div>
          )}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <QuickAction icon="apartment" label="건축물" onClick={() => openIncidentTool('building', '건축물')} />
            <QuickAction icon="fire_hydrant" label="소방용수" onClick={() => openIncidentTool('hydrants', '소방용수')} />
            <QuickAction icon="checklist" label="활동기록" onClick={() => openIncidentTool('activity-log', '활동기록')} />
            <QuickAction icon="timer" label="타이머" onClick={() => openIncidentTool('field-timer', '타이머')} />
            <QuickAction icon="groups" label="환자보드" onClick={() => openIncidentTool('triage', '환자보드')} />
            <QuickAction icon="map" label="시설조회" onClick={() => openIncidentTool('shelter', '시설조회')} />
            <QuickAction icon="menu_book" label="매뉴얼" onClick={() => openIncidentTool('manual', '매뉴얼')} />
            <QuickAction icon="download_for_offline" label="오프라인" onClick={() => openIncidentTool('offline-readiness', '오프라인 점검')} />
          </div>
        </div>

        <div className="space-y-4">
          <AviationSafetyCard weather={weather} loading={loading} onClick={() => onNavigate('aviation')} />
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-3">
            <h3 className="text-lg font-bold text-on-surface">진행 중 타이머</h3>
            {activeTimers.length === 0 && !stopwatchRunning ? (
              <p className="text-sm text-on-surface-variant">진행 중인 타이머가 없습니다.</p>
            ) : (
              <div className="space-y-2">
                {activeTimers.slice(0, 4).map(t => (
                  <div key={t.id} className="flex items-center justify-between rounded-lg bg-surface-container px-3 py-2 text-sm">
                    <span className="font-bold text-on-surface truncate">{t.label}</span>
                    <span className="font-mono text-primary">{Math.floor(t.remaining / 60).toString().padStart(2, '0')}:{(t.remaining % 60).toString().padStart(2, '0')}</span>
                  </div>
                ))}
                {stopwatchRunning && (
                  <div className="flex items-center justify-between rounded-lg bg-primary/10 px-3 py-2 text-sm text-primary">
                    <span className="font-bold">스톱워치</span>
                    <span className="font-mono">{formatDuration(stopwatchElapsed)}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <IncidentCloseReviewDialog
        open={closeReviewOpen}
        preset={activityPreset}
        stamps={activitySession.stamps}
        timers={timers}
        stopwatchRunning={stopwatchRunning}
        onClose={() => setCloseReviewOpen(false)}
        onOpenActivity={() => {
          setCloseReviewOpen(false);
          openIncidentTool('activity-log', '활동기록');
        }}
        onOpenTimers={() => {
          setCloseReviewOpen(false);
          openIncidentTool('field-timer', '타이머');
        }}
        onConfirm={finalizeSession}
      />
    </div>
  );
}

function InfoCard({ icon, label, value, mono = false }: { icon: string; label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-4">
      <div className="flex items-center gap-2 text-on-surface-variant">
        <span className="material-symbols-outlined text-lg">{icon}</span>
        <span className="text-xs font-bold">{label}</span>
      </div>
      <div className={`mt-2 text-xl font-extrabold text-on-surface ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-surface-container px-4 py-3">
      <div className="text-xs text-on-surface-variant">{label}</div>
      <div className="text-lg font-extrabold text-on-surface mt-1">{value}</div>
    </div>
  );
}

function QuickAction({ icon, label, onClick }: { icon: string; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-xl bg-surface-container px-3 py-3 text-sm font-bold text-on-surface hover:bg-surface-container-high transition-colors flex flex-col items-center gap-1.5"
    >
      <span className="material-symbols-outlined text-xl text-primary">{icon}</span>
      {label}
    </button>
  );
}
