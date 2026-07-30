/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  CITY_GRIDS,
  getUltraShortNow,
  latLngToGrid,
  parseCurrentWeather,
  type CurrentWeather,
} from '../services/weatherApi';
import {
  CITY_TO_SIDO,
  getERRealTimeBeds,
  type ERRealTimeData,
} from '../services/erApi';
import { getStaleAt, type RoadDisasterResponse } from '../services/apiClient';
import { getNearbyRoadDisasters } from '../services/roadDisasterApi';
import { rankNearbyRoadDisasters } from '../services/incidentBriefing';
import {
  detectIncidentChanges,
  type IncidentDetectedChange,
  type IncidentOperationalSnapshot,
} from '../services/incidentChangeBriefing';
import { matchHospitals } from '../utils/hospitalMatch';
import { appendActivityEvent } from '../services/activitySession';
import type { IncidentSession } from '../services/incidentSession';

export const INCIDENT_ROAD_POLL_MS = 60 * 1000;
export const INCIDENT_OPERATIONAL_POLL_MS = 5 * 60 * 1000;

export interface IncidentChangeAlert extends IncidentDetectedChange {
  alertId: string;
}

export interface IncidentChangeMonitorValue {
  alerts: IncidentChangeAlert[];
  acknowledgeAlert: (alertId: string) => void;
  weather: CurrentWeather | null;
  erList: ERRealTimeData[];
  operationalLoading: boolean;
  weatherError: string;
  weatherStaleAt: number | null;
  erError: string;
  erStaleAt: number | null;
  roadDisasters: RoadDisasterResponse | null;
  roadDisasterLoading: boolean;
  roadDisasterError: string;
  roadDisasterStaleAt: number | null;
}

interface IncidentChangeMonitorProviderProps {
  session: IncidentSession;
  city: string;
  enabledWhenIdle?: boolean;
  children: ReactNode;
}

const IncidentChangeMonitorContext = createContext<IncidentChangeMonitorValue | undefined>(
  undefined,
);

