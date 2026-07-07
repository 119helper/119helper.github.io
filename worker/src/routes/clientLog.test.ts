import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleClientLog } from './clientLog';

const ORIGIN = 'https://119helper.github.io';

function postClientLog(body: unknown, extraHeaders?: Record<string, string>): Request {
  return new Request('https://api.example.test/api/client-log', {
    method: 'POST',
    headers: {
      Origin: ORIGIN,
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

describe('handleClientLog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('accepts valid client logs and writes structured JSON', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const response = await handleClientLog(postClientLog({
      level: 'warn',
      context: 'ErrorBoundary',
      message: 'render failed',
      stack: 'stack trace',
      url: 'https://119helper.github.io/?serviceKey=secret#dashboard',
      meta: {
        path: '/api/weather/now',
        status: 502,
        bodyPreview: 'token=secret&phone=010-1234-5678',
      },
    }, {
      'User-Agent': 'vitest',
      'CF-Connecting-IP': '203.0.113.10',
    }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(warnSpy).toHaveBeenCalledOnce();

    const entry = JSON.parse(String(warnSpy.mock.calls[0][0])) as Record<string, unknown>;
    expect(entry).toMatchObject({
      tag: '[client-error]',
      level: 'warn',
      context: 'ErrorBoundary',
      message: 'render failed',
      pageUrl: 'https://119helper.github.io/#dashboard',
      userAgent: 'vitest',
      ip: '203.0.113.10',
    });
    expect(entry.meta).toMatchObject({
      path: '/api/weather/now',
      status: 502,
      bodyPreview: 'token=[REDACTED]&phone=[PHONE]',
    });
  });

  it('rejects invalid JSON before logging', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await handleClientLog(postClientLog('{bad json'));

    expect(response.status).toBe(400);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('rejects oversized payloads before logging', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const oversized = JSON.stringify({ message: 'x'.repeat(16 * 1024) });

    const response = await handleClientLog(postClientLog(oversized));

    expect(response.status).toBe(413);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('clamps long fields in emitted logs', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await handleClientLog(postClientLog({
      context: 'x'.repeat(500),
      message: 'm'.repeat(2500),
      stack: 's'.repeat(5000),
      url: 'u'.repeat(800),
      userAgent: 'client-agent',
    }));

    expect(response.status).toBe(202);
    expect(errorSpy).toHaveBeenCalledOnce();

    const entry = JSON.parse(String(errorSpy.mock.calls[0][0])) as Record<string, string>;
    expect(entry.context).toHaveLength(200);
    expect(entry.message).toHaveLength(2000);
    expect(entry.stack).toHaveLength(4000);
    expect(entry.pageUrl).toHaveLength(500);
    expect(entry.userAgent).toBe('client-agent');
  });

  it('redacts sensitive values before logging', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const response = await handleClientLog(postClientLog({
      context: 'api',
      message: 'failed serviceKey=abc123 phone 010-1234-5678 test@example.com',
      stack: 'Error: token=my-token\nat fn (?api_key=abcdef)',
      url: 'https://119helper.github.io/?token=abc123&address=secret#weather',
    }));

    expect(response.status).toBe(202);
    const entry = JSON.parse(String(errorSpy.mock.calls[0][0])) as Record<string, string>;
    expect(entry.message).toContain('serviceKey=[REDACTED]');
    expect(entry.message).toContain('[PHONE]');
    expect(entry.message).toContain('[EMAIL]');
    expect(entry.stack).toContain('token=[REDACTED]');
    expect(entry.pageUrl).toBe('https://119helper.github.io/#weather');
  });
});
