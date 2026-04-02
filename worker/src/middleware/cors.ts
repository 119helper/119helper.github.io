/**
 * CORS 미들웨어 — 허용된 Origin만 통과
 */
const ALLOWED_ORIGINS = [
  'https://119helper.github.io',
  'https://119helper.pages.dev',
  'http://localhost:5173',
  'http://localhost:4173',
];

export function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('Origin') || '';
  const isAllowed = ALLOWED_ORIGINS.some(o => origin === o) || origin.endsWith('.pages.dev');

  return {
    'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

export function handleOptions(request: Request): Response {
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
