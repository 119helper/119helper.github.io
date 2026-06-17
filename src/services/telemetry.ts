/**
 * 경량 클라이언트 텔레메트리.
 *
 * 외부 유료 서비스(Sentry 등) 없이, 프론트엔드 오류를 Worker의
 * /api/client-log 로 보내 Cloudflare 로그에 남긴다.
 * - 전역 오류/프로미스 거부, ErrorBoundary, API 실패 지점에서 호출한다.
 * - 항상 best-effort: 전송 실패는 절대 앱 동작에 영향을 주지 않는다.
 * - 짧은 시간 내 동일/과다 전송은 throttle 해 로그 폭주와 루프를 막는다.
 */

const API_BASE = import.meta.env.VITE_API_BASE || 'https://119-helper-api.teemozipsa.workers.dev';
const APP_TOKEN = import.meta.env.VITE_APP_TOKEN || '';

const THROTTLE_WINDOW_MS = 10_000; // 동일 시그니처는 10초에 1회만
const MAX_PER_WINDOW = 10;         // 윈도우당 총 전송 상한
const recentSignatures = new Map<string, number>();
let windowStart = Date.now();
let windowCount = 0;

function shouldSend(signature: string): boolean {
  const now = Date.now();

  if (now - windowStart > THROTTLE_WINDOW_MS) {
    windowStart = now;
    windowCount = 0;
    recentSignatures.clear();
  }
  if (windowCount >= MAX_PER_WINDOW) return false;

  const last = recentSignatures.get(signature);
  if (last && now - last < THROTTLE_WINDOW_MS) return false;

  recentSignatures.set(signature, now);
  windowCount++;
  return true;
}

export interface ClientErrorReport {
  context: string;
  level?: 'error' | 'warn';
  meta?: Record<string, unknown>;
}

export function reportClientError(error: unknown, report: ClientErrorReport): void {
  try {
    const message = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    const signature = `${report.context}:${message}`.slice(0, 200);

    if (!shouldSend(signature)) return;

    const body = JSON.stringify({
      context: report.context,
      level: report.level ?? 'error',
      message,
      stack,
      url: typeof location !== 'undefined' ? location.href : '',
      meta: report.meta,
    });

    const url = `${API_BASE}/api/client-log`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN;

    // keepalive: 페이지 이탈 중에도 전송 보장. 실패는 조용히 무시.
    void fetch(url, { method: 'POST', headers, body, keepalive: true }).catch(() => {});
  } catch {
    // 텔레메트리는 절대 앱을 깨뜨리지 않는다.
  }
}

/** 전역 오류/프로미스 거부 핸들러 등록 (앱 진입점에서 1회 호출). */
export function installGlobalErrorReporting(): void {
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    reportClientError(event.error ?? event.message, { context: 'window.onerror' });
  });

  window.addEventListener('unhandledrejection', (event) => {
    reportClientError(event.reason, { context: 'unhandledrejection' });
  });
}
