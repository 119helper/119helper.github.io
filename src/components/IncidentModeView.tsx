import { useEffect, useMemo, useRef, useState } from 'react';
import AviationSafetyCard from './AviationSafetyCard';
import { useIncidentSession } from '../hooks/useIncidentSession';
import { useActivitySession } from '../hooks/useActivitySession';
import { useTimer } from '../contexts/TimerContext';
import { useIncidentChangeMonitor } from '../contexts/IncidentChangeMonitorContext';
import { formatDuration } from '../utils/activityReport';
import { ACTIVITY_PRESETS } from '../data/activityStages';
import {
  fetchFireWaterFacilities,
  isSplitCity,
  parseFireWaterFacilities,
  type CityIndex,
} from '../services/fireWaterApi';
import type { FireFacility } from '../data/mockData';
import type { NavigateTarget } from '../types/navigation';
import { loadStoredJson } from '../services/privacySettings';
import {
  appendActivityEvent,
  buildClosedActivitySession,
  saveActivitySession,
  startActivityFromIncident,
} from '../services/activitySession';
import {
  EMPTY_INCIDENT_SESSION,
  type IncidentFireWaterSelection,
  type IncidentHospitalSelection,
  type IncidentLocation,
  type IncidentRoadSelection,
  type IncidentSelections,
  type IncidentSession,
  type IncidentType,
} from '../services/incidentSession';
import {
  geocodeIncidentAddress,
  getCurrentIncidentLocation,
} from '../services/incidentLocation';
import {
  pickNearbyFireWaterFacilities,
  rankNearbyRoadDisasters,
  type NearbyRoadDisaster,
} from '../services/incidentBriefing';
import { matchHospitals, type MatchedHospital } from '../utils/hospitalMatch';
import { isAddressInAppCity } from '../services/administrativeRegions';
import {
  formatFreshnessSourceDate,
  getDatasetFreshness,
  isFreshnessExpired,
  type DatasetFreshness,
} from '../services/dataFreshness';
import { kakaoRegionToCity } from '../utils/locationResolver';
import IncidentCloseReviewDialog from './IncidentCloseReviewDialog';
import {
  loadTriagePatients,
  patientsForIncident,
  removeTriagePatientsForIncident,
} from '../services/triageSession';
import { archiveIncidentCase } from '../services/incidentCaseStore';
import { getIncidentActionOrder } from '../utils/incidentActionOrder';

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
  facilityLoadError?: string;
  cityIndex: CityIndex | null;
  onNavigate: (tab: NavigateTarget | string, subId?: string) => void;
}

function readCount(key: string): number {
  return loadStoredJson<unknown[]>(key, [], parsed => Array.isArray(parsed) ? parsed : []).length;
}

function createIncidentId(startedAt: number): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `incident-${startedAt}-${Math.random().toString(36).slice(2, 10)}`;
}

function boundedCandidateId(value: string): string {
  return value.trim().slice(0, 160);
}

function roadCandidateId(disaster: NearbyRoadDisaster): string {
  return boundedCandidateId(
    disaster.eventId
    || [
      disaster.eventTypeCode || disaster.eventType,
      disaster.occurredAt || '',
      disaster.roadNames[0] || disaster.facilityName || '',
      disaster.message || '',
    ].join('|'),
  );
}

function hospitalCandidateId(hospital: MatchedHospital): string {
  return boundedCandidateId(
    hospital.id
    || hospital.hpid
    || hospital.phpid
    || `${hospital.name}|${hospital.address}`,
  );
}

function sameSelectionSnapshot<T extends { selectedAt: number }>(
  current: T | undefined,
  next: T,
): boolean {
  if (!current) return false;
  const operationalEntries = (value: T) => Object.entries(value)
    .filter(([key]) => key !== 'selectedAt' && key !== 'sourceObservedAt')
    .sort(([left], [right]) => left.localeCompare(right));
  return JSON.stringify(operationalEntries(current)) === JSON.stringify(operationalEntries(next));
}

function observedAtOrSelection(value: string | number | null | undefined, selectedAt: number): number {
  const parsed = typeof value === 'number' ? value : Date.parse(value || '');
  return Number.isFinite(parsed) && parsed > 0
    ? Math.min(parsed, selectedAt)
    : selectedAt;
}

function currentTimestamp(): number {
  return Date.now();
}

