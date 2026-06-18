/**
 * 클라이언트 오류 텔레메트리 수집 엔드포인트.
 *
 * 프론트엔드(ErrorBoundary, 전역 핸들러, API 실패)에서 발생한 오류를
 * 구조화된 로그로 남긴다. Cloudflare 대시보드 / `wrangler tail` 에서 조회 가능해
 * "현장 대원이 안 된다고 말해줘야 아는" 상황을 줄인다.
 *
 * 외부 유료 서비스(Sentry 등) 없이 동작하는 경량 수집기다.
 */

import { jsonResponse, errorResponse } from '../middleware/cors';

interface ClientLogPayload {
  context?: string;
  message?: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  level?: 'error' | 'warn';
  meta?: Record<string, unknown>;
}

const MAX_BODY_BYTES = 16 * 1024; // 16KB — 로그 폭주/남용 방지
const MAX_FIELD_LEN = 2000;

function redactSensitiveText(value: string): string {
  return value
    .replace(/(serviceKey|ServiceKey|api[_-]?key|token|APP_ACCESS_TOKEN|VITE_APP_TOKEN)=([^&\s]+)/gi, '$1=[REDACTED]')
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]')
    .replace(/\b01[016789][-\s]?\d{3,4}[-\s]?\d{4}\b/g, '[PHONE]')
    .replace(/\b\d{2,3}[-\s]\d{3,4}[-\s]\d{4}\b/g, '[PHONE]');
}

function sanitizeUrl(value: unknown): string {
  const raw = clamp(value, 500);
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return `${parsed.origin}${parsed.pathname}${parsed.hash}`;
  } catch {
    return redactSensitiveText(raw.split('?')[0]);
  }
}

function clamp(value: unknown, max = MAX_FIELD_LEN): string {
  if (typeof value !== 'string') return '';
  return value.slice(0, max);
}

export async function handleClientLog(request: Request): Promise<Response> {
  const raw = await request.text().catch(() => '');
  if (raw.length > MAX_BODY_BYTES) {
    return errorResponse('Payload too large', request, 413);
  }

  let payload: ClientLogPayload;
  try {
    payload = JSON.parse(raw) as ClientLogPayload;
  } catch {
    return errorResponse('Invalid JSON', request, 400);
  }

  const entry = {
    tag: '[client-error]',
    level: payload.level === 'warn' ? 'warn' : 'error',
    context: clamp(payload.context, 200),
    message: redactSensitiveText(clamp(payload.message)),
    stack: redactSensitiveText(clamp(payload.stack, MAX_FIELD_LEN * 2)),
    pageUrl: sanitizeUrl(payload.url),
    userAgent: clamp(request.headers.get('User-Agent') ?? payload.userAgent, 300),
    ip: request.headers.get('CF-Connecting-IP') ?? 'unknown',
    country: (request as Request & { cf?: { country?: string } }).cf?.country ?? 'unknown',
    at: new Date().toISOString(),
  };

  // Cloudflare 로그 스트림으로 흘려보냄 (대시보드 / wrangler tail 에서 조회)
  if (entry.level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.error(JSON.stringify(entry));
  }

  return jsonResponse({ ok: true }, request, 202);
}
