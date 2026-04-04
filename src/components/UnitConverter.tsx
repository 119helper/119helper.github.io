import { useState } from 'react';

interface ConversionGroup {
  id: string;
  title: string;
  icon: string;
  color: string;
  units: { id: string; label: string; toBase: (v: number) => number; fromBase: (v: number) => number }[];
}

const GROUPS: ConversionGroup[] = [
  {
    id: 'pressure', title: '수압', icon: 'speed', color: 'text-blue-400',
    units: [
      { id: 'mpa', label: 'MPa', toBase: v => v, fromBase: v => v },
      { id: 'bar', label: 'bar', toBase: v => v * 0.1, fromBase: v => v / 0.1 },
      { id: 'psi', label: 'psi', toBase: v => v * 0.00689476, fromBase: v => v / 0.00689476 },
      { id: 'kgcm2', label: 'kgf/cm²', toBase: v => v * 0.0980665, fromBase: v => v / 0.0980665 },
      { id: 'atm', label: 'atm', toBase: v => v * 0.101325, fromBase: v => v / 0.101325 },
    ]
  },
  {
    id: 'flow', title: '방수량', icon: 'water_drop', color: 'text-cyan-400',
    units: [
      { id: 'lpm', label: 'LPM (L/min)', toBase: v => v, fromBase: v => v },
      { id: 'gpm', label: 'GPM (gal/min)', toBase: v => v * 3.78541, fromBase: v => v / 3.78541 },
      { id: 'cms', label: 'm³/s', toBase: v => v * 60000, fromBase: v => v / 60000 },
      { id: 'lps', label: 'L/s', toBase: v => v * 60, fromBase: v => v / 60 },
    ]
  },
  {
    id: 'length', title: '거리/높이', icon: 'straighten', color: 'text-green-400',
    units: [
      { id: 'm', label: 'm', toBase: v => v, fromBase: v => v },
      { id: 'ft', label: 'ft', toBase: v => v * 0.3048, fromBase: v => v / 0.3048 },
      { id: 'inch', label: 'inch', toBase: v => v * 0.0254, fromBase: v => v / 0.0254 },
      { id: 'km', label: 'km', toBase: v => v * 1000, fromBase: v => v / 1000 },
    ]
  },
  {
    id: 'temperature', title: '온도', icon: 'thermostat', color: 'text-red-400',
    units: [
      { id: 'celsius', label: '°C', toBase: v => v, fromBase: v => v },
      { id: 'fahrenheit', label: '°F', toBase: v => (v - 32) * 5 / 9, fromBase: v => v * 9 / 5 + 32 },
      { id: 'kelvin', label: 'K', toBase: v => v - 273.15, fromBase: v => v + 273.15 },
    ]
  },
  {
    id: 'volume', title: '용량', icon: 'water_full', color: 'text-purple-400',
    units: [
      { id: 'liter', label: 'L', toBase: v => v, fromBase: v => v },
      { id: 'gallon', label: 'gal (US)', toBase: v => v * 3.78541, fromBase: v => v / 3.78541 },
      { id: 'cubicm', label: 'm³', toBase: v => v * 1000, fromBase: v => v / 1000 },
      { id: 'ton', label: 't (톤)', toBase: v => v * 1000, fromBase: v => v / 1000 },
    ]
  },
  {
    id: 'area', title: '면적', icon: 'square_foot', color: 'text-orange-400',
    units: [
      { id: 'sqm', label: 'm²', toBase: v => v, fromBase: v => v },
      { id: 'pyeong', label: '평', toBase: v => v * 3.30579, fromBase: v => v / 3.30579 },
      { id: 'sqft', label: 'ft²', toBase: v => v * 0.092903, fromBase: v => v / 0.092903 },
      { id: 'ha', label: 'ha', toBase: v => v * 10000, fromBase: v => v / 10000 },
    ]
  },
];