export default function IncidentModeView({
  city,
  cityLabel,
  fireFacilities,
  isLoadingFacilities,
  facilityLoadError = '',
  cityIndex,
  onNavigate,
}: IncidentModeViewProps) {
  const [session, setSession] = useIncidentSession();
  const [draft, setDraft] = useState<IncidentSession>(EMPTY_INCIDENT_SESSION);
  const draftRef = useRef(draft);
  const [incidentFireFacilities, setIncidentFireFacilities] = useState<FireFacility[]>([]);
  const [incidentFireWaterLoading, setIncidentFireWaterLoading] = useState(false);
  const [incidentFireWaterError, setIncidentFireWaterError] = useState('');
  const [incidentFireWaterFreshness, setIncidentFireWaterFreshness] = useState<DatasetFreshness | null>(null);
  const [showAllChangeAlerts, setShowAllChangeAlerts] = useState(false);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);
  const [now, setNow] = useState(() => Date.now());
  const [closeReviewOpen, setCloseReviewOpen] = useState(false);
  const [closingSession, setClosingSession] = useState(false);
  const [closeSaveError, setCloseSaveError] = useState('');
  const [locationResolving, setLocationResolving] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [offerRegionalFallback, setOfferRegionalFallback] = useState(false);
  const [activitySession] = useActivitySession(session.type);
  const {
    timers,
    allTimers,
    stopwatchIncidentId,
    stopwatchRunning,
    stopwatchStart,
    stopwatchElapsed,
    laps,
    clearIncidentScope,
  } = useTimer();
  const {
    alerts: changeAlerts,
    acknowledgeAlert,
    weather,
    erList,
    operationalLoading: loading,
    weatherError,
    weatherStaleAt,
    erError,
    erStaleAt,
    roadDisasters,
    roadDisasterLoading,
    roadDisasterError,
    roadDisasterStaleAt,
  } = useIncidentChangeMonitor();

  useEffect(() => {
    setShowAllChangeAlerts(false);
  }, [session.incidentId]);

  useEffect(() => {
    let alive = true;
    const location = session.active ? session.location : undefined;
    if (!location) {
      setIncidentFireFacilities([]);
      setIncidentFireWaterLoading(false);
      setIncidentFireWaterError('');
      setIncidentFireWaterFreshness(null);
      return () => { alive = false; };
    }

    const incidentCity = location.regionName
      ? kakaoRegionToCity(location.regionName, location.districtName)
      : undefined;
    if (!incidentCity) {
      setIncidentFireFacilities([]);
      setIncidentFireWaterLoading(false);
      setIncidentFireWaterFreshness(null);
      setIncidentFireWaterError(location.regionName
        ? '현재 현장 관할은 앱의 소방용수 등록 데이터 지원 범위에 없습니다.'
        : '현장 행정구역을 확인하지 못해 소방용수 등록 데이터를 선택할 수 없습니다.');
      return () => { alive = false; };
    }
    if (isSplitCity(incidentCity) && !location.districtName) {
      setIncidentFireFacilities([]);
      setIncidentFireWaterLoading(false);
      setIncidentFireWaterFreshness(null);
      setIncidentFireWaterError('현장 구·군을 확인하지 못해 분할 소방용수 데이터를 불러오지 않았습니다.');
      return () => { alive = false; };
    }

    setIncidentFireFacilities([]);
    setIncidentFireWaterLoading(true);
    setIncidentFireWaterError('');
    setIncidentFireWaterFreshness(null);
    Promise.all([
      fetchFireWaterFacilities(
        incidentCity,
        isSplitCity(incidentCity) ? location.districtName : undefined,
      ),
      getDatasetFreshness('hydrants', incidentCity),
    ]).then(([items, freshness]) => {
      if (!alive) return;
      setIncidentFireFacilities(parseFireWaterFacilities(items));
      setIncidentFireWaterFreshness(freshness);
    }).catch(error => {
      if (!alive) return;
      setIncidentFireFacilities([]);
      setIncidentFireWaterError(
        error instanceof Error
          ? error.message
          : '소방용수 등록 데이터를 불러오지 못했습니다.',
      );
    }).finally(() => {
      if (alive) setIncidentFireWaterLoading(false);
    });

    return () => { alive = false; };
  }, [session.active, session.incidentId, session.location]);

  useEffect(() => {
    if (!session.active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [session.active]);

  const hydrantsCount = cityIndex
    ? (cityIndex.hydrants ?? cityIndex.total)
    : fireFacilities.filter(f => f.type === '소화전' || f.type === '비상소화장치').length;
  const waterCount = cityIndex
    ? (cityIndex.waterTowers ?? 0)
    : fireFacilities.filter(f => f.type === '급수탑' || f.type === '저수조').length;

  const activeTimers = timers.filter(t => t.isRunning || t.remaining < t.totalSeconds);
  const triageCount = session.incidentId
    ? patientsForIncident(loadTriagePatients(), session.incidentId).length
    : 0;
  const preplanCount = readCount('119helper-preplans');
  const elapsed = session.active ? now - session.startedAt : 0;
  const typeMeta = INCIDENT_TYPES.find(t => t.id === session.type) ?? INCIDENT_TYPES[0];
  const activityPreset = ACTIVITY_PRESETS.find(preset => preset.id === session.type) ?? ACTIVITY_PRESETS[0];
  const hasRecentIncident = !session.active
    && Boolean(session.title)
    && session.startedAt > 0
    && Boolean(session.endedAt && session.endedAt >= session.startedAt);

  const erSummary = useMemo(() => {
    const erBeds = erList.reduce((sum, er) => sum + Math.max(0, parseInt(er.hvec) || 0), 0);
    return { hospitals: erList.length, erBeds };
  }, [erList]);
  const incidentRegionUnavailable = Boolean(
    session.active && session.location && !session.location.regionName,
  );
  const incidentRegionMismatch = Boolean(
    session.active
    && session.location?.regionName
    && !isAddressInAppCity(
      city,
      session.location.resolvedAddress || session.address || session.location.regionName,
    ),
  );

  const nearbyWater = useMemo(() => {
    if (!session.active || !session.location) return [];
    const candidates = incidentFireFacilities.filter(facility => (
      (facility.type === '소화전' || facility.type === '비상소화장치')
      && facility.status !== '고장'
    ));
    return pickNearbyFireWaterFacilities(candidates, session.location, {
      radiusKm: 5,
      limit: 3,
    });
  }, [incidentFireFacilities, session.active, session.location]);
  const incidentFireWaterFreshnessExpired = incidentFireWaterFreshness
    ? isFreshnessExpired(incidentFireWaterFreshness, now)
    : false;

  const transportCandidates = useMemo(() => {
    if (!session.active || !session.location) return [];
    return matchHospitals(erList, {
      origin: { lat: session.location.lat, lon: session.location.lng },
      limit: Math.max(20, erList.length),
    })
      .filter(hospital => (
        (hospital.erBeds ?? 0) > 0
        && hospital.distanceKm !== null
        && hospital.distanceKm <= 50
      ))
      .slice(0, 3);
  }, [erList, session.active, session.location]);

  const nearbyRoadDisasters = useMemo(() => {
    if (!session.active || !session.location || !roadDisasters) return [];
    return rankNearbyRoadDisasters(roadDisasters.items, session.location, {
      radiusKm: 5,
      limit: 20,
    });
  }, [roadDisasters, session.active, session.location]);
  const activeRoadDisasters = nearbyRoadDisasters
    .filter(disaster => disaster.isActive)
    .slice(0, 3);
  const endedRoadDisasters = nearbyRoadDisasters
    .filter(disaster => !disaster.isActive)
    .slice(0, 3);

  const roadSelectionFrom = (
    disaster: NearbyRoadDisaster,
    selectedAt: number,
  ): IncidentRoadSelection => ({
    id: roadCandidateId(disaster),
    selectedAt,
    isActiveAtSelection: true,
    eventLabel: disaster.eventLabel,
    controlLabel: disaster.controlLabel,
    roadName: disaster.roadNames[0] || disaster.facilityName || undefined,
    distanceKm: disaster.distanceKm,
    distanceLabel: disaster.distanceLabel,
    status: '진행 중',
    sourceObservedAt: observedAtOrSelection(roadDisasters?.retrievedAt, selectedAt),
  });
  const fireWaterSelectionFrom = (
    candidate: (typeof nearbyWater)[number],
    selectedAt: number,
  ): IncidentFireWaterSelection => ({
    id: boundedCandidateId(candidate.facility.id),
    selectedAt,
    type: candidate.facility.type,
    address: candidate.facility.address,
    distanceKm: candidate.distanceKm,
    distanceLabel: candidate.distanceLabel,
    status: candidate.facility.status,
    sourceDate: incidentFireWaterFreshness?.sourceDate ?? null,
  });
  const hospitalSelectionFrom = (
    hospital: MatchedHospital,
    selectedAt: number,
  ): IncidentHospitalSelection => ({
    id: hospitalCandidateId(hospital),
    selectedAt,
    name: hospital.name,
    address: hospital.address,
    tel: hospital.tel || undefined,
    distanceKm: hospital.distanceKm ?? undefined,
    distanceLabel: hospital.distanceKm === null
      ? undefined
      : `${hospital.distanceKm.toFixed(1)}km`,
    erBeds: hospital.erBeds ?? undefined,
    wardBeds: hospital.wardBeds ?? undefined,
    sourceObservedAt: observedAtOrSelection(erStaleAt, selectedAt),
  });

  const commitIncidentSelection = <Key extends keyof IncidentSelections>(
    key: Key,
    selection: NonNullable<IncidentSelections[Key]>,
    expectedIncidentId: string,
  ): boolean => {
    let changed = false;
    setSession(current => {
      if (!current.active || current.incidentId !== expectedIncidentId) return current;
      const existing = current.selections?.[key] as NonNullable<IncidentSelections[Key]> | undefined;
      if (sameSelectionSnapshot(existing, selection)) return current;
      changed = true;
      return {
        ...current,
        selections: {
          ...current.selections,
          [key]: selection,
        },
      };
    });
    return changed;
  };

  const selectRoadCandidate = (disaster: NearbyRoadDisaster) => {
    if (!disaster.isActive) return;
    const expectedIncidentId = session.incidentId;
    const selection = roadSelectionFrom(disaster, currentTimestamp());
    if (sameSelectionSnapshot(session.selections?.road, selection)) return;
    if (!commitIncidentSelection('road', selection, expectedIncidentId)) return;
    appendActivityEvent(
      `진입 주의 후보 지정 · ${selection.roadName || selection.eventLabel} · ${selection.controlLabel || selection.eventLabel}`,
      selection.selectedAt,
      expectedIncidentId,
    );
  };
  const selectFireWaterCandidate = (candidate: (typeof nearbyWater)[number]) => {
    const expectedIncidentId = session.incidentId;
    const selection = fireWaterSelectionFrom(candidate, currentTimestamp());
    if (sameSelectionSnapshot(session.selections?.fireWater, selection)) return;
    if (!commitIncidentSelection('fireWater', selection, expectedIncidentId)) return;
    appendActivityEvent(
      `소방용수 후보 지정 · ${selection.type} · ${selection.distanceLabel || '거리 미확인'}`,
      selection.selectedAt,
      expectedIncidentId,
    );
  };
  const selectHospitalCandidate = (hospital: MatchedHospital) => {
    const expectedIncidentId = session.incidentId;
    const selection = hospitalSelectionFrom(hospital, currentTimestamp());
    if (sameSelectionSnapshot(session.selections?.hospital, selection)) return;
    if (!commitIncidentSelection('hospital', selection, expectedIncidentId)) return;
    appendActivityEvent(
      `이송 전화확인 후보 지정 · ${selection.name} · 선택 당시 ${selection.erBeds ?? '미확인'}병상`,
      selection.selectedAt,
      expectedIncidentId,
    );
  };

  const selectedRoadCandidate = session.selections?.road
    ? activeRoadDisasters.find(disaster => roadCandidateId(disaster) === session.selections?.road?.id)
    : undefined;
  const selectedFireWaterCandidate = session.selections?.fireWater
    ? nearbyWater.find(candidate => candidate.facility.id === session.selections?.fireWater?.id)
    : undefined;
  const selectedHospitalCandidate = session.selections?.hospital
    ? transportCandidates.find(hospital => hospitalCandidateId(hospital) === session.selections?.hospital?.id)
    : undefined;
  const roadNeedsReview = Boolean(session.selections?.road && (
    !selectedRoadCandidate
    || !sameSelectionSnapshot(
      session.selections.road,
      roadSelectionFrom(selectedRoadCandidate, session.selections.road.selectedAt),
    )
  ));
  const fireWaterNeedsReview = Boolean(session.selections?.fireWater && (
    !selectedFireWaterCandidate
    || !sameSelectionSnapshot(
      session.selections.fireWater,
      fireWaterSelectionFrom(selectedFireWaterCandidate, session.selections.fireWater.selectedAt),
    )
  ));
  const hospitalNeedsReview = Boolean(session.selections?.hospital && (
    !selectedHospitalCandidate
    || !sameSelectionSnapshot(
      session.selections.hospital,
      hospitalSelectionFrom(selectedHospitalCandidate, session.selections.hospital.selectedAt),
    )
  ));
  const hasSelectedActions = Boolean(
    session.selections?.road
    || session.selections?.fireWater
    || session.selections?.hospital,
  );
  const visibleChangeAlerts = showAllChangeAlerts
    ? changeAlerts
    : changeAlerts.slice(0, 4);
  const hiddenChangeAlertCount = changeAlerts.length - visibleChangeAlerts.length;

  const beginSession = (location?: IncidentLocation) => {
    const startedAt = Date.now();
    const incidentId = createIncidentId(startedAt);
    const currentDraft = draftRef.current;
    const address = location?.source === 'address' && location.resolvedAddress
      ? location.resolvedAddress
      : (currentDraft.address.trim() || location?.resolvedAddress || '');
    const next: IncidentSession = {
      ...currentDraft,
      incidentId,
      active: true,
      title: currentDraft.title.trim() || `${cityLabel} ${INCIDENT_TYPES.find(t => t.id === currentDraft.type)?.label ?? '출동'}`,
      address,
      location,
      startedAt,
      endedAt: undefined,
      note: currentDraft.note.trim(),
      snapshot: location ? undefined : {
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
      incidentId,
      type: next.type,
      title: next.title,
      note: next.note,
      startedAt,
      location: location ? { lat: location.lat, lng: location.lng } : undefined,
    });
  };

  const resolveAddress = async (): Promise<IncidentLocation | null> => {
    setLocationResolving(true);
    setLocationError('');
    setOfferRegionalFallback(false);
    try {
      const location = await geocodeIncidentAddress(draft.address);
      setDraft(prev => ({
        ...prev,
        address: location.resolvedAddress || prev.address.trim(),
        location,
      }));
      return location;
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : '현장 주소를 확인하지 못했습니다.');
      setOfferRegionalFallback(true);
      return null;
    } finally {
      setLocationResolving(false);
    }
  };

  const resolveCurrentLocation = async () => {
    setLocationResolving(true);
    setLocationError('');
    setOfferRegionalFallback(false);
    try {
      const location = await getCurrentIncidentLocation();
      setDraft(prev => ({
        ...prev,
        address: location.resolvedAddress,
        location,
      }));
    } catch (error) {
      setLocationError(error instanceof Error ? error.message : '현재 위치를 확인하지 못했습니다.');
      setOfferRegionalFallback(true);
    } finally {
      setLocationResolving(false);
    }
  };

  const startSession = async () => {
    if (draft.location) {
      beginSession(draft.location);
      return;
    }
    if (!draft.address.trim()) {
      setLocationError('현장 주소를 입력하거나 현재 위치를 사용해 주세요.');
      setOfferRegionalFallback(true);
      return;
    }

    const location = await resolveAddress();
    if (location) beginSession(location);
  };

  const closeSession = () => {
    setCloseSaveError('');
    setCloseReviewOpen(true);
  };

  const finalizeSession = async () => {
    if (closingSession || !session.active || !session.incidentId) return;

    const endedAt = Date.now();
    const incidentId = session.incidentId;
    setClosingSession(true);
    setCloseSaveError('');

    try {
      const closedIncident: IncidentSession = {
        ...session,
        active: false,
        endedAt,
      };
      const closedActivity = buildClosedActivitySession({
        current: activitySession,
        incidentId,
        presetId: session.type,
        title: session.title,
        note: session.note,
        startedAt: session.startedAt,
        endedAt,
        location: session.location
          ? { lat: session.location.lat, lng: session.location.lng }
          : undefined,
      });
      const archiveResult = archiveIncidentCase({
        incident: closedIncident,
        activity: closedActivity,
        triagePatients: loadTriagePatients(),
        timers: allTimers,
        stopwatch: stopwatchIncidentId === incidentId
          ? {
              incidentId,
              running: stopwatchRunning,
              startedAt: stopwatchStart,
              elapsedMs: stopwatchElapsed,
              laps,
            }
          : null,
      }, endedAt);
      const committedIncident = archiveResult.status === 'skipped-public'
        ? closedIncident
        : archiveResult.record.incident;
      const committedActivity = archiveResult.status === 'skipped-public'
        ? closedActivity
        : archiveResult.record.activity;

      saveActivitySession(committedActivity);
      removeTriagePatientsForIncident(incidentId);
      clearIncidentScope(incidentId);
      setSession(committedIncident);
      setDraft(EMPTY_INCIDENT_SESSION);
      setLocationError('');
      setOfferRegionalFallback(false);
      setCloseReviewOpen(false);
    } catch (error) {
      setCloseSaveError(
        error instanceof Error
          ? error.message
          : '종료 기록을 보관하지 못했습니다. 저장 공간을 확인하고 다시 시도해 주세요.',
      );
    } finally {
      setClosingSession(false);
    }
  };

  const openIncidentTool = (tab: NavigateTarget | string, label: string, subId?: string) => {
    appendActivityEvent(`${label} 열람`, Date.now(), session.incidentId);
    onNavigate(tab, subId);
  };

  if (!session.active) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="ui-page-title">출동 상황판</h2>
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
            <div className="grid gap-2 px-5 pb-5 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => openIncidentTool('activity-log', '활동기록')}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-extrabold text-on-primary hover:bg-primary/90"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-lg">description</span>
                활동 기록·보고서 열기
              </button>
              <button
                type="button"
                onClick={() => onNavigate('dashboard')}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-outline-variant/25 bg-surface-container px-4 py-2.5 text-sm font-extrabold text-on-surface hover:bg-surface-container-high"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-lg">space_dashboard</span>
                평시 업무로 돌아가기
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
            <span>현장 주소 <span className="font-normal text-on-surface-variant">(자동 브리핑 기준)</span></span>
            <input
              id="incident-address"
              type="text"
              value={draft.address}
              disabled={locationResolving}
              onChange={e => {
                setDraft(prev => ({ ...prev, address: e.target.value, location: undefined }));
                setLocationError('');
                setOfferRegionalFallback(false);
              }}
              placeholder="도로명 또는 지번 주소"
              className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30 font-normal disabled:cursor-wait disabled:opacity-60"
            />
          </label>
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => void resolveAddress()}
                disabled={locationResolving || !draft.address.trim()}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm font-bold text-primary transition-colors hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-lg">search</span>
                주소 확인
              </button>
              <button
                type="button"
                onClick={() => void resolveCurrentLocation()}
                disabled={locationResolving}
                className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-outline-variant/25 bg-surface-container px-3 py-2 text-sm font-bold text-on-surface transition-colors hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-45"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-lg">my_location</span>
                현재 위치 사용
              </button>
            </div>
            {locationResolving && (
              <div role="status" className="flex items-center gap-2 rounded-lg bg-primary/5 px-3 py-2 text-xs font-bold text-primary">
                <span aria-hidden="true" className="material-symbols-outlined animate-spin text-base">progress_activity</span>
                현장 좌표를 확인하고 있습니다.
              </div>
            )}
            {!locationResolving && draft.location && (
              <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs text-on-surface ${
                draft.location.source === 'gps'
                && (draft.location.accuracyMeters ?? 0) > 100
                  ? 'border-amber-500/30 bg-amber-500/10'
                  : 'border-tertiary/25 bg-tertiary/5'
              }`}>
                <span
                  aria-hidden="true"
                  className={`material-symbols-outlined text-base ${
                    draft.location.source === 'gps'
                    && (draft.location.accuracyMeters ?? 0) > 100
                      ? 'text-amber-700'
                      : 'text-tertiary'
                  }`}
                >
                  location_on
                </span>
                <div>
                  <p className="font-bold">
                    {draft.location.source === 'gps' ? '현재 위치 연결됨' : '주소 위치 확인됨'}
                  </p>
                  <p className="mt-0.5 text-on-surface-variant">
                    {draft.location.resolvedAddress}
                    {draft.location.accuracyMeters != null
                      ? ` · 오차 약 ${Math.round(draft.location.accuracyMeters)}m`
                      : ''}
                  </p>
                  {draft.location.source === 'gps'
                    && (draft.location.accuracyMeters ?? 0) > 100
                    && (
                      <p className="mt-1 font-bold text-amber-700">
                        위치 정밀도가 낮습니다. 거리 정보는 오차 범위를 함께 고려하세요.
                      </p>
                    )}
                </div>
              </div>
            )}
            {locationError && (
              <div role="alert" className="rounded-lg border border-error/25 bg-error/5 px-3 py-2 text-xs font-bold text-error">
                {locationError}
              </div>
            )}
          </div>
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
            onClick={() => void startSession()}
            disabled={locationResolving}
            className="w-full bg-primary text-on-primary rounded-xl px-4 py-3 font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <span className="material-symbols-outlined">play_arrow</span>
            위치 기준 브리핑 시작
          </button>
          {offerRegionalFallback && (
            <button
              type="button"
              onClick={() => beginSession()}
              className="w-full rounded-xl border border-outline-variant/30 bg-surface-container px-4 py-3 text-sm font-bold text-on-surface-variant transition-colors hover:bg-surface-container-high"
            >
              위치 없이 {cityLabel} 지역 기준으로 시작
            </button>
          )}
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
            {session.location
              ? (session.address || session.location.resolvedAddress)
              : session.address
                ? `신고 위치(좌표 미확인) · ${session.address}`
                : `${cityLabel} 지역 기준`}
            {' · '}시작 {new Date(session.startedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
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

      {session.location ? (
        <div className={`flex items-start gap-3 rounded-xl border px-4 py-3 ${
          session.location.source === 'gps'
          && (session.location.accuracyMeters ?? 0) > 100
            ? 'border-amber-500/30 bg-amber-500/10'
            : 'border-primary/20 bg-primary/5'
        }`}>
          <span
            aria-hidden="true"
            className={`material-symbols-outlined mt-0.5 text-xl ${
              session.location.source === 'gps'
              && (session.location.accuracyMeters ?? 0) > 100
                ? 'text-amber-700'
                : 'text-primary'
            }`}
          >
            location_on
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-on-surface">현장 위치가 자동 브리핑의 기준점입니다.</p>
            <p className="mt-0.5 truncate text-xs text-on-surface-variant">
              {session.location.resolvedAddress || session.address}
              {' · '}
              {session.location.source === 'gps' ? '기기 위치' : '주소 검색'}
              {session.location.accuracyMeters != null
                ? ` · 오차 약 ${Math.round(session.location.accuracyMeters)}m`
                : ''}
            </p>
            {session.location.source === 'gps'
              && (session.location.accuracyMeters ?? 0) > 100
              && (
                <p className="mt-1 text-xs font-bold text-amber-700">
                  GPS 정밀도가 낮습니다. 가까운 시설·도로 거리에는 이 오차가 포함될 수 있습니다.
                </p>
              )}
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/25 bg-amber-500/5 px-4 py-3">
          <span aria-hidden="true" className="material-symbols-outlined mt-0.5 text-xl text-amber-700">location_off</span>
          <div>
            <p className="text-sm font-extrabold text-on-surface">현장 위치가 연결되지 않았습니다.</p>
            <p className="mt-0.5 text-xs text-on-surface-variant">
              아래 정보는 {cityLabel} 전체 기준이며, 가까운 시설·도로 위험 판단에는 사용할 수 없습니다.
            </p>
          </div>
        </div>
      )}

      {incidentRegionMismatch && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
          <span aria-hidden="true" className="material-symbols-outlined mt-0.5 text-xl text-amber-700">warning</span>
          <div>
            <p className="text-sm font-extrabold text-on-surface">출동 현장과 관심 지역이 다릅니다.</p>
            <p className="mt-0.5 text-xs leading-5 text-on-surface-variant">
              이 출동판의 기상·도로·응급실·소방용수는 현장 좌표와 관할을 따릅니다. 일반 대시보드의 관심 지역은 계속 {cityLabel}로 유지됩니다.
            </p>
          </div>
        </div>
      )}

      {incidentRegionUnavailable && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-error/30 bg-error/5 px-4 py-3">
          <span aria-hidden="true" className="material-symbols-outlined mt-0.5 text-xl text-error">wrong_location</span>
          <div>
            <p className="text-sm font-extrabold text-on-surface">GPS 행정구역을 확인하지 못했습니다.</p>
            <p className="mt-0.5 text-xs leading-5 text-on-surface-variant">
              기상·도로·거리 계산은 좌표를 사용하지만, 잘못된 관할 병상을 섞지 않도록 응급실 후보는 숨겼습니다. 주소 검색으로 다시 연결해 주세요.
            </p>
          </div>
        </div>
      )}

      {hasSelectedActions && (
        <section
          role="region"
          aria-label="선택한 현장 조치"
          className="rounded-2xl border border-primary/25 bg-primary/5 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-primary">원탭 연결</p>
              <h3 className="mt-1 text-lg font-extrabold text-on-surface">선택한 현장 조치</h3>
            </div>
            <p className="text-[11px] font-bold text-on-surface-variant">
              후보 지정 상태 · 현장·기관 재확인 필수
            </p>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
            {session.selections?.road && (
              <article className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-extrabold text-on-surface">진입 주의 후보</p>
                  <span className="material-symbols-outlined text-lg text-primary" aria-hidden="true">route</span>
                </div>
                <p className="mt-1 truncate text-sm font-black text-on-surface">
                  {session.selections.road.roadName || session.selections.road.eventLabel}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
                  {session.selections.road.eventLabel}
                  {session.selections.road.controlLabel ? ` · ${session.selections.road.controlLabel}` : ''}
                  {session.selections.road.distanceLabel ? ` · ${session.selections.road.distanceLabel}` : ''}
                </p>
                <SelectionTimestamp value={session.selections.road.selectedAt} />
                {roadNeedsReview && <SelectionReviewWarning />}
              </article>
            )}
            {session.selections?.fireWater && (
              <article className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-extrabold text-on-surface">소방용수 사용 후보</p>
                  <span className="material-symbols-outlined text-lg text-primary" aria-hidden="true">fire_hydrant</span>
                </div>
                <p className="mt-1 truncate text-sm font-black text-on-surface">
                  {session.selections.fireWater.type} · {session.selections.fireWater.distanceLabel || '거리 미확인'}
                </p>
                <p className="mt-1 truncate text-[11px] text-on-surface-variant">
                  점검상태 {session.selections.fireWater.status}(등록값)
                  {' · '}기준일 {session.selections.fireWater.sourceDate || '미확인'}
                  {' · '}실제 사용 가능 여부 미확정
                </p>
                <SelectionTimestamp value={session.selections.fireWater.selectedAt} />
                {fireWaterNeedsReview && <SelectionReviewWarning />}
              </article>
            )}
            {session.selections?.hospital && (
              <article className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-extrabold text-on-surface">이송 전화확인 후보</p>
                  <span className="material-symbols-outlined text-lg text-primary" aria-hidden="true">ambulance</span>
                </div>
                <p className="mt-1 truncate text-sm font-black text-on-surface">
                  {session.selections.hospital.name}
                </p>
                <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">
                  선택 당시 {session.selections.hospital.erBeds ?? '미확인'}병상
                  {session.selections.hospital.distanceLabel ? ` · ${session.selections.hospital.distanceLabel}` : ''}
                  {' · '}수용 확정 아님
                </p>
                <SelectionTimestamp value={session.selections.hospital.selectedAt} />
                {hospitalNeedsReview && <SelectionReviewWarning />}
              </article>
            )}
          </div>
        </section>
      )}

      {session.location && changeAlerts.length === 0 && (
        <div
          aria-live="polite"
          className="flex items-center gap-2 rounded-xl border border-primary/15 bg-primary/5 px-4 py-2.5 text-xs text-on-surface-variant"
        >
          <span aria-hidden="true" className="material-symbols-outlined text-lg text-primary">monitor_heart</span>
          <span>
            변화 감시 중 · 새 도로 통제, 이송 후보·병상 급감, 풍속·풍향 급변만 알려드립니다.
          </span>
        </div>
      )}

      {changeAlerts.length > 0 && (
        <section
          aria-labelledby="incident-change-alerts-title"
          aria-live="polite"
          className="space-y-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-widest text-amber-700">변화 감지</p>
              <h3 id="incident-change-alerts-title" className="mt-1 text-lg font-extrabold text-on-surface">
                다시 확인할 현장 정보
              </h3>
            </div>
            <p className="text-[11px] text-on-surface-variant">
              미확인 {changeAlerts.length}건 · 긴급도 높은 순 · 활동기록 자동 저장
            </p>
          </div>
          <div className="space-y-2">
            {visibleChangeAlerts.map(change => (
              <article
                key={change.alertId}
                role={change.severity === 'critical' ? 'alert' : undefined}
                className={`rounded-xl border px-3 py-3 ${
                  change.severity === 'critical'
                    ? 'border-error/35 bg-error/10'
                    : 'border-amber-500/30 bg-surface-container-lowest'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-extrabold ${
                        change.severity === 'critical'
                          ? 'bg-error text-on-error'
                          : 'bg-amber-500/15 text-amber-800'
                      }`}>
                        {change.severity === 'critical' ? '즉시 확인' : '재확인'}
                      </span>
                      <h4 className="text-sm font-extrabold text-on-surface">{change.title}</h4>
                    </div>
                    <p className="mt-1.5 text-xs leading-5 text-on-surface-variant">{change.message}</p>
                    <p className="mt-1 text-[10px] text-outline">
                      {new Date(change.detectedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                      {' · '}{change.source.current.provider}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => acknowledgeAlert(change.alertId)}
                    className="shrink-0 rounded-lg border border-outline-variant/25 px-2.5 py-1.5 text-xs font-bold text-on-surface-variant transition-colors hover:bg-surface-container"
                    aria-label={`${change.title} 확인 완료`}
                  >
                    확인
                  </button>
                </div>
              </article>
            ))}
          </div>
          {(hiddenChangeAlertCount > 0 || showAllChangeAlerts) && (
            <button
              type="button"
              onClick={() => setShowAllChangeAlerts(current => !current)}
              className="flex w-full items-center justify-center gap-1 rounded-lg border border-amber-500/25 bg-surface-container-lowest px-3 py-2 text-xs font-extrabold text-amber-800"
              aria-expanded={showAllChangeAlerts}
            >
              <span aria-hidden="true" className="material-symbols-outlined text-base">
                {showAllChangeAlerts ? 'expand_less' : 'expand_more'}
              </span>
              {showAllChangeAlerts
                ? '변화 알림 접기'
                : `나머지 ${hiddenChangeAlertCount}건 모두 보기`}
            </button>
          )}
        </section>
      )}

      <section className="space-y-3" aria-labelledby="automatic-briefing-title">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-primary">자동 연결</p>
            <h3 id="automatic-briefing-title" className="mt-1 text-xl font-extrabold text-on-surface">
              현장 기준 핵심 브리핑
            </h3>
          </div>
          <p className="text-xs text-on-surface-variant">각 정보는 독립 조회되며 현장 지휘·기관 확인이 우선입니다.</p>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
          {getIncidentActionOrder(session.type).map(card => (
            <div key={card} className="contents" data-incident-action-card={card}>
              {card === 'road' ? (
          <article className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-xl text-primary">route</span>
                <div>
                  <h4 className="text-sm font-extrabold text-on-surface">진입로 재난·통제</h4>
                  <p className="text-[11px] text-on-surface-variant">현장 5km · 최근 7일 등록 건</p>
                </div>
              </div>
              {roadDisasterLoading && (
                <span className="rounded-full bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary">조회 중</span>
              )}
            </div>

            <div className="mt-4 space-y-2">
              {roadDisasterError && roadDisasters && (
                <p role="alert" className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] font-bold text-amber-700">
                  {roadDisasterError}
                </p>
              )}
              {!session.location ? (
                <BriefingEmpty
                  icon="location_off"
                  title="현장 위치가 필요합니다."
                  description="도로 재난은 지역 전체가 아니라 현장 좌표를 기준으로만 조회합니다."
                />
              ) : roadDisasterLoading && !roadDisasters ? (
                <BriefingLoading label="ITS 도로 재난 정보를 확인 중입니다." />
              ) : roadDisasterError && !roadDisasters ? (
                <BriefingEmpty
                  icon="sync_problem"
                  title="도로 통제 조회 불가"
                  description="조회 실패를 ‘통제 없음’으로 판단하지 마세요. 현장 지령·교통 통제를 별도로 확인해야 합니다."
                  tone="error"
                />
              ) : activeRoadDisasters.length > 0 ? (
                activeRoadDisasters.map(disaster => (
                  <div
                    key={disaster.eventId || `${disaster.eventTypeCode}-${disaster.distanceKm}`}
                    className={`rounded-lg border px-3 py-2.5 ${
                      disaster.controlRank >= 5 || disaster.severityRank >= 4
                        ? 'border-error/25 bg-error/5'
                        : 'border-amber-500/25 bg-amber-500/5'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-on-surface">
                          {disaster.eventLabel} · {disaster.controlLabel}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">
                          {disaster.roadNames[0] || disaster.facilityName || '도로명 미상'}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-xs font-extrabold text-error">
                        {disaster.distanceLabel}
                      </span>
                    </div>
                    {disaster.message && (
                      <p className="mt-2 line-clamp-2 text-[11px] leading-4 text-on-surface-variant">
                        {disaster.message}
                      </p>
                    )}
                    <button
                      type="button"
                      aria-label={`${disaster.roadNames[0] || disaster.facilityName || disaster.eventLabel} 진입 주의로 고정`}
                      aria-pressed={session.selections?.road?.id === roadCandidateId(disaster)}
                      onClick={() => selectRoadCandidate(disaster)}
                      className={`mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-extrabold ${
                        session.selections?.road?.id === roadCandidateId(disaster)
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-primary/25 bg-surface-container-lowest text-primary hover:bg-primary/10'
                      }`}
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-base">
                        {session.selections?.road?.id === roadCandidateId(disaster) ? 'check' : 'keep'}
                      </span>
                      진입 주의로 고정
                    </button>
                  </div>
                ))
              ) : endedRoadDisasters.length > 0 ? (
                <>
                  <BriefingEmpty
                    icon="task_alt"
                    title="거리 확인된 항목은 종료·해제 상태"
                    description={`현장 5km 안에서 최근 종료·해제 ${endedRoadDisasters.length}건을 확인했습니다. 현재 통제로 표시하지 않습니다.`}
                  />
                  {endedRoadDisasters.map(disaster => (
                    <div
                      key={`ended-${disaster.eventId || `${disaster.eventTypeCode}-${disaster.distanceKm}`}`}
                      className="flex items-start justify-between gap-2 rounded-lg border border-outline-variant/15 bg-surface-container px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[11px] font-bold text-on-surface-variant">
                          종료·해제 · {disaster.eventLabel}
                        </p>
                        <p className="truncate text-[10px] text-on-surface-variant">
                          {disaster.roadNames[0] || disaster.facilityName || '도로명 미상'}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-[10px] text-on-surface-variant">
                        {disaster.distanceLabel}
                      </span>
                    </div>
                  ))}
                </>
              ) : roadDisasters?.totalCount === 0 ? (
                <BriefingEmpty
                  icon="fact_check"
                  title="조회 결과 보고된 항목 없음"
                  description="ITS 최근 7일·5km 조회 결과입니다. 미신고 위험이나 현장 통제가 없다는 뜻은 아닙니다."
                />
              ) : (
                <BriefingEmpty
                  icon="wrong_location"
                  title="거리 확인 가능한 항목 없음"
                  description={`ITS 응답 ${roadDisasters?.totalCount ?? 0}건 중 현장 5km 안에서 좌표를 확인한 항목이 없습니다.`}
                />
              )}
            </div>

            {roadDisasters && !roadDisasterLoading && (
              <div className="mt-3 border-t border-outline-variant/10 pt-3 text-[10px] text-on-surface-variant">
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <span>
                    {roadDisasterStaleAt
                      ? `${Math.max(1, Math.round((now - roadDisasterStaleAt) / 60_000))}분 전 성공 캐시 · 변경 가능`
                      : `조회 ${new Date(roadDisasters.retrievedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}`}
                  </span>
                  <a
                    href={roadDisasters.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-bold text-primary hover:underline"
                  >
                    ITS 원문
                  </a>
                </div>
                {roadDisasters.truncated && <p className="mt-1 font-bold text-amber-700">응답 일부만 표시 중</p>}
              </div>
            )}
          </article>
              ) : card === 'fireWater' ? (

          <article className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-xl text-primary">fire_hydrant</span>
                <div>
                  <h4 className="text-sm font-extrabold text-on-surface">가까운 등록 소방용수</h4>
                  <p className="text-[11px] text-on-surface-variant">
                    현장 5km · {incidentFireWaterFreshness
                      ? formatFreshnessSourceDate(incidentFireWaterFreshness)
                      : '기준일 미확인'}
                    {incidentFireWaterFreshnessExpired ? ' · 갱신주기 초과' : ''}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openIncidentTool('hydrants', '소방용수')}
                className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/15"
              >
                전체 보기
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {!session.location ? (
                <BriefingEmpty
                  icon="location_off"
                  title="현장 위치가 필요합니다."
                  description="위치 없이 시작한 출동은 가까운 소방용수를 계산하지 않습니다."
                />
              ) : incidentFireWaterLoading ? (
                <BriefingLoading label="현장 구·군 소방용수 등록 데이터를 불러오는 중입니다." />
              ) : incidentFireWaterError ? (
                <BriefingEmpty
                  icon="sync_problem"
                  title="소방용수 등록 데이터 조회 불가"
                  description={`${incidentFireWaterError} 현장 지리·관할 정보와 실제 사용 가능 여부를 확인하세요.`}
                  tone="error"
                />
              ) : nearbyWater.length > 0 ? (
                nearbyWater.map(({ facility, distanceLabel }) => (
                  <div key={facility.id} className="rounded-lg bg-surface-container px-3 py-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-on-surface">
                          {facility.type} · {facility.status === '미확인'
                            ? '점검상태 미확인'
                            : `점검상태 ${facility.status}(등록값)`}
                        </p>
                        <p className="mt-0.5 truncate text-[11px] text-on-surface-variant">{facility.address}</p>
                      </div>
                      <span className="shrink-0 font-mono text-xs font-extrabold text-primary">{distanceLabel}</span>
                    </div>
                    <button
                      type="button"
                      aria-label={`${facility.id} ${facility.type} 사용 후보 지정`}
                      aria-pressed={session.selections?.fireWater?.id === facility.id}
                      onClick={() => selectFireWaterCandidate(
                        nearbyWater.find(candidate => candidate.facility.id === facility.id)!,
                      )}
                      className={`mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-extrabold ${
                        session.selections?.fireWater?.id === facility.id
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-primary/25 bg-surface-container-lowest text-primary hover:bg-primary/10'
                      }`}
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-base">
                        {session.selections?.fireWater?.id === facility.id ? 'check' : 'add_circle'}
                      </span>
                      사용 후보 지정
                    </button>
                  </div>
                ))
              ) : (
                <BriefingEmpty
                  icon="water_drop"
                  title="5km 내 사용 후보 등록시설 미확인"
                  description="현장 구·군의 등록 좌표 결과입니다. 실제 시설 존재·접근·사용 가능 여부를 관할 정보와 현장에서 확인하세요."
                />
              )}
            </div>
            {incidentFireWaterFreshnessExpired && (
              <p className="mt-3 border-t border-outline-variant/10 pt-3 text-[10px] font-bold text-amber-700">
                소방용수 원본 기준일이 권장 갱신 주기를 넘었습니다. 위치·점검상태를 최신 관할 자료와 현장에서 재확인하세요.
              </p>
            )}
          </article>
              ) : (

          <article className="rounded-xl border border-outline-variant/15 bg-surface-container-lowest p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-xl text-primary">ambulance</span>
                <div>
                  <h4 className="text-sm font-extrabold text-on-surface">이송 후보</h4>
                  <p className="text-[11px] font-bold text-error">거리·가용 병상 참고 · 전화 확인 필수</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openIncidentTool('er', '응급실')}
                className="rounded-lg bg-primary/10 px-2.5 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/15"
              >
                상세
              </button>
            </div>

            <div className="mt-4 space-y-2">
              {!session.location ? (
                <BriefingEmpty
                  icon="location_off"
                  title="현장 위치가 필요합니다."
                  description="거리 기반 이송 후보는 좌표가 확인된 출동에서만 표시합니다."
                />
              ) : loading && erList.length === 0 ? (
                <BriefingLoading label="응급실 병상과 거리를 확인 중입니다." />
              ) : erError ? (
                <BriefingEmpty
                  icon="sync_problem"
                  title="응급실 정보 조회 불가"
                  description={erError}
                  tone="error"
                />
              ) : transportCandidates.length > 0 ? (
                transportCandidates.map(hospital => (
                  <div key={`${hospital.name}-${hospital.address}`} className="rounded-lg bg-surface-container px-3 py-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-xs font-extrabold text-on-surface">{hospital.name}</p>
                        <p className="mt-0.5 text-[11px] text-on-surface-variant">
                          응급실 가용 {hospital.erBeds}병상
                          {hospital.distanceKm !== null ? ` · ${hospital.distanceKm.toFixed(1)}km` : ''}
                        </p>
                      </div>
                      {hospital.tel && (
                        <a
                          href={`tel:${hospital.tel.replace(/[^\d+]/g, '')}`}
                          aria-label={`${hospital.name} 전화`}
                          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-2 text-[11px] font-extrabold text-on-primary"
                        >
                          <span aria-hidden="true" className="material-symbols-outlined text-sm">call</span>
                          전화
                        </a>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`${hospital.name} 전화 확인 후보 지정`}
                      aria-pressed={session.selections?.hospital?.id === hospitalCandidateId(hospital)}
                      onClick={() => selectHospitalCandidate(hospital)}
                      className={`mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-extrabold ${
                        session.selections?.hospital?.id === hospitalCandidateId(hospital)
                          ? 'border-primary bg-primary text-on-primary'
                          : 'border-primary/25 bg-surface-container-lowest text-primary hover:bg-primary/10'
                      }`}
                    >
                      <span aria-hidden="true" className="material-symbols-outlined text-base">
                        {session.selections?.hospital?.id === hospitalCandidateId(hospital) ? 'check' : 'phone_in_talk'}
                      </span>
                      전화 확인 후보 지정
                    </button>
                  </div>
                ))
              ) : (
                <BriefingEmpty
                  icon="medical_services"
                  title="현장 시도 조회기관 중 50km 내 후보 미확인"
                  description="시도 경계 밖 기관은 포함되지 않을 수 있습니다. 양수 병상도 실제 수용 가능 여부를 뜻하지 않으므로 전화로 확인하세요."
                />
              )}
            </div>

            {erStaleAt && !loading && (
              <p className="mt-3 border-t border-outline-variant/10 pt-3 text-[10px] font-bold text-amber-700">
                {Math.max(1, Math.round((now - erStaleAt) / 60_000))}분 전 성공 데이터 · 현재 수용 여부 재확인
              </p>
            )}
          </article>
              )}
            </div>
          ))}
        </div>
      </section>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <InfoCard icon="timer" label="경과 시간" value={formatDuration(elapsed)} mono />
        <InfoCard icon="fire_hydrant" label={`${cityLabel} 소화전`} value={isLoadingFacilities ? '조회 중' : facilityLoadError ? '확인 필요' : `${hydrantsCount.toLocaleString()}개`} />
        <InfoCard icon="water_pump" label={`${cityLabel} 급수원`} value={isLoadingFacilities ? '조회 중' : facilityLoadError ? '확인 필요' : `${waterCount.toLocaleString()}개`} />
        <InfoCard
          icon="local_hospital"
          label={`${incidentRegionUnavailable ? '현장 관할 미확인' : (session.location?.regionName || cityLabel)} 응급실`}
          value={loading && erList.length === 0
            ? '조회 중'
            : erError
              ? '확인 필요'
              : `${erSummary.erBeds} / ${erSummary.hospitals}곳`}
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div className="xl:col-span-2 bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-bold text-on-surface">현장 기상·초기 상황</h3>
            <span className="text-[11px] text-on-surface-variant">
              {session.location ? '현장 좌표 기상 격자' : `${cityLabel} 대표 기상 격자`}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Metric label="기온" value={weather ? `${weather.temperature}°C` : '--'} />
            <Metric label="습도" value={weather ? `${weather.humidity}%` : '--'} />
            <Metric label="풍향/풍속" value={weather ? `${weather.windDirection} ${weather.windSpeed}m/s` : '--'} />
          </div>
          {weatherError && !loading && (
            <p role="alert" className="rounded-lg border border-error/20 bg-error/5 px-3 py-2 text-xs font-bold text-error">
              {weatherError} 현장 관측과 지령 정보를 우선하세요.
            </p>
          )}
          {weatherStaleAt && (
            <p className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs font-bold text-amber-700">
              기상은 {Math.max(1, Math.round((now - weatherStaleAt) / 60_000))}분 전 성공 데이터입니다.
            </p>
          )}
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
          <AviationSafetyCard
            weather={weatherError || weatherStaleAt ? null : weather}
            loading={loading && !weather}
            onClick={() => onNavigate('aviation')}
          />
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
        saving={closingSession}
        saveError={closeSaveError}
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

