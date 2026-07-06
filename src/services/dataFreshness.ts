export interface DatasetFreshness {
  label: string;
  sourceDate: string | null;
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

const CITY_TO_KR: Record<string, string> = {
  seoul: '서울특별시',
  busan: '부산광역시',
  daegu: '대구광역시',
  incheon: '인천광역시',
  gwangju: '광주광역시',
  daejeon: '대전광역시',
  ulsan: '울산광역시',
  sejong: '세종특별자치시',
  jeju: '제주특별자치도',
};

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
    const cityName = CITY_TO_KR[city] || city;
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

export function isFreshnessExpired(meta: DatasetFreshness, now = Date.now()): boolean {
  if (!meta.generatedAt || !meta.maxAgeDays) return false;
  const generatedAt = new Date(meta.generatedAt).getTime();
  if (Number.isNaN(generatedAt)) return false;
  return now - generatedAt > meta.maxAgeDays * 24 * 60 * 60 * 1000;
}
