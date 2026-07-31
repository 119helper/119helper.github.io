import { useState, useEffect } from 'react';
import FieldAssessment from './FieldAssessment';
import RadioCodes from './RadioCodes';
import SOPChecklist from './SOPChecklist';

type SubTab = 'assessment' | 'radio' | 'sop';
interface ManualRouteTarget {
  tab: SubTab;
  sopId?: string;
}

const SUB_TABS: { id: SubTab; label: string; icon: string }[] = [
  { id: 'assessment', label: '현장 평가', icon: 'emergency' },
  { id: 'radio', label: '무전 코드', icon: 'radio' },
  { id: 'sop', label: 'SOP 체크리스트', icon: 'checklist' },
];

function resolveRouteTarget(subId?: string): ManualRouteTarget {
  if (subId?.startsWith('sop:')) {
    return { tab: 'sop', sopId: subId.slice('sop:'.length) || undefined };
  }
  if (subId === 'radio' || subId === 'sop' || subId === 'assessment') return { tab: subId };
  return { tab: 'assessment' };
}

export default function ManualView({ subId }: { subId?: string }) {
  const routeTarget = resolveRouteTarget(subId);
  const [activeSubTab, setActiveSubTab] = useState<SubTab>(() => routeTarget.tab);
  const [initialSopId, setInitialSopId] = useState<string | undefined>(() => routeTarget.sopId);

  useEffect(() => {
    const next = resolveRouteTarget(subId);
    setActiveSubTab(next.tab);
    setInitialSopId(next.sopId);
  }, [subId]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="ui-page-title">
          <span className="material-symbols-outlined ui-page-title-icon">menu_book</span>
          대응 매뉴얼
        </h2>
        <p className="text-sm text-on-surface-variant mt-1">현장 활동 가이드라인 및 필수 참조 자료</p>
      </div>

      {/* Sub-Tab Bar */}
      <div className="flex gap-2 bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-1.5 overflow-x-auto">
        {SUB_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={activeSubTab === tab.id}
            onClick={() => {
              setActiveSubTab(tab.id);
              if (tab.id === 'sop' && activeSubTab !== 'sop') setInitialSopId(undefined);
            }}
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
      <div className="mt-6">
        {activeSubTab === 'assessment' && <FieldAssessment />}
        {activeSubTab === 'radio' && <RadioCodes />}
        {activeSubTab === 'sop' && <SOPChecklist initialSopId={initialSopId} />}
      </div>
    </div>
  );
}
