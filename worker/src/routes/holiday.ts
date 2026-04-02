/**
 * 공휴일 API 프록시
 * Route: GET /api/holiday?year=2026&month=4
 */

export async function handleHoliday(url: URL, apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const year = url.searchParams.get('year') || String(new Date().getFullYear());
  const month = (url.searchParams.get('month') || '1').padStart(2, '0');

  // 공공데이터 API 키는 이미 URL 인코딩된 형태로 저장되어 있으므로
  // URLSearchParams 사용 시 이중 인코딩 발생 → 수동 구성
  const apiUrl = `https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${apiKey}&solYear=${year}&solMonth=${month}&numOfRows=30`;

  const res = await fetch(apiUrl, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });
  if (!res.ok) throw new Error(`Holiday API ${res.status}`);
  const text = await res.text();

  return { data: { xml: text }, cacheTtl: 604800 }; // 7일 캐시
}
