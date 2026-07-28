/**
 * 한국수자원공사 댐 방류정보 어댑터.
 *
 * 심의 승인 전에는 DAM_DISCHARGE_ENABLED=false로 두어 업스트림을 호출하지 않는다.
 * Source: https://www.data.go.kr/data/15140222/openapi.do
 */

import { sanitizeNumericParam, sanitizeStringParam } from '../middleware/cors';
import { encodeServiceKey, fetchWithRetry, findPublicDataError } from './publicData';

const DAM_DISCHARGE_URL =
  'https://apis.data.go.kr/B500001/DamDisChargeInfo/flugdschginfo';
const SOURCE_URL = 'https://www.data.go.kr/data/15140222/openapi.do';

function kstYmd(daysAgo: number): string {
  const kstNow = Date.now() + 9 * 60 * 60 * 1000 - daysAgo * 24 * 60 * 60 * 1000;
  return new Date(kstNow).toISOString().slice(0, 10).replaceAll('-', '');
}
function requestedDate(value: string | null, fallback: string): string {
  return value && /^\d{8}$/.test(value) ? value : fallback;
}

function jsonResultError(text: string): string | null {
  if (!text.trimStart().startsWith('{')) return null;
  try {
    const value = JSON.parse(text) as {
      response?: { header?: { resultCode?: unknown; resultMsg?: unknown } };
      header?: { resultCode?: unknown; resultMsg?: unknown };
    };
    const header = value.response?.header || value.header;
    const code = String(header?.resultCode ?? '00');
    if (!/^0+$/.test(code)) return `API_RESULT_${code} ${String(header?.resultMsg || '')}`.trim();
  } catch {
    return 'INVALID_JSON';
  }
  return null;
}

export async function handleDamDischarge(
  url: URL,
  apiKey: string,
  enabled: boolean,
): Promise<{ data: unknown; cacheTtl: number }> {
  if (!enabled) {
    return {
      data: {
        status: 'pending-approval',
        items: [],
        message: '공공데이터포털 활용 신청 심의가 완료되면 연동을 활성화합니다.',
        source: '한국수자원공사',
        sourceUrl: SOURCE_URL,
      },
      cacheTtl: 300,
    };
  }

  const serviceKey = encodeServiceKey(apiKey, 'PUBLIC_DATA_API_KEY/ER_API_KEY');
  const days = Number(sanitizeNumericParam(url, 'days', 1, 7, 2));
  const pageNo = sanitizeNumericParam(url, 'pageNo', 1, 1000, 1);
  const numOfRows = sanitizeNumericParam(url, 'numOfRows', 1, 1000, 100);
  const stDt = requestedDate(url.searchParams.get('stDt'), kstYmd(days - 1));
  const edDt = requestedDate(url.searchParams.get('edDt'), kstYmd(0));
  const damCd = sanitizeStringParam(url, 'damCd', 12) || '';
  if (damCd && !/^\d{1,12}$/.test(damCd)) {
    throw new Error('INVALID_DAM_CODE: damCd는 숫자 코드여야 합니다.');
  }

  const params = new URLSearchParams({ pageNo, numOfRows, stDt, edDt });
  if (damCd) params.set('damCd', damCd);
  const response = await fetchWithRetry(
    `${DAM_DISCHARGE_URL}?serviceKey=${serviceKey}&${params}`,
    { headers: { 'User-Agent': '119-helper-worker/1.0' } },
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`DamDisChargeInfo ${response.status}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);
  }
  const apiError = findPublicDataError(text) || jsonResultError(text);
  if (apiError) throw new Error(`DamDisChargeInfo: ${apiError}`);
  const trimmed = text.trimStart();
  if (!trimmed.startsWith('<') && !trimmed.startsWith('{')) {
    throw new Error(`DamDisChargeInfo: INVALID_RESPONSE ${text.replace(/\s+/g, ' ').slice(0, 120)}`);
  }

  return {
    data: {
      status: 'active',
      payload: text,
      format: trimmed.startsWith('{') ? 'json' : 'xml',
      fetchedAt: new Date().toISOString(),
      source: '한국수자원공사',
      sourceUrl: SOURCE_URL,
    },
    cacheTtl: 900,
  };
}
