import { sanitizeStringParam } from '../middleware/cors';
import { encodeServiceKey, fetchWithRetry } from './publicData';

const KMA_WARNING_STATUS_URL = 'https://apihub.kma.go.kr/api/typ01/url/wrn_now_data_new.php';
const KMA_WARNING_PAGE_URL = 'https://www.weather.go.kr/w/special-report/overall.do';

export interface OfficialWeatherAlert {
  id: string;
  parentRegionCode: string;
  parentRegionName: string;
  regionCode: string;
  regionName: string;
  announcedAt: string;
  effectiveAt: string;
  warning: string;
  level: string;
  command: string;
  expectedEndAt?: string;
}

export interface OfficialWeatherAlertResponse {
  alerts: OfficialWeatherAlert[];
  observedAt: string;
  source: '기상청 API Hub';
  sourceUrl: string;
}

const CITY_REGION_NAMES: Record<string, string[]> = {
  서울: ['서울', '서울특별시'],
  부산: ['부산', '부산광역시'],
  대구: ['대구', '대구광역시'],
  인천: ['인천', '인천광역시'],
  광주: ['광주', '광주광역시', '전남광주통합특별시'],
  대전: ['대전', '대전광역시'],
  울산: ['울산', '울산광역시'],
  세종: ['세종', '세종특별자치시'],
  제주: ['제주', '제주도', '제주특별자치도', '제주시', '서귀포시'],
};

const GWANGJU_CURRENT_NAME = '전남광주통합특별시';
const GWANGJU_DISTRICTS = ['동구', '서구', '남구', '북구', '광산구'];

function isGwangjuAlertRelevant(alert: OfficialWeatherAlert): boolean {
  const parent = alert.parentRegionName.trim();
  const region = alert.regionName.trim();
  if (parent.includes('광주광역시') || region.includes('광주광역시')) return true;
  if (region === '광주' || region.startsWith('광주')) return true;
  if (parent !== GWANGJU_CURRENT_NAME && !parent.includes(GWANGJU_CURRENT_NAME)
    && region !== GWANGJU_CURRENT_NAME && !region.includes(GWANGJU_CURRENT_NAME)) {
    return false;
  }
  if (region === GWANGJU_CURRENT_NAME || region === parent) return true;
  return GWANGJU_DISTRICTS.some(district =>
    region === district
    || region.startsWith(`${district} `)
    || region.startsWith(`${GWANGJU_CURRENT_NAME} ${district}`)
  );
}

function kmaTimeToIso(value: string): string {
  if (!/^\d{12}$/.test(value)) return '';
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}T${value.slice(8, 10)}:${value.slice(10, 12)}:00+09:00`;
}

function severity(alert: OfficialWeatherAlert): number {
  if (alert.level.includes('중대')) return 3;
  if (alert.level.includes('경보')) return 2;
  if (alert.level.includes('주의')) return 1;
  return 0;
}

export function parseKmaWarningStatus(text: string): OfficialWeatherAlertResponse {
  const observedMatch = text.match(/^#기준시각:\s*(\d{12})/m);
  const alerts: OfficialWeatherAlert[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    if (!/^[A-Z]\d{7},/.test(rawLine)) continue;
    const fields = rawLine.split(',').map(field => field.trim().replace(/=$/, '').trim());
    if (fields.length < 9) continue;

    const [
      parentRegionCode,
      parentRegionName,
      regionCode,
      regionName,
      announcedRaw,
      effectiveRaw,
      warning,
      level,
      command,
      expectedEndRaw = '',
    ] = fields;

    if (!regionCode || !regionName || !warning || !level) continue;
    const dedupeKey = `${regionCode}:${warning}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    alerts.push({
      id: `${regionCode}:${warning}:${effectiveRaw}`,
      parentRegionCode,
      parentRegionName,
      regionCode,
      regionName,
      announcedAt: kmaTimeToIso(announcedRaw),
      effectiveAt: kmaTimeToIso(effectiveRaw),
      warning,
      level,
      command,
      expectedEndAt: kmaTimeToIso(expectedEndRaw) || undefined,
    });
  }

  alerts.sort((a, b) => severity(b) - severity(a)
    || b.effectiveAt.localeCompare(a.effectiveAt)
    || a.regionName.localeCompare(b.regionName, 'ko'));

  return {
    alerts,
    observedAt: observedMatch ? kmaTimeToIso(observedMatch[1]) : new Date().toISOString(),
    source: '기상청 API Hub',
    sourceUrl: KMA_WARNING_PAGE_URL,
  };
}

export function filterWeatherAlertsByCity(
  alerts: OfficialWeatherAlert[],
  city: string | null,
): OfficialWeatherAlert[] {
  if (!city) return alerts;
  const normalized = city.trim();
  if (normalized === '광주' || normalized === '광주광역시' || normalized === GWANGJU_CURRENT_NAME) {
    return alerts.filter(isGwangjuAlertRelevant);
  }
  const regionNames = CITY_REGION_NAMES[normalized] ?? [normalized];
  return alerts.filter(alert => regionNames.some(regionName =>
    alert.parentRegionName.includes(regionName) || alert.regionName.includes(regionName)
  ));
}

async function decodeKmaText(response: Response): Promise<string> {
  const bytes = await response.arrayBuffer();
  try {
    return new TextDecoder('euc-kr').decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

export async function handleWeatherAlerts(
  url: URL,
  apiKey: string,
): Promise<{ data: OfficialWeatherAlertResponse; cacheTtl: number }> {
  const city = sanitizeStringParam(url, 'city', 30);
  const serviceKey = encodeServiceKey(apiKey, 'KMA_API_KEY');
  const upstreamUrl = `${KMA_WARNING_STATUS_URL}?fe=f&tm=&disp=0&help=0&authKey=${serviceKey}`;
  const response = await fetchWithRetry(upstreamUrl, {
    headers: { 'User-Agent': '119-helper-worker/1.0' },
  });

  if (!response.ok) {
    throw new Error(`KMA warning status API ${response.status}`);
  }

  const text = await decodeKmaText(response);
  if (!text.includes('#START7777')) {
    throw new Error(`KMA warning status INVALID_RESPONSE: ${text.replace(/\s+/g, ' ').slice(0, 140)}`);
  }

  const parsed = parseKmaWarningStatus(text);
  return {
    data: {
      ...parsed,
      alerts: filterWeatherAlertsByCity(parsed.alerts, city),
    },
    cacheTtl: 180,
  };
}
