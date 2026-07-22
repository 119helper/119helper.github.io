import { useState, useEffect, useId, type RefObject } from 'react';
import {
  loadNotificationSettings,
  saveNotificationSettings,
  type NotificationSettings,
} from '../services/notificationSettings';
import { SHIFT_CYCLE_DANGBIBI, type ShiftSetting, type ShiftType } from '../utils/shiftCalculator';
import OfflineDataSection from './OfflineDataSection';
import { useUserProfile, FIRE_RANKS, DUTY_ROLES, type UserProfile } from '../contexts/UserProfileContext';
import {
  clearSensitiveStoredData,
  loadPrivacySettings,
  savePrivacySettings,
  type PrivacySettings,
} from '../services/privacySettings';
import {
  APP_LOCK_EVENT,
  APP_LOCK_MIN_CODE_LENGTH,
  clearAppUnlock,
  createAppLockCredential,
  isAppLockConfigured,
  isValidAppLockCode,
  recordAppUnlock,
} from '../services/appLock';
import {
  loadDisplaySettings,
  saveDisplaySettings,
  type DisplaySettings,
} from '../services/displaySettings';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';
import { useAppFeedback } from '../contexts/FeedbackContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  city: string;
  onCityChange: (c: string) => void;
  cityNames: Record<string, string>;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

type SettingsTab = 'profile' | 'general' | 'notification' | 'shift';

// ── 유틸리티 함수 ──
const DEFAULT_SHIFT_SETTING: ShiftSetting = {
  isActive: false,
  baseDate: new Date().toISOString().split('T')[0],
  baseShift: '당직',
};

const isValidShiftSetting = (value: unknown): value is ShiftSetting => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ShiftSetting>;
  return (
    typeof candidate.isActive === 'boolean' &&
    typeof candidate.baseDate === 'string' &&
    candidate.baseShift !== undefined &&
    SHIFT_CYCLE_DANGBIBI.includes(candidate.baseShift)
  );
};

const normalizeRefreshInterval = (value: string) => {
  return ['0', '1', '5', '10'].includes(value) ? value : '5';
};

const parseNumberOr = (value: string, fallback: number) => {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

// ── 토글 스위치 ──
function Toggle({ on, onChange, size = 'md', label }: { on: boolean; onChange: (v: boolean) => void; size?: 'sm' | 'md'; label?: string }) {
  const w = size === 'sm' ? 'w-9 h-5' : 'w-11 h-6';
  const dot = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const pos = size === 'sm' ? (on ? 'left-[18px]' : 'left-[3px]') : (on ? 'left-6' : 'left-1');
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className={`${w} rounded-full transition-colors relative shrink-0 ${on ? 'bg-primary' : 'bg-surface-container-highest'}`}
    >
      <span className={`absolute top-[3px] ${dot} rounded-full transition-all ${pos} ${on ? 'bg-on-primary' : 'bg-on-surface-variant'}`} />
    </button>
  );
}

