/**
 * 공공데이터포털(data.go.kr) 공통 헬퍼
 *
 * 1) 서비스키 정규화 — 키가 인코딩/디코딩 어느 형태로 저장돼 있어도 정확히 1회만 인코딩되도록 보장
 * 2) 응답 파싱 — 키 미등록/미승인/한도초과 등의 에러를 삼키지 않고 명확한 에러로 표면화
 *    (프론트엔드 apiClient의 humanizeApiError가 "API_RESULT_XX" 패턴을 인식해 한국어 안내로 변환)
 * 3) 느슨한 zod 봉투 스키마로 `any` 없이 타입 안전하게 응답을 다룬다.
 *    (모든 leaf는 z.unknown(), .passthrough() — 어떤 응답도 거부하거나 변형하지 않음)
 */

import { z } from 'zod';

const headerSchema = z.object({
  resultCode: z.unknown().optional(),
  returnReasonCode: z.unknown().optional(),
  resultMsg: z.unknown().optional(),
  returnAuthMsg: z.unknown().optional(),
}).catchall(z.unknown());

const bodySchema = z.object({
  items: z.unknown().optional(),
  totalCount: z.unknown().optional(),
  pageNo: z.unknown().optional(),
  numOfRows: z.unknown().optional(),
}).catchall(z.unknown());

/**
 * 공공데이터 표준 응답 봉투(매우 느슨). 객체면 무엇이든 통과하고 값을 변형하지 않는다.
 * catchall(unknown)이라 선언 외 키(odcloud의 data 등)도 unknown으로 접근 가능.
 */
export const publicDataEnvelopeSchema = z.object({
  response: z.object({
    header: headerSchema.optional(),
    body: bodySchema.optional(),
  }).catchall(z.unknown()).optional(),
  header: headerSchema.optional(),
  body: bodySchema.optional(),
}).catchall(z.unknown());

export type PublicDataEnvelope = z.infer<typeof publicDataEnvelopeSchema>;

/** 임의의 파싱 값 → 느슨한 봉투 타입 (객체가 아니면 빈 봉투). 구조 변형 없음. */
export function coerceEnvelope(value: unknown): PublicDataEnvelope {
  const parsed = publicDataEnvelopeSchema.safeParse(value);
  return parsed.success ? parsed.data : {};
}

/** unknown 값을 항상 배열로 정규화 (단일객체 → [객체], 빈/널 → []) */
export function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

/** 배열이 아닌 일반 객체인지 (동적 응답 탐색 시 안전한 속성 접근용) */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 공공데이터 응답에서 items 배열과 totalCount를 견고하게 추출.
 * response 래핑형/평탄형, items.item 중첩, 단일 객체 모두 대응한다.
 * (emergencyStats/emergencyInfo/fireInfo 공통 패턴 — 기존 동작과 동일)
 */
export function pickItemsAndCount(data: PublicDataEnvelope): { items: unknown[]; totalCount: number } {
  const root: unknown = data.response ?? data;
  const rootRec = isRecord(root) ? root : {};
  const body: unknown = rootRec.body ?? {};
  const bodyRec = isRecord(body) ? body : {};

  const bodyItems = bodyRec.items;
  const rootItems = rootRec.items;
  const rawItems =
    (isRecord(bodyItems) ? bodyItems.item : undefined) ?? bodyItems ??
    (isRecord(rootItems) ? rootItems.item : undefined) ?? rootItems ??
    (Array.isArray(body) ? body : []);

  const items = asArray(rawItems).filter(Boolean);
  const totalCount = Number(rootRec.totalCount ?? bodyRec.totalCount) || items.length;
  return { items, totalCount };
}

/** 봉투에서 catch 블록용 에러 메시지 안전 추출 */
export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** 워커 시크릿 필수값 검증. 운영 키가 코드 fallback으로 조용히 대체되지 않도록 한다. */
export function requireSecret(key: string | undefined, secretName: string): string {
  const value = key?.trim();
  if (!value) {
    throw new Error(`API_KEY_NOT_CONFIGURED: 워커에 ${secretName} 시크릿이 등록되지 않았습니다 (wrangler secret put ${secretName})`);
  }
  return value;
}

/** 워커 시크릿 누락/인코딩 형태를 정규화한 serviceKey 반환 (URL에 직접 concat해서 사용할 것) */
export function encodeServiceKey(key: string | undefined, secretName: string): string {
  const value = requireSecret(key, secretName);
  // 이미 퍼센트 인코딩된 형태('%2B' 등 포함)면 그대로, 아니면 1회 인코딩
  return /%[0-9A-Fa-f]{2}/.test(value) ? value : encodeURIComponent(value);
}

const RETRYABLE_HTTP_STATUS = new Set([500, 502, 503, 504]);
const DEFAULT_RETRY_ATTEMPTS = 2;

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').slice(0, 140);
}

