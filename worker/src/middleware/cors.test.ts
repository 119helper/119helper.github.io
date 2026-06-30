import { describe, expect, it } from 'vitest';
import { corsHeaders, isAppTokenRequired, isAppTokenValid, isOriginAllowed, sanitizeStringParam } from './cors';

function requestWithOrigin(origin?: string, token?: string): Request {
  const headers = new Headers();
  if (origin) headers.set('Origin', origin);
  if (token) headers.set('X-App-Token', token);
  return new Request('https://api.example.test/api/health', { headers });
}

describe('isOriginAllowed', () => {
  it('allows configured production and development origins', () => {
    expect(isOriginAllowed(requestWithOrigin('https://119helper.github.io'))).toBe(true);
    expect(isOriginAllowed(requestWithOrigin('http://localhost:5173'))).toBe(true);
    expect(isOriginAllowed(requestWithOrigin('http://127.0.0.1:5173'))).toBe(true);
  });

  it('allows localhost and loopback origins only when an explicit port is present', () => {
    expect(isOriginAllowed(requestWithOrigin('http://localhost:3000'))).toBe(true);
    expect(isOriginAllowed(requestWithOrigin('http://127.0.0.1:8787'))).toBe(true);
    expect(isOriginAllowed(requestWithOrigin('http://[::1]:5173'))).toBe(true);

    expect(isOriginAllowed(requestWithOrigin('http://localhost'))).toBe(false);
    expect(isOriginAllowed(requestWithOrigin('https://localhost:5173'))).toBe(false);
  });

  it('rejects localhost origins in production', () => {
    expect(isOriginAllowed(requestWithOrigin('http://localhost:5173'), 'production')).toBe(false);
    expect(isOriginAllowed(requestWithOrigin('http://127.0.0.1:5173'), 'production')).toBe(false);
    expect(isOriginAllowed(requestWithOrigin('https://119helper.github.io'), 'production')).toBe(true);
  });

  it('rejects missing, malformed, and untrusted origins', () => {
    expect(isOriginAllowed(requestWithOrigin())).toBe(false);
    expect(isOriginAllowed(requestWithOrigin('not a url'))).toBe(false);
    expect(isOriginAllowed(requestWithOrigin('https://evil.example'))).toBe(false);
  });

  it('does not reflect disallowed origins in CORS headers', () => {
    const headers = corsHeaders(requestWithOrigin('https://evil.example'));
    expect(headers['Access-Control-Allow-Origin']).toBe('');
    expect(headers.Vary).toBe('Origin');
  });
});

describe('isAppTokenValid', () => {
  it('requires app tokens only in production environment', () => {
    expect(isAppTokenRequired('production')).toBe(true);
    expect(isAppTokenRequired('PRODUCTION')).toBe(true);
    expect(isAppTokenRequired('development')).toBe(false);
    expect(isAppTokenRequired(undefined)).toBe(false);
  });

  it('allows requests when APP_ACCESS_TOKEN is not configured', () => {
    expect(isAppTokenValid(requestWithOrigin('https://119helper.github.io'), undefined)).toBe(true);
    expect(isAppTokenValid(requestWithOrigin('https://119helper.github.io'), '')).toBe(true);
  });

  it('accepts exactly matching app tokens', () => {
    expect(isAppTokenValid(requestWithOrigin('https://119helper.github.io', 'secret-token'), 'secret-token')).toBe(true);
  });

  it('rejects missing, different, or differently sized tokens', () => {
    expect(isAppTokenValid(requestWithOrigin('https://119helper.github.io'), 'secret-token')).toBe(false);
    expect(isAppTokenValid(requestWithOrigin('https://119helper.github.io', 'secret-tokem'), 'secret-token')).toBe(false);
    expect(isAppTokenValid(requestWithOrigin('https://119helper.github.io', 'secret-token-extra'), 'secret-token')).toBe(false);
  });
});

describe('sanitizeStringParam', () => {
  it('removes control characters and dangerous delimiters', () => {
    const url = new URL('https://api.example.test/?q=%3Cscript%3E%22%27%3B%5Cabc%00def');

    expect(sanitizeStringParam(url, 'q')).toBe('scriptabcdef');
  });

  it('preserves Korean address separators used in search terms', () => {
    const url = new URL('https://api.example.test/?q=' + encodeURIComponent('서울 강남구 테헤란로/역삼동 119안전센터'));

    expect(sanitizeStringParam(url, 'q')).toBe('서울 강남구 테헤란로/역삼동 119안전센터');
  });

  it('trims, clamps, and returns null for empty values', () => {
    const url = new URL('https://api.example.test/?q=' + encodeURIComponent('  abcdef  ') + '&blank=');

    expect(sanitizeStringParam(url, 'q', 3)).toBe('abc');
    expect(sanitizeStringParam(url, 'blank')).toBeNull();
    expect(sanitizeStringParam(url, 'missing')).toBeNull();
  });
});
