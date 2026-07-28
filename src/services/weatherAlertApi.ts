import { z } from 'zod';
import { apiFetch, isStaleDataError, tagStale } from './apiClient';

export interface OfficialWeatherAlert {
  id: string;
  parentRegionCode: string;
  parentRegionName: string;
  regionCode: string;
  regionName: string;
  announcedAt: string;
  effectiveAt: string;
  warning: string;
  level: string;
  command: string;
  expectedEndAt?: string;
}

export interface OfficialWeatherAlertResponse {
  alerts: OfficialWeatherAlert[];
  observedAt: string;
  source: string;
  sourceUrl: string;
}

const alertSchema = z.object({
  id: z.string(),
  parentRegionCode: z.string(),
  parentRegionName: z.string(),
  regionCode: z.string(),
  regionName: z.string(),
  announcedAt: z.string(),
  effectiveAt: z.string(),
  warning: z.string(),
  level: z.string(),
  command: z.string(),
  expectedEndAt: z.string().optional(),
}).passthrough();

const responseSchema = z.object({
  alerts: z.array(alertSchema),
  observedAt: z.string(),
  source: z.string(),
  sourceUrl: z.string().url(),
}).passthrough() satisfies z.ZodType<OfficialWeatherAlertResponse>;

export async function fetchOfficialWeatherAlerts(
  city: string,
  forceRefresh = false,
): Promise<OfficialWeatherAlertResponse> {
  try {
    return await apiFetch<OfficialWeatherAlertResponse>('/api/weather-alerts', { city }, {
      cacheTtlMs: 3 * 60 * 1000,
      maxStaleMs: 10 * 60 * 1000,
      forceRefresh,
      schema: responseSchema,
    });
  } catch (error) {
    if (!isStaleDataError(error)) throw error;
    return tagStale(error.cachedData as OfficialWeatherAlertResponse, error.cachedAt);
  }
}
