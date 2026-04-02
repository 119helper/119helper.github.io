import { useState, useEffect, useRef } from 'react';
import HazmatCalc from './HazmatCalc';

interface CalcResult {
  label: string;
  value: string;
  unit: string;
}

function WaterPressureCalc() {
  const [floors, setFloors] = useState('');
  const [results, setResults] = useState<CalcResult[]>([]);

  const calculate = () => {
    const f = parseInt(floors);
    if (isNaN(f) || f < 1) return;
    const floorHeight = 3; // 층고 평균 3m
    const realHead = f * floorHeight; // 실양정 (m)
    const frictionLoss = realHead * 0.15; // 배관 마찰손실 (실양정의 약 15%)
    const nozzlePressureM = 35; // mH2O (0.35MPa = 35m)
    const safety = (realHead + frictionLoss + nozzlePressureM) * 0.1;
    const totalHead = realHead + frictionLoss + nozzlePressureM + safety; // 총 양정 (m)
    const totalPressureMPa = (totalHead * 0.00981).toFixed(2); // MPa로 변환
    const totalPressureKgf = (totalHead * 0.1).toFixed(1); // kgf/cm²

    setResults([
      { label: '실양정 (건물 높이)', value: realHead.toFixed(1), unit: 'm' },
      { label: '배관 마찰손실', value: frictionLoss.toFixed(1), unit: 'm' },
      { label: '방수압력 (노즐)', value: nozzlePressureM.toFixed(1), unit: 'm (0.35MPa)' },
      { label: '안전율 (10%)', value: safety.toFixed(1), unit: 'm' },
      { label: '필요 총 양정', value: totalHead.toFixed(1), unit: 'm' },
      { label: '필요 송수압력', value: totalPressureMPa, unit: 'MPa' },
      { label: '필요 송수압력', value: totalPressureKgf, unit: 'kgf/cm²' },
    ]);
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
      <div className="flex gap-3">
        <input
          type="number"
          min="1"
          max="200"
          value={floors}
          onChange={(e) => setFloors(e.target.value)}
          placeholder="건물 층수 입력"
          className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button onClick={calculate} className="bg-primary text-on-primary px-6 py-3 rounded-lg font-bold hover:bg-primary/80 transition-colors">
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
    const d = parseFloat(distance) || 0;
    const f = parseInt(floors) || 0;
    const hoseLength = 20; // 소방호스 1본 = 20m
    const floorHeight = 3;
    const verticalDist = f * floorHeight;
    const totalDist = d + verticalDist;
    const hoseCount = Math.ceil(totalDist / hoseLength);
    const reserve = Math.ceil(hoseCount * 0.2); // 예비 20%

    setResults([
      { label: '수평 거리', value: d.toFixed(0), unit: 'm' },
      { label: '수직 거리 (층 × 3m)', value: verticalDist.toFixed(0), unit: 'm' },
      { label: '총 호스 전개 거리', value: totalDist.toFixed(0), unit: 'm' },
      { label: '필요 호스 본수 (20m/본)', value: hoseCount.toString(), unit: '본' },
      { label: '예비 호스 (20%)', value: reserve.toString(), unit: '본' },
      { label: '총 필요 호스', value: (hoseCount + reserve).toString(), unit: '본' },
    ]);
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
      <div className="flex gap-3">
        <input
          type="number"
          min="0"
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
          placeholder="수평 거리 (m)"
          className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <input
          type="number"
          min="0"
          value={floors}
          onChange={(e) => setFloors(e.target.value)}
          placeholder="건물 층수"
          className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
        />
        <button onClick={calculate} className="bg-secondary text-on-secondary px-6 py-3 rounded-lg font-bold hover:bg-secondary/80 transition-colors">
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
    const p = parseFloat(pressure);
    if (isNaN(p) || p <= 0) return;
    // 공기호흡기: 약 6.8L 용기, 40L/분 평균 소비량 기준
    // 사용가능시간(분) = (용기 용량 × 충전압력) / 소비량
    // 간이 계산: 300bar 충전 기준 약 30분
    const minutes = Math.floor((p / 300) * 30);
    const seconds = minutes * 60;
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

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
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
        </div>
      </div>

      {!isRunning && timeLeft === 0 ? (
        <div className="flex gap-3">
          <input
            type="number"
            min="1"
            max="300"
            value={pressure}
            onChange={(e) => setPressure(e.target.value)}
            placeholder="충전 압력 (bar, 최대 300)"
            className="flex-1 bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
          <button onClick={startTimer} className="bg-tertiary text-on-tertiary px-6 py-3 rounded-lg font-bold hover:bg-tertiary/80 transition-colors">
            시작
          </button>
        </div>
      ) : (
        <div className="text-center space-y-4">
          <div className={`text-6xl font-mono font-extrabold ${isWarning ? 'text-error animate-pulse' : 'text-on-surface'}`}>
            {formatTime(timeLeft)}
          </div>
          <div className="w-full bg-surface-container h-3 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${isWarning ? 'bg-error' : 'bg-tertiary'}`}
              style={{ width: `${percentage}%` }}
            />
          </div>
          {isWarning && (
            <p className="text-error font-bold text-sm animate-pulse">⚠️ 잔압 부족! 즉시 철수하세요!</p>
          )}
          <button onClick={stopTimer} className="bg-error text-on-error px-6 py-3 rounded-lg font-bold hover:bg-error/80 transition-colors">
            정지 / 리셋
          </button>
        </div>
      )}
    </div>
  );
}

export default function Calculators() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-on-surface font-headline">🧮 소방 계산기</h2>
        <p className="text-sm text-on-surface-variant mt-1">현장 활동에 필요한 계산 도구</p>
      </div>
      <HazmatCalc />
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <WaterPressureCalc />
        <HoseLengthCalc />
      </div>
      <AirTankTimer />
    </div>
  );
}
