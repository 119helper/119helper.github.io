/*
 * 관할 지역 오프라인 데이터 사전 다운로드
 *
 * 소방서 와이파이 등 신호가 좋을 때 관할 지역의 정적 데이터
 * (소화전·급수탑, 공중화장실, 대피소 번들)를 미리 받아
 * 서비스 워커의 DATA 캐시에 넣어둔다.
 * 출동 중 신호가 끊겨도 시설 조회가 동작하게 하는 핵심 현장 기능.
 *
 * 캐시 이름은 sw.js의 DATA_CACHE와 반드시 일치해야 한다.
 * (페이지에서 Cache API로 직접 쓰고, SW가 fetch 시 같은 캐시에서 읽는다)
 */

import { CITY_TO_STATIC_PROVINCE } from './administrativeRegions';

const DATA_CACHE = '119-data-v2'; // sw.js와 동일해야 함
const STATUS_KEY = '119helper-offline-region';

// 소방용수 데이터가 구별로 분할된 도시
const SPLIT_CITIES = new Set(['서울특별시', '부산광역시', '대구광역시', '인천광역시', '광주광역시']);

export interface OfflineRegionStatus {
  city: string;
  downloadedAt: number;
  fileCount: number;
  failedCount: number;
  expectedUrls?: string[];
  verified?: boolean;
}

export interface DownloadProgress {
  done: number;
  total: number;
  currentLabel: string;
}

export function getRegionStatus(): OfflineRegionStatus | null {
  try {
    const raw = localStorage.getItem(STATUS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** 저장 기록과 실제 Cache API 항목을 대조한다. 구버전 기록은 재다운로드가 필요하다. */
export async function getVerifiedRegionStatus(): Promise<OfflineRegionStatus | null> {
  const status = getRegionStatus();
  if (!status) return null;
  if (!isOfflineDataSupported() || !status.expectedUrls?.length) {
    return { ...status, verified: false };
  }

  try {
    const cache = await caches.open(DATA_CACHE);
    const cached = await Promise.all(status.expectedUrls.map(url => cache.match(url)));
    const fileCount = cached.filter(Boolean).length;
    return {
      ...status,
      fileCount,
      failedCount: status.expectedUrls.length - fileCount,
      verified: true,
    };
  } catch {
    return { ...status, verified: false };
  }
}

function saveRegionStatus(status: OfflineRegionStatus) {
  try {
    localStorage.setItem(STATUS_KEY, JSON.stringify(status));
  } catch { /* quota 초과 등 — 상태 저장 실패해도 캐시는 유효 */ }
}

export function isOfflineDataSupported(): boolean {
  return typeof caches !== 'undefined';
}

/** 브라우저가 저장소를 임의로 비우지 않도록 영구 저장 요청 (사용자 명시 동작 시점에 호출) */
async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage?.persist) {
      return await navigator.storage.persist();
    }
  } catch { /* 미지원 브라우저 */ }
  return false;
}

/** index.json을 읽고 구별 파일 URL 목록을 만든다. index가 없으면 빈 배열. */
async function listDistrictUrls(indexUrl: string, baseDir: string): Promise<string[]> {
  try {
    const res = await fetch(indexUrl, { cache: 'no-store' });
    if (!res.ok) return [];
    const index = await res.json() as { districts?: Record<string, number> };
    if (!index?.districts) return [];
    return Object.keys(index.districts).map(d => `${baseDir}/${d}.json`);
  } catch {
    return [];
  }
}

/** 다운로드 대상 URL 목록 구성 */
async function buildUrlList(city: string): Promise<string[]> {
  const kr = CITY_TO_STATIC_PROVINCE[city] || '서울특별시';
  const urls: string[] = [];

  // 1. 소방용수시설
  if (SPLIT_CITIES.has(kr)) {
    const indexUrl = `/firewater/${kr}/index.json`;
    urls.push(indexUrl);
    urls.push(...await listDistrictUrls(indexUrl, `/firewater/${kr}`));
  } else {
    urls.push(`/firewater/${kr}.json`);
  }

  // 2. 공중화장실 (영문 도시키 디렉터리)
  const restroomIndexUrl = `/data/restrooms/${city}/index.json`;
  const restroomUrls = await listDistrictUrls(restroomIndexUrl, `/data/restrooms/${city}`);
  if (restroomUrls.length > 0) {
    urls.push(restroomIndexUrl, ...restroomUrls);
  }
  const restroomAddressPointIndexUrl = `/data/restroom-address-points/${city}/index.json`;
  const restroomAddressPointUrls = await listDistrictUrls(
    restroomAddressPointIndexUrl,
    `/data/restroom-address-points/${city}`,
  );
  if (restroomAddressPointUrls.length > 0) {
    urls.push(restroomAddressPointIndexUrl, ...restroomAddressPointUrls);
  }

  // 3. 대피소 (지진해일 전국 파일 + 민방위 지역 파일)
  urls.push('/data/tsunami.json');
  urls.push(`/data/civil/${city}.json`);

  return urls;
}

/**
 * 관할 지역 데이터 다운로드 → SW DATA 캐시 적재
 * 동시 3개씩, 진행률 콜백 제공. 개별 실패는 건너뛰고 카운트만 남긴다.
 */
export async function downloadRegionData(
  city: string,
  onProgress?: (p: DownloadProgress) => void
): Promise<OfflineRegionStatus> {
  if (!isOfflineDataSupported()) {
    throw new Error('이 브라우저는 오프라인 저장(Cache API)을 지원하지 않습니다.');
  }

  await requestPersistentStorage();

  const urls = await buildUrlList(city);
  if (urls.length === 0) {
    throw new Error('다운로드할 지역 데이터를 찾지 못했습니다.');
  }

  const cache = await caches.open(DATA_CACHE);
  let done = 0;
  let failed = 0;
  const total = urls.length;

  const queue = [...urls];
  const worker = async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) break;
      try {
        // no-store로 받아 최신본을 캐시에 넣는다 (SWR 캐시 갱신과 동일 효과)
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          await cache.put(url, res);
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
      done += 1;
      onProgress?.({ done, total, currentLabel: decodeURIComponent(url.split('/').pop() || '') });
    }
  };

  await Promise.all([worker(), worker(), worker()]);

  const status: OfflineRegionStatus = {
    city,
    downloadedAt: Date.now(),
    fileCount: total - failed,
    failedCount: failed,
    expectedUrls: urls,
    verified: true,
  };
  saveRegionStatus(status);
  return status;
}

/** 받아둔 관할 데이터 삭제 */
export async function clearRegionData(): Promise<void> {
  if (isOfflineDataSupported()) {
    await caches.delete(DATA_CACHE);
  }
  try {
    localStorage.removeItem(STATUS_KEY);
  } catch { /* ignore */ }
}
