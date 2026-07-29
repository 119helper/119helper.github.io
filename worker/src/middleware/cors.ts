/**
 * CORS + 보안 미들웨어
 * 
 * - 허용된 Origin만 통과 (화이트리스트)
 * - 보안 헤더 자동 적용
 * - IP 기반 Rate Limiting (분당 60회)
 * - 쿼리 파라미터 위생 검증
 */

const ALLOWED_ORIGINS = [
  'https://119.teemozipsa.com',         // 프로덕션 사용자 지정 도메인
  'https://119helper.github.io',        // 기존 설치·전환기 호환
];

const DEVELOPMENT_ORIGINS = [
  'http://localhost:5173',               // 개발 서버
  'http://127.0.0.1:5173',               // 개발 서버 (IP)
  'http://localhost:4173',               // 프리뷰 서버
];

/* ═══ CORS ═══ */

function isProductionEnvironment(environment: string | undefined): boolean {
  return environment?.trim().toLowerCase() === 'production';
}

function isAllowedOrigin(origin: string, environment?: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  if (isProductionEnvironment(environment)) return false;
  if (DEVELOPMENT_ORIGINS.includes(origin)) return true;

  try {
    const url = new URL(origin);
    return url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '::1', '[::1]'].includes(url.hostname)
      && !!url.port;
  } catch {
    return false;
  }
}

export function isOriginAllowed(request: Request, environment?: string): boolean {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return false;
  return isAllowedOrigin(origin, environment);
}

/* ═══ 앱 토큰 (심층 방어) ═══ */
//
// Origin 헤더는 브라우저만 강제하므로 curl 등으로 위조 가능하다.
// 공유 토큰(X-App-Token)을 추가로 요구해 스크래핑/무단 프록시 사용의 문턱을 높인다.
// SPA 번들에 토큰이 노출되는 한계는 있으나, Origin 단독 검사보다 명확히 낫고
// 토큰 회전(rotation)이 가능해진다. 운영 환경에서는 APP_ACCESS_TOKEN을 필수로
// 요구하고, 로컬/테스트 환경에서는 미설정 시 기존처럼 검사를 생략한다.
export function isAppTokenRequired(environment: string | undefined): boolean {
  return isProductionEnvironment(environment);
}

export function isAppTokenValid(request: Request, expected: string | undefined): boolean {
  if (!expected) return true; // 로컬/테스트 환경 하위 호환
  const provided = request.headers.get('X-App-Token') || '';
  if (provided.length !== expected.length) return false;
  // 타이밍 공격 완화를 위한 상수 시간 비교
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= provided.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return diff === 0;
}

export function corsHeaders(request: Request, environment?: string): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = isAllowedOrigin(origin, environment);

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : '',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-App-Token',
    'Access-Control-Expose-Headers': 'X-119-Data-Stale, X-119-Data-Cached-At, Warning',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

/**
 * 라우트가 직접 만든 Response에 중앙 응답 정책을 강제 적용한다.
 * (law/equipment 등 직접 반환 라우트가 'Allow-Origin: *' 같은 느슨한 헤더를
 *  쓰지 않도록 화이트리스트 기반 CORS와 보안 헤더로 덮어쓴다.)
 */
export function applyCors(response: Response, request: Request, environment?: string): Response {
  const res = new Response(response.body, response);
  const headers = {
    ...corsHeaders(request, environment),
    ...securityHeaders(),
  };
  for (const [k, v] of Object.entries(headers)) {
    res.headers.set(k, String(v));
  }
  return res;
}

/* ═══ 보안 헤더 ═══ */

function securityHeaders(): Record<string, string> {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'X-XSS-Protection': '1; mode=block',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(self)',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  };
}

/* ═══ Rate Limiting (IP 기반, 분당 60회) ═══ */

const RATE_LIMIT_WINDOW_MS = 60_000;   // 1분
const RATE_LIMIT_MAX = 60;             // 분당 최대 요청 수

// Map<IP, { count, resetAt }>
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

// 오래된 엔트리 주기적 정리 (메모리 누수 방지)
let lastCleanup = Date.now();

function cleanupRateLimitMap() {
  const now = Date.now();
  if (now - lastCleanup < RATE_LIMIT_WINDOW_MS) return;
  lastCleanup = now;
  for (const [ip, entry] of rateLimitMap) {
    if (entry.resetAt <= now) rateLimitMap.delete(ip);
  }
}

