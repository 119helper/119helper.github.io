import { z } from 'zod';
import type { PrePlan } from '../types/preplan';
import { MAX_PREPLAN_PHOTO_DATA_URL_LENGTH } from './preplanPhotos';
import { savePhoto, deletePhoto } from './preplanPhotos';
import { canPersistStorageKey, isStoragePending, loadStoredJson, saveStoredJson } from './privacySettings';
export type PreplanConflictMode = 'keep' | 'newer' | 'copy';

export async function importPreplans(input: unknown, mode: PreplanConflictMode) {
  const bundle = prePlanBundleSchema.parse(input);
  const key = '119helper-preplans';
  if (!canPersistStorageKey(key)) throw new Error('공용 기기 모드에서는 복원할 수 없습니다.');
  const original = loadStoredJson<PrePlan[]>(key, []);
  const byId = new Map(original.map(plan => [plan.id, plan]));
  const incomingIds = new Set<string>();
  const writtenPhotos: string[] = [];
  let changed = 0;
  let skipped = 0;
  try {
    for (const plan of bundle.plans) {
      if (incomingIds.has(plan.id)) throw new Error('파일에 중복 대상물 ID가 있습니다.');
      incomingIds.add(plan.id);
      const existing = byId.get(plan.id);
      if (existing && (mode === 'keep' || (mode === 'newer' && existing.updatedAt >= plan.updatedAt))) { skipped++; continue; }
      const id = existing && mode === 'copy' ? crypto.randomUUID() : plan.id;
      const photoKeys: string[] = [];
      for (const oldKey of plan.photoKeys) {
        const data = bundle.photos?.[oldKey];
        if (!data) throw new Error('참조된 사진이 백업에 없습니다.');
        // Never overwrite another plan's photo, including when imported keys collide.
        const newKey = `import-${crypto.randomUUID()}`;
        await savePhoto(newKey, data);
        writtenPhotos.push(newKey);
        photoKeys.push(newKey);
      }
      byId.set(id, { ...plan, id, photoKeys });
      changed++;
    }
    // Fail closed if another tab changed this collection while photos were being loaded.
    if (JSON.stringify(loadStoredJson(key, [])) !== JSON.stringify(original)) throw new Error('대상물이 변경되었습니다. 다시 가져와 주세요.');
    const plans = [...byId.values()];
    if (changed && !saveStoredJson(key, plans)) {
      // Keep imported photos because the recoverable pending write references them.
      if (isStoragePending(key)) writtenPhotos.length = 0;
      throw new Error('대상물이 임시 보관 중입니다. 저장 상태에서 다시 시도하세요.');
    }
    return { plans, changed, skipped };
  } catch (error) {
    await Promise.allSettled(writtenPhotos.map(deletePhoto));
    throw error;
  }
}
const MAX_PHOTOS_PER_PLAN = 50;
const MAX_IMPORT_PLANS = 500;
const photoKeySchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/);
const prePlanContactSchema = z.object({
  role: z.string().max(80),
  name: z.string().max(100),
  phone: z.string().max(50),
});
export const prePlanSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().max(200),
  address: z.string().max(500),
  hazards: z.array(z.string().max(200)).max(50),
  contacts: z.array(prePlanContactSchema).max(50),
  facilities: z.array(z.string().max(200)).max(100),
  accessNotes: z.string().max(5000),
  photoKeys: z.array(photoKeySchema).max(MAX_PHOTOS_PER_PLAN),
  updatedAt: z.number().finite().nonnegative(),
}) satisfies z.ZodType<PrePlan>;
const photoDataUrlSchema = z.string()
  .max(MAX_PREPLAN_PHOTO_DATA_URL_LENGTH)
  .regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/);
export const prePlanBundleSchema = z.object({
  version: z.literal(1).optional(),
  plans: z.array(prePlanSchema).max(MAX_IMPORT_PLANS),
  photos: z.record(photoKeySchema, photoDataUrlSchema).optional(),
});

