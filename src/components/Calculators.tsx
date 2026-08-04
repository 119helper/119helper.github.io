import { useState, useEffect, useRef } from 'react';
import OvertimeCalc from './OvertimeCalc';
import HazmatCalc from './HazmatCalc';
import UnitConverter from './UnitConverter';
import ResponsiveTabs from './ResponsiveTabs';
import {
  calculateAirTankSeconds,
  calculateHoseDeployment,
  calculateWaterPressure,
  formatHoseDeploymentResults,
  formatTimerSeconds,
  formatWaterPressureResults,
  type CalcResult,
} from '../utils/fieldCalculations';

function WaterPressureCalc() {
  const [floors, setFloors] = useState('');
  const [results, setResults] = useState<CalcResult[]>([]);

  const calculate = () => {
    const f = Number(floors);
    const calc = calculateWaterPressure(f);
    if (!calc) return;

    setResults(formatWaterPressureResults(calc));
  };

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-primary/10 rounded-lg">
          <span className="material-symbols-outlined text-primary text-2xl">water_drop</span>
        </div>
        <div>
          <h3 className="text-lg font-bold text-on-surface">송수압력 계산기</h3>
          <p className="text-xs text-on-surface-variant">층수 입력 → 필요 송수압력 자동 계산</p>
        </div>
      </div>
      <img
        src="/images/tools/diagram_water_pressure.svg"
        alt="펌프에서 건물 상층 관창까지 이어지는 송수압력 구조"
        className="h-36 w-full rounded-lg border border-outline-variant/10 object-cover"
      />
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
        <input
          aria-label="건물 층수"
          type="number"
          min="1"
          max="200"
          value={floors}
          onChange={(e) => {
            setFloors(e.target.value);
            setResults([]);
          }}
          placeholder="건물 층수 입력"
          className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button type="button" onClick={calculate} className="bg-primary text-on-primary px-6 py-3 rounded-lg font-bold hover:bg-primary/80 transition-colors">
          계산
        </button>
      </div>
      {results.length > 0 && (
        <div className="bg-surface-container rounded-lg p-4 space-y-2 mt-4">
          {results.map((r, i) => (
            <div key={i} className={`flex justify-between items-center py-2 ${i === results.length - 1 || i === results.length - 2 ? 'border-t border-outline-variant/20 font-bold text-primary' : ''}`}>
              <span className="text-sm text-on-surface-variant">{r.label}</span>
              <span className="text-sm text-on-surface font-mono">{r.value} <span className="text-on-surface-variant text-xs">{r.unit}</span></span>
            </div>
          ))}
          <p className="text-[11px] text-on-surface-variant mt-3">※ 평균 층고 3m, 마찰손실 15%, 노즐 방수압력 0.35MPa 기준의 간이 계산입니다.</p>
        </div>
      )}
    </div>
  );
}