function SelectionTimestamp({ value }: { value: number }) {
  return (
    <p className="mt-2 text-[10px] font-bold text-outline">
      지정 {new Date(value).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
    </p>
  );
}

function SelectionReviewWarning() {
  return (
    <p
      role="status"
      className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-[10px] font-extrabold text-amber-800 dark:text-amber-200"
    >
      현재 조회값과 달라 재확인 필요
    </p>
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

function BriefingLoading({ label }: { label: string }) {
  return (
    <div role="status" className="flex min-h-24 items-center justify-center gap-2 rounded-lg bg-surface-container px-3 py-4 text-xs font-bold text-on-surface-variant">
      <span aria-hidden="true" className="material-symbols-outlined animate-spin text-lg text-primary">progress_activity</span>
      {label}
    </div>
  );
}

function BriefingEmpty({
  icon,
  title,
  description,
  tone = 'neutral',
}: {
  icon: string;
  title: string;
  description: string;
  tone?: 'neutral' | 'error';
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={`min-h-24 rounded-lg border px-3 py-3 ${
        tone === 'error'
          ? 'border-error/20 bg-error/5'
          : 'border-outline-variant/15 bg-surface-container'
      }`}
    >
      <div className="flex items-start gap-2">
        <span
          aria-hidden="true"
          className={`material-symbols-outlined text-lg ${tone === 'error' ? 'text-error' : 'text-on-surface-variant'}`}
        >
          {icon}
        </span>
        <div>
          <p className="text-xs font-extrabold text-on-surface">{title}</p>
          <p className="mt-1 text-[11px] leading-4 text-on-surface-variant">{description}</p>
        </div>
      </div>
    </div>
  );
}
