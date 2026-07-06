import { useEffect, useMemo, useState } from 'react';
import AviationSafetyCard from './AviationSafetyCard';
import { CITY_GRIDS, getUltraShortNow, parseCurrentWeather, type CurrentWeather } from '../services/weatherApi';
import { CITY_TO_SIDO, getERRealTimeBeds, type ERRealTimeData } from '../services/erApi';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { useTimer } from '../contexts/TimerContext';
import { formatDuration } from '../utils/activityReport';
import type { CityIndex } from '../services/fireWaterApi';
import type { FireFacility } from '../data/mockData';
import type { NavigateTarget } from '../types/navigation';

type IncidentType = 'fire' | 'ems' | 'rescue' | 'support';

interface IncidentSession {
  active: boolean;
  type: IncidentType;
  title: string;
  address: string;
  startedAt: number;
  note: string;
}

const EMPTY_SESSION: IncidentSession = {
  active: false,
  type: 'fire',
  title: '',
  address: '',
  startedAt: 0,
  note: '',
};

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
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return 0;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
}

export default function IncidentModeView({
  city,
  cityLabel,
  fireFacilities,
  isLoadingFacilities,
  cityIndex,
  onNavigate,
}: IncidentModeViewProps) {
  const [session, setSession] = useLocalStorageState<IncidentSession>('119helper-incident-session', EMPTY_SESSION);
  const [draft, setDraft] = useState<IncidentSession>(EMPTY_SESSION);
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [erList, setErList] = useState<ERRealTimeData[]>([]);
  const [loading, setLoading] = useState(false);
  const [now, setNow] = useState(() => Date.now());
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

  const erSummary = useMemo(() => {
    const erBeds = erList.reduce((sum, er) => sum + (parseInt(er.hvec) || 0), 0);
    return { hospitals: erList.length, erBeds };
  }, [erList]);

  const startSession = () => {
    const next: IncidentSession = {
      ...draft,
      active: true,
      title: draft.title.trim() || `${cityLabel} ${INCIDENT_TYPES.find(t => t.id === draft.type)?.label ?? '출동'}`,
      address: draft.address.trim(),
      startedAt: Date.now(),
      note: draft.note.trim(),
    };
    setSession(next);
  };

  const closeSession = () => {
    const ok = window.confirm('현재 출동 상황판을 종료할까요? 활동 타임라인 기록은 별도로 유지됩니다.');
    if (!ok) return;
    setSession(EMPTY_SESSION);
    setDraft(EMPTY_SESSION);
  };

  if (!session.active) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface font-headline">출동 상황판</h2>
          <p className="text-sm text-on-surface-variant mt-1">출동 중 필요한 핵심 화면과 현장 정보를 한 곳에서 열어둡니다.</p>
        </div>

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

          <input
            type="text"
            value={draft.title}
            onChange={e => setDraft(prev => ({ ...prev, title: e.target.value }))}
            placeholder="출동 제목 (예: ○○동 상가 화재)"
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <input
            type="text"
            value={draft.address}
            onChange={e => setDraft(prev => ({ ...prev, address: e.target.value }))}
            placeholder="주소 또는 집결 위치 (선택)"
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <textarea
            value={draft.note}
            onChange={e => setDraft(prev => ({ ...prev, note: e.target.value }))}
            placeholder="초기 상황, 신고 내용, 위험요소 메모"
            rows={3}
            className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
          />

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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <QuickAction icon="apartment" label="건축물" onClick={() => onNavigate('building')} />
            <QuickAction icon="fire_hydrant" label="소방용수" onClick={() => onNavigate('hydrants')} />
            <QuickAction icon="checklist" label="활동기록" onClick={() => onNavigate('activity-log')} />
            <QuickAction icon="timer" label="타이머" onClick={() => onNavigate('field-timer')} />
            <QuickAction icon="groups" label="환자보드" onClick={() => onNavigate('triage')} />
            <QuickAction icon="map" label="시설조회" onClick={() => onNavigate('shelter')} />
            <QuickAction icon="menu_book" label="매뉴얼" onClick={() => onNavigate('manual')} />
            <QuickAction icon="download_for_offline" label="오프라인" onClick={() => onNavigate('offline-readiness')} />
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