function isGatewayErrorText(text: string): boolean {
  return text.trimStart().toLowerCase().startsWith('error code:');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMs = 8_000,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

interface FetchRetryOptions {
  attempts?: number;
  timeoutMs?: number;
  baseDelayMs?: number;
}

function fetchFailureMessage(error: unknown): string {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return 'timeout';
    return error.message || error.name;
  }
  return String(error);
}

/**
 * 일시적인 네트워크 오류·타임아웃·5xx를 짧게 재시도한다.
 * 인증/입력 오류인 4xx는 즉시 반환해 호출자가 원인을 그대로 표시할 수 있게 한다.
 */
export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  {
    attempts = DEFAULT_RETRY_ATTEMPTS,
    timeoutMs = 8_000,
    baseDelayMs = 150,
  }: FetchRetryOptions = {},
): Promise<Response> {
  let lastError: unknown;
  let lastResponse: Response | undefined;
  const totalAttempts = Math.max(1, attempts);

  for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
    try {
      const response = await fetchWithTimeout(input, init, timeoutMs);
      if (!RETRYABLE_HTTP_STATUS.has(response.status) || attempt === totalAttempts - 1) {
        return response;
      }
      lastResponse = response;
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      lastError = error;
      if (attempt === totalAttempts - 1) break;
    }

    await delay(baseDelayMs * (attempt + 1));
  }

  if (lastResponse) return lastResponse;
  throw new Error(`UPSTREAM_FETCH_FAILED: ${fetchFailureMessage(lastError)}`, { cause: lastError });
}

export async function fetchPublicDataText(
  url: string,
  source: string,
  init?: RequestInit,
  attempts = 3,
): Promise<string> {
  let lastStatus = 0;
  let lastText = '';

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const res = await fetchWithTimeout(url, {
        ...init,
        headers: {
          'User-Agent': '119-helper-worker/1.0',
          ...(init?.headers || {}),
        },
      });
      lastStatus = res.status;
      lastText = await res.text();

      if (res.ok && !isGatewayErrorText(lastText)) {
        return lastText;
      }

      if (!RETRYABLE_HTTP_STATUS.has(res.status) && !isGatewayErrorText(lastText)) {
        break;
      }
    } catch (error) {
      lastText = fetchFailureMessage(error);
    }

    if (attempt < attempts - 1) {
      await delay(150 * (attempt + 1));
    }
  }

  const status = lastStatus || 'network';
  throw new Error(`${source} API ${status}: ${compact(lastText)}`);
}

/** XML/JSON 공통 — 공공데이터 에러 응답이면 throw, 아니면 null */
export function findPublicDataError(text: string): string | null {
  // 게이트웨이 인증 에러 (OpenAPI_ServiceResponse)
  const reason = text.match(/<returnReasonCode>\s*(\d+)\s*<\/returnReasonCode>/);
  if (reason) {
    const msg = text.match(/<returnAuthMsg>\s*([^<]+?)\s*<\/returnAuthMsg>/)?.[1] || '';
    return `API_RESULT_${reason[1]} ${msg}`.trim();
  }
  // 서비스 레벨 resultCode (00/0 이외는 에러)
  const rc = text.match(/<resultCode>\s*([0-9]+)\s*<\/resultCode>/);
  if (rc && !/^0+$/.test(rc[1])) {
    const msg = text.match(/<resultMsg>\s*([^<]+?)\s*<\/resultMsg>/)?.[1] || '';
    return `API_RESULT_${rc[1]} ${msg}`.trim();
  }
  return null;
}

function isPublicDataSuccessCode(code: unknown): boolean {
  if (code === undefined || code === null) return true;
  const normalized = String(code).trim().toUpperCase();
  return /^0+$/.test(normalized) || normalized === 'I100';
}

/**
 * 공공데이터 텍스트 응답을 JSON으로 파싱.
 * - XML 에러 응답이면 에러 코드를 살려서 throw (조용히 빈 배열로 바꾸지 않음)
 * - JSON 본문 안의 resultCode가 에러여도 throw
 */
export function parsePublicDataJson(text: string, source: string): PublicDataEnvelope {
  const xmlError = findPublicDataError(text);
  if (xmlError) throw new Error(`${source}: ${xmlError}`);

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(`${source}: INVALID_JSON 응답이 JSON이 아닙니다 — ${compact(text)}`);
  }

  const data = coerceEnvelope(raw);
  const header = data.response?.header ?? data.header;
  const code = header?.resultCode ?? header?.returnReasonCode;
  if (!isPublicDataSuccessCode(code)) {
    const msg = header?.resultMsg ?? header?.returnAuthMsg ?? '';
    throw new Error(`${source}: API_RESULT_${String(code)} ${String(msg)}`.trim());
  }

  return data;
}
