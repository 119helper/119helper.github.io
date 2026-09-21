// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createWorkspaceBackup, parseWorkspaceBackup, restoreWorkspaceBackup } from './workspaceBackup';
import { importPreplans } from './preplanBundle';
import { createEmptyPrePlan } from '../types/preplan';
import { removeStoredJson, retryPendingStorage, saveStoredJson } from './privacySettings';
const photos = vi.hoisted(() => new Map<string, string>());
vi.mock('./preplanPhotos', () => ({
  MAX_PREPLAN_PHOTO_DATA_URL_LENGTH: 2500000,
  getPhoto: vi.fn(async (key: string) => photos.get(key)),
  savePhoto: vi.fn(async (key: string, value: string) => { photos.set(key, value); }),
  deletePhoto: vi.fn(async (key: string) => { photos.delete(key); }),
}));
beforeEach(() => { localStorage.clear(); photos.clear(); });
afterEach(() => { vi.restoreAllMocks(); ['119helper-notes', '119helper-schedules', '119helper-preplans'].forEach(removeStoredJson); });
it('round trips notes, schedules, photos and preserves local changes on repeated restore', async () => {
  const plan = { ...createEmptyPrePlan(), id: 'p1', name: '시장', photoKeys: ['photo'] };
  photos.set('photo', 'data:image/png;base64,YQ==');
  saveStoredJson('119helper-preplans', [plan]);
  saveStoredJson('119helper-notes', [{ id: 'n1', text: '원본', color: 'yellow', createdAt: 'today' }]);
  saveStoredJson('119helper-schedules', [{ id: 's1', date: '2026-09-22', title: '교육', type: '교육', memo: '메모' }]);
  const backup = await createWorkspaceBackup();
  localStorage.clear(); photos.clear();
  await restoreWorkspaceBackup(backup);
  const restored = JSON.parse(localStorage.getItem('119helper-preplans')!);
  expect(photos.get(restored[0].photoKeys[0])).toBe('data:image/png;base64,YQ==');
  expect(JSON.parse(localStorage.getItem('119helper-schedules')!)[0].title).toBe('교육');
  saveStoredJson('119helper-notes', [{ ...backup.notes[0], text: '로컬 수정' }]);
  await restoreWorkspaceBackup(backup);
  expect(JSON.parse(localStorage.getItem('119helper-notes')!)).toHaveLength(1);
  expect(JSON.parse(localStorage.getItem('119helper-notes')!)[0].text).toBe('로컬 수정');
});
it('rejects malformed versions, active incidents and missing photos before touching storage', async () => {
  const backup = await createWorkspaceBackup();
  expect(() => parseWorkspaceBackup(JSON.stringify({ ...backup, version: 2 }))).toThrow();
  await expect(restoreWorkspaceBackup({ ...backup, incidents: [{ incident: { active: true } }] })).rejects.toThrow();
  expect(() => parseWorkspaceBackup(JSON.stringify({ ...backup, preplans: { plans: [{ ...createEmptyPrePlan(), photoKeys: ['missing'] }] } }))).toThrow();
  expect(localStorage.length).toBe(0);
});
it('restores a closed incident within retention and keeps its patient and activity association', async () => {
  const backup = await createWorkspaceBackup();
  const closedAt = Date.now();
  backup.incidents = [{ schemaVersion: 1, incidentId: 'case', snapshotAt: closedAt, closedAt,
    incident: { incidentId: 'case', active: false, type: 'fire', title: '종료 기록', address: '', note: '', startedAt: closedAt - 1000, endedAt: closedAt },
    activity: { incidentId: 'case', title: '활동', presetId: 'fire', note: '', stamps: [] }, triagePatients: [], timers: [], stopwatch: null,
  }];
  await restoreWorkspaceBackup(backup);
  const archive = JSON.parse(localStorage.getItem('119helper-incident-case-archive')!);
  expect(archive.records[0].incident.title).toBe('종료 기록');
  expect(archive.records[0].activity.incidentId).toBe('case');
  expect(archive.records[0].incident.active).toBe(false);
});
it('keeps, updates only newer records, or copies conflicting preplans without overwriting photo keys', async () => {
  const old = { ...createEmptyPrePlan(), id: 'p', name: 'old', updatedAt: 100, photoKeys: ['shared'] };
  photos.set('shared', 'data:image/png;base64,YQ==');
  saveStoredJson('119helper-preplans', [old]);
  const bundle = { version: 1, plans: [{ ...old, name: 'new', updatedAt: 200 }], photos: { shared: 'data:image/png;base64,Yg==' } };
  expect((await importPreplans(bundle, 'keep')).plans[0].name).toBe('old');
  const updated = await importPreplans(bundle, 'newer');
  expect(updated.plans[0].name).toBe('new');
  expect(updated.plans[0].photoKeys[0]).not.toBe('shared');
  expect(photos.get('shared')).toBe('data:image/png;base64,YQ==');
  expect((await importPreplans(bundle, 'copy')).plans).toHaveLength(2);
});
it('does not announce successful restore on quota failure and can retry safely', async () => {
  const backup = await createWorkspaceBackup();
  backup.notes.push({ id: 'n', text: 'recover', color: '', createdAt: '' });
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); });
  await expect(restoreWorkspaceBackup(backup)).rejects.toThrow('임시 보관');
  write.mockRestore(); retryPendingStorage();
  await restoreWorkspaceBackup(backup);
  expect(JSON.parse(localStorage.getItem('119helper-notes')!)).toHaveLength(1);
});
