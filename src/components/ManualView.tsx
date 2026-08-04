import { useState, useEffect } from 'react';
import FieldAssessment from './FieldAssessment';
import RadioCodes from './RadioCodes';
import SOPChecklist from './SOPChecklist';
import ResponsiveTabs from './ResponsiveTabs';

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

      <ResponsiveTabs
        items={SUB_TABS}
        activeId={activeSubTab}
        ariaLabel="대응 매뉴얼 분류"
        onChange={tabId => {
          setActiveSubTab(tabId);
          if (tabId === 'sop' && activeSubTab !== 'sop') setInitialSopId(undefined);
        }}
      />

      {/* Tab Content */}
      <div className="mt-6">
        {activeSubTab === 'assessment' && <FieldAssessment />}
        {activeSubTab === 'radio' && <RadioCodes />}
        {activeSubTab === 'sop' && <SOPChecklist initialSopId={initialSopId} />}
      </div>
    </div>
  );
}
