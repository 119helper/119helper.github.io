import { useState, useEffect } from 'react';
import {
  loadNotificationSettings,
  saveNotificationSettings,
  type NotificationSettings,
} from '../services/notificationSettings';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  city: string;
  onCityChange: (c: string) => void;
  cityNames: Record<string, string>;
}

// ── 토글 스위치 컴포넌트 ──
function Toggle({ on, onChange, size = 'md' }: { on: boolean; onChange: (v: boolean) => void; size?: 'sm' | 'md' }) {
  const w = size === 'sm' ? 'w-9 h-5' : 'w-11 h-6';
  const dot = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const pos = size === 'sm' ? (on ? 'left-[18px]' : 'left-[3px]') : (on ? 'left-6' : 'left-1');
  return (
    <button
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
      <Toggle on={on} onChange={onChange} size="sm" />
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
      <Toggle on={masterOn} onChange={onMasterChange} size="sm" />
    </div>
  );
}

export default function SettingsModal({ isOpen, onClose, city, onCityChange, cityNames }: SettingsModalProps) {
  const [refreshInterval, setRefreshInterval] = useState('5');
  const [ns, setNs] = useState<NotificationSettings>(loadNotificationSettings());

  useEffect(() => {
    if (isOpen) {
      setRefreshInterval(localStorage.getItem('119helper-refresh') || '5');
      setNs(loadNotificationSettings());
    }
  }, [isOpen]);

  // 헬퍼: 깊은 업데이트
  const update = <K extends keyof NotificationSettings>(
    key: K,
    val: NotificationSettings[K]
  ) => setNs(prev => ({ ...prev, [key]: val }));

  const updateWeather = (patch: Partial<NotificationSettings['weather']>) =>
    update('weather', { ...ns.weather, ...patch });
  const updateAir = (patch: Partial<NotificationSettings['airQuality']>) =>
    update('airQuality', { ...ns.airQuality, ...patch });
  const updateEr = (patch: Partial<NotificationSettings['er']>) =>
    update('er', { ...ns.er, ...patch });
  const updateWildfire = (patch: Partial<NotificationSettings['wildfire']>) =>
    update('wildfire', { ...ns.wildfire, ...patch });
  const updateDisaster = (patch: Partial<NotificationSettings['disaster']>) =>
    update('disaster', { ...ns.disaster, ...patch });

  const handleSave = () => {
    saveNotificationSettings(ns);
    localStorage.setItem('119helper-refresh', refreshInterval);
    localStorage.setItem('119helper-sound', ns.soundEnabled.toString());
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="absolute right-0 top-full mt-2 z-50 p-2">
      <div className="bg-surface-container-high border border-outline-variant/20 rounded-2xl shadow-xl w-[360px] overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150">
        {/* 헤더 */}
        <div className="p-3 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container">
          <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">settings</span>
            환경 설정
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container-high transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>

        {/* 본문 (스크롤) */}
        <div className="max-h-[70vh] overflow-y-auto custom-scrollbar">
          <div className="p-5 space-y-5">

            {/* ── 알림 마스터 + 사운드 ── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary text-lg" style={{ fontVariationSettings: "'FILL' 1" }}>notifications_active</span>
                  <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">알림 시스템</span>
                </div>
                <Toggle on={ns.enabled} onChange={v => update('enabled', v)} />
              </div>

              {ns.enabled && (
                <div className="ml-7">
                  <AlertRow
                    icon="volume_up" iconColor="text-primary"
                    label="경고음" desc="알림 발생 시 소리 재생"
                    on={ns.soundEnabled} onChange={v => update('soundEnabled', v)}
                  />
                </div>
              )}
            </div>

            {ns.enabled && (
              <>
                <hr className="border-outline-variant/10" />

                {/* ── 기상 알림 ── */}
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
                          <input
                            type="number" value={ns.weather.heatwaveThreshold} min={30} max={45}
                            onChange={e => updateWeather({ heatwaveThreshold: parseInt(e.target.value) || 35 })}
                            className="w-14 text-xs font-mono bg-surface-container border border-outline-variant/20 rounded px-1.5 py-0.5 text-on-surface"
                          />
                          <span className="text-[10px] text-on-surface-variant">°C 이상</span>
                        </div>
                      )}
                      <AlertRow icon="ac_unit" iconColor="text-cyan-400" label="한파 경고" on={ns.weather.coldwave} onChange={v => updateWeather({ coldwave: v })} />
                      {ns.weather.coldwave && (
                        <div className="flex items-center gap-2 ml-7 mb-1">
                          <span className="text-[10px] text-on-surface-variant">기준:</span>
                          <input
                            type="number" value={ns.weather.coldwaveThreshold} min={-30} max={0}
                            onChange={e => updateWeather({ coldwaveThreshold: parseInt(e.target.value) || -10 })}
                            className="w-14 text-xs font-mono bg-surface-container border border-outline-variant/20 rounded px-1.5 py-0.5 text-on-surface"
                          />
                          <span className="text-[10px] text-on-surface-variant">°C 이하</span>
                        </div>
                      )}
                      <AlertRow icon="air" iconColor="text-teal-400" label="강풍 경고" on={ns.weather.strongWind} onChange={v => updateWeather({ strongWind: v })} />
                      {ns.weather.strongWind && (
                        <div className="flex items-center gap-2 ml-7 mb-1">
                          <span className="text-[10px] text-on-surface-variant">기준:</span>
                          <input
                            type="number" value={ns.weather.windThreshold} min={5} max={30}
                            onChange={e => updateWeather({ windThreshold: parseInt(e.target.value) || 14 })}
                            className="w-14 text-xs font-mono bg-surface-container border border-outline-variant/20 rounded px-1.5 py-0.5 text-on-surface"
                          />
                          <span className="text-[10px] text-on-surface-variant">m/s 이상</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <hr className="border-outline-variant/10" />

                {/* ── 대기질 알림 ── */}
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

                {/* ── 응급실 알림 ── */}
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

                {/* ── 산불 알림 ── */}
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

                {/* ── 재난 문자 ── */}
                <div className="space-y-2">
                  <CategoryHeader icon="crisis_alert" iconColor="text-red-600" label="재난 문자" masterOn={ns.disaster.enabled} onMasterChange={v => updateDisaster({ enabled: v })} />
                  {ns.disaster.enabled && (
                    <div className="ml-7 space-y-1">
                      <AlertRow icon="emergency" iconColor="text-red-600" label="긴급재난문자" desc="지진, 해일, 대규모 사고" on={ns.disaster.emergencyAll} onChange={v => updateDisaster({ emergencyAll: v })} />
                      <AlertRow icon="health_and_safety" iconColor="text-amber-500" label="안전안내문자" desc="폭염, 한파, 태풍, 미세먼지" on={ns.disaster.safetyAlert} onChange={v => updateDisaster({ safetyAlert: v })} />
                    </div>
                  )}
                </div>
              </>
            )}

            <hr className="border-outline-variant/10" />

            {/* ── 데이터 설정 ── */}
            <div className="space-y-3">
              <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider flex items-center gap-2">
                <span className="material-symbols-outlined text-primary text-lg">database</span>
                데이터 설정
              </span>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-on-surface">자동 새로고침</p>
                    <p className="text-[10px] text-on-surface-variant">데이터 갱신 주기</p>
                  </div>
                  <select
                    value={refreshInterval}
                    onChange={e => setRefreshInterval(e.target.value)}
                    className="bg-surface-container text-on-surface text-sm rounded-lg px-2 py-1.5 border border-outline-variant/20 focus:outline-none focus:border-primary"
                  >
                    <option value="1">1분마다</option>
                    <option value="5">5분마다</option>
                    <option value="10">10분마다</option>
                    <option value="0">수동 갱신</option>
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-on-surface">기본 관심 지역</p>
                    <p className="text-[10px] text-on-surface-variant">접속 시 최초 로딩 지역</p>
                  </div>
                  <select
                    value={city}
                    onChange={e => onCityChange(e.target.value)}
                    className="bg-surface-container text-on-surface text-sm rounded-lg px-2 py-1.5 border border-outline-variant/20 focus:outline-none focus:border-primary"
                  >
                    {Object.entries(cityNames).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 하단바 */}
        <div className="p-3 border-t border-outline-variant/20 bg-surface-container-low flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-2 text-sm font-bold bg-primary text-on-primary hover:bg-primary/90 rounded-xl shadow-lg shadow-primary/20 transition-all cursor-pointer"
          >
            저장하기
          </button>
        </div>
      </div>
    </div>
  );
}
