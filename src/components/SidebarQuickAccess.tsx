import { getTabIcon, getTabLabel } from '../app/navigation';
import type { NavigationPreferences } from '../services/navigationPreferences';
import type { TabId } from '../types/navigation';

interface SidebarQuickAccessProps {
  preferences: NavigationPreferences;
  activeTab: TabId;
  visibleTabs: readonly TabId[];
  onNavigate: (tab: TabId) => void;
}

export default function SidebarQuickAccess({
  preferences,
  activeTab,
  visibleTabs,
  onNavigate,
}: SidebarQuickAccessProps) {
  const visibleFavorites = preferences.favorites.filter(tab => visibleTabs.includes(tab));

  return (
    <section aria-labelledby="sidebar-favorites-title" className="mb-3 rounded-2xl border border-outline-variant/20 bg-surface-container/55 p-3">
      <div className="flex items-center gap-2">
        <span
          aria-hidden="true"
          className="material-symbols-outlined text-lg text-amber-600 dark:text-amber-300"
          style={{ fontVariationSettings: "'FILL' 1" }}
        >
          star
        </span>
        <div className="min-w-0">
          <h2 id="sidebar-favorites-title" className="text-xs font-extrabold text-on-surface">즐겨찾기</h2>
          <p className="text-[10px] text-on-surface-variant">자주 쓰는 기능만 모아봅니다</p>
        </div>
      </div>

      {visibleFavorites.length > 0 ? (
        <div className="mt-2 space-y-1">
          {visibleFavorites.map(tab => {
            const selected = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                aria-current={selected ? 'page' : undefined}
                onClick={() => onNavigate(tab)}
                className={`ui-menu-item w-full ${
                  selected
                    ? 'bg-primary/15 text-primary'
                    : 'text-on-surface hover:bg-surface-container-high'
                }`}
              >
                <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-lg">
                  {getTabIcon(tab)}
                </span>
                <span className="min-w-0 flex-1 truncate">{getTabLabel(tab)}</span>
                <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-base text-on-surface-variant">
                  chevron_right
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className="mt-2 rounded-xl bg-surface-container-lowest px-3 py-2.5 text-[11px] leading-4 text-on-surface-variant">
          이 업무 공간 메뉴의 별표를 눌러 기능을 추가하세요.
        </div>
      )}
    </section>
  );
}
