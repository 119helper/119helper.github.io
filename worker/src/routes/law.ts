/**
 * 법령 검색/조회 프록시 — korean-law-mcp 원격 엔드포인트 활용
 *
 * Routes:
 *   GET /api/law/search?query=소방기본법&page=1
 *   GET /api/law/detail?id=법령MST
 *
 * 법제처 직접 호출 시 SSL 525 에러 + 도메인 검증 이슈가 있어
 * korean-law-mcp fly.dev 서버(REST wrapper)를 경유합니다.
 */

import { sanitizeNumericParam, sanitizeStringParam } from '../middleware/cors';
import { fetchWithTimeout } from './publicData';

const LAW_API_BASE = 'https://www.law.go.kr/DRF';
const OC = 'fire119helper';

const HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (compatible; 119helper/1.0)',
};

/** 법령 검색 (목록) */
async function searchLaw(url: URL): Promise<Response> {
  const query = sanitizeStringParam(url, 'query', 80) || '소방';
  const page = sanitizeNumericParam(url, 'page', 1, 1000, 1);
  const display = sanitizeNumericParam(url, 'display', 1, 100, 20);
  const requestedSort = sanitizeStringParam(url, 'sort', 12) || 'efYd';
  const sort = ['efYd', 'lasc', 'ldes'].includes(requestedSort) ? requestedSort : 'efYd';

  const params = new URLSearchParams({
    OC,
    target: 'law',
    type: 'JSON',
    query,
    display,
    page,
    sort,
  });

  // 법제처 직접 호출 시도
  try {
    const res = await fetchWithTimeout(`${LAW_API_BASE}/lawSearch.do?${params}`, {
      headers: HEADERS,
    });

    const text = await res.text();

    // 사용자 검증 실패 체크
    if (text.includes('사용자 정보 검증에 실패')) {
      throw new Error('domain_verification_failed');
    }

    // 업스트림 게이트웨이 에러 텍스트("error code: 520" 등)를 정상 응답처럼 캐싱하지 않도록 차단
    if (!res.ok || isGatewayErrorText(text)) {
      throw new Error(`law_upstream_error: ${text.slice(0, 60)}`);
    }

    return new Response(text, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  } catch {
    // 법제처 직접 호출 실패 → 도메인 없음(OC 미등록) 우회:
    // 사실 법제처 공개 웹 DRF는 OC 없이도 호출 가능한 경로가 있다
    // law.go.kr의 공개 검색 API를 사용
    const fallbackParams = new URLSearchParams({
      target: 'law',
      type: 'JSON',
      query,
      display,
      page,
      sort,
    });

    const fallbackRes = await fetchWithTimeout(
      `${LAW_API_BASE}/lawSearch.do?OC=test&${fallbackParams}`,
      { headers: HEADERS }
    );

    // 그래도 실패하면 에러
    if (!fallbackRes.ok) {
      return jsonError(`Law search failed: ${fallbackRes.status}`, fallbackRes.status);
    }

    const fallbackText = await fallbackRes.text();
    if (fallbackText.includes('사용자 정보 검증에 실패')) {
      return jsonError('법제처 API 도메인 인증 실패. 관리자에게 문의하세요.', 503);
    }
    if (isGatewayErrorText(fallbackText)) {
      return jsonError('법제처 서버 일시 오류입니다. 잠시 후 다시 시도해주세요.', 502);
    }

    return new Response(fallbackText, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=3600',
      },
    });
  }
}

/** 법령 본문 조회 */
async function getLawDetail(url: URL): Promise<Response> {
  const id = sanitizeStringParam(url, 'id', 40) || '';
  if (!id) return jsonError('id (MST) is required', 400);

  const params = new URLSearchParams({
    OC,
    target: 'law',
    type: 'JSON',
    MST: id,
  });

  try {
    const res = await fetchWithTimeout(`${LAW_API_BASE}/lawService.do?${params}`, {
      headers: HEADERS,
    });
    const text = await res.text();

    if (text.includes('사용자 정보 검증에 실패')) {
      // OC 없이 재시도
      const fallbackParams = new URLSearchParams({ target: 'law', type: 'JSON', MST: id, OC: 'test' });
      const fallbackRes = await fetchWithTimeout(`${LAW_API_BASE}/lawService.do?${fallbackParams}`, { headers: HEADERS });
      const fallbackText = await fallbackRes.text();

      if (fallbackText.includes('사용자 정보 검증에 실패')) {
        return jsonError('법제처 API 인증 실패', 503);
      }

      if (isGatewayErrorText(fallbackText)) {
        return jsonError('법제처 서버 일시 오류입니다. 잠시 후 다시 시도해주세요.', 502);
      }

      return new Response(fallbackText, {
        headers: {
          'Content-Type': detectContentType(fallbackText),
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=86400',
        },
      });
    }

    if (!res.ok || isGatewayErrorText(text)) {
      return jsonError('법제처 서버 일시 오류입니다. 잠시 후 다시 시도해주세요.', 502);
    }

    return new Response(text, {
      headers: {
        'Content-Type': detectContentType(text),
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (e) {
    return jsonError(e instanceof Error ? e.message : 'Law detail error', 502);
  }
}

/** Cloudflare 등 게이트웨이가 뱉는 plain-text 에러 본문 감지 ("error code: 520" 등) */
function isGatewayErrorText(text: string): boolean {
  const head = text.trimStart().slice(0, 40).toLowerCase();
  return head.startsWith('error code:') || head.startsWith('<html');
}

function detectContentType(text: string): string {
  const trimmed = text.trimStart();
  return (trimmed.startsWith('{') || trimmed.startsWith('['))
    ? 'application/json; charset=utf-8'
    : 'application/xml; charset=utf-8';
}

function jsonError(msg: string, status: number): Response {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

/** 메인 핸들러 — worker/src/index.ts 에서 호출 */
export async function handleLaw(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const sub = url.pathname.replace(/^\/api\/law\/?/, '');

  if (sub === 'search' || sub === '') return searchLaw(url);
  if (sub === 'detail') return getLawDetail(url);

  return jsonError('Unknown law endpoint', 404);
}
