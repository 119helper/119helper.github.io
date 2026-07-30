import { CITY_TO_STATIC_PROVINCE } from './administrativeRegions';

export interface DatasetFreshness {
  label: string;
  sourceDate: string | null;
  sourceDateLabel?: string;
  generatedAt: string | null;
  maxAgeDays: number | null;
  sourceUrl?: string;
  total?: number;
  upstreamTotal?: number;
  uniqueUpstreamTotal?: number;
  activeUpstreamTotal?: number;
  supportedCityTotal?: number;
  supportedCityCount?: number;
  missingCoordinateCount?: number;
  coordinateCoveragePercent?: number;
  facilityCoordinateCount?: number;
  facilityCoordinateCoveragePercent?: number;
  addressPointCount?: number;
  legacyGeocodedAddressPointCount?: number;
  legacySharedAddressPointCount?: number;
  officialAddressPointCount?: number;
  officialAddressPointRepairCount?: number;
  hostAddressPointCount?: number;
  nationalStandardHostAddressPointCount?: number;
  municipalHostAddressPointCount?: number;
  cities?: Record<string, number>;
  regionCounts?: Record<string, number>;
  coverageScope?: string;
  coverageNote?: string;
  completenessStatus?: 'complete' | 'scoped' | 'partial' | 'upstream-mismatch';
  regionalOverlays?: RegionalDatasetOverlay[];
  regionalCoordinateCount?: number;
  regionalCoordinateCoverageGainCount?: number;
  regionalCoordinateUpgradeCount?: number;
  coordinateOverlays?: CoordinateDatasetOverlay[];
  addressPointOverlays?: CoordinateDatasetOverlay[];
  announcedTotal?: number;
  countDelta?: number;
  reconciliationStatus?: 'matched' | 'upstream-mismatch';
  reconciliationNote?: string;
}

export interface RegionalDatasetOverlay {
  id: string;
  city: string;
  district: string;
  sourceDate: string;
  overlayKind?: 'district-replacement' | 'partial-corroboration';
  replacementScope?: 'district' | 'none';
  total?: number;
  sourceTotal?: number;
  targetTotal?: number;
  matchedCount?: number;
  unmatchedCount?: number;
  ambiguousMatchCount?: number;
  matchMethod?: string;
  matchFingerprint?: string;
  matchFingerprintAlgorithm?: string;
  targetBodyFingerprint?: string;
  targetBodyFingerprintAlgorithm?: string;
  coordinatesPreserved?: boolean;
  regionalCoordinateCount?: number;
  baselineCoordinateBackfillCount?: number;
  coordinateMappedCount?: number;
  missingCoordinateCount?: number;
  duplicateFacilityNumberCount?: number;
  duplicateFacilityNumberRows?: number;
  normalizedAddressCount?: number;
  sourceUrl?: string;
}

export interface CoordinateDatasetOverlay {
  id: string;
  label: string;
  sourceDate: string;
  sourceTotal: number;
  matchedCount: number;
  exactMatchedCount?: number;
  addressNameContainedMatchedCount?: number;
  coverageGainCount: number;
  precisionUpgradeCount?: number;
  addressNameMismatchCount?: number;
  consistentDuplicateRegionalRowCount?: number;
  consistentDuplicateRegionalTargetCount?: number;
  sourceUrl?: string;
}

export interface DatasetCompletenessNotice {
  tone: 'info' | 'warning';
  text: string;
}

interface StaticDataManifest {
  datasets?: Record<string, DatasetFreshness & { path?: string }>;
}

interface FirewaterManifest {
  sourceUrl?: string;
  maxAgeDays?: number;
  supportedCityCount?: number;
  coverageScope?: string;
  coverageNote?: string;
  completenessStatus?: DatasetFreshness['completenessStatus'];
  regionalOverlays?: RegionalDatasetOverlay[];
  cities?: Record<string, {
    city?: string;
    sourceDate?: string | null;
    generatedAt?: string | null;
    total?: number;
    hydrants?: number;
    waterTowers?: number;
    sourceDateLabel?: string;
    coverageScope?: string;
    completenessStatus?: DatasetFreshness['completenessStatus'];
    regionalOverlays?: RegionalDatasetOverlay[];
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
    return firewaterFreshnessFromManifest(category, city, manifest);
  }

  if (category === 'civil' || category === 'tsunami' || category === 'restrooms') {
    const manifest = await staticManifest();
    return manifest?.datasets?.[category] ?? null;
  }

  return null;
}