export default function UnitConverter() {
  const [activeGroup, setActiveGroup] = useState('pressure');
  const [fromUnit, setFromUnit] = useState('mpa');
  const [inputValue, setInputValue] = useState('');

  const group = GROUPS.find(g => g.id === activeGroup)!;

  const handleGroupChange = (id: string) => {
    setActiveGroup(id);
    setInputValue('');
    const g = GROUPS.find(gr => gr.id === id)!;
    setFromUnit(g.units[0].id);
  };

  const fromUnitObj = group.units.find(u => u.id === fromUnit)!;
  const numValue = parseFloat(inputValue) || 0;
  const baseValue = fromUnitObj.toBase(numValue);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-500/10 rounded-xl">
            <span className="material-symbols-outlined text-indigo-400 text-2xl" style={{ fontVariationSettings: "'FILL' 1" }}>swap_horiz</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-on-surface">소방 단위 변환기</h2>
            <p className="text-xs text-on-surface-variant mt-0.5">수압 · 방수량 · 거리 · 온도 · 면적 변환</p>
          </div>
        </div>
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-2 overflow-x-auto pb-1 custom-scrollbar">
        {GROUPS.map(g => (
          <button
            key={g.id}
            onClick={() => handleGroupChange(g.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all shrink-0 ${
              activeGroup === g.id ? 'bg-primary text-on-primary shadow-lg' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high'
            }`}
          >
            <span className="material-symbols-outlined text-sm">{g.icon}</span>
            {g.title}
          </button>
        ))}
      </div>

      {/* 입력 */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5">
        <div className="flex items-center gap-3 mb-4">
          <span className={`material-symbols-outlined ${group.color} text-2xl`}>{group.icon}</span>
          <h3 className="text-lg font-bold text-on-surface">{group.title} 변환</h3>
        </div>

        <div className="flex gap-3 items-end mb-6">
          <div className="flex-1">
            <label className="text-xs text-on-surface-variant font-bold mb-1.5 block">값 입력</label>
            <input
              type="number"
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              placeholder="0"
              className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-lg font-bold text-on-surface font-mono placeholder:text-on-surface-variant/30 focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <div className="w-32">
            <label className="text-xs text-on-surface-variant font-bold mb-1.5 block">단위</label>
            <select
              value={fromUnit}
              onChange={e => setFromUnit(e.target.value)}
              className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-3 py-3 text-sm font-bold text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              {group.units.map(u => (
                <option key={u.id} value={u.id}>{u.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* 결과 */}
        <div className="space-y-2">
          {group.units.map(unit => {
            if (unit.id === fromUnit) return null;
            const converted = unit.fromBase(baseValue);
            const display = Math.abs(converted) < 0.001 && converted !== 0
              ? converted.toExponential(4)
              : converted.toLocaleString('ko-KR', { minimumFractionDigits: 0, maximumFractionDigits: 4 });

            return (
              <div
                key={unit.id}
                className="flex items-center justify-between bg-surface-container/50 rounded-xl px-4 py-3 hover:bg-surface-container transition-colors cursor-pointer"
                onClick={() => {
                  setFromUnit(unit.id);
                  setInputValue(converted.toString());
                }}
              >
                <span className="text-sm text-on-surface-variant font-bold">{unit.label}</span>
                <span className={`text-lg font-black font-mono ${group.color} tabular-nums`}>
                  {inputValue ? display : '─'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 소방 참고 정보 */}
      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5">
        <h4 className="text-sm font-bold text-on-surface mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-yellow-400 text-lg">lightbulb</span>
          소방 참고값
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div className="bg-surface-container/50 rounded-lg p-3">
            <p className="font-bold text-on-surface">옥내소화전 방수압</p>
            <p className="text-on-surface-variant">0.17~0.7 MPa (25~100 psi)</p>
          </div>
          <div className="bg-surface-container/50 rounded-lg p-3">
            <p className="font-bold text-on-surface">옥외소화전 방수량</p>
            <p className="text-on-surface-variant">350 LPM (92 GPM) 이상</p>
          </div>
          <div className="bg-surface-container/50 rounded-lg p-3">
            <p className="font-bold text-on-surface">스프링클러 방수압</p>
            <p className="text-on-surface-variant">0.1 MPa (14.5 psi) 이상</p>
          </div>
          <div className="bg-surface-container/50 rounded-lg p-3">
            <p className="font-bold text-on-surface">플래시오버 온도</p>
            <p className="text-on-surface-variant">500~600°C (932~1112°F)</p>
          </div>
          <div className="bg-surface-container/50 rounded-lg p-3">
            <p className="font-bold text-on-surface">65mm 호스 1본</p>
            <p className="text-on-surface-variant">20m, 마찰손실 0.02 MPa/본</p>
          </div>
          <div className="bg-surface-container/50 rounded-lg p-3">
            <p className="font-bold text-on-surface">공기호흡기 용량</p>
            <p className="text-on-surface-variant">6.8L (30분) / 9L (45분)</p>
          </div>
        </div>
      </div>
    </div>
  );
}
