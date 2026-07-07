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
const MAX_META_DEPTH = 3;
const MAX_META_KEYS = 20;
const MAX_META_ARRAY = 20;
const MAX_META_STRING_LEN = 500;

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

async function readBoundedText(request: Request): Promise<{ text: string; tooLarge: boolean }> {
  const contentLength = Number(request.headers.get('Content-Length') || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    return { text: '', tooLarge: true };
  }

  if (!request.body) return { text: '', tooLarge: false };

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let totalBytes = 0;
  let text = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel().catch(() => undefined);
        return { text: '', tooLarge: true };
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  return { text, tooLarge: false };
}

function sanitizeMeta(value: unknown, depth = 0): unknown {
  if (depth > MAX_META_DEPTH) return '[TRUNCATED]';
  if (typeof value === 'string') return redactSensitiveText(value).slice(0, MAX_META_STRING_LEN);
  if (typeof value === 'number' || typeof value === 'boolean' || value === null) return value;
  if (Array.isArray(value)) return value.slice(0, MAX_META_ARRAY).map(item => sanitizeMeta(item, depth + 1));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, MAX_META_KEYS)
        .map(([key, item]) => [key.slice(0, 80), sanitizeMeta(item, depth + 1)])
    );
  }
  return undefined;
}

export async function handleClientLog(request: Request): Promise<Response> {
  const { text: raw, tooLarge } = await readBoundedText(request).catch(() => ({ text: '', tooLarge: false }));
  if (tooLarge) {
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
    meta: sanitizeMeta(payload.meta),
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
