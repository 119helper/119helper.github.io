import { z } from 'zod';
import { apiFetch, isStaleDataError, tagStale } from './apiClient';

export interface HazardItem {
  id: string;
  receiveDay: string;
  occurrenceDate: string;
  treatmentPeriod: string;
  age: string;
  gender: string;
  itemMajor: string;
  itemMiddle: string;
  itemMinor: string;
  injuryReason: string;
  injuryPart: string;
  injurySymptoms: string;
  occurrencePlace: string;
}

export interface ConsumerHazardDataset {
  items: HazardItem[];
  totalCount: number;
  loadedCount: number;
  pageSize: number;
  requestedPages: number;
  loadedPages: number;
  failedPages: number[];
  latestReceiveDay: string;
  earliestReceiveDay: string;
  sourceName: string;
  sourceUrl: string;
  partial: boolean;
}

const CACHE_TTL = 1000 * 60 * 60 * 24;
// 원 API는 1,000건 응답에서 간헐적으로 Worker 제한시간을 넘는다.
// 250건씩 3페이지를 병렬 수집해 분석 범위를 넓히면서 첫 화면 실패를 피한다.
const PAGE_SIZE = 250;
const ANALYSIS_PAGE_COUNT = 3;
const SOURCE_NAME = '한국소비자원 소비자위해감시시스템(CISS)';
const SOURCE_URL = 'https://www.data.go.kr/data/15142643/openapi.do';

const hazardApiItemSchema = z.object({
  receptionNumber: z.unknown().optional(),
  receiveDay: z.unknown().optional(),
  occurrenDate: z.unknown().optional(),
  occurrenceDate: z.unknown().optional(),
  treatmentPeriod: z.unknown().optional(),
  age: z.unknown().optional(),
  gender: z.unknown().optional(),
  itemMajor: z.unknown().optional(),
  itemMiddle: z.unknown().optional(),
  itemMinor: z.unknown().optional(),
  injuryReason: z.unknown().optional(),
  injuryPart: z.unknown().optional(),
  injurySymptoms: z.unknown().optional(),
  occurrencePlace: z.unknown().optional(),
}).passthrough();

const hazardResponseSchema = z.object({
  response: z.object({
    body: z.object({
      items: z.object({
        item: z.union([hazardApiItemSchema, z.array(hazardApiItemSchema)]).optional(),
      }).passthrough().optional(),
      totalCount: z.coerce.number().catch(0),
      pageNo: z.coerce.number().catch(1),
      numOfRows: z.coerce.number().catch(PAGE_SIZE),
    }).passthrough().optional(),
  }).passthrough().optional(),
}).passthrough();

type HazardApiItem = z.infer<typeof hazardApiItemSchema>;
type HazardApiResponse = z.infer<typeof hazardResponseSchema>;

interface HazardPage {
  items: HazardItem[];
  totalCount: number;
  pageNo: number;
  numOfRows: number;
}

function text(value: unknown, fallback = ''): string {
  return value === undefined || value === null || value === '' ? fallback : String(value).trim();
}

