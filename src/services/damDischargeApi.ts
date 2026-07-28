import {
  fetchDamDischarge,
  isStaleDataError,
  tagStale,
  type DamDischargeApiResponse,
} from './apiClient';

export interface DamDischargeEvent {
  id: string;
  damCode: string;
  damName: string;
  coordinates: string;
  startedAt: string;
  endedAt: string;
  createdAt: string;
  updatedAt: string;
  affectedArea: string;
}
export interface DamDischargeStatus {
  status: 'pending-approval' | 'active';
  items: DamDischargeEvent[];
  message?: string;
  fetchedAt?: string;
  source: string;
  sourceUrl: string;
}

function textFrom(element: Element, tag: string): string {
  return element.getElementsByTagName(tag)[0]?.textContent?.trim() || '';
}

function itemFromRecord(record: Record<string, unknown>, index: number): DamDischargeEvent {
  const text = (key: string) => String(record[key] ?? '').trim();
  const damCode = text('damcd') || text('damCd');
  const startedAt = text('startdate') || text('startDate');
  return {
    id: `${damCode || text('damNm') || 'dam'}:${startedAt || index}`,
    damCode,
    damName: text('damNm') || '댐 이름 미상',
    coordinates: text('damcoord') || text('damCoord'),
    startedAt,
    endedAt: text('enddate') || text('endDate'),
    createdAt: text('createddate') || text('createdDate'),
    updatedAt: text('updateddate') || text('updatedDate'),
    affectedArea: text('affectarea') || text('affectArea'),
  };
}

function parseXml(payload: string): DamDischargeEvent[] {
  const documentNode = new DOMParser().parseFromString(payload, 'text/xml');
  if (documentNode.querySelector('parsererror')) throw new Error('댐 방류 응답 XML 형식이 올바르지 않습니다.');
  return [...documentNode.querySelectorAll('item')].map((item, index) => {
    const damCode = textFrom(item, 'damcd');
    const startedAt = textFrom(item, 'startdate');
    return {
      id: `${damCode || textFrom(item, 'damNm') || 'dam'}:${startedAt || index}`,
      damCode,
      damName: textFrom(item, 'damNm') || '댐 이름 미상',
      coordinates: textFrom(item, 'damcoord'),
      startedAt,
      endedAt: textFrom(item, 'enddate'),
      createdAt: textFrom(item, 'createddate'),
      updatedAt: textFrom(item, 'updateddate'),
      affectedArea: textFrom(item, 'affectarea'),
    };
  });
}

function extractJsonItems(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter(item => item && typeof item === 'object') as Record<string, unknown>[];
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  for (const key of ['response', 'body', 'items', 'item', 'data']) {
    if (key in record) {
      const found = extractJsonItems(record[key]);
      if (found.length > 0) return found;
    }
  }
  return ('damNm' in record || 'damcd' in record) ? [record] : [];
}

export function parseDamDischargeResponse(response: DamDischargeApiResponse): DamDischargeStatus {
  const source = response.source || '한국수자원공사';
  const sourceUrl = response.sourceUrl || 'https://www.data.go.kr/data/15140222/openapi.do';
  if (response.status === 'pending-approval') {
    return {
      status: 'pending-approval',
      items: [],
      message: response.message,
      source,
      sourceUrl,
    };
  }

  if (!response.payload) throw new Error('댐 방류 API 응답 본문이 없습니다.');
  const items = response.format === 'json'
    ? extractJsonItems(JSON.parse(response.payload)).map(itemFromRecord)
    : parseXml(response.payload);

  return {
    status: 'active',
    items: items.sort((a, b) => b.startedAt.localeCompare(a.startedAt)),
    fetchedAt: response.fetchedAt,
    source,
    sourceUrl,
  };
}

export async function getDamDischargeStatus(forceRefresh = false): Promise<DamDischargeStatus> {
  try {
    return parseDamDischargeResponse(await fetchDamDischarge(forceRefresh));
  } catch (error) {
    if (isStaleDataError(error)) {
      return tagStale(
        parseDamDischargeResponse(error.cachedData as DamDischargeApiResponse),
        error.cachedAt,
      );
    }
    throw error;
  }
}
