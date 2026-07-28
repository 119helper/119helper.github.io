/**
 * 행정안전부 긴급재난문자 API 프록시
 * 
 * Route: GET /api/disaster-msg
 */

import { fetchSafetydataJson } from './safetydata';
import { isRecord, requireSecret } from './publicData';
import { sanitizeNumericParam } from '../middleware/cors';

const UPSTREAM_PAGE_SIZE = 100;
const SEOUL_TIME_ZONE = 'Asia/Seoul';

interface DisasterPage {
  items: Record<string, unknown>[];
  totalCount: number;
}

function text(value: unknown): string {
  return value === undefined || value === null ? '' : String(value).trim();
}

function koreanDateKey(offsetDays = 0): string {
  const instant = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SEOUL_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant).replace(/\D/g, '');
}

function parsePage(json: unknown): DisasterPage {
  if (!isRecord(json)) return { items: [], totalCount: 0 };
  const body = Array.isArray(json.body)
    ? json.body.filter(isRecord)
    : [];
  const totalCount = Number(json.totalCount);
  return {
    items: body,
    totalCount: Number.isFinite(totalCount) ? totalCount : body.length,
  };
}

async function fetchPage(
  serviceKey: string,
  date: string,
  pageNo: number,
): Promise<DisasterPage> {
  const params = new URLSearchParams({
    serviceKey,
    returnType: 'json',
    numOfRows: String(UPSTREAM_PAGE_SIZE),
    pageNo: String(pageNo),
    crtDt: date,
  });
  return parsePage(await fetchSafetydataJson('/V2/api/DSSP-IF-00247', params, {
    label: 'DisasterMsg API',
  }));
}

async function fetchLatestDayItems(
  serviceKey: string,
  date: string,
  limit: number,
): Promise<Record<string, unknown>[]> {
  const firstPage = await fetchPage(serviceKey, date, 1);
  if (firstPage.totalCount === 0) return [];

  const lastPageNo = Math.max(1, Math.ceil(firstPage.totalCount / UPSTREAM_PAGE_SIZE));
  const lastPage = lastPageNo === 1
    ? firstPage
    : await fetchPage(serviceKey, date, lastPageNo);

  let items = lastPage.items;
  if (items.length < limit && lastPageNo > 1) {
    const previousPage = await fetchPage(serviceKey, date, lastPageNo - 1);
    items = [...previousPage.items, ...items];
  }

  return items
    .sort((a, b) => text(b.CRT_DT).localeCompare(text(a.CRT_DT)))
    .slice(0, limit);
}

function normalizeItem(item: Record<string, unknown>) {
  return {
    create_date: text(item.CRT_DT || item.REG_YMD),
    location_id: '',
    location_name: text(item.RCPTN_RGN_NM),
    md101_sn: text(item.SN),
    msg: text(item.MSG_CN),
    send_platform: 'cbs',
    msgType: text(item.EMRG_STEP_NM),
  };
}

export async function handleDisasterMsg(url: URL, apiKey?: string): Promise<{ data: unknown; cacheTtl: number }> {
  const serviceKey = requireSecret(apiKey, 'DISASTER_API_KEY');
  const numOfRows = sanitizeNumericParam(url, 'numOfRows', 1, 100, 20);

  // 날짜 조건이 없으면 API가 2023년의 첫 페이지부터 반환한다.
  // 오늘 발송분을 최신 페이지부터 읽고, 자정 직후 아직 발송분이 없을 때만 전날로 폴백한다.
  let items = await fetchLatestDayItems(serviceKey, koreanDateKey(), numOfRows);
  if (items.length === 0) {
    items = await fetchLatestDayItems(serviceKey, koreanDateKey(-1), numOfRows);
  }

  // 캐시: 재난문자는 비교적 실시간성이 중요하지만, API 호출 제한 방지를 위해 3분 캐시
  return { data: items.map(normalizeItem), cacheTtl: 180 };
}