function getClientIp(request: Request): string {
  return request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown';
}

/**
 * Cloudflare 네이티브 Rate Limiting 바인딩 인터페이스.
 * (wrangler.toml의 [[unsafe.bindings]] type = "ratelimit" 로 설정)
 */
export interface RateLimitBinding {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/**
 * 분산 rate limit 검사.
 *
 * 기존 in-memory Map은 Worker isolate마다·엣지 PoP마다 별도로 존재해
 * 실제로는 "isolate당" 한도라 사실상 제한이 되지 않았다.
 * 네이티브 바인딩은 colo 단위로 일관되며 isolate 재활용에도 살아남는다.
 * 바인딩이 없으면(로컬 dev 등) 기존 in-memory 폴백을 사용한다.
 *
 * ⚠️ 한계: 네이티브 rate limiter도 "colo(지역) 단위"라 글로벌 하드캡은 아니다.
 *    여러 지역에 분산된 공격은 colo 수만큼 한도가 배수로 늘어난다.
 *    진짜 글로벌 보호가 필요하면 애플리케이션 코드가 아니라
 *    Cloudflare WAF Rate Limiting Rules 또는 Turnstile(봇 차단)로 막아야 한다.
 *    (글로벌 단일 카운터를 Durable Object로 두면 모든 요청이 한 지점을 거쳐
 *     지연·비용이 커지므로 지연 민감한 출동 앱에는 부적합.)
 */
export async function checkRateLimitDistributed(
  request: Request,
  binding: RateLimitBinding | undefined
): Promise<{ allowed: boolean }> {
  if (binding) {
    try {
      const { success } = await binding.limit({ key: getClientIp(request) });
      return { allowed: success };
    } catch {
      // 바인딩 호출 실패 시 in-memory 폴백
    }
  }
  return { allowed: checkRateLimit(request).allowed };
}

export function checkRateLimit(request: Request): { allowed: boolean; remaining: number } {
  cleanupRateLimitMap();

  const ip = getClientIp(request);

  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || entry.resetAt <= now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1 };
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0 };
  }

  return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count };
}

/* ═══ 입력값 검증 ═══ */

/** 숫자 파라미터 검증 (최소/최대 범위) */
export function sanitizeNumericParam(
  url: URL, key: string, min: number, max: number, defaultVal: number
): string {
  const raw = url.searchParams.get(key);
  if (!raw) return String(defaultVal);
  const num = parseInt(raw, 10);
  if (isNaN(num) || num < min || num > max) return String(defaultVal);
  return String(num);
}

/** 문자열 파라미터 기본 위생 처리 (길이 제한 + 위험 문자 제거) */
export function sanitizeStringParam(url: URL, key: string, maxLen = 100): string | null {
  const raw = url.searchParams.get(key);
  if (!raw) return null;
  // 제어 문자와 HTML/SQL 문맥에서 위험한 구분자를 제거하되 주소 검색에 쓰이는 / 는 보존한다.
  return raw
    .replace(/<\/?[A-Za-z][A-Za-z0-9:-]*(?:\s+[^<>]*)?>/g, '')
    .replace(/[<>'";\\]/g, '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f]/g, '')
    .trim()
    .slice(0, maxLen) || null;
}

/* ═══ 응답 헬퍼 ═══ */

export function handleOptions(request: Request, environment?: string): Response {
  if (!isOriginAllowed(request, environment)) {
    return new Response('Forbidden', { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, environment),
  });
}

export function jsonResponse(data: unknown, request: Request, status = 200, cacheTtl = 0, environment?: string): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(request, environment),
    ...securityHeaders(),
  };
  if (cacheTtl > 0) {
    headers['Cache-Control'] = `public, max-age=${cacheTtl}`;
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function errorResponse(message: string, request: Request, status = 500, environment?: string): Response {
  return jsonResponse({ error: message }, request, status, 0, environment);
}

export function rateLimitResponse(request: Request, environment?: string): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Retry-After': '60',
    ...corsHeaders(request, environment),
    ...securityHeaders(),
  };
  return new Response(
    JSON.stringify({ error: 'API 호출 한도 초과 (분당 60회). 잠시 후 다시 시도해주세요.' }),
    { status: 429, headers }
  );
}
