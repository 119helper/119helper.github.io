// 지진해일 긴급 대피장소 API 프록시
// Route: GET /api/shelter?ctprvnNm=경상북도&numOfRows=100&pageNo=1

import { fetchSafetydataJson } from './safetydata';
import { isRecord } from './publicData';

const SAFETYDATA_TSUNAMI_KEY = '5D5834I0Q3N1GT96';
const SAFETYDATA_TSUNAMI_PATH = '/V2/api/DSSP-IF-10944';

function normalizeSafetydataShelter(item: Record<string, unknown>) {
  return {
    lat: item.LA,
    lot: item.LO,
    latitude: item.LA,
    longitude: item.LO,
    shelterNm: item.SHNT_PLACE_NM,
    shelterName: item.SHNT_PLACE_NM,
    shltNm: item.SHNT_PLACE_NM,
    rdnmadr: item.RN_DTL_ADRES || item.SHNT_PLACE_DTL_POSITION,
    lnmadr: item.SHNT_PLACE_DTL_POSITION,
    dtlAdres: item.SHNT_PLACE_DTL_POSITION,
    shltSeCo: item.PSBL_NMPR,
    acmPrsnCo: item.PSBL_NMPR,
    capacity: item.PSBL_NMPR,
    seaLvlHght: item.EV_ANTCTY,
    altitude: item.EV_ANTCTY,
    useYn: item.USE_AT,
    ctprvnNm: item.CTPRVN_NM,
  };
}

async function fetchSafetydataTsunami(params: URLSearchParams): Promise<unknown> {
  return fetchSafetydataJson(SAFETYDATA_TSUNAMI_PATH, params, { label: 'Safetydata Shelter API' });
}

export async function handleShelter(url: URL, _apiKey: string): Promise<{ data: unknown; cacheTtl: number }> {
  const ctprvnNm = url.searchParams.get('ctprvnNm') || '';
  const signguNm = url.searchParams.get('signguNm') || '';
  const numOfRows = url.searchParams.get('numOfRows') || '100';
  const pageNo = url.searchParams.get('pageNo') || '1';
  const upstreamRows = ctprvnNm || signguNm ? '1000' : numOfRows;

  const params = new URLSearchParams({
    serviceKey: SAFETYDATA_TSUNAMI_KEY,
    pageNo,
    numOfRows: upstreamRows,
  });

  const json = await fetchSafetydataTsunami(params);
  const header = isRecord(json) && isRecord(json.header) ? json.header : {};
  if (header.resultCode !== '00') {
    throw new Error(`Safetydata Shelter API_RESULT_${String(header.resultCode)}: ${String(header.resultMsg ?? 'Unknown API Error')}`);
  }

  const body: unknown = isRecord(json) ? json.body : undefined;
  const rawItems = Array.isArray(body) ? body : [];
  const items = rawItems
    .filter(isRecord)
    .filter((item) => {
      const address = String(item.SHNT_PLACE_DTL_POSITION || item.RN_DTL_ADRES || '');
      if (ctprvnNm && !address.startsWith(ctprvnNm)) return false;
      if (signguNm && !address.includes(signguNm)) return false;
      return true;
    })
    .map(normalizeSafetydataShelter);

  return { data: items, cacheTtl: 86400 };
}
