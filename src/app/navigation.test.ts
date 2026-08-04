import { describe, expect, it } from 'vitest';
import {
  getDefaultWorkspaceForTab,
  getWorkspaceNavItems,
  getWorkspaceTabIds,
  TAB_LABELS,
} from './navigation';
import { ALL_TAB_IDS, isTabId } from '../types/navigation';

describe('workspace navigation', () => {
  it('separates routine-only work from response-only work', () => {
    const routineTabs = getWorkspaceTabIds('routine');
    const responseTabs = getWorkspaceTabIds('response');

    expect(routineTabs).toContain('dashboard');
    expect(routineTabs).toContain('calendar');
    expect(routineTabs).not.toContain('incident');
    expect(routineTabs).not.toContain('activity-log');

    expect(responseTabs).toContain('incident');
    expect(responseTabs).toContain('activity-log');
    expect(responseTabs).not.toContain('dashboard');
    expect(responseTabs).not.toContain('calendar');
  });

  it('keeps shared information tools available in both workspaces', () => {
    const routineTabs = getWorkspaceTabIds('routine');
    const responseTabs = getWorkspaceTabIds('response');

    for (const tab of ['shelter', 'weather', 'er', 'calculator', 'manual', 'preplan'] as const) {
      expect(routineTabs).toContain(tab);
      expect(responseTabs).toContain(tab);
      expect(getDefaultWorkspaceForTab(tab)).toBeNull();
    }
  });

  it('infers a workspace only for exclusive routes', () => {
    expect(getDefaultWorkspaceForTab('dashboard')).toBe('routine');
    expect(getDefaultWorkspaceForTab('checklist')).toBe('routine');
    expect(getDefaultWorkspaceForTab('incident')).toBe('response');
    expect(getDefaultWorkspaceForTab('field-timer')).toBe('response');
  });

  it('keeps response copy scoped to what each destination actually provides', () => {
    const responseItems = getWorkspaceNavItems('response');
    const fieldInfo = responseItems.find(item => item.id === 'group-field-info');

    expect(fieldInfo?.subItems).toContainEqual({ id: 'weather', label: '기상 정보' });
    expect(fieldInfo?.subItems).not.toContainEqual({ id: 'weather', label: '현장 기상' });
  });

  it('uses the canonical tool names in every workspace', () => {
    for (const workspace of ['routine', 'response'] as const) {
      for (const item of getWorkspaceNavItems(workspace)) {
        item.subItems?.forEach(subItem => {
          expect(subItem.label).toBe(TAB_LABELS[subItem.id]);
        });
      }
    }

    expect(TAB_LABELS.weather).toBe('기상 정보');
    expect(TAB_LABELS.wildfire).toBe('산불 현황');
    expect(TAB_LABELS.news).toBe('소방 뉴스');
    expect(TAB_LABELS.law).toBe('법률 방어망');
    expect(TAB_LABELS.policy).toBe('법안·지침');
  });

  it('keeps every route reachable and every standalone menu id valid', () => {
    const reachableTabs = new Set([
      ...getWorkspaceTabIds('routine'),
      ...getWorkspaceTabIds('response'),
    ]);

    expect([...reachableTabs].sort()).toEqual([...ALL_TAB_IDS].sort());
    for (const workspace of ['routine', 'response'] as const) {
      for (const item of getWorkspaceNavItems(workspace)) {
        if (!item.subItems) expect(isTabId(item.id)).toBe(true);
      }
    }
  });
});
