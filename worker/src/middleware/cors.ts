/**
 * CORS + 보안 미들웨어
 * 
 * - 허용된 Origin만 통과 (화이트리스트)
 * - 보안 헤더 자동 적용
 * - IP 기반 Rate Limiting (분당 60회)
 * - 쿼리 파라미터 위생 검증
 */

const ALLOWED_ORIGINS = [
  'https://119helper.github.io',        // 프로덕션
  'http://localhost:5173',               // 개발 서버
  'http://localhost:4173',               // 프리뷰 서버
];

/* ═══ CORS ═══ */

export function isOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return false;
  return ALLOWED_ORIGINS.some(o => origin === o);
}

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(o => origin === o);

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : '',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
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

export function checkRateLimit(request: Request): { allowed: boolean; remaining: number } {
  cleanupRateLimitMap();
  
  const ip = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || 'unknown';

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
  // 제어 문자, 스크립트 태그 등 제거
  return raw
    .replace(/[<>'";\\/]/g, '')
    .replace(/[\x00-\x1f]/g, '')
    .slice(0, maxLen)
    .trim() || null;
}

/* ═══ 응답 헬퍼 ═══ */

export function handleOptions(request: Request): Response {
  if (!isOriginAllowed(request)) {
    return new Response('Forbidden', { status: 403 });
  }
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request),
  });
}

export function jsonResponse(data: unknown, request: Request, status = 200, cacheTtl = 0): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsHeaders(request),
    ...securityHeaders(),
  };
  if (cacheTtl > 0) {
    headers['Cache-Control'] = `public, max-age=${cacheTtl}`;
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function errorResponse(message: string, request: Request, status = 500): Response {
  return jsonResponse({ error: message }, request, status);
}

export function rateLimitResponse(request: Request): Response {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json; charset=utf-8',
    'Retry-After': '60',
    ...corsHeaders(request),
    ...securityHeaders(),
  };
  return new Response(
    JSON.stringify({ error: 'API 호출 한도 초과 (분당 60회). 잠시 후 다시 시도해주세요.' }),
    { status: 429, headers }
  );
}
