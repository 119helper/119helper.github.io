import { useState, useEffect, useMemo, useRef } from 'react';
import { z } from 'zod';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { type PrePlan, type PrePlanContact, createEmptyPrePlan } from '../types/preplan';
import { resizeImage, savePhoto, getPhoto, deletePhoto, MAX_PREPLAN_PHOTO_DATA_URL_LENGTH } from '../services/preplanPhotos';
import { buildSensitiveExportMessage } from '../utils/sensitiveExport';
import { useAppFeedback } from '../contexts/FeedbackContext';

const MAX_IMPORT_BYTES = 25 * 1024 * 1024;
const MAX_IMPORT_PLANS = 500;
const MAX_IMPORT_PHOTOS = 500;
const MAX_PHOTOS_PER_PLAN = 50;
const PREPLAN_EXPORT_DETAILS = [
  '대상물명과 주소',
  '관계인 이름과 연락처',
  '위험요소, 진입로, 소방시설 위치',
  '현장 사진',
];

const photoKeySchema = z.string().min(1).max(120).regex(/^[A-Za-z0-9_.:-]+$/);
const prePlanContactSchema = z.object({
  role: z.string().max(80),
  name: z.string().max(100),
  phone: z.string().max(50),
});
const prePlanSchema = z.object({
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
const prePlanBundleSchema = z.object({
  version: z.number().optional(),
  plans: z.array(prePlanSchema).max(MAX_IMPORT_PLANS),
  photos: z.record(photoKeySchema, photoDataUrlSchema).optional(),
});

interface PrePlanViewProps {
  incidentContext?: { title: string; address: string } | null;
}

export default function PrePlanView({ incidentContext = null }: PrePlanViewProps) {
  const { showUndo, showNotice, confirmAction } = useAppFeedback();
  const [plans, setPlans] = useLocalStorageState<PrePlan[]>('119helper-preplans', []);
  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const fileImportRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const sorted = [...plans].sort((a, b) => b.updatedAt - a.updatedAt);
    if (!q) return sorted;
    return sorted.filter(p => p.name.toLowerCase().includes(q) || p.address.toLowerCase().includes(q));
  }, [plans, search]);

  const editing = plans.find(p => p.id === editingId) ?? null;

  const createNew = () => {
    const plan = {
      ...createEmptyPrePlan(),
      name: incidentContext?.title.trim() ?? '',
      address: incidentContext?.address.trim() ?? '',
    };
    setPlans(prev => [plan, ...prev]);
    setEditingId(plan.id);
  };

  const updatePlan = (updated: PrePlan) => {
    setPlans(prev => prev.map(p => (p.id === updated.id ? { ...updated, updatedAt: Date.now() } : p)));
  };

  const deletePlan = (plan: PrePlan) => {
    const index = plans.findIndex(item => item.id === plan.id);
    setPlans(prev => prev.filter(p => p.id !== plan.id));
    if (editingId === plan.id) setEditingId(null);
    showUndo({
      message: '대상물 정보를 삭제했습니다.',
      undo: () => {
        setPlans(current => {
          if (current.some(item => item.id === plan.id)) return current;
          const restored = [...current];
          restored.splice(Math.min(Math.max(index, 0), restored.length), 0, plan);
          return restored;
        });
        setEditingId(plan.id);
      },
      onExpire: () => Promise.all(plan.photoKeys.map(key => deletePhoto(key).catch(() => {}))).then(() => undefined),
    });
  };

  const exportAll = async () => {
    const approved = await confirmAction({
      title: '민감정보 내보내기',
      message: buildSensitiveExportMessage('대상물 정보 내보내기 파일', PREPLAN_EXPORT_DETAILS),
      confirmLabel: '내보내기 계속',
      tone: 'warning',
    });
    if (!approved) return;
    const photos: Record<string, string> = {};
    for (const p of plans) {
      for (const k of p.photoKeys) {
        const data = await getPhoto(k);
        if (data) photos[k] = data;
      }
    }
    const bundle = { version: 1, plans, photos };
    const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `preplans-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importFile = async (file: File) => {
    try {
      if (file.size > MAX_IMPORT_BYTES) throw new Error('파일 용량 초과');
      const text = await file.text();
      const parsed = prePlanBundleSchema.safeParse(JSON.parse(text));
      if (!parsed.success) throw new Error('형식 오류');

      const existingIds = new Set(plans.map(p => p.id));
      const importedPlans = parsed.data.plans.filter(p => !existingIds.has(p.id));
      if (importedPlans.length === 0) {
        showNotice({ message: '새로 가져올 대상물이 없습니다.', tone: 'info' });
        return;
      }

      const referencedPhotoKeys = new Set(importedPlans.flatMap(p => p.photoKeys));
      const photoEntries = Object.entries(parsed.data.photos ?? {})
        .filter(([key]) => referencedPhotoKeys.has(key));
      if (photoEntries.length > MAX_IMPORT_PHOTOS) throw new Error('사진 개수 초과');
      await Promise.all(photoEntries.map(([key, dataUrl]) => savePhoto(key, dataUrl)));

      setPlans(prev => {
        const ids = new Set(prev.map(p => p.id));
        const merged = [...prev];
        importedPlans.forEach(p => {
          if (!ids.has(p.id)) merged.push(p);
        });
        return merged;
      });
    } catch {
      showNotice({ message: '가져오기에 실패했습니다. 올바른 백업 파일인지 확인하세요.', tone: 'error' });
    }
  };

  if (editing) {
    return <PrePlanEditor plan={editing} onChange={updatePlan} onClose={() => setEditingId(null)} onDelete={() => deletePlan(editing)} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-extrabold text-on-surface font-headline">🏢 대상물 정보 (Pre-plan)</h2>
          <p className="text-sm text-on-surface-variant mt-1">관할 대상물의 위험요소·연락처·소방시설·사진을 기기에 축적</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportAll} className="px-3 py-2 rounded-lg text-sm font-bold bg-surface-container text-on-surface-variant hover:bg-surface-container-high flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">download</span>내보내기
          </button>
          <button onClick={() => fileImportRef.current?.click()} className="px-3 py-2 rounded-lg text-sm font-bold bg-surface-container text-on-surface-variant hover:bg-surface-container-high flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">upload</span>가져오기
          </button>
          <input
            ref={fileImportRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) importFile(f);
              e.target.value = '';
            }}
          />
          <button onClick={createNew} className="px-4 py-2 rounded-lg text-sm font-bold bg-primary text-on-primary hover:bg-primary/80 flex items-center gap-1.5">
            <span className="material-symbols-outlined text-base">add</span>{incidentContext ? '출동 정보로 추가' : '새 대상물'}
          </button>
        </div>
      </div>

      {incidentContext && (incidentContext.title || incidentContext.address) && (
        <div className="flex items-start gap-3 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-sm text-on-surface">
          <span aria-hidden="true" className="material-symbols-outlined text-primary">assignment</span>
          <div>
            <p className="font-extrabold text-primary">진행 중인 출동 정보 연결됨</p>
            <p className="mt-0.5 text-xs text-on-surface-variant">새 대상물을 만들면 사건명과 주소가 자동 입력됩니다.</p>
          </div>
        </div>
      )}

      <input
        aria-label="대상물 검색"
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="대상물명 또는 주소 검색"
        className="w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-3 text-on-surface placeholder:text-outline focus:outline-none focus:ring-2 focus:ring-primary/30"
      />

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-on-surface-variant">
          <span className="material-symbols-outlined text-6xl opacity-30">apartment</span>
          <p className="mt-4 text-sm">{search ? '검색 결과가 없습니다' : '등록된 대상물이 없습니다. "새 대상물"로 추가하세요'}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filtered.map(p => (
            <button
              key={p.id}
              onClick={() => setEditingId(p.id)}
              className="text-left bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-4 hover:bg-surface-container-high/30 transition-colors"
            >
              <div className="font-bold text-on-surface">{p.name || '(이름 없음)'}</div>
              <div className="text-xs text-on-surface-variant mt-0.5 truncate">{p.address || '주소 미입력'}</div>
              <div className="flex gap-2 mt-2 flex-wrap">
                {p.hazards.slice(0, 3).map((h, i) => (
                  <span key={i} className="text-[10px] font-bold text-error bg-error/10 px-2 py-0.5 rounded-full">{h}</span>
                ))}
                {p.photoKeys.length > 0 && (
                  <span className="text-[10px] font-bold text-on-surface-variant bg-surface-container px-2 py-0.5 rounded-full flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[12px]">image</span>{p.photoKeys.length}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 편집기 ────────────────────────────────────────────────────
function PrePlanEditor({
  plan,
  onChange,
  onClose,
  onDelete,
}: {
  plan: PrePlan;
  onChange: (p: PrePlan) => void;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { showNotice } = useAppFeedback();
  const set = <K extends keyof PrePlan>(key: K, value: PrePlan[K]) => onChange({ ...plan, [key]: value });

  const addPhoto = async (file: File) => {
    try {
      const dataUrl = await resizeImage(file);
      const key = `${plan.id}-${Date.now()}`;
      await savePhoto(key, dataUrl);
      onChange({ ...plan, photoKeys: [...plan.photoKeys, key] });
    } catch {
      showNotice({ message: '사진 처리에 실패했습니다.', tone: 'error' });
    }
  };

  const removePhoto = async (key: string) => {
    await deletePhoto(key).catch(() => {});
    onChange({ ...plan, photoKeys: plan.photoKeys.filter(k => k !== key) });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-surface-container text-on-surface-variant">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h2 className="text-xl font-extrabold text-on-surface font-headline flex-1">대상물 편집</h2>
        <button onClick={onDelete} className="px-3 py-2 rounded-lg text-sm font-bold text-error hover:bg-error/10 flex items-center gap-1.5">
          <span className="material-symbols-outlined text-base">delete</span>삭제
        </button>
      </div>

      <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-4">
        <Field label="대상물명" controlId="preplan-name">
          <input id="preplan-name" type="text" value={plan.name} onChange={e => set('name', e.target.value)} className={inputCls} placeholder="예: ○○상가" />
        </Field>
        <Field label="주소" controlId="preplan-address">
          <input id="preplan-address" type="text" value={plan.address} onChange={e => set('address', e.target.value)} className={inputCls} placeholder="도로명/지번 주소" />
        </Field>
        <Field label="위험요소" controlId="preplan-hazards">
          <TagInput id="preplan-hazards" tags={plan.hazards} onChange={t => set('hazards', t)} placeholder="위험물·가스·전기 등 입력 후 Enter" accent="error" />
        </Field>
        <Field label="소방시설 / 주의 위치" controlId="preplan-facilities">
          <TagInput id="preplan-facilities" tags={plan.facilities} onChange={t => set('facilities', t)} placeholder="수신기·방화셔터·연결송수구 등 Enter" accent="primary" />
        </Field>
        <Field label="진입로 / 주의사항" controlId="preplan-access-notes">
          <textarea id="preplan-access-notes" value={plan.accessNotes} onChange={e => set('accessNotes', e.target.value)} rows={3} className={`${inputCls} resize-none`} placeholder="진입 동선, 주차, 야간 출입 등" />
        </Field>
      </div>

      <ContactEditor contacts={plan.contacts} onChange={c => set('contacts', c)} />

      <PhotoEditor photoKeys={plan.photoKeys} onAdd={addPhoto} onRemove={removePhoto} />
    </div>
  );
}

const inputCls =
  'w-full bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-2.5 text-on-surface placeholder:text-outline text-sm focus:outline-none focus:ring-2 focus:ring-primary/30';

function Field({ label, controlId, children }: { label: string; controlId: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={controlId} className="text-xs font-bold text-on-surface-variant">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function TagInput({
  id,
  tags,
  onChange,
  placeholder,
  accent,
}: {
  id: string;
  tags: string[];
  onChange: (t: string[]) => void;
  placeholder: string;
  accent: 'error' | 'primary';
}) {
  const [value, setValue] = useState('');
  const accentCls = accent === 'error' ? 'text-error bg-error/10' : 'text-primary bg-primary/10';

  const add = () => {
    const v = value.trim();
    if (v && !tags.includes(v)) onChange([...tags, v]);
    setValue('');
  };

  return (
    <div>
      <input
        id={id}
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add();
          }
        }}
        placeholder={placeholder}
        className={inputCls}
      />
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-2">
          {tags.map((t, i) => (
            <span key={i} className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1 ${accentCls}`}>
              {t}
              <button type="button" aria-label={`${t} 삭제`} onClick={() => onChange(tags.filter((_, idx) => idx !== i))} className="hover:opacity-70">
                <span aria-hidden="true" className="material-symbols-outlined text-sm">close</span>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ContactEditor({ contacts, onChange }: { contacts: PrePlanContact[]; onChange: (c: PrePlanContact[]) => void }) {
  const update = (i: number, patch: Partial<PrePlanContact>) =>
    onChange(contacts.map((c, idx) => (idx === i ? { ...c, ...patch } : c)));

  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-on-surface">관계인 연락처</h3>
        <button
          onClick={() => onChange([...contacts, { role: '', name: '', phone: '' }])}
          className="text-sm font-bold text-primary flex items-center gap-1"
        >
          <span className="material-symbols-outlined text-base">add</span>추가
        </button>
      </div>
      {contacts.length === 0 ? (
        <p className="text-sm text-on-surface-variant">등록된 연락처가 없습니다</p>
      ) : (
        contacts.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_1.2fr_auto] gap-2 items-center">
            <input aria-label={`연락처 ${i + 1} 구분`} value={c.role} onChange={e => update(i, { role: e.target.value })} placeholder="구분" className={inputCls} />
            <input aria-label={`연락처 ${i + 1} 이름`} value={c.name} onChange={e => update(i, { name: e.target.value })} placeholder="이름" className={inputCls} />
            <input aria-label={`연락처 ${i + 1} 전화번호`} value={c.phone} onChange={e => update(i, { phone: e.target.value })} placeholder="전화번호" className={inputCls} />
            <div className="flex items-center gap-1">
              {c.phone && (
                <a href={`tel:${c.phone}`} aria-label={`${c.name || `${i + 1}번 연락처`}에 전화`} className="p-2 text-primary">
                  <span aria-hidden="true" className="material-symbols-outlined text-lg">call</span>
                </a>
              )}
              <button type="button" aria-label={`${c.name || `${i + 1}번 연락처`} 삭제`} onClick={() => onChange(contacts.filter((_, idx) => idx !== i))} className="p-2 text-on-surface-variant hover:text-error">
                <span aria-hidden="true" className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function PhotoEditor({ photoKeys, onAdd, onRemove }: { photoKeys: string[]; onAdd: (f: File) => void; onRemove: (k: string) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-bold text-on-surface">현장 사진</h3>
        <button onClick={() => ref.current?.click()} className="text-sm font-bold text-primary flex items-center gap-1">
          <span className="material-symbols-outlined text-base">add_a_photo</span>추가
        </button>
        <input
          ref={ref}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) onAdd(f);
            e.target.value = '';
          }}
        />
      </div>
      {photoKeys.length === 0 ? (
        <p className="text-sm text-on-surface-variant">소화전·수신기·방화셔터 위치 등을 촬영해 두면 출동 시 도움이 됩니다</p>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {photoKeys.map(k => (
            <PhotoThumb key={k} photoKey={k} onRemove={() => onRemove(k)} />
          ))}
        </div>
      )}
    </div>
  );
}

function PhotoThumb({ photoKey, onRemove }: { photoKey: string; onRemove: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    getPhoto(photoKey).then(d => alive && setSrc(d ?? null));
    return () => {
      alive = false;
    };
  }, [photoKey]);

  return (
    <div className="relative group aspect-square rounded-lg overflow-hidden bg-surface-container">
      {src ? <img src={src} alt="현장" className="w-full h-full object-cover" /> : <div className="w-full h-full animate-pulse" />}
      <button
        onClick={onRemove}
        className="absolute top-1 right-1 p-1 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity"
      >
        <span className="material-symbols-outlined text-sm">close</span>
      </button>
    </div>
  );
}