function finiteCoordinate(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function monitorContextKey(session: IncidentSession): string {
  if (!session.active || !session.incidentId || !session.location) return '';
  const lat = finiteCoordinate(session.location.lat);
  const lng = finiteCoordinate(session.location.lng);
  if (lat === null || lng === null) return '';
  return [
    session.incidentId,
    lat.toFixed(6),
    lng.toFixed(6),
    session.location.regionName || '',
    session.location.districtName || '',
  ].join(':');
}

function alertPriority(left: IncidentChangeAlert, right: IncidentChangeAlert): number {
  const severity =
    Number(right.severity === 'critical') - Number(left.severity === 'critical');
  return severity || right.detectedAt - left.detectedAt || left.alertId.localeCompare(right.alertId);
}

export function IncidentChangeMonitorProvider({
  session,
  city,
  enabledWhenIdle = false,
  children,
}: IncidentChangeMonitorProviderProps) {
  const [alerts, setAlerts] = useState<IncidentChangeAlert[]>([]);
  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [erList, setErList] = useState<ERRealTimeData[]>([]);
  const [operationalLoading, setOperationalLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [weatherStaleAt, setWeatherStaleAt] = useState<number | null>(null);
  const [erError, setErError] = useState('');
  const [erStaleAt, setErStaleAt] = useState<number | null>(null);
  const [roadDisasters, setRoadDisasters] = useState<RoadDisasterResponse | null>(null);
  const [roadDisasterLoading, setRoadDisasterLoading] = useState(false);
  const [roadDisasterError, setRoadDisasterError] = useState('');
  const [roadDisasterStaleAt, setRoadDisasterStaleAt] = useState<number | null>(null);

  const snapshotRef = useRef<IncidentOperationalSnapshot | null>(null);
  const monitorContextRef = useRef('');
  const alertSequenceRef = useRef(0);
  const weatherLastSuccessAtRef = useRef<number | null>(null);
  const erLastSuccessAtRef = useRef<number | null>(null);
  const roadDisastersRef = useRef<RoadDisasterResponse | null>(null);

  const sessionActive = session.active;
  const sessionIncidentId = session.incidentId;
  const incidentLat = finiteCoordinate(session.location?.lat);
  const incidentLng = finiteCoordinate(session.location?.lng);
  const incidentRegionName = session.location?.regionName || '';
  const monitoringContextKey = monitorContextKey(session);
  const shouldLoadOperational = sessionActive || enabledWhenIdle;
  const shouldPoll = Boolean(sessionActive && incidentLat !== null && incidentLng !== null);
  const operationalContextKey = sessionActive
    ? monitoringContextKey || `incident:${sessionIncidentId}:city:${city}`
    : `city:${city}`;

  const advanceMonitoringSnapshot = useCallback((
    expectedContextKey: string,
    incidentId: string,
    observedAt: number,
    patch: Partial<Pick<IncidentOperationalSnapshot, 'roads' | 'er' | 'weather'>>,
  ) => {
    if (
      !expectedContextKey
      || monitorContextRef.current !== expectedContextKey
      || !incidentId
    ) return;

    const previous = snapshotRef.current?.incidentId === incidentId
      ? snapshotRef.current
      : null;
    const current: IncidentOperationalSnapshot = {
      incidentId,
      observedAt,
      roads: previous?.roads,
      er: previous?.er,
      weather: previous?.weather,
      ...patch,
    };
    snapshotRef.current = current;

    const detected = detectIncidentChanges(previous, current);
    if (detected.length === 0) return;
    const surfaced = detected.map((change): IncidentChangeAlert => {
      alertSequenceRef.current += 1;
      return {
        ...change,
        alertId:
          `${change.dedupeKey}:${change.detectedAt}:${alertSequenceRef.current}`,
      };
    });

    setAlerts(existing => [...existing, ...surfaced].sort(alertPriority));
    surfaced.forEach(change => {
      appendActivityEvent(
        `변화 감지 · ${change.title}: ${change.message}`,
        change.detectedAt,
        incidentId,
      );
    });
  }, []);

  const acknowledgeAlert = useCallback((alertId: string) => {
    setAlerts(existing => existing.filter(alert => alert.alertId !== alertId));
  }, []);

  useEffect(() => {
    monitorContextRef.current = monitoringContextKey;
    snapshotRef.current = null;
    alertSequenceRef.current = 0;
    setAlerts([]);
  }, [monitoringContextKey]);

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    let hasWeather = false;
    let hasErData = false;
    weatherLastSuccessAtRef.current = null;
    erLastSuccessAtRef.current = null;
    setWeather(null);
    setErList([]);
    setWeatherStaleAt(null);
    setErStaleAt(null);
    setWeatherError('');
    setErError('');

    if (!shouldLoadOperational) {
      setOperationalLoading(false);
      return () => {
        alive = false;
      };
    }

    const grid =
      sessionActive && incidentLat !== null && incidentLng !== null
        ? latLngToGrid(incidentLat, incidentLng)
        : (CITY_GRIDS[city] || CITY_GRIDS.seoul);
    const sido =
      sessionActive && incidentRegionName
        ? incidentRegionName
        : (CITY_TO_SIDO[city] || '서울특별시');
    const incidentRegionUnavailable = Boolean(
      sessionActive
      && incidentLat !== null
      && incidentLng !== null
      && !incidentRegionName,
    );

    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      setOperationalLoading(true);
      try {
        const [weatherResult, erResult] = await Promise.allSettled([
          getUltraShortNow(grid.nx, grid.ny),
          incidentRegionUnavailable
            ? Promise.reject(new Error('INCIDENT_REGION_UNAVAILABLE'))
            : getERRealTimeBeds(
              sido,
              '',
              false,
              sessionActive && incidentLat !== null && incidentLng !== null
                ? 'incident-region'
                : 'app-city',
            ),
        ]);
        if (!alive) return;

        const observedAt = Date.now();
        const monitoringPatch: Partial<
          Pick<IncidentOperationalSnapshot, 'er' | 'weather'>
        > = {};
        if (weatherResult.status === 'fulfilled' && weatherResult.value.length > 0) {
          const currentWeather = parseCurrentWeather(weatherResult.value);
          const sourceStaleAt = getStaleAt(weatherResult.value);
          setWeather(currentWeather);
          hasWeather = true;
          setWeatherError('');
          weatherLastSuccessAtRef.current = sourceStaleAt ?? observedAt;
          setWeatherStaleAt(sourceStaleAt);
          if (sourceStaleAt === null && monitoringContextKey) {
            monitoringPatch.weather = {
              state: 'ready',
              value: {
                windSpeed: currentWeather.windSpeed,
                windDirection: currentWeather.windDirection,
                windDirectionDegree: currentWeather.windDirectionDegree,
              },
              source: {
                provider: '기상청 초단기실황',
                retrievedAt: currentWeather.lastUpdate || observedAt,
                staleAt: null,
              },
            };
          }
        } else {
          setWeatherStaleAt(weatherLastSuccessAtRef.current);
          setWeatherError(
            hasWeather
              ? '현장 기상 최신 갱신에 실패해 마지막 성공 정보를 유지합니다.'
              : '현장 기상을 불러오지 못했습니다.',
          );
        }

        if (erResult.status === 'fulfilled') {
          const sourceStaleAt = getStaleAt(erResult.value);
          setErList(erResult.value);
          hasErData = erResult.value.length > 0;
          setErError('');
          erLastSuccessAtRef.current = sourceStaleAt ?? observedAt;
          setErStaleAt(sourceStaleAt);
          if (
            sourceStaleAt === null
            && monitoringContextKey
            && incidentLat !== null
            && incidentLng !== null
          ) {
            const candidates = matchHospitals(erResult.value, {
              origin: { lat: incidentLat, lon: incidentLng },
              limit: Math.max(1, erResult.value.length),
            })
              .filter(hospital => (
                hospital.distanceKm !== null
                && hospital.distanceKm <= 50
              ))
              .map(hospital => ({
                id: hospital.id,
                hpid: hospital.hpid,
                phpid: hospital.phpid,
                name: hospital.name,
                address: hospital.address,
                erBeds: hospital.erBeds,
                distanceKm: hospital.distanceKm,
                eligible: true,
              }));
            monitoringPatch.er = {
              state: 'ready',
              items: candidates,
              source: {
                provider: '국립중앙의료원 응급의료정보',
                retrievedAt: observedAt,
                staleAt: null,
              },
            };
          }
        } else {
          setErStaleAt(erLastSuccessAtRef.current);
          setErError(
            incidentRegionUnavailable
              ? 'GPS 좌표의 행정구역을 확인하지 못해 응급실 후보를 표시하지 않습니다. 주소 검색으로 현장을 다시 연결하거나 119상황실·수용기관에 확인하세요.'
              : hasErData
                ? '응급실 최신 갱신에 실패해 마지막 성공 정보를 현재 후보로 표시하지 않습니다. 119상황실·수용기관에 확인하세요.'
                : '응급실 가용 정보를 불러오지 못했습니다. 119상황실·수용기관에 확인하세요.',
          );
        }

        if (
          monitoringContextKey
          && (monitoringPatch.weather || monitoringPatch.er)
        ) {
          advanceMonitoringSnapshot(
            monitoringContextKey,
            sessionIncidentId,
            observedAt,
            monitoringPatch,
          );
        }
      } finally {
        inFlight = false;
        if (alive) setOperationalLoading(false);
      }
    };

    void refresh();
    const intervalId = shouldPoll
      ? window.setInterval(() => {
        if (document.visibilityState === 'visible') void refresh();
      }, INCIDENT_OPERATIONAL_POLL_MS)
      : null;
    const refreshOnVisible = () => {
      if (shouldPoll && document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', refreshOnVisible);

    return () => {
      alive = false;
      if (intervalId !== null) window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshOnVisible);
    };
  }, [
    advanceMonitoringSnapshot,
    city,
    incidentLat,
    incidentLng,
    incidentRegionName,
    monitoringContextKey,
    operationalContextKey,
    sessionActive,
    sessionIncidentId,
    shouldLoadOperational,
    shouldPoll,
  ]);

  useEffect(() => {
    let alive = true;
    let inFlight = false;
    roadDisastersRef.current = null;
    setRoadDisasters(null);
    setRoadDisasterLoading(false);
    setRoadDisasterError('');
    setRoadDisasterStaleAt(null);

    if (!monitoringContextKey || incidentLat === null || incidentLng === null) {
      return () => {
        alive = false;
      };
    }

    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      setRoadDisasterLoading(true);
      setRoadDisasterError('');
      try {
        const result = await getNearbyRoadDisasters(incidentLat, incidentLng, 5);
        if (!alive) return;
        setRoadDisasters(result.data);
        roadDisastersRef.current = result.data;
        setRoadDisasterStaleAt(result.staleAt);

        if (result.staleAt === null && !result.data.truncated) {
          const monitoredRoads = rankNearbyRoadDisasters(
            result.data.items,
            { lat: incidentLat, lng: incidentLng },
            { radiusKm: 5, limit: result.data.items.length },
          ).map(disaster => ({
            eventId: disaster.eventId,
            eventType: disaster.eventType,
            eventTypeCode: disaster.eventTypeCode,
            eventLabel: disaster.eventLabel,
            roadNames: disaster.roadNames,
            facilityName: disaster.facilityName,
            controlType: disaster.controlType,
            controlLabel: disaster.controlLabel,
            controlRank: disaster.controlRank,
            severityRank: disaster.severityRank,
            isActive: disaster.isActive,
            distanceKm: disaster.distanceKm,
            nearestCoordinate: disaster.nearestCoordinate,
          }));
          advanceMonitoringSnapshot(
            monitoringContextKey,
            sessionIncidentId,
            Date.now(),
            {
              roads: {
                state: 'ready',
                items: monitoredRoads,
                source: {
                  provider: result.data.source,
                  retrievedAt: result.data.retrievedAt,
                  staleAt: null,
                },
              },
            },
          );
        }
      } catch {
        if (!alive) return;
        const previous = roadDisastersRef.current;
        const previousRetrievedAt = previous ? Date.parse(previous.retrievedAt) : Number.NaN;
        if (
          previous
          && Number.isFinite(previousRetrievedAt)
          && Date.now() - previousRetrievedAt <= 10 * 60 * 1000
        ) {
          setRoadDisasters(previous);
          setRoadDisasterStaleAt(previousRetrievedAt);
          setRoadDisasterError('최신 갱신에 실패해 마지막 성공 정보를 유지합니다.');
        } else {
          setRoadDisasters(null);
          roadDisastersRef.current = null;
          setRoadDisasterStaleAt(null);
          setRoadDisasterError('도로 재난·통제 정보를 확인하지 못했습니다.');
        }
      } finally {
        inFlight = false;
        if (alive) setRoadDisasterLoading(false);
      }
    };

    void refresh();
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, INCIDENT_ROAD_POLL_MS);
    const refreshOnVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', refreshOnVisible);

    return () => {
      alive = false;
      window.clearInterval(intervalId);
      document.removeEventListener('visibilitychange', refreshOnVisible);
    };
  }, [
    advanceMonitoringSnapshot,
    incidentLat,
    incidentLng,
    monitoringContextKey,
    sessionIncidentId,
  ]);

  const value = useMemo<IncidentChangeMonitorValue>(() => ({
    alerts,
    acknowledgeAlert,
    weather,
    erList,
    operationalLoading,
    weatherError,
    weatherStaleAt,
    erError,
    erStaleAt,
    roadDisasters,
    roadDisasterLoading,
    roadDisasterError,
    roadDisasterStaleAt,
  }), [
    acknowledgeAlert,
    alerts,
    erError,
    erList,
    erStaleAt,
    operationalLoading,
    roadDisasterError,
    roadDisasterLoading,
    roadDisasterStaleAt,
    roadDisasters,
    weather,
    weatherError,
    weatherStaleAt,
  ]);

  return (
    <IncidentChangeMonitorContext.Provider value={value}>
      {children}
    </IncidentChangeMonitorContext.Provider>
  );
}

export function useIncidentChangeMonitor(): IncidentChangeMonitorValue {
  const context = useContext(IncidentChangeMonitorContext);
  if (!context) {
    throw new Error(
      'useIncidentChangeMonitor must be used within IncidentChangeMonitorProvider',
    );
  }
  return context;
}
