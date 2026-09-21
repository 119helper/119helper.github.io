import { z } from 'zod';
import { loadPrivacySettings, loadStoredJson, saveStoredJson, getPendingStorageCount } from './privacySettings';
import { getPhoto } from './preplanPhotos';
import { prePlanBundleSchema, importPreplans } from './preplanBundle';
import { INCIDENT_CASE_ARCHIVE_KEY, listIncidentCaseSnapshots, normalizeSnapshot } from './incidentCaseStore';
import { loadSchedules } from './scheduleStore';

export const MAX_BACKUP_BYTES = 25 * 1024 * 1024;
const notesSchema = z.array(z.object({ id: z.string().min(1), text: z.string(), color: z.string(), createdAt: z.string() }).passthrough()).max(10000);
const schedulesSchema = z.array(z.object({
  id: z.string().min(1), date: z.string(), title: z.string(), type: z.enum(['근무', '점검', '교육', '기타']), memo: z.string(),
  trackCompletion: z.boolean().optional(), completedAt: z.number().finite().optional(),
}).passthrough()).max(10000);
const backupSchema = z.object({
  format: z.literal('119-helper-workspace'), version: z.literal(1), createdAt: z.string(),
  notes: notesSchema, schedules: schedulesSchema, preplans: prePlanBundleSchema,
  incidents: z.array(z.unknown()).max(10000),
});
export type WorkspaceBackup = z.infer<typeof backupSchema>;

export function parseWorkspaceBackup(text: string): WorkspaceBackup {
  if (new Blob([text]).size > MAX_BACKUP_BYTES) throw new Error('백업은 25MB 이하만 지원합니다.');
  const backup = backupSchema.parse(JSON.parse(text));
  for (const rows of [backup.notes, backup.schedules, backup.preplans.plans]) {
    if (new Set(rows.map(row => row.id)).size !== rows.length) throw new Error('백업에 중복 ID가 있습니다.');
  }
  const records = backup.incidents.map(normalizeSnapshot);
  if (records.some(record => !record) || new Set(records.map(record => record?.incidentId)).size !== records.length) throw new Error('종료 출동 기록 형식이 올바르지 않습니다.');
  backup.incidents = records;
  for (const plan of backup.preplans.plans) {
    if (plan.photoKeys.some(key => !backup.preplans.photos?.[key])) throw new Error('백업에 대상물 사진이 누락되었습니다.');
  }
  return backup;
}

export async function createWorkspaceBackup(): Promise<WorkspaceBackup> {
  if (loadPrivacySettings().publicDeviceMode) throw new Error('공용 기기 모드에서는 백업할 수 없습니다.');
  const plans = prePlanBundleSchema.shape.plans.parse(loadStoredJson('119helper-preplans', []));
  const photos: Record<string, string> = {};
  for (const plan of plans) for (const key of plan.photoKeys) {
    const photo = await getPhoto(key);
    if (!photo) throw new Error('대상물 사진을 읽지 못했습니다. 사진을 확인한 후 다시 백업하세요.');
    photos[key] = photo;
  }
  return parseWorkspaceBackup(JSON.stringify({
    format: '119-helper-workspace', version: 1, createdAt: new Date().toISOString(),
    notes: loadStoredJson('119helper-notes', []), schedules: loadSchedules(),
    preplans: { version: 1, plans, photos }, incidents: listIncidentCaseSnapshots(),
  }));
}

export function mergeMissing<T>(current: T[], incoming: T[], id: (row: T) => string): T[] {
  const seen = new Set(current.map(id));
  return [...current, ...incoming.filter(row => { const key = id(row); if (seen.has(key)) return false; seen.add(key); return true; })];
}

export async function restoreWorkspaceBackup(input: WorkspaceBackup): Promise<string> {
  // Validate the complete file before making any change. Restoring only adds missing
  // records; repeated attempts are safe even if a later collection runs out of space.
  const backup = parseWorkspaceBackup(JSON.stringify(input));
  if (loadPrivacySettings().publicDeviceMode) throw new Error('공용 기기 모드에서는 복원할 수 없습니다.');
  if (getPendingStorageCount()) throw new Error('임시 보관 자료를 먼저 저장한 후 복원하세요.');
  const restored: string[] = [];
  try {
    const plans = await importPreplans(backup.preplans, 'keep');
    restored.push(`대상물 ${plans.changed}개`);
    for (const [key, label, incoming] of [
      ['119helper-notes', '메모', backup.notes],
      ['119helper-schedules', '일정', backup.schedules],
    ] as const) {
      const current = loadStoredJson<{ id: string }[]>(key, []);
      const merged = mergeMissing(current, [...incoming], row => row.id);
      if (merged.length !== current.length && !saveStoredJson(key, merged)) throw new Error(`${label}는 임시 보관 중입니다. 저장 다시 시도를 눌러 주세요.`);
      restored.push(`${label} ${merged.length - current.length}개`);
    }
    const current = listIncidentCaseSnapshots();
    const incoming = backup.incidents.map(normalizeSnapshot).filter(record => record !== null);
    const retention = loadPrivacySettings().retentionDays;
    const retained = incoming.filter(record => retention <= 0 || Date.now() - record.closedAt <= retention * 86400000);
    const merged = mergeMissing(current, retained, row => row.incidentId);
    if (merged.length !== current.length && !saveStoredJson(INCIDENT_CASE_ARCHIVE_KEY, { version: 1, records: merged })) throw new Error('출동 기록은 임시 보관 중입니다. 저장 다시 시도를 눌러 주세요.');
    restored.push(`종료 출동 ${merged.length - current.length}개`);
    return `${restored.join(' · ')} 추가${incoming.length !== retained.length ? ` · 보관 기간이 지난 출동 ${incoming.length - retained.length}개 제외` : ''}`;
  } catch (error) {
    throw new Error(`${restored.length ? `반영 완료: ${restored.join(' · ')}. ` : ''}${error instanceof Error ? error.message : '복원 실패'} 기존 자료는 유지됩니다. 다시 가져오면 이미 반영된 자료는 건너뜁니다.`, { cause: error });
  } finally {
    window.dispatchEvent(new Event('119helper-settings-updated'));
    window.dispatchEvent(new Event('119helper-schedules-updated'));
    window.dispatchEvent(new Event('119helper-incident-case-archive-updated'));
  }
}
