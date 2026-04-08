/**
 * 알림 설정 관리 모듈
 *
 * localStorage 기반으로 세부 알림 항목별 on/off 및 임계값을 관리합니다.
 */

export interface NotificationSettings {
  // 전체 마스터 스위치
  enabled: boolean;
  // 소리/진동
  soundEnabled: boolean;

  // ── 기상 알림 ──
  weather: {
    enabled: boolean;
    rain: boolean;           // 강수 감지
    snow: boolean;           // 폭설
    heatwave: boolean;       // 폭염 (기본 35°C)
    heatwaveThreshold: number;
    coldwave: boolean;       // 한파 (기본 -10°C)
    coldwaveThreshold: number;
    strongWind: boolean;     // 강풍 (기본 14m/s)
    windThreshold: number;
  };

  // ── 대기질 알림 ──
  airQuality: {
    enabled: boolean;
    pm10Bad: boolean;        // PM10 나쁨 이상
    pm25Bad: boolean;        // PM2.5 나쁨 이상
  };

  // ── 응급실 알림 ──
  er: {
    enabled: boolean;
    fullCapacity: boolean;   // 가용 병상 0 되었을 때
    criticalNotice: boolean; // 진료 제한/중단 공지
  };

  // ── 산불 알림 ──
  wildfire: {
    enabled: boolean;
    newFire: boolean;        // 신규 산불 발생
    levelChange: boolean;    // 산불 위험등급 변경 (높음 이상)
  };

  // ── 재난 문자 ──
  disaster: {
    enabled: boolean;
    emergencyAll: boolean;   // 긴급재난문자 (지진, 해일 등)
    safetyAlert: boolean;    // 안전안내문자
  };
}

const STORAGE_KEY = '119helper-noti-settings';

export const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: true,
  soundEnabled: false,
  weather: {
    enabled: true,
    rain: true,
    snow: true,
    heatwave: true,
    heatwaveThreshold: 35,
    coldwave: true,
    coldwaveThreshold: -10,
    strongWind: true,
    windThreshold: 14,
  },
  airQuality: {
    enabled: true,
    pm10Bad: true,
    pm25Bad: true,
  },
  er: {
    enabled: true,
    fullCapacity: true,
    criticalNotice: true,
  },
  wildfire: {
    enabled: true,
    newFire: true,
    levelChange: true,
  },
  disaster: {
    enabled: true,
    emergencyAll: true,
    safetyAlert: true,
  },
};

/** 설정 로드 (localStorage → 기본값 merge) */
export function loadNotificationSettings(): NotificationSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    // deep merge with defaults to handle new fields in updates
    return deepMerge(DEFAULT_SETTINGS, parsed) as NotificationSettings;
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

/** 설정 저장 */
export function saveNotificationSettings(settings: NotificationSettings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** 간단한 deep merge */
function deepMerge(defaults: any, overrides: any): any {
  const result = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (key in overrides) {
      if (
        typeof defaults[key] === 'object' &&
        defaults[key] !== null &&
        !Array.isArray(defaults[key])
      ) {
        result[key] = deepMerge(defaults[key], overrides[key]);
      } else {
        result[key] = overrides[key];
      }
    }
  }
  return result;
}
