import { apiFetch } from './apiClient';
import { isStaleDataError } from './apiClient';
import { z } from 'zod';

export interface HazardItem {
  id: string;
  receiveDay: string;      // 접수일자
  age: string;             // 나이
  gender: string;          // 성별
  itemMajor: string;       // 품목대분류
  itemMiddle: string;      // 품목중분류
  itemMinor: string;       // 품목소분류
  injuryReason: string;    // 위해원인
  injuryPart: string;      // 위해부위
  injurySymptoms: string;  // 위해증상
  occurrencePlace: string; // 발생장소
}

const CACHE_TTL = 1000 * 60 * 60 * 24; // 1일 캐시

const hazardApiItemSchema = z.object({
  receptionNumber: z.unknown().optional(),
  receiveDay: z.unknown().optional(),
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
    }).passthrough().optional(),
  }).passthrough().optional(),
}).passthrough();

type HazardApiItem = z.infer<typeof hazardApiItemSchema>;
type HazardApiResponse = z.infer<typeof hazardResponseSchema>;

function text(value: unknown, fallback = ''): string {
  return value === undefined || value === null || value === '' ? fallback : String(value);
}

function itemsFromResponse(json: HazardApiResponse): HazardApiItem[] {
  const raw = json.response?.body?.items?.item;
  if (!raw) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function mapHazards(json: HazardApiResponse): HazardItem[] {
  const items = itemsFromResponse(json).map((item): HazardItem => ({
    id: text(item.receptionNumber) || Math.random().toString(36).substr(2, 9),
    receiveDay: text(item.receiveDay),
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

  return items.sort((a, b) => new Date(b.receiveDay).getTime() - new Date(a.receiveDay).getTime());
}

export async function fetchConsumerHazards(forceRefresh = false): Promise<HazardItem[]> {
  try {
    // Cloudflare Worker 프록시 통신
    const json = await apiFetch<HazardApiResponse>('/api/consumer-hazard', undefined, {
      cacheTtlMs: CACHE_TTL,
      forceRefresh,
      schema: hazardResponseSchema,
    });

    return mapHazards(json);
  } catch (err) {
    if (isStaleDataError(err)) {
      return mapHazards(err.cachedData as HazardApiResponse);
    }
    console.error('Consumer Hazard Fetch Error:', err);
    return [];
  }
}