function HoseLengthCalc() {
  const [distance, setDistance] = useState('');
  const [floors, setFloors] = useState('');
  const [results, setResults] = useState<CalcResult[]>([]);

  const calculate = () => {
    const d = Number(distance);
    const f = Number(floors);
    const calc = calculateHoseDeployment(d, f);
    if (!calc) return;

    setResults(formatHoseDeploymentResults(calc));
  };

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-secondary/10 rounded-lg">
          <span className="material-symbols-outlined text-secondary text-2xl">straighten</span>
        </div>
        <div>
          <h3 className="text-lg font-bold text-on-surface">호스 전개 계산기</h3>
          <p className="text-xs text-on-surface-variant">거리·층수 입력 → 필요 호스 본수 계산</p>
        </div>
      </div>
      <img
        src="/images/tools/diagram_hose_deployment.svg"
        alt="소방차에서 건물 상층까지 이어지는 호스 전개 경로"
        className="h-36 w-full rounded-lg border border-outline-variant/10 object-cover"
      />
      <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-3">
        <input
          aria-label="수평 거리"
          type="number"
          min="0"
          value={distance}
          onChange={(e) => { setDistance(e.target.value); setResults([]); }}
          placeholder="수평 거리 (m)"
          className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          aria-label="건물 층수"
          type="number"
          min="0"
          value={floors}
          onChange={(e) => { setFloors(e.target.value); setResults([]); }}
          placeholder="건물 층수"
          className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button type="button" onClick={calculate} className="bg-secondary text-on-secondary px-6 py-3 rounded-lg font-bold hover:bg-secondary/80 transition-colors sm:w-auto">
          계산
        </button>
      </div>
      {results.length > 0 && (
        <div className="bg-surface-container rounded-lg p-4 space-y-2">
          {results.map((r, i) => (
            <div key={i} className={`flex justify-between items-center py-2 ${i >= results.length - 1 ? 'border-t border-outline-variant/20 font-bold text-secondary' : ''}`}>
              <span className="text-sm text-on-surface-variant">{r.label}</span>
              <span className="text-sm text-on-surface font-mono">{r.value} <span className="text-on-surface-variant text-xs">{r.unit}</span></span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function AirTankTimer() {
  const [pressure, setPressure] = useState('');
  const [isRunning, setIsRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(0);
  const [totalTime, setTotalTime] = useState(0);
  const startTimeRef = useRef<number>(0);

  const startTimer = () => {
    const p = Number(pressure);
    const seconds = calculateAirTankSeconds(p);
    if (!seconds) return;
    setTotalTime(seconds);
    setTimeLeft(seconds);
    startTimeRef.current = Date.now();
    setIsRunning(true);
  };

  // Timer effect — Date.now() 기반으로 백그라운드 탭에서도 정확
  useEffect(() => {
    if (!isRunning || totalTime <= 0) return;
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = Math.max(totalTime - elapsed, 0);
      setTimeLeft(remaining);
      if (remaining <= 0) {
        setIsRunning(false);
      }
    }, 250); // 250ms 간격으로 더 자주 체크하여 정확도 향상
    return () => clearInterval(interval);
  }, [isRunning, totalTime]);

  const stopTimer = () => {
    setIsRunning(false);
    setTimeLeft(0);
  };

  const percentage = totalTime > 0 ? (timeLeft / totalTime) * 100 : 0;
  const isWarning = percentage < 25;

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-6 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <div className="p-2 bg-tertiary/10 rounded-lg">
          <span className="material-symbols-outlined text-tertiary text-2xl">timer</span>
        </div>
        <div>
          <h3 className="text-lg font-bold text-on-surface">공기호흡기 타이머</h3>
          <p className="text-xs text-on-surface-variant">충전 압력 입력 → 잔여 시간 카운트다운</p>
          <p className="text-[11px] text-on-surface-variant leading-relaxed mt-1">※ 간이 참고용 타이머입니다. 실제 철수 판단은 장비 경보, 잔압 기준, 현장 지휘 지침을 우선하세요.</p>
        </div>
      </div>
      <img
        src="/images/tools/diagram_air_tank.svg"
        alt="공기호흡기 용기와 압력계 안전 구간"
        className="h-40 w-full rounded-lg border border-outline-variant/10 object-cover"
      />

      {!isRunning && timeLeft === 0 ? (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
          <input
            aria-label="공기호흡기 충전 압력"
            type="number"
            min="1"
            max="300"
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
            placeholder="충전 압력 (bar, 최대 300)"
            className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button type="button" onClick={startTimer} className="bg-tertiary text-on-tertiary px-6 py-3 rounded-lg font-bold hover:bg-tertiary/80 transition-colors">
            시작
          </button>
        </div>
      ) : (
        <div className="text-center space-y-4">
          <div className={`text-6xl font-mono font-extrabold ${isWarning ? 'text-error animate-pulse' : 'text-on-surface'}`}>
            {formatTimerSeconds(timeLeft)}
          </div>
          <div className="w-full bg-surface-container h-3 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${isWarning ? 'bg-error' : 'bg-tertiary'}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          {isWarning && (
            <p className="text-error font-bold text-sm animate-pulse">⚠️ 잔여 시간이 부족합니다. 장비 잔압과 지휘 지침을 확인하세요.</p>
          )}
          <button type="button" onClick={stopTimer} className="bg-error text-on-error px-6 py-3 rounded-lg font-bold hover:bg-error/80 transition-colors">
            정지 / 리셋
          </button>
        </div>
      )}
    </div>
  );
}

type CalcTab = 'overtime' | 'field' | 'air_tank' | 'hazmat' | 'unit';
const TABS: { id: CalcTab; label: string; icon: string }[] = [
  { id: 'overtime', label: '초과수당', icon: 'payments' },
  { id: 'field', label: '현장계산', icon: 'water_drop' },
  { id: 'air_tank', label: '공기호흡기', icon: 'timer' },
  { id: 'hazmat', label: '유해화학', icon: 'science' },
  { id: 'unit', label: '단위변환', icon: 'sync_alt' },
];

function calculatorTabForSubId(subId?: string): CalcTab | null {
  if (subId === 'hazmat_calc') return 'hazmat';
  if (subId === 'water_pressure_calc' || subId === 'hose_length_calc') return 'field';
  if (subId === 'air_tank_timer') return 'air_tank';
  if (subId === 'unit_converter') return 'unit';
  return null;
}

interface CalculatorsProps {
  subId?: string;
  preferFieldTools?: boolean;
}

export default function Calculators({ subId, preferFieldTools = false }: CalculatorsProps) {
  const [activeTab, setActiveTab] = useState<CalcTab>(() => (
    calculatorTabForSubId(subId) ?? (preferFieldTools ? 'field' : 'overtime')
  ));

  useEffect(() => {
    setActiveTab(calculatorTabForSubId(subId) ?? (preferFieldTools ? 'field' : 'overtime'));
    if (!subId) return;

    requestAnimationFrame(() => {
      document.getElementById(subId)?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      });
    });
  }, [preferFieldTools, subId]);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div>
        <h2 className="ui-page-title">
          <span className="material-symbols-outlined ui-page-title-icon">calculate</span>
          119 계산기
        </h2>
        <p className="text-sm text-on-surface-variant mt-1">현장 활동 및 행정에 필요한 계산 · 변환 도구 목록</p>
      </div>

      <ResponsiveTabs
        items={TABS}
        activeId={activeTab}
        ariaLabel="계산기 분류"
        onChange={setActiveTab}
      />

      <div className="flex-1 w-full relative">
        {activeTab === 'overtime' && (
          <div className="h-full animate-slide-in-bottom pb-10">
            <OvertimeCalc />
          </div>
        )}
        
        {activeTab === 'field' && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 animate-slide-in-bottom pb-10">
            <div id="water_pressure_calc"><WaterPressureCalc /></div>
            <div id="hose_length_calc"><HoseLengthCalc /></div>
          </div>
        )}

        {activeTab === 'air_tank' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-slide-in-bottom pb-10">
            <div id="air_tank_timer"><AirTankTimer /></div>
          </div>
        )}

        {activeTab === 'hazmat' && (
          <div id="hazmat_calc" className="animate-slide-in-bottom pb-10">
            <HazmatCalc />
          </div>
        )}

        {activeTab === 'unit' && (
          <div id="unit_converter" className="animate-slide-in-bottom pb-10">
            <UnitConverter />
          </div>
        )}
      </div>
    </div>
  );
}