function itemsFromResponse(json: HazardApiResponse): HazardApiItem[] {
  const raw = json.response?.body?.items?.item;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function dateValue(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function mapHazardPage(json: HazardApiResponse): HazardPage {
  const body = json.response?.body;
  const items = itemsFromResponse(json).map((item, index): HazardItem => ({
    id: text(item.receptionNumber) || `unknown-${body?.pageNo ?? 1}-${index}`,
    receiveDay: text(item.receiveDay),
    occurrenceDate: text(item.occurrenDate ?? item.occurrenceDate),
    treatmentPeriod: text(item.treatmentPeriod),
    age: text(item.age, '미상'),
    gender: text(item.gender, '미상'),
    itemMajor: text(item.itemMajor, '-'),
    itemMiddle: text(item.itemMiddle, '-'),
    itemMinor: text(item.itemMinor, '-'),
    injuryReason: text(item.injuryReason, '-'),
    injuryPart: text(item.injuryPart, '-'),
    injurySymptoms: text(item.injurySymptoms, '-'),
    occurrencePlace: text(item.occurrencePlace, '-'),
  }));

  return {
    items,
    totalCount: body?.totalCount || items.length,
    pageNo: body?.pageNo || 1,
    numOfRows: body?.numOfRows || PAGE_SIZE,
  };
}

function combinePages(
  pages: HazardPage[],
  requestedPages: number,
  failedPages: number[],
): ConsumerHazardDataset {
  const unique = new Map<string, HazardItem>();
  pages.flatMap(page => page.items).forEach(item => unique.set(item.id, item));
  const items = [...unique.values()].sort((a, b) => (
    dateValue(b.receiveDay) - dateValue(a.receiveDay) || b.id.localeCompare(a.id)
  ));
  const datedItems = items.filter(item => item.receiveDay);
  const firstPage = pages[0];

  return {
    items,
    totalCount: Math.max(firstPage?.totalCount ?? 0, items.length),
    loadedCount: items.length,
    pageSize: firstPage?.numOfRows ?? PAGE_SIZE,
    requestedPages,
    loadedPages: pages.length,
    failedPages,
    latestReceiveDay: datedItems[0]?.receiveDay ?? '',
    earliestReceiveDay: datedItems.at(-1)?.receiveDay ?? '',
    sourceName: SOURCE_NAME,
    sourceUrl: SOURCE_URL,
    partial: failedPages.length > 0,
  };
}

async function loadPage(pageNo: number, forceRefresh: boolean): Promise<{ page: HazardPage; staleAt: number | null }> {
  try {
    const json = await apiFetch<HazardApiResponse>(
      `/api/consumer-hazard?pageNo=${pageNo}&numOfRows=${PAGE_SIZE}`,
      undefined,
      {
        cacheTtlMs: CACHE_TTL,
        forceRefresh,
        timeoutMs: 30_000,
        schema: hazardResponseSchema,
      },
    );
    return { page: mapHazardPage(json), staleAt: null };
  } catch (error) {
    if (!isStaleDataError(error)) throw error;
    return {
      page: mapHazardPage(error.cachedData as HazardApiResponse),
      staleAt: error.cachedAt,
    };
  }
}

export async function fetchConsumerHazardDataset(forceRefresh = false): Promise<ConsumerHazardDataset> {
  const pageNumbers = Array.from({ length: ANALYSIS_PAGE_COUNT }, (_, index) => index + 1);
  const results = await Promise.allSettled(pageNumbers.map(pageNo => loadPage(pageNo, forceRefresh)));
  const successful = results.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
  if (successful.length === 0) {
    const firstFailure = results.find(result => result.status === 'rejected');
    throw firstFailure?.reason ?? new Error('위해정보 분석 자료를 불러오지 못했습니다.');
  }

  const totalPages = Math.max(1, Math.ceil(successful[0].page.totalCount / PAGE_SIZE));
  const requestedPages = Math.min(ANALYSIS_PAGE_COUNT, totalPages);
  const pages = successful
    .map(result => result.page)
    .filter(page => page.pageNo <= requestedPages)
    .sort((a, b) => a.pageNo - b.pageNo);
  const staleTimes = successful
    .map(result => result.staleAt)
    .filter((value): value is number => value !== null);
  const failedPages = results.flatMap((result, index) => (
    result.status === 'rejected' && pageNumbers[index] <= requestedPages ? [pageNumbers[index]] : []
  ));

  const dataset = combinePages(pages, requestedPages, failedPages);
  return staleTimes.length > 0 ? tagStale(dataset, Math.min(...staleTimes)) : dataset;
}

/** 기존 호출부 호환. 신규 화면은 범위 메타데이터가 있는 dataset 함수를 사용한다. */
export async function fetchConsumerHazards(forceRefresh = false): Promise<HazardItem[]> {
  return (await fetchConsumerHazardDataset(forceRefresh)).items;
}
