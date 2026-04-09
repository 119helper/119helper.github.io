import { useState } from 'react';
import AnnualFireView from './AnnualFireView';
import FireAnalysis from './FireAnalysis';
import EmergencyAnalysis from './EmergencyAnalysis';
import HazmatView from './HazmatView';
import FireDamageView from './FireDamageView';
import MultiUseView from './MultiUseView';
import ConsumerHazardView from './ConsumerHazardView';

type SubTab = 'annual' | 'fire' | 'fire-damage' | 'emergency' | 'hazmat' | 'multiuse' | 'hazards';

const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'annual', label: '연간 화재통계', icon: 'bar_chart' },
  { id: 'fire', label: '화재 분석', icon: 'local_fire_department' },
  { id: 'fire-damage', label: '지역별 화재피해', icon: 'map' },
  { id: 'emergency', label: '구급 출동 분석', icon: 'ambulance' },
  { id: 'hazmat', label: '위험물시설', icon: 'warning' },
  { id: 'multiuse', label: '다중이용업소', icon: 'store' },
  { id: 'hazards', label: '생활위해사고', icon: 'personal_injury' },
];

export default function StatisticsView({ city }: { city: string }) {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>('annual');

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-extrabold text-on-surface font-headline">📊 통계</h2>
        <p className="text-sm text-on-surface-variant mt-1">소방청 공공 데이터 기반 통계 분석</p>
      </div>

      {/* Sub-Tab Bar */}
      <div className="relative">
        {/* 좌측 스크롤 힌트 그라디언트 */}
        <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-surface-container-lowest to-transparent z-10 pointer-events-none rounded-l-xl md:hidden" />
        {/* 우측 스크롤 힌트 그라디언트 */}
        <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-surface-container-lowest to-transparent z-10 pointer-events-none rounded-r-xl md:hidden" />
        <div className="flex gap-2 bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-1.5 overflow-x-auto scrollbar-hide">
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
      </div>

      {/* Tab Content */}
      {activeSubTab === 'annual' && <AnnualFireView />}
      {activeSubTab === 'fire' && <FireAnalysis />}
      {activeSubTab === 'fire-damage' && <FireDamageView />}
      {activeSubTab === 'emergency' && <EmergencyAnalysis />}
      {activeSubTab === 'hazmat' && <HazmatView />}
      {activeSubTab === 'multiuse' && <MultiUseView city={city} />}
      {activeSubTab === 'hazards' && <ConsumerHazardView />}
    </div>
  );
}