export function firewaterFreshnessFromManifest(
  category: 'hydrants' | 'waterTowers',
  city: string,
  manifest: FirewaterManifest | null,
): DatasetFreshness | null {
  const cityName = CITY_TO_STATIC_PROVINCE[city] || city;
  const meta = manifest?.cities?.[cityName];
  if (!meta) return null;
  return {
    label: category === 'hydrants' ? '소화전' : '급수탑/저수조',
    sourceDate: meta.sourceDate ?? null,
    sourceDateLabel: meta.sourceDateLabel,
    generatedAt: meta.generatedAt ?? null,
    maxAgeDays: manifest?.maxAgeDays ?? null,
    sourceUrl: manifest?.sourceUrl,
    total: category === 'hydrants' ? meta.hydrants : meta.waterTowers,
    supportedCityCount: manifest?.supportedCityCount,
    coverageScope: meta.coverageScope ?? manifest?.coverageScope,
    completenessStatus: meta.completenessStatus ?? manifest?.completenessStatus,
    coverageNote: manifest?.coverageNote,
    regionalOverlays: meta.regionalOverlays,
  };
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

export function getDatasetCompletenessNotices(meta: DatasetFreshness): DatasetCompletenessNotice[] {
  const notices: DatasetCompletenessNotice[] = [];

  if (
    meta.reconciliationStatus === 'upstream-mismatch'
    && typeof meta.total === 'number'
    && typeof meta.announcedTotal === 'number'
  ) {
    const difference = typeof meta.countDelta === 'number'
      ? Math.abs(meta.countDelta)
      : Math.abs(meta.announcedTotal - meta.total);
    notices.push({
      tone: 'warning',
      text: `공개 API ${meta.total.toLocaleString()}곳 / 관리대장 발표 ${meta.announcedTotal.toLocaleString()}곳 · ${difference.toLocaleString()}곳 차이`,
    });
  }

  if (
    typeof meta.supportedCityTotal === 'number'
    && typeof meta.total === 'number'
    && typeof meta.missingCoordinateCount === 'number'
    && meta.supportedCityTotal > 0
  ) {
    const coveragePercent = meta.coordinateCoveragePercent
      ?? Math.round((meta.total / meta.supportedCityTotal) * 1_000) / 10;
    const hasCoordinateKinds = typeof meta.facilityCoordinateCount === 'number'
      && typeof meta.addressPointCount === 'number';
    notices.push({
      tone: meta.missingCoordinateCount > 0 ? 'warning' : 'info',
      text: hasCoordinateKinds
        ? `지원 ${meta.supportedCityCount ?? '일부'}개 도시 전체 원본 ${meta.supportedCityTotal.toLocaleString()}곳 중 지도 표시 ${meta.total.toLocaleString()}곳 (${coveragePercent.toFixed(1)}%) · 시설 좌표 ${meta.facilityCoordinateCount?.toLocaleString()}곳 · 주소 대표점 ${meta.addressPointCount?.toLocaleString()}곳 · 좌표 미확인 ${meta.missingCoordinateCount.toLocaleString()}곳`
        : `지원 ${meta.supportedCityCount ?? '일부'}개 도시 전체 원본 ${meta.supportedCityTotal.toLocaleString()}곳 중 지도 좌표 확인 ${meta.total.toLocaleString()}곳 (${coveragePercent.toFixed(1)}%) · 좌표 미확인 ${meta.missingCoordinateCount.toLocaleString()}곳`,
    });
  }

  if (typeof meta.addressPointCount === 'number' && meta.addressPointCount > 0) {
    const breakdown = [
      typeof meta.legacyGeocodedAddressPointCount === 'number'
        ? `기존 주소 지오코딩 ${meta.legacyGeocodedAddressPointCount.toLocaleString()}`
        : null,
      typeof meta.legacySharedAddressPointCount === 'number'
        ? `동일 주소 이전 공식 좌표 ${meta.legacySharedAddressPointCount.toLocaleString()}`
        : null,
      typeof meta.officialAddressPointCount === 'number'
        ? `부산 공식 도로명주소 ${meta.officialAddressPointCount.toLocaleString()}`
        : null,
      typeof meta.nationalStandardHostAddressPointCount === 'number'
        ? `전국 표준 호스트 시설 ${meta.nationalStandardHostAddressPointCount.toLocaleString()}`
        : null,
      typeof meta.municipalHostAddressPointCount === 'number'
        ? `용산 지자체 호스트 시설 ${meta.municipalHostAddressPointCount.toLocaleString()}`
        : typeof meta.hostAddressPointCount === 'number'
          ? `공식 호스트 시설 ${meta.hostAddressPointCount.toLocaleString()}`
        : null,
    ].filter(Boolean);
    notices.push({
      tone: 'warning',
      text: `주소 대표점 ${meta.addressPointCount.toLocaleString()}곳`
        + (breakdown.length > 0 ? ` · ${breakdown.join(' · ')}` : '')
        + (typeof meta.officialAddressPointRepairCount === 'number'
          && meta.officialAddressPointRepairCount > 0
          ? ` (기존 오류 좌표 ${meta.officialAddressPointRepairCount.toLocaleString()}곳 교정 포함)`
          : '')
        + ' · 실제 화장실 위치나 출입구와 다를 수 있음',
    });
  }

  if ((meta.coordinateOverlays?.length ?? 0) > 0) {
    const overlays = meta.coordinateOverlays ?? [];
    const total = meta.regionalCoordinateCoverageGainCount
      ?? overlays.reduce((sum, overlay) => sum + overlay.coverageGainCount, 0);
    const upgradeCount = meta.regionalCoordinateUpgradeCount
      ?? overlays.reduce((sum, overlay) => sum + (overlay.precisionUpgradeCount ?? 0), 0);
    notices.push({
      tone: 'info',
      text: `공식 지역 시설 좌표 보충 ${total.toLocaleString()}곳`
        + (upgradeCount > 0
          ? ` · 주소 대표점에서 시설 좌표로 개선 ${upgradeCount.toLocaleString()}곳`
          : '')
        + ' · '
        + overlays
          .map(overlay => `${overlay.label} ${overlay.coverageGainCount.toLocaleString()}`)
          .join(' · '),
    });
  }

  if (
    typeof meta.activeUpstreamTotal === 'number'
    && typeof meta.total === 'number'
    && meta.activeUpstreamTotal >= meta.total
  ) {
    const supportedCityCount = meta.supportedCityCount
      ?? (meta.cities ? Object.keys(meta.cities).length : undefined);
    notices.push({
      tone: 'info',
      text: `앱 지원 ${supportedCityCount ?? '일부'}개 도시 ${meta.total.toLocaleString()}곳 / 전국 사용중 ${meta.activeUpstreamTotal.toLocaleString()}곳`,
    });
  }

  if (meta.regionCounts && Object.keys(meta.regionCounts).length > 0) {
    const shortRegionNames: Record<string, string> = {
      강원특별자치도: '강원',
      경상북도: '경북',
      부산광역시: '부산',
      울산광역시: '울산',
    };
    const regions = Object.keys(meta.regionCounts).map(region =>
      shortRegionNames[region]
      ?? region
        .replace('특별자치도', '')
        .replace('광역시', '')
        .replace('특별시', '')
        .replace(/도$/, '')
    );
    notices.push({
      tone: 'info',
      text: `공개 API 제공 범위: ${regions.join('·')} ${regions.length}개 시도`,
    });
  }

  if (
    meta.coverageScope === 'supported-cities-with-verified-regional-overlays'
    && typeof meta.supportedCityCount === 'number'
  ) {
    notices.push({
      tone: 'info',
      text: `앱 지도 제공 범위: 지원 ${meta.supportedCityCount}개 시도`,
    });
  }

  for (const overlay of meta.regionalOverlays ?? []) {
    if (overlay.overlayKind === 'partial-corroboration') {
      const sourceTotal = overlay.sourceTotal ?? 0;
      const targetTotal = overlay.targetTotal ?? 0;
      const matched = overlay.matchedCount ?? 0;
      const unmatched = overlay.unmatchedCount ?? 0;
      const ambiguous = overlay.ambiguousMatchCount ?? 0;
      notices.push({
        tone: unmatched > 0 || ambiguous > 0 ? 'warning' : 'info',
        text: `${overlay.district} 최신 원본 ${sourceTotal.toLocaleString()}행(${overlay.sourceDate}) 중 `
          + `기존 지도점 ${matched.toLocaleString()}곳 일대일 교차검증`
          + ` · 미일치 ${unmatched.toLocaleString()}행`
          + ` · 중복/다의 ${ambiguous.toLocaleString()}행은 미적용`
          + ` · 기존 ${targetTotal.toLocaleString()}곳 주소·좌표 유지`,
      });
      continue;
    }
    const mapped = overlay.coordinateMappedCount ?? overlay.total;
    const baselineBackfill = overlay.baselineCoordinateBackfillCount ?? 0;
    const total = overlay.total ?? 0;
    const missing = overlay.missingCoordinateCount ?? Math.max(0, total - (mapped ?? 0));
    notices.push({
      tone: missing > 0 || baselineBackfill > 0 ? 'warning' : 'info',
      text: `${overlay.district} 최신 원본 ${total.toLocaleString()}곳(${overlay.sourceDate}) 적용 · `
        + `지도 ${(mapped ?? 0).toLocaleString()}곳`
        + (baselineBackfill > 0
          ? `(이 중 ${baselineBackfill.toLocaleString()}곳은 정확 주소가 같은 이전 좌표 유지)`
          : '')
        + ` · 좌표 미확인 ${missing.toLocaleString()}곳`,
    });
    if ((overlay.duplicateFacilityNumberCount ?? 0) > 0) {
      notices.push({
        tone: 'warning',
        text: `공급기관 시설번호 중복 ${overlay.duplicateFacilityNumberCount?.toLocaleString()}개`
          + `(${overlay.duplicateFacilityNumberRows?.toLocaleString() ?? '여러'}행)는 임의 삭제하지 않음`,
      });
    }
    if ((overlay.normalizedAddressCount ?? 0) > 0) {
      notices.push({
        tone: 'info',
        text: `공급기관 주소의 시군구 누락 ${overlay.normalizedAddressCount?.toLocaleString()}행은 별도 시군구 필드로 보정`,
      });
    }
  }

  if (meta.coverageNote && notices.every(notice => notice.text !== meta.coverageNote)) {
    notices.push({
      tone: meta.completenessStatus === 'partial' || meta.completenessStatus === 'upstream-mismatch'
        ? 'warning'
        : 'info',
      text: meta.coverageNote,
    });
  }

  return notices;
}
