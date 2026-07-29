import { CITY_TO_STATIC_PROVINCE } from './administrativeRegions';

export interface DatasetFreshness {
  label: string;
  sourceDate: string | null;
  sourceDateLabel?: string;
  generatedAt: string | null;
  maxAgeDays: number | null;
  sourceUrl?: string;
}

interface StaticDataManifest {
  datasets?: Record<string, DatasetFreshness & { path?: string }>;
}

interface FirewaterManifest {
  sourceUrl?: string;
  maxAgeDays?: number;
  cities?: Record<string, {
    city?: string;
    sourceDate?: string | null;
    generatedAt?: string | null;
    total?: number;
    hydrants?: number;
    waterTowers?: number;
  }>;
}

let staticManifestPromise: Promise<StaticDataManifest | null> | null = null;
let firewaterManifestPromise: Promise<FirewaterManifest | null> | null = null;

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json() as T;
  } catch {
    return null;
  }
}

function staticManifest() {
  staticManifestPromise ??= fetchJson<StaticDataManifest>('/data/manifest.json');
  return staticManifestPromise;
}

function firewaterManifest() {
  firewaterManifestPromise ??= fetchJson<FirewaterManifest>('/firewater/manifest.json');
  return firewaterManifestPromise;
}

export async function getDatasetFreshness(category: string, city: string): Promise<DatasetFreshness | null> {
  if (category === 'hydrants' || category === 'waterTowers') {
    const manifest = await firewaterManifest();
    const cityName = CITY_TO_STATIC_PROVINCE[city] || city;
    const meta = manifest?.cities?.[cityName];
    if (!meta) return null;
    return {
      label: category === 'hydrants' ? '소화전' : '급수탑/저수조',
      sourceDate: meta.sourceDate ?? null,
      generatedAt: meta.generatedAt ?? null,
      maxAgeDays: manifest?.maxAgeDays ?? null,
      sourceUrl: manifest?.sourceUrl,
    };
  }

  if (category === 'civil' || category === 'tsunami' || category === 'restrooms') {
    const manifest = await staticManifest();
    return manifest?.datasets?.[category] ?? null;
  }

  return null;
}

export function formatDatasetDate(value: string | null): string {
  if (!value) return '미확인';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function formatFreshnessSourceDate(meta: DatasetFreshness): string {
  return `${meta.sourceDateLabel ?? '기준일'} ${formatDatasetDate(meta.sourceDate)}`;
}

export function isFreshnessExpired(meta: DatasetFreshness, now = Date.now()): boolean {
  if (!meta.maxAgeDays) return false;
  // 재수집 시각이 최근이어도 공급기관 원본이 오래됐으면 최신 자료로 오인하면 안 된다.
  // 원본 기준일을 우선하고, 기준일이 없는 데이터만 앱 생성 시각으로 폴백한다.
  const referenceDate = meta.sourceDate || meta.generatedAt;
  if (!referenceDate) return false;
  const referenceTime = new Date(referenceDate).getTime();
  if (Number.isNaN(referenceTime)) return false;
  return now - referenceTime > meta.maxAgeDays * 24 * 60 * 60 * 1000;
}
