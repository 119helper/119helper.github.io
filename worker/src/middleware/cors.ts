/**
 * CORS 미들웨어 — 비공개 API: 허용된 Origin만 통과
 * 
 * 외부에서 이 Worker에 직접 접근하는 것을 차단합니다.
 * 오직 우리 프론트엔드에서만 호출 가능합니다.
 */

const ALLOWED_ORIGINS = [
  'https://119helper.github.io',        // 프로덕션
  'http://localhost:5173',               // 개발 서버
  'http://localhost:4173',               // 프리뷰 서버
];

export function isOriginAllowed(request: Request): boolean {
  const origin = request.headers.get('Origin') || '';
  // Origin이 없는 요청(서버 간 직접 호출 등)도 차단
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
  };
  if (cacheTtl > 0) {
    headers['Cache-Control'] = `public, max-age=${cacheTtl}`;
  }
  return new Response(JSON.stringify(data), { status, headers });
}

export function errorResponse(message: string, request: Request, status = 500): Response {
  return jsonResponse({ error: message }, request, status);
}
