import { isTabId, type ShelterCategory, type TabId } from '../types/navigation';

export interface TabLocationState {
  tab: TabId;
  subId?: string;
  shelterCategory?: ShelterCategory;
}

function isShelterCategory(value: string | null): value is ShelterCategory {
  return value === 'building'
    || value === 'hydrants'
    || value === 'waterTowers'
    || value === 'civil'
    || value === 'tsunami'
    || value === 'restrooms';
}

export function readTabLocation(): TabLocationState {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (hash) {
    const [rawTab, rawQuery = ''] = hash.split('?');
    const params = new URLSearchParams(rawQuery);
    if (isTabId(rawTab)) {
      const category = params.get('category');
      return {
        tab: rawTab,
        subId: params.get('subId') || undefined,
        shelterCategory: isShelterCategory(category) ? category : undefined,
      };
    }
  }

  const tab = new URLSearchParams(window.location.search).get('tab');
  return { tab: isTabId(tab) ? tab : 'dashboard' };
}

export function buildTabHash(tab: TabId, subId?: string, shelterCategory?: ShelterCategory): string {
  const params = new URLSearchParams();
  if (subId) params.set('subId', subId);
  if (tab === 'shelter' && shelterCategory) params.set('category', shelterCategory);
  const query = params.toString();
  return `#${tab}${query ? `?${query}` : ''}`;
}
