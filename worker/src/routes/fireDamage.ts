/**
 * 소방청_지역별 화재피해 현황 API 프록시
 * Base: https://apis.data.go.kr/1661000/FireDamageStatus
 *
 * ⚠ 명세(데이터셋 15142972) 기준 필수 파라미터:
 *   serviceKey, pageNo, numOfRows, resultType, startYmd, endYmd, sidoNm
 *   데이터 제공 범위: 2019.01 ~ 2023.12
 *
 * 응답 구조(주의 — header/totalCount가 최상위):
 *   { header: { resultCode, resultMsg }, numOfRows, pageNo, totalCount,
 *     body: { items: { item: {...} | [...] } } }
 */

import { encodeServiceKey, parsePublicDataJson } from './publicData';

const BASE = 'https://apis.data.go.kr/1661000/FireDamageStatus';

// 데이터 제공 종료 시점 (포털 명세: 2023년 12월까지)
const DEFAULT_START = '20230101';
const DEFAULT_END = '20231231';
const DEFAULT_SIDO = '서울특별시';

const SIDO_NAME_MAP: Record<string, string> = {
  서울: '서울특별시',
  부산: '부산광역시',
  대구: '대구광역시',
  인천: '인천광역시',
  광주: '광주광역시',
  대전: '대전광역시',
  울산: '울산광역시',
  세종: '세종특별자치시',
  경기: '경기도',
  강원: '강원특별자치도',
  충북: '충청북도',
  충남: '충청남도',
  전북: '전북특별자치도',
  전남: '전라남도',
  경북: '경상북도',
  경남: '경상남도',
  제주: '제주특별자치도',
};

function normalizeSidoName(value: string | null): string {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '전체') return DEFAULT_SIDO;
  return SIDO_NAME_MAP[trimmed] || trimmed;
}

export async function handleFireDamage(
  url: URL, apiKey: string
): Promise<{ data: unknown; cacheTtl: number }> {
  const serviceKey = encodeServiceKey(apiKey, 'FIRE_DAMAGE_API_KEY');
  const params = new URLSearchParams({ resultType: 'json' });

  // 페이지네이션
  const pageNo = url.searchParams.get('pageNo') || '1';
  const numOfRows = url.searchParams.get('numOfRows') || '100';
  params.set('pageNo', pageNo);
  params.set('numOfRows', numOfRows);

  // 필수 조회 기간 (프론트가 안 보내면 기본값)
  params.set('startYmd', url.searchParams.get('startYmd') || DEFAULT_START);
  params.set('endYmd', url.searchParams.get('endYmd') || DEFAULT_END);

  // sidoNm은 필수. 프론트 구버전은 lawAddrName으로 보내므로 정식 시도명으로 매핑.
  const sidoNm = normalizeSidoName(url.searchParams.get('sidoNm') || url.searchParams.get('lawAddrName'));
  params.set('sidoNm', sidoNm);

  const res = await fetch(`${BASE}/getOcByregionFpcnd?serviceKey=${serviceKey}&${params}`, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`FireDamageStatus ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);

  const data: any = parsePublicDataJson(text, 'FireDamageStatus');

  // header/totalCount는 최상위, items는 body.items.item (response 래핑 형태도 방어)
  const root = data?.response || data || {};
  const header = root.header || {};
  const body = root.body || {};
  const rawItems = body?.items?.item ?? body?.items ?? [];
  const items = (Array.isArray(rawItems) ? rawItems : [rawItems]).filter(Boolean);
  const totalCount = Number(root.totalCount ?? body.totalCount) || 0;

  // 에러 응답 체크 (parsePublicDataJson이 못 잡은 형태 방어)
  if (header.resultCode && !/^0+$/.test(String(header.resultCode))) {
    return {
      data: {
        items: [],
        totalCount: 0,
        error: header.resultMsg || 'API 오류',
        errorCode: header.resultCode,
      },
      cacheTtl: 60,
    };
  }

  return {
    data: {
      items,
      totalCount,
      pageNo: Number(root.pageNo ?? body.pageNo) || Number(pageNo),
      numOfRows: Number(root.numOfRows ?? body.numOfRows) || Number(numOfRows),
    },
    cacheTtl: 3600,
  };
}
