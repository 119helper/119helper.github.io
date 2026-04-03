import { useState } from 'react';
import AnnualFireView from './AnnualFireView';
import FireAnalysis from './FireAnalysis';
import EmergencyAnalysis from './EmergencyAnalysis';
import HazmatView from './HazmatView';

type SubTab = 'annual' | 'fire' | 'emergency' | 'hazmat';

const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'annual', label: '연간 화재통계', icon: 'bar_chart' },
  { id: 'fire', label: '화재 분석', icon: 'local_fire_department' },
  { id: 'emergency', label: '구급 출동 분석', icon: 'ambulance' },
  { id: 'hazmat', label: '위험물시설', icon: 'warning' },
];

export default function StatisticsView() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('annual');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-on-surface font-headline">📊 통계</h2>
        <p className="text-sm text-on-surface-variant mt-1">소방청 공공 데이터 기반 통계 분석</p>
      </div>

      {/* Sub-Tab Bar */}
      <div className="flex gap-2 bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-1.5 overflow-x-auto">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
              activeSubTab === tab.id
                ? 'bg-primary text-on-primary shadow-lg shadow-primary/20'
                : 'text-on-surface-variant hover:bg-surface-container-high/50'
            }`}
          >
            <span
              className="material-symbols-outlined text-lg"
              style={activeSubTab === tab.id ? { fontVariationSettings: "'FILL' 1" } : undefined}
            >
              {tab.icon}
            </span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeSubTab === 'annual' && <AnnualFireView />}
      {activeSubTab === 'fire' && <FireAnalysis />}
      {activeSubTab === 'emergency' && <EmergencyAnalysis />}
      {activeSubTab === 'hazmat' && <HazmatView />}
    </div>
  );
}