// ── 알림 항목 행 ──
function AlertRow({ icon, iconColor, label, desc, on, onChange }: {
  icon: string; iconColor: string; label: string; desc?: string; on: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-1.5">
      <div className="flex items-center gap-2.5 min-w-0">
        <span className={`material-symbols-outlined text-base ${iconColor}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium text-on-surface leading-tight">{label}</p>
          {desc && <p className="text-[10px] text-on-surface-variant leading-tight mt-0.5">{desc}</p>}
        </div>
      </div>
      <Toggle label={label} on={on} onChange={onChange} size="sm" />
    </div>
  );
}

// ── 카테고리 헤더 ──
function CategoryHeader({ icon, iconColor, label, masterOn, onMasterChange }: {
  icon: string; iconColor: string; label: string; masterOn: boolean; onMasterChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className={`material-symbols-outlined text-lg ${iconColor}`} style={{ fontVariationSettings: "'FILL' 1" }}>{icon}</span>
        <span className="text-xs font-bold text-on-surface uppercase tracking-wider">{label}</span>
      </div>
      <Toggle label={`${label} 전체`} on={masterOn} onChange={onMasterChange} size="sm" />
    </div>
  );
}

// ══════════════════════════════════════════
// 일반 설정 탭
// ══════════════════════════════════════════
function GeneralTab({ city, onCityChange, cityNames, refreshInterval, setRefreshInterval, ns, updateNs, privacy, setPrivacy, displaySettings, setDisplaySettings, appLockCode, setAppLockCode, onClearUserData, onLockNow }: {
  city: string; onCityChange: (c: string) => void; cityNames: Record<string, string>;
  refreshInterval: string; setRefreshInterval: (v: string) => void;
  ns: NotificationSettings; updateNs: (patch: Partial<NotificationSettings>) => void;
  privacy: PrivacySettings; setPrivacy: (settings: PrivacySettings) => void;
  displaySettings: DisplaySettings; setDisplaySettings: (settings: DisplaySettings) => void;
  appLockCode: string; setAppLockCode: (value: string) => void;
  onClearUserData: () => void;
  onLockNow: () => void;
}) {
  const appLockConfigured = isAppLockConfigured(privacy);

  return (
    <div className="p-5 space-y-5">
      {/* 기본 관심 지역 */}
      <div className="space-y-3">
        <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>location_on</span>
          기본 관심 지역
        </span>
        <select
          aria-label="기본 관심 지역"
          value={city}
          onChange={e => onCityChange(e.target.value)}
          className="w-full bg-surface-container text-on-surface text-sm rounded-xl px-3 py-2.5 border border-outline-variant/20 focus:outline-none focus:border-primary transition-colors"
        >
          {Object.entries(cityNames).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>

      <hr className="border-outline-variant/10" />

      {/* 현장 가독성 */}
      <div className="space-y-3">
        <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
          <span aria-hidden="true" className="material-symbols-outlined text-primary text-lg">visibility</span>
          현장 가독성
        </span>
        <div className="flex items-center justify-between gap-3 rounded-xl bg-surface-container px-3 py-3">
          <div>
            <p className="text-sm font-medium text-on-surface">큰 글씨·큰 터치·화면 켜짐 유지</p>
            <p className="text-[10px] leading-4 text-on-surface-variant">장갑·야외 환경에 맞춰 정보를 확대하고, 활성 출동 중 화면 꺼짐을 방지합니다.</p>
          </div>
          <Toggle
            label="현장 가독성 모드"
            on={displaySettings.fieldReadabilityMode}
            onChange={fieldReadabilityMode => setDisplaySettings({ fieldReadabilityMode })}
          />
        </div>
      </div>

      <hr className="border-outline-variant/10" />

      {/* 관할 지역 오프라인 데이터 */}
      <OfflineDataSection city={city} cityNames={cityNames} />

      <hr className="border-outline-variant/10" />

      {/* 자동 새로고침 */}
      <div className="space-y-3">
        <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-lg">sync</span>
          자동 새로고침
        </span>
        <select
          aria-label="자동 새로고침 주기"
          value={refreshInterval}
          onChange={e => setRefreshInterval(e.target.value)}
          className="w-full bg-surface-container text-on-surface text-sm rounded-xl px-3 py-2.5 border border-outline-variant/20 focus:outline-none focus:border-primary transition-colors"
        >
          <option value="1">1분마다</option>
          <option value="5">5분마다</option>
          <option value="10">10분마다</option>
          <option value="0">수동 갱신</option>
        </select>
      </div>

      <hr className="border-outline-variant/10" />

      {/* 알림 마스터 + 사운드 */}
      <div className="space-y-3">
        <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>notifications</span>
          알림
        </span>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-on-surface">알림 활성화</p>
              <p className="text-[10px] text-on-surface-variant">기상, 대기질, 응급실 등 실시간 알림</p>
            </div>
            <Toggle label="알림 활성화" on={ns.enabled} onChange={v => updateNs({ enabled: v })} />
          </div>
          {ns.enabled && (
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-on-surface">경고음</p>
                <p className="text-[10px] text-on-surface-variant">알림 발생 시 소리 재생</p>
              </div>
              <Toggle label="경고음" on={ns.soundEnabled} onChange={v => updateNs({ soundEnabled: v })} size="sm" />
            </div>
          )}
          {ns.enabled && (
            <p className="text-[10px] text-primary font-medium mt-1 flex items-center gap-1 cursor-default">
              <span className="material-symbols-outlined text-xs">arrow_forward</span>
              세부 알림 설정은 '알림 설정' 탭에서 조정하세요
            </p>
          )}
        </div>
      </div>

      <hr className="border-outline-variant/10" />

      <div className="space-y-3">
        <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
          <span className="material-symbols-outlined text-error text-lg">delete_forever</span>
          기기 저장 데이터 보호
        </span>
        <div className="space-y-2 rounded-xl bg-surface-container px-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-on-surface">공용 기기 모드</p>
              <p className="text-[10px] text-on-surface-variant">메모, 대상물, 사진, GPS 활동기록 등 민감 데이터를 저장하지 않습니다.</p>
            </div>
            <Toggle
              label="공용 기기 모드"
              on={privacy.publicDeviceMode}
              onChange={v => setPrivacy({ ...privacy, publicDeviceMode: v })}
              size="sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="settings-retention-days" className="text-xs font-bold text-on-surface-variant">자동 삭제 기간</label>
            <select
              id="settings-retention-days"
              value={privacy.retentionDays}
              onChange={e => setPrivacy({ ...privacy, retentionDays: parseNumberOr(e.target.value, 30) })}
              disabled={privacy.publicDeviceMode}
              className="w-full bg-surface-container-high text-on-surface text-sm rounded-lg px-3 py-2 border border-outline-variant/20 focus:outline-none focus:border-primary disabled:opacity-50"
            >
              <option value={0}>자동 삭제 안 함</option>
              <option value={1}>1일 보관</option>
              <option value={7}>7일 보관</option>
              <option value={30}>30일 보관</option>
              <option value={90}>90일 보관</option>
            </select>
          </div>
          <div className="border-t border-outline-variant/10 pt-3 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-on-surface">앱 잠금</p>
                <p className="text-[10px] text-on-surface-variant">기기 분실·공유 시 캐주얼 접근을 막습니다.</p>
              </div>
              <Toggle
                label="앱 잠금"
                on={privacy.appLockEnabled}
                onChange={v => setPrivacy({
                  ...privacy,
                  appLockEnabled: v,
                  appLockCodeHash: v ? privacy.appLockCodeHash : null,
                  appLockSalt: v ? privacy.appLockSalt : null,
                })}
                size="sm"
              />
            </div>
            {privacy.appLockEnabled && (
              <div className="space-y-2">
                <input
                  id="settings-app-lock-code"
                  aria-label="앱 잠금 코드"
                  type="password"
                  inputMode="numeric"
                  value={appLockCode}
                  onChange={e => setAppLockCode(e.target.value)}
                  placeholder={appLockConfigured ? '코드 변경 시에만 입력' : `${APP_LOCK_MIN_CODE_LENGTH}자 이상 잠금 코드`}
                  className="w-full bg-surface-container-high text-on-surface text-sm rounded-lg px-3 py-2 border border-outline-variant/20 focus:outline-none focus:border-primary"
                />
                <select
                  aria-label="앱 잠금 시간"
                  value={privacy.appLockTimeoutMinutes}
                  onChange={e => setPrivacy({ ...privacy, appLockTimeoutMinutes: parseNumberOr(e.target.value, 15) })}
                  className="w-full bg-surface-container-high text-on-surface text-sm rounded-lg px-3 py-2 border border-outline-variant/20 focus:outline-none focus:border-primary"
                >
                  <option value={0}>탭 전환 시 잠금</option>
                  <option value={5}>5분 미사용 후 잠금</option>
                  <option value={15}>15분 미사용 후 잠금</option>
                  <option value={30}>30분 미사용 후 잠금</option>
                  <option value={60}>60분 미사용 후 잠금</option>
                </select>
                <button
                  type="button"
                  onClick={onLockNow}
                  disabled={!appLockConfigured}
                  className="w-full rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/15 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  지금 잠금
                </button>
                <p className="text-[10px] leading-4 text-on-surface-variant">
                  잠금 코드는 이 브라우저 저장소에 해시로 보관됩니다. 기기 암호나 OS 보안을 대체하지 않습니다.
                </p>
              </div>
            )}
          </div>
        </div>
        <p className="text-[11px] leading-5 text-on-surface-variant">
          메모, 대상물 정보, 활동 타임라인, 환자 분류, 일정, 최근 검색 기록을 이 기기에서 삭제합니다.
        </p>
        <button
          type="button"
          onClick={onClearUserData}
          className="w-full rounded-xl border border-error/30 bg-error/10 px-3 py-2 text-sm font-bold text-error hover:bg-error/15 transition-colors"
        >
          저장 데이터 삭제
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// 알림 설정 탭
// ══════════════════════════════════════════
function NotificationTab({ ns, updateNs }: {
  ns: NotificationSettings; updateNs: (patch: Partial<NotificationSettings>) => void;
}) {
  const updateWeather = (patch: Partial<NotificationSettings['weather']>) =>
    updateNs({ weather: { ...ns.weather, ...patch } });
  const updateAir = (patch: Partial<NotificationSettings['airQuality']>) =>
    updateNs({ airQuality: { ...ns.airQuality, ...patch } });
  const updateEr = (patch: Partial<NotificationSettings['er']>) =>
    updateNs({ er: { ...ns.er, ...patch } });
  const updateWildfire = (patch: Partial<NotificationSettings['wildfire']>) =>
    updateNs({ wildfire: { ...ns.wildfire, ...patch } });
  const updateDisaster = (patch: Partial<NotificationSettings['disaster']>) =>
    updateNs({ disaster: { ...ns.disaster, ...patch } });

  if (!ns.enabled) {
    return (
      <div className="p-10 text-center">
        <span className="material-symbols-outlined text-on-surface-variant/30 text-4xl">notifications_off</span>
        <p className="text-sm text-on-surface-variant mt-3">알림이 비활성화 상태입니다</p>
        <p className="text-[10px] text-on-surface-variant/60 mt-1">'일반' 탭에서 알림을 켜주세요</p>
      </div>
    );
  }

  return (
    <div className="p-5 space-y-4">
      {/* 기상 */}
      <div className="space-y-2">
        <CategoryHeader icon="cloud" iconColor="text-blue-400" label="기상 알림" masterOn={ns.weather.enabled} onMasterChange={v => updateWeather({ enabled: v })} />
        {ns.weather.enabled && (
          <div className="ml-7 space-y-1">
            <AlertRow icon="water_drop" iconColor="text-blue-400" label="비/강수" desc="강수 감지" on={ns.weather.rain} onChange={v => updateWeather({ rain: v })} />
            <AlertRow icon="weather_snowy" iconColor="text-cyan-300" label="폭설" desc="적설 감지" on={ns.weather.snow} onChange={v => updateWeather({ snow: v })} />
            <AlertRow icon="thermostat" iconColor="text-red-400" label="폭염 경고" on={ns.weather.heatwave} onChange={v => updateWeather({ heatwave: v })} />
            {ns.weather.heatwave && (
              <div className="flex items-center gap-2 ml-7 mb-1">
                <span className="text-[10px] text-on-surface-variant">기준:</span>
                <input aria-label="폭염 경고 기준 온도" type="number" value={ns.weather.heatwaveThreshold} min={30} max={45}
                  onChange={e => updateWeather({ heatwaveThreshold: clamp(parseNumberOr(e.target.value, 35), 30, 45) })}
                  className="w-14 text-xs font-mono bg-surface-container border border-outline-variant/20 rounded px-1.5 py-0.5 text-on-surface" />
                <span className="text-[10px] text-on-surface-variant">°C 이상</span>
              </div>
            )}
            <AlertRow icon="ac_unit" iconColor="text-cyan-400" label="한파 경고" on={ns.weather.coldwave} onChange={v => updateWeather({ coldwave: v })} />
            {ns.weather.coldwave && (
              <div className="flex items-center gap-2 ml-7 mb-1">
                <span className="text-[10px] text-on-surface-variant">기준:</span>
                <input aria-label="한파 경고 기준 온도" type="number" value={ns.weather.coldwaveThreshold} min={-30} max={0}
                  onChange={e => updateWeather({ coldwaveThreshold: clamp(parseNumberOr(e.target.value, -10), -30, 0) })}
                  className="w-14 text-xs font-mono bg-surface-container border border-outline-variant/20 rounded px-1.5 py-0.5 text-on-surface" />
                <span className="text-[10px] text-on-surface-variant">°C 이하</span>
              </div>
            )}
            <AlertRow icon="air" iconColor="text-teal-400" label="강풍 경고" on={ns.weather.strongWind} onChange={v => updateWeather({ strongWind: v })} />
            {ns.weather.strongWind && (
              <div className="flex items-center gap-2 ml-7 mb-1">
                <span className="text-[10px] text-on-surface-variant">기준:</span>
                <input aria-label="강풍 경고 기준 풍속" type="number" value={ns.weather.windThreshold} min={5} max={30}
                  onChange={e => updateWeather({ windThreshold: clamp(parseNumberOr(e.target.value, 14), 5, 30) })}
                  className="w-14 text-xs font-mono bg-surface-container border border-outline-variant/20 rounded px-1.5 py-0.5 text-on-surface" />
                <span className="text-[10px] text-on-surface-variant">m/s 이상</span>
              </div>
            )}
          </div>
        )}
      </div>

      <hr className="border-outline-variant/10" />

      {/* 대기질 */}
      <div className="space-y-2">
        <CategoryHeader icon="masks" iconColor="text-yellow-500" label="대기질 알림" masterOn={ns.airQuality.enabled} onMasterChange={v => updateAir({ enabled: v })} />
        {ns.airQuality.enabled && (
          <div className="ml-7 space-y-1">
            <AlertRow icon="blur_on" iconColor="text-yellow-500" label="PM10 나쁨" desc="미세먼지 나쁨 등급 이상" on={ns.airQuality.pm10Bad} onChange={v => updateAir({ pm10Bad: v })} />
            <AlertRow icon="blur_circular" iconColor="text-orange-400" label="PM2.5 나쁨" desc="초미세먼지 나쁨 등급 이상" on={ns.airQuality.pm25Bad} onChange={v => updateAir({ pm25Bad: v })} />
          </div>
        )}
      </div>

      <hr className="border-outline-variant/10" />

      {/* 응급실 */}
      <div className="space-y-2">
        <CategoryHeader icon="local_hospital" iconColor="text-red-400" label="응급실 알림" masterOn={ns.er.enabled} onMasterChange={v => updateEr({ enabled: v })} />
        {ns.er.enabled && (
          <div className="ml-7 space-y-1">
            <AlertRow icon="hotel" iconColor="text-red-400" label="병상 포화" desc="가용 병상 0 감지" on={ns.er.fullCapacity} onChange={v => updateEr({ fullCapacity: v })} />
            <AlertRow icon="warning" iconColor="text-amber-500" label="진료 제한 공지" desc="응급실 진료 중단/제한 알림" on={ns.er.criticalNotice} onChange={v => updateEr({ criticalNotice: v })} />
          </div>
        )}
      </div>

      <hr className="border-outline-variant/10" />

      {/* 산불 */}
      <div className="space-y-2">
        <CategoryHeader icon="local_fire_department" iconColor="text-orange-500" label="산불 알림" masterOn={ns.wildfire.enabled} onMasterChange={v => updateWildfire({ enabled: v })} />
        {ns.wildfire.enabled && (
          <div className="ml-7 space-y-1">
            <AlertRow icon="whatshot" iconColor="text-orange-500" label="신규 산불" desc="내 지역 산불 발생" on={ns.wildfire.newFire} onChange={v => updateWildfire({ newFire: v })} />
            <AlertRow icon="trending_up" iconColor="text-red-500" label="위험등급 변경" desc="높음 이상 위험등급 감지" on={ns.wildfire.levelChange} onChange={v => updateWildfire({ levelChange: v })} />
          </div>
        )}
      </div>

      <hr className="border-outline-variant/10" />

      {/* 재난 문자 */}
      <div className="space-y-2">
        <CategoryHeader icon="crisis_alert" iconColor="text-red-600" label="재난 문자" masterOn={ns.disaster.enabled} onMasterChange={v => updateDisaster({ enabled: v })} />
        {ns.disaster.enabled && (
          <div className="ml-7 space-y-1">
            <AlertRow icon="emergency" iconColor="text-red-600" label="긴급재난문자" desc="지진, 해일, 대규모 사고" on={ns.disaster.emergencyAll} onChange={v => updateDisaster({ emergencyAll: v })} />
            <AlertRow icon="health_and_safety" iconColor="text-amber-500" label="안전안내문자" desc="폭염, 한파, 태풍, 미세먼지" on={ns.disaster.safetyAlert} onChange={v => updateDisaster({ safetyAlert: v })} />
          </div>
        )}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// 교대근무 탭
// ══════════════════════════════════════════
function ShiftTab({ setting, setSetting }: { setting: ShiftSetting; setSetting: (s: ShiftSetting) => void }) {
  return (
    <div className="p-5 space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-lg">calendar_month</span>
          교대근무 스케줄 표시 설정
        </span>
        <Toggle label="교대근무 스케줄 표시" on={setting.isActive} onChange={(v) => setSetting({ ...setting, isActive: v })} size="sm" />
      </div>

      <p className="text-xs text-on-surface-variant">
        활성화 시 <code>(당직-비번-비번)</code> 기준의 복잡한 교대 일정을 달력에 자동으로 표시합니다.
      </p>

      {setting.isActive && (
        <div className="space-y-4 pt-2 border-t border-outline-variant/10">
          <div className="space-y-1.5">
            <label htmlFor="settings-shift-base-date" className="text-sm font-medium text-on-surface block">기준 일자 (아무 날짜나 선택)</label>
            <input 
              id="settings-shift-base-date"
              type="date" 
              value={setting.baseDate}
              onChange={(e) => setSetting({ ...setting, baseDate: e.target.value })}
              className="w-full bg-surface-container text-on-surface text-sm rounded-xl px-3 py-2 border border-outline-variant/20 focus:outline-[2px] focus:outline-primary/50 transition-all font-mono"
            />
          </div>

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium text-on-surface block">해당 기준일의 내 근무 상태</legend>
            <div className="grid grid-cols-3 gap-2">
              {SHIFT_CYCLE_DANGBIBI.map(shift => (
                <button
                  key={shift}
                  type="button"
                  aria-pressed={setting.baseShift === shift}
                  onClick={() => setSetting({ ...setting, baseShift: shift as ShiftType })}
                  className={`py-2 rounded-xl text-sm font-bold border transition-colors ${
                    setting.baseShift === shift 
                      ? 'bg-primary/10 border-primary text-primary' 
                      : 'bg-surface-container border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'
                  }`}
                >
                  {shift}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-on-surface-variant pt-1 text-center">선택하신 기준일에 해당하는 근무조를 눌러주세요.</p>
          </fieldset>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════
// 내 정보 탭
// ══════════════════════════════════════════
function ProfileTab({ draft, setDraft }: { draft: UserProfile; setDraft: (p: UserProfile) => void }) {
  const set = <K extends keyof UserProfile>(key: K, value: UserProfile[K]) => setDraft({ ...draft, [key]: value });
  const fieldCls =
    'w-full bg-surface-container text-on-surface text-sm rounded-xl px-3 py-2.5 border border-outline-variant/20 focus:outline-none focus:border-primary transition-colors';

  return (
    <div className="p-5 space-y-4">
      <p className="text-[11px] text-on-surface-variant flex items-center gap-1.5">
        <span className="material-symbols-outlined text-sm text-primary">lock</span>
        입력 정보는 이 기기에만 저장되며 외부로 전송되지 않습니다.
      </p>

      <div className="space-y-1.5">
        <label htmlFor="settings-profile-name" className="text-sm font-medium text-on-surface block">이름</label>
        <input id="settings-profile-name" type="text" value={draft.name} onChange={e => set('name', e.target.value)} placeholder="예: 홍길동" className={fieldCls} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="settings-profile-rank" className="text-sm font-medium text-on-surface block">계급</label>
          <select id="settings-profile-rank" value={draft.rank} onChange={e => set('rank', e.target.value)} className={fieldCls}>
            <option value="">선택 안 함</option>
            {FIRE_RANKS.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="settings-profile-team" className="text-sm font-medium text-on-surface block">근무팀/반 <span className="text-on-surface-variant font-normal">(선택)</span></label>
          <input id="settings-profile-team" type="text" value={draft.team} onChange={e => set('team', e.target.value)} placeholder="예: 1팀" className={fieldCls} />
        </div>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="settings-profile-station" className="text-sm font-medium text-on-surface block">소속</label>
        <input id="settings-profile-station" type="text" value={draft.station} onChange={e => set('station', e.target.value)} placeholder="예: ○○소방서 ○○119안전센터" className={fieldCls} />
      </div>

      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium text-on-surface block">주임무 <span className="text-on-surface-variant font-normal">(활동 보고서 기본값에 사용)</span></legend>
        <div className="grid grid-cols-3 gap-2">
          {DUTY_ROLES.map(r => (
            <button
              key={r.id}
              type="button"
              aria-pressed={draft.role === r.id}
              onClick={() => set('role', draft.role === r.id ? '' : r.id)}
              className={`py-2 rounded-xl text-sm font-bold border transition-colors ${
                draft.role === r.id
                  ? 'bg-primary/10 border-primary text-primary'
                  : 'bg-surface-container border-outline-variant/20 text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <label htmlFor="settings-profile-phone" className="text-sm font-medium text-on-surface block">비상연락 <span className="text-on-surface-variant font-normal">(선택)</span></label>
        <input id="settings-profile-phone" type="tel" value={draft.phone} onChange={e => set('phone', e.target.value)} placeholder="예: 010-0000-0000" className={fieldCls} />
      </div>
    </div>
  );
}

// ══════════════════════════════════════════
// 메인 SettingsModal
// ══════════════════════════════════════════
export default function SettingsModal({ isOpen, onClose, city, onCityChange, cityNames, returnFocusRef }: SettingsModalProps) {
  const { profile, updateProfile } = useUserProfile();
  const { confirmAction, showNotice } = useAppFeedback();
  const [tab, setTab] = useState<SettingsTab>('profile');
  const [draftCity, setDraftCity] = useState(city);
  const [draftProfile, setDraftProfile] = useState<UserProfile>(profile);
  const [refreshInterval, setRefreshInterval] = useState('5');
  const [ns, setNs] = useState<NotificationSettings>(loadNotificationSettings());
  const [shiftSetting, setShiftSetting] = useState<ShiftSetting>(DEFAULT_SHIFT_SETTING);
  const [privacy, setPrivacy] = useState<PrivacySettings>(loadPrivacySettings());
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(loadDisplaySettings());
  const [appLockCode, setAppLockCode] = useState('');
  const dialogTitleId = useId();
  const dialogRef = useDialogAccessibility<HTMLDivElement>(isOpen, onClose, returnFocusRef);

  useEffect(() => {
    if (isOpen) {
      setDraftCity(city);
      setDraftProfile(profile);
      setRefreshInterval(normalizeRefreshInterval(localStorage.getItem('119helper-refresh') || '5'));
      setNs(loadNotificationSettings());
      setPrivacy(loadPrivacySettings());
      setDisplaySettings(loadDisplaySettings());
      setAppLockCode('');
      
      try {
        const savedShift = localStorage.getItem('119helper-shift-setting');
        if (savedShift) {
          const parsed = JSON.parse(savedShift);
          setShiftSetting(isValidShiftSetting(parsed) ? parsed : DEFAULT_SHIFT_SETTING);
        } else {
          setShiftSetting(DEFAULT_SHIFT_SETTING);
        }
      } catch {
        setShiftSetting(DEFAULT_SHIFT_SETTING);
      }

      setTab('profile');
    }
  }, [isOpen, city, profile]);

  const updateNs = (patch: Partial<NotificationSettings>) =>
    setNs(prev => ({ ...prev, ...patch }));

  const handleSave = async () => {
    let nextPrivacy = privacy;
    const trimmedLockCode = appLockCode.trim();

    if (nextPrivacy.appLockEnabled) {
      if (trimmedLockCode) {
        if (!isValidAppLockCode(trimmedLockCode)) {
          showNotice({ message: `앱 잠금 코드는 ${APP_LOCK_MIN_CODE_LENGTH}자 이상이어야 합니다.`, tone: 'error' });
          window.requestAnimationFrame(() => document.getElementById('settings-app-lock-code')?.focus());
          return;
        }
        nextPrivacy = {
          ...nextPrivacy,
          ...(await createAppLockCredential(trimmedLockCode)),
        };
      } else if (!isAppLockConfigured(nextPrivacy)) {
        showNotice({ message: `앱 잠금을 켜려면 ${APP_LOCK_MIN_CODE_LENGTH}자 이상 잠금 코드를 입력하세요.`, tone: 'error' });
        window.requestAnimationFrame(() => document.getElementById('settings-app-lock-code')?.focus());
        return;
      }
    } else {
      clearAppUnlock();
      nextPrivacy = {
        ...nextPrivacy,
        appLockCodeHash: null,
        appLockSalt: null,
      };
    }

    onCityChange(draftCity);
    updateProfile(draftProfile);
    saveNotificationSettings(ns);
    savePrivacySettings(nextPrivacy);
    saveDisplaySettings(displaySettings);
    setPrivacy(nextPrivacy);
    setAppLockCode('');
    if (nextPrivacy.appLockEnabled && isAppLockConfigured(nextPrivacy)) {
      recordAppUnlock();
    }
    if (nextPrivacy.publicDeviceMode) {
      await clearSensitiveStoredData();
    }
    localStorage.setItem('119helper-refresh', normalizeRefreshInterval(refreshInterval));
    localStorage.setItem('119helper-sound', ns.soundEnabled.toString());
    localStorage.setItem('119helper-shift-setting', JSON.stringify(shiftSetting));
    window.dispatchEvent(new Event('119helper-settings-updated'));
    onClose();
  };

  const handleClearUserData = async () => {
    const approved = await confirmAction({
      title: '저장 데이터 영구 삭제',
      message: '이 기기에 저장된 현장 데이터를 삭제할까요? 이 작업은 실행 취소할 수 없으며, 삭제 후 앱을 새로고침합니다.',
      details: ['메모와 대상물 정보', '활동 기록과 환자 분류', '일정과 최근 검색 기록'],
      confirmLabel: '영구 삭제',
      tone: 'danger',
    });
    if (!approved) return;
    await clearSensitiveStoredData();
    window.location.reload();
  };

  const handleLockNow = () => {
    if (!isAppLockConfigured(privacy)) return;
    clearAppUnlock();
    window.dispatchEvent(new Event(APP_LOCK_EVENT));
  };

  if (!isOpen) return null;

  const tabs: { id: SettingsTab; icon: string; label: string }[] = [
    { id: 'profile', icon: 'person', label: '내 정보' },
    { id: 'general', icon: 'tune', label: '일반' },
    { id: 'shift', icon: 'calendar_month', label: '내 근무' },
    { id: 'notification', icon: 'notifications', label: '알림' },
  ];

  return (
    <>
      {/* 모바일 배경 (탭하면 닫힘) */}
      <div className="fixed inset-0 bg-black/40 z-40 sm:hidden" onClick={onClose} aria-hidden="true" />
      <div className="fixed inset-x-0 bottom-0 z-50 p-2 sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:top-full sm:mt-2">
        <div
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={dialogTitleId}
          tabIndex={-1}
          className="bg-surface-container-high border border-outline-variant/20 rounded-2xl shadow-xl w-full sm:w-[360px] mx-auto overflow-hidden animate-slide-in-bottom sm:animate-slide-in-top"
        >
        {/* 헤더 */}
        <div className="p-3 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container">
          <h2 id={dialogTitleId} className="text-lg font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">settings</span>
            환경 설정
          </h2>
          <button type="button" onClick={onClose} aria-label="설정 닫기" className="p-1 rounded-lg hover:bg-surface-container-high transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        {/* 탭 바 */}
        <div className="flex border-b border-outline-variant/10 bg-surface-container/50">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2.5 text-xs font-bold flex items-center justify-center gap-1.5 transition-all border-b-2 ${
                tab === t.id
                  ? 'text-primary border-primary bg-primary/5'
                  : 'text-on-surface-variant border-transparent hover:bg-surface-container-highest'
              }`}
            >
              <span className="material-symbols-outlined text-sm" style={tab === t.id ? { fontVariationSettings: "'FILL' 1" } : {}}>{t.icon}</span>
              {t.label}
            </button>
          ))}
        </div>

        {/* 탭 콘텐츠 (스크롤) */}
        <div className="max-h-[55vh] overflow-y-auto custom-scrollbar">
          {tab === 'profile' && (
            <ProfileTab draft={draftProfile} setDraft={setDraftProfile} />
          )}
          {tab === 'general' && (
            <GeneralTab
              city={draftCity} onCityChange={setDraftCity} cityNames={cityNames}
              refreshInterval={refreshInterval} setRefreshInterval={setRefreshInterval}
              ns={ns} updateNs={updateNs}
              privacy={privacy} setPrivacy={setPrivacy}
              displaySettings={displaySettings} setDisplaySettings={setDisplaySettings}
              appLockCode={appLockCode} setAppLockCode={setAppLockCode}
              onClearUserData={handleClearUserData}
              onLockNow={handleLockNow}
            />
          )}
          {tab === 'shift' && (
            <ShiftTab setting={shiftSetting} setSetting={setShiftSetting} />
          )}
          {tab === 'notification' && (
            <NotificationTab ns={ns} updateNs={updateNs} />
          )}
        </div>

        {/* 하단바 */}
        <div className="p-3 border-t border-outline-variant/20 bg-surface-container-low flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-colors">
            취소
          </button>
          <button type="button" onClick={handleSave} className="px-4 py-2 text-sm font-bold bg-primary text-on-primary hover:bg-primary/90 rounded-xl shadow-lg shadow-primary/20 transition-all cursor-pointer">
            저장하기
          </button>
        </div>
        </div>
      </div>
    </>
  );
}
