import { getTabIcon, getTabLabel } from '../app/navigation';
import {
  WORK_PRESETS,
  type NavigationPreferences,
  type WorkPresetId,
} from '../services/navigationPreferences';
import type { TabId } from '../types/navigation';

interface SidebarQuickAccessProps {
  preferences: NavigationPreferences;
  activeTab: TabId;
  onNavigate: (tab: TabId) => void;
  onPresetChange: (preset: WorkPresetId) => void;
}

const QUICK_LABELS: Partial<Record<TabId, string>> = {
  incident: '상황판',
  'field-timer': '타이머',
  'safety-monitor': '대원 안전',
  shelter: '시설',
  'ems-protocol': '응급처치',
  triage: '중증도',
  er: '응급실',
  'activity-log': '활동 기록',
  preplan: '대상물',
  checklist: '장비 점검',
  'equipment-cert': '장비 인증',
  manual: '매뉴얼',
  calendar: '일정',
  law: '법률',
  policy: '지침',
  'annual-fire': '화재 통계',
};

function CompactLinkRow({
  label,
  tabs,
  activeTab,
  onNavigate,
}: {
  label: string;
  tabs: TabId[];
  activeTab: TabId;
  onNavigate: (tab: TabId) => void;
}) {
  if (tabs.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11px] font-extrabold text-on-surface-variant">{label}</p>
      <div className="scrollbar-hide flex gap-1.5 overflow-x-auto pb-0.5">
        {tabs.map(tab => (
          <button
            key={tab}
            type="button"
            aria-current={activeTab === tab ? 'page' : undefined}
            onClick={() => onNavigate(tab)}
            className={`shrink-0 rounded-lg border px-2.5 py-2 text-xs font-bold transition-colors ${
              activeTab === tab
                ? 'border-primary bg-primary text-on-primary'
                : 'border-outline-variant/20 bg-surface-container-lowest text-on-surface hover:bg-surface-container-high'
            }`}
          >
            {getTabLabel(tab)}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function SidebarQuickAccess({
  preferences,
  activeTab,
  onNavigate,
  onPresetChange,
}: SidebarQuickAccessProps) {
  const preset = WORK_PRESETS.find(item => item.id === preferences.preset) ?? WORK_PRESETS[0];

  return (
    <section aria-labelledby="sidebar-quick-access-title" className="mb-3 rounded-2xl border border-outline-variant/20 bg-surface-container/55 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id="sidebar-quick-access-title" className="text-xs font-extrabold text-on-surface">빠른 메뉴</h2>
          <p className="truncate text-[10px] text-on-surface-variant">{preset.description}</p>
        </div>
        <span aria-hidden="true" className="material-symbols-outlined text-lg text-primary">{preset.icon}</span>
      </div>

      <div className="mt-2 grid grid-cols-4 gap-1" aria-label="업무 모드 선택">
        {WORK_PRESETS.map(item => {
          const selected = item.id === preferences.preset;
          return (
            <button
              key={item.id}
              type="button"
              aria-pressed={selected}
              onClick={() => onPresetChange(item.id)}
              className={`rounded-lg px-1 py-2 text-[11px] font-extrabold transition-colors ${
                selected
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {preset.shortcuts.map(tab => {
          const selected = activeTab === tab;
          return (
            <button
              key={tab}
              type="button"
              aria-label={getTabLabel(tab)}
              aria-current={selected ? 'page' : undefined}
              onClick={() => onNavigate(tab)}
              className={`flex min-h-12 min-w-0 items-center gap-1.5 rounded-xl border px-2 py-2 text-left text-[11px] font-bold text-on-surface transition-colors ${
              selected ? 'border-primary/40 bg-primary/10' : 'border-outline-variant/15 bg-surface-container-lowest'
            } hover:bg-surface-container-high`}
            >
              <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-base text-primary">{getTabIcon(tab)}</span>
              <span className="truncate">{QUICK_LABELS[tab] ?? getTabLabel(tab)}</span>
            </button>
          );
        })}
      </div>

      <CompactLinkRow label="즐겨찾기" tabs={preferences.favorites} activeTab={activeTab} onNavigate={onNavigate} />
      <CompactLinkRow label="최근 사용" tabs={preferences.recents} activeTab={activeTab} onNavigate={onNavigate} />
    </section>
  );
}
