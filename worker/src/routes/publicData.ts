/**
 * 공공데이터포털(data.go.kr) 공통 헬퍼
 *
 * 1) 서비스키 정규화 — 키가 인코딩/디코딩 어느 형태로 저장돼 있어도 정확히 1회만 인코딩되도록 보장
 * 2) 응답 파싱 — 키 미등록/미승인/한도초과 등의 에러를 삼키지 않고 명확한 에러로 표면화
 *    (프론트엔드 apiClient의 humanizeApiError가 "API_RESULT_XX" 패턴을 인식해 한국어 안내로 변환)
 */

/** 워커 시크릿 누락/인코딩 형태를 정규화한 serviceKey 반환 (URL에 직접 concat해서 사용할 것) */
export function encodeServiceKey(key: string | undefined, secretName: string): string {
  if (!key) {
    throw new Error(`API_KEY_NOT_CONFIGURED: 워커에 ${secretName} 시크릿이 등록되지 않았습니다 (wrangler secret put ${secretName})`);
  }
  // 이미 퍼센트 인코딩된 형태('%2B' 등 포함)면 그대로, 아니면 1회 인코딩
  return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
}

/** XML/JSON 공통 — 공공데이터 에러 응답이면 throw, 아니면 null */
export function findPublicDataError(text: string): string | null {
  // 게이트웨이 인증 에러 (OpenAPI_ServiceResponse)
  const reason = text.match(/<returnReasonCode>\s*(\d+)\s*<\/returnReasonCode>/);
  if (reason) {
    const msg = text.match(/<returnAuthMsg>\s*([^<]+?)\s*<\/returnAuthMsg>/)?.[1] || '';
    return `API_RESULT_${reason[1]} ${msg}`.trim();
  }
  // 서비스 레벨 resultCode (00/0 이외는 에러)
  const rc = text.match(/<resultCode>\s*([0-9]+)\s*<\/resultCode>/);
  if (rc && !/^0+$/.test(rc[1])) {
    const msg = text.match(/<resultMsg>\s*([^<]+?)\s*<\/resultMsg>/)?.[1] || '';
    return `API_RESULT_${rc[1]} ${msg}`.trim();
  }
  return null;
}

/**
 * 공공데이터 텍스트 응답을 JSON으로 파싱.
 * - XML 에러 응답이면 에러 코드를 살려서 throw (조용히 빈 배열로 바꾸지 않음)
 * - JSON 본문 안의 resultCode가 에러여도 throw
 */
export function parsePublicDataJson(text: string, source: string): any {
  const xmlError = findPublicDataError(text);
  if (xmlError) throw new Error(`${source}: ${xmlError}`);

  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`${source}: INVALID_JSON 응답이 JSON이 아닙니다 — ${text.replace(/\s+/g, ' ').slice(0, 140)}`);
  }

  const header = data?.response?.header || data?.header;
  const code = header?.resultCode ?? header?.returnReasonCode;
  if (code !== undefined && code !== null && !/^0+$/.test(String(code))) {
    const msg = header?.resultMsg || header?.returnAuthMsg || '';
    throw new Error(`${source}: API_RESULT_${code} ${msg}`.trim());
  }

  return data;
}
