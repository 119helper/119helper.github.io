import { createHash } from 'node:crypto';

import {
  downloadSourceRows,
} from './restroom-regional-overlays.mjs';

const DATA_GO_BASE_URL = 'https://www.data.go.kr';
const REQUEST_TIMEOUT_MS = 30_000;
const STANDARD_PAGE_SIZE = 10_000;
const MATCH_DISTANCE_METERS = 40;
const PORTAL_POLICY_URL = 'https://www.data.go.kr/ugs/selectPortalPolicyView.do';

const CITY_PREFIXES = Object.freeze({
  seoul: ['서울특별시', '서울시', '서울 '],
  daegu: ['대구광역시', '대구시'],
  sejong: ['세종특별자치시'],
  ulsan: ['울산광역시', '울산시'],
});

const CITY_BOUNDS = Object.freeze({
  seoul: { latitude: [37.4, 37.75], longitude: [126.7, 127.25] },
  daegu: { latitude: [35.55, 36.35], longitude: [128.3, 129.05] },
  sejong: { latitude: [36.3, 36.8], longitude: [127.05, 127.55] },
  ulsan: { latitude: [35.25, 35.8], longitude: [128.9, 129.55] },
});

function standardSource({
  id,
  publicDataPk,
  name,
  serviceTableName,
  nameField,
  lotAddressField = 'LNMADR',
  minimumRows,
  maximumRows,
  minimumValidScopedRows,
  minimumValidScopedRowsByCity,
  minimumLatestSourceDate,
  recordIdFields = [],
  recordKeyFields = [],
  eligibilityRules = [],
}) {
  return Object.freeze({
    id,
    downloadKind: 'data-go-standard',
    sourceGroup: 'national-standard-host',
    publicDataPk,
    name,
    sourceUrl: `${DATA_GO_BASE_URL}/data/${publicDataPk}/standard.do`,
    license: '개별 제공기관 이용허락범위 적용',
    termsUrl: PORTAL_POLICY_URL,
    serviceTableName,
    minimumRows,
    maximumRows,
    minimumSourceDate: '2025-01-01',
    minimumLatestSourceDate,
    minimumValidScopedRows,
    minimumValidScopedRowsByCity: Object.freeze(minimumValidScopedRowsByCity),
    allowedCityKeys: ['daegu', 'sejong', 'ulsan'],
    recordIdFields,
    recordKeyFields,
    requireProviderIdentity: true,
    eligibilityRules,
    fieldMap: {
      name: [nameField],
      roadAddress: ['RDNMADR'],
      lotAddress: lotAddressField ? [lotAddressField] : [],
      latitude: ['LATITUDE'],
      longitude: ['LONGITUDE'],
      sourceDate: ['REFERENCE_DATE'],
      providerCode: ['INSTT_CODE'],
      providerName: ['INSTT_NM'],
    },
  });
}

export const HOST_ADDRESS_SOURCES = Object.freeze([
  standardSource({
    id: 'national-city-park-host-points',
    publicDataPk: '15012890',
    name: '전국도시공원정보표준데이터',
    serviceTableName: 'tn_pubr_public_cty_park_info_svc',
    nameField: 'PARK_NM',
    minimumRows: 17_500,
    maximumRows: 20_000,
    minimumValidScopedRows: 1_200,
    minimumValidScopedRowsByCity: { daegu: 591, sejong: 179, ulsan: 445 },
    minimumLatestSourceDate: '2026-06-01',
    recordIdFields: ['MANAGE_NO'],
  }),
  standardSource({
    id: 'national-parking-lot-host-points',
    publicDataPk: '15012896',
    name: '전국주차장정보표준데이터',
    serviceTableName: 'tn_pubr_prkplce_info_svc',
    nameField: 'PRKPLCE_NM',
    minimumRows: 17_500,
    maximumRows: 20_000,
    minimumValidScopedRows: 1_360,
    minimumValidScopedRowsByCity: { daegu: 977, sejong: 91, ulsan: 344 },
    minimumLatestSourceDate: '2026-05-01',
    recordIdFields: ['PRKPLCE_NO'],
  }),
  standardSource({
    id: 'national-traditional-market-host-points',
    publicDataPk: '15012894',
    name: '전국전통시장표준데이터',
    serviceTableName: 'tn_pubr_public_trdit_mrkt_svc',
    nameField: 'MRKT_NM',
    minimumRows: 1_250,
    maximumRows: 1_550,
    minimumValidScopedRows: 135,
    minimumValidScopedRowsByCity: { daegu: 89, sejong: 3, ulsan: 37 },
    minimumLatestSourceDate: '2025-11-01',
    recordKeyFields: ['MRKT_NM'],
    eligibilityRules: [{
      field: 'PBLIC_TOILET_YN',
      allowedValues: ['Y'],
      label: '공중화장실 보유 여부',
    }],
  }),
  standardSource({
    id: 'national-library-host-points',
    publicDataPk: '15013109',
    name: '전국도서관표준데이터',
    serviceTableName: 'tn_pubr_public_lbrry_svc',
    nameField: 'LBRRY_NM',
    lotAddressField: '',
    minimumRows: 3_300,
    maximumRows: 3_900,
    minimumValidScopedRows: 350,
    minimumValidScopedRowsByCity: { daegu: 216, sejong: 21, ulsan: 114 },
    minimumLatestSourceDate: '2026-06-01',
    recordKeyFields: ['LBRRY_NM', 'CTPRVN_NM', 'SIGNGU_NM'],
  }),
  standardSource({
    id: 'national-museum-art-gallery-host-points',
    publicDataPk: '15017323',
    name: '전국박물관미술관정보표준데이터',
    serviceTableName: 'tn_pubr_public_museum_artgr_info_svc',
    nameField: 'FCLTY_NM',
    minimumRows: 950,
    maximumRows: 1_250,
    minimumValidScopedRows: 36,
    minimumValidScopedRowsByCity: { daegu: 34, sejong: 1, ulsan: 3 },
    minimumLatestSourceDate: '2026-06-01',
    recordKeyFields: ['FCLTY_NM'],
  }),
  standardSource({
    id: 'national-public-facility-opening-host-points',
    publicDataPk: '15013117',
    name: '전국공공시설개방정보표준데이터',
    serviceTableName: 'tn_pubr_public_pblfclt_opn_info_svc',
    nameField: 'OPEN_LC_NM',
    minimumRows: 6_800,
    maximumRows: 8_000,
    minimumValidScopedRows: 330,
    minimumValidScopedRowsByCity: { daegu: 231, sejong: 52, ulsan: 48 },
    minimumLatestSourceDate: '2026-06-01',
    recordKeyFields: ['OPEN_LC_NM', 'OPEN_FCLTY_NM'],
  }),
  Object.freeze({
    id: 'yongsan-community-center-host-points',
    downloadKind: 'data-go-file',
    sourceGroup: 'yongsan-municipal-host',
    publicDataPk: '15116840',
    publicDataDetailPk: 'uddi:0ec22f7b-b537-415f-ab74-91045942a8f3',
    name: '서울특별시 용산구 동주민센터 현황',
    sourceUrl: 'https://www.data.go.kr/data/15116840/fileData.do',
    encoding: 'utf-8',
    license: '이용허락범위 제한 없음',
    minimumRows: 16,
    maximumRows: 20,
    minimumSourceDate: '2025-01-01',
    minimumLatestSourceDate: '2025-08-01',
    minimumValidScopedRows: 16,
    minimumValidScopedRowsByCity: Object.freeze({ seoul: 16 }),
    allowedCityKeys: ['seoul'],
    district: '용산구',
    providerNameFixed: '서울특별시 용산구',
    recordKeyFields: ['주민센터명'],
    fieldMap: {
      name: ['주민센터명'],
      roadAddress: ['도로명주소'],
      lotAddress: ['지번주소'],
      latitude: ['위도'],
      longitude: ['경도'],
      sourceDate: [],
      providerCode: [],
      providerName: [],
    },
  }),
]);

export const REVIEWED_HOST_ADDRESS_POINT_IDS = new Set([
  '202634400000100058',
  '202534100000100135',
  '202534100000100108',
  '202534700000100530',
  '202534100000100240',
  '202434300000100017',
  '202534100000100231',
  '202534100000100190',
  '202534700000100315',
  '202434600000100216',
  '202634600000100020',
  '202434600000100373',
  '202434600000100179',
  '202434600000100178',
  '202434600000100177',
  '202534100000100246',
  '202534100000100097',
  '202534100000100203',
  '202634400000100063',
  '202534100000100039',
  '202634600000100003',
  '202534100000100145',
  '202534100000100008',
  '202634400000100003',
  '202434600000100237',
  '202434600000100236',
  '202434600000100235',
  '202534100000100182',
  '202534100000100172',
  '202534100000100085',
  '202534100000100216',
  '202534100000100086',
  '202534100000100103',
  '202534100000100259',
  '202534100000100199',
  '202456900000101600',
  '202456900000101191',
  '202456900000101684',
  '202456900000101827',
  '202456900000101207',
  '202456900000101338',
  '202456900000101750',
  '202456900000101445',
  '202456900000101624',
  '202656900000100016',
  '202456900000101252',
  '202456900000101437',
  '202337300000100045',
  '202437300000100006',
  '202437300000100010',
  '202437300000100043',
  '202337300000100002',
  '202437000000101213',
  '202437000000101215',
  '202437000000101212',
  '202437000000101214',
  '202437000000101153',
  '202437000000101424',
  '202437000000101426',
  '202437000000101425',
  '202437000000101627',
  '202437000000101305',
  '202437000000101225',
  '202337300000100011',
  '202437000000101156',
  '202437000000101157',
  '202437000000101159',
  '202437000000101161',
  '202437000000101160',
  '202437000000101162',
  '202437000000101155',
  '202437000000101171',
  '202437300000100029',
  '202437000000101626',
  '202437000000101625',
  '202437000000101623',
  '202437000000101624',
  '202437000000101421',
  '202437000000101631',
  '202437000000101446',
  '202437000000101310',
  '202437000000101314',
  '202330200000100416',
  '202330200000100432',
  '202330200000100487',
  '202330200000100492',
  '202330200000100495',
]);

export const REVIEWED_HOST_ADDRESS_POINT_FINGERPRINT =
  '57d951743cc08a69d1bc0ccd88c8f710f7ed24128a5c153fb936fc131b353b3f';

export const REVIEWED_HOST_ADDRESS_POINT_GROUPS = Object.freeze({
  'national-standard-host': Object.freeze({
    sourceIds: Object.freeze([
      'national-city-park-host-points',
      'national-library-host-points',
      'national-museum-art-gallery-host-points',
      'national-parking-lot-host-points',
      'national-public-facility-opening-host-points',
      'national-traditional-market-host-points',
    ]),
    total: 82,
    coverageGainCount: 82,
    uniquePointCount: 82,
    cities: Object.freeze({ daegu: 35, sejong: 12, ulsan: 35 }),
    expectedIdsHash: '3b659336899ee2c14b593c23a9f96b09e5adc998e232795e58bf7621911f8a67',
    reviewedTupleHash: '8e33cacdb095690f4a1db3cc671e39f10d606f0dc1b0ceef22900cc1ab5b1019',
  }),
  'yongsan-municipal-host': Object.freeze({
    sourceIds: Object.freeze(['yongsan-community-center-host-points']),
    total: 5,
    coverageGainCount: 5,
    uniquePointCount: 5,
    cities: Object.freeze({ seoul: 5 }),
    expectedIdsHash: '195a6647d729713802c348776b5526e2a596fdf060e0b0381bb0d3921c16843b',
    reviewedTupleHash: '948d7e0c3a1b4f1da95b1d5ac99ffd74980c10256b7bc37adc54d69a4f73b341',
  }),
});

export const REVIEWED_HOST_PRIMARY_SOURCE_COUNTS = Object.freeze({
  'national-city-park-host-points': 22,
  'national-parking-lot-host-points': 14,
  'national-traditional-market-host-points': 10,
  'national-library-host-points': 17,
  'national-museum-art-gallery-host-points': 3,
  'national-public-facility-opening-host-points': 16,
  'yongsan-community-center-host-points': 5,
});

export const REVIEWED_HOST_NAME_ALIASES = Object.freeze({
  '202434600000100177': Object.freeze({
    nationalName: '범어도서관',
    sourceId: 'national-library-host-points',
    allowedSourceNames: Object.freeze(['수성구립범어도서관']),
  }),
  '202434600000100178': Object.freeze({
    nationalName: '용학도서관',
    sourceId: 'national-library-host-points',
    allowedSourceNames: Object.freeze(['수성구립용학도서관']),
  }),
  '202434600000100179': Object.freeze({
    nationalName: '무학숲도서관',
    sourceId: 'national-library-host-points',
    allowedSourceNames: Object.freeze(['수성구립무학숲도서관']),
  }),
  '202434600000100216': Object.freeze({
    nationalName: '범물근린공원',
    sourceId: 'national-city-park-host-points',
    allowedSourceNames: Object.freeze(['범물공원']),
  }),
  '202434600000100373': Object.freeze({
    nationalName: '고산도서관',
    sourceId: 'national-library-host-points',
    allowedSourceNames: Object.freeze(['수성구립고산도서관']),
  }),
  '202437000000101225': Object.freeze({
    nationalName: '태화강역 화장실',
    sourceId: 'national-parking-lot-host-points',
    allowedSourceNames: Object.freeze(['태화강역 제1주차장']),
  }),
  '202437000000101627': Object.freeze({
    nationalName: '노동자종합복지회관 화장실',
    sourceId: 'national-parking-lot-host-points',
    allowedSourceNames: Object.freeze(['노동자종합복지회관 주차장']),
  }),
  '202437000000101631': Object.freeze({
    nationalName: '울산남구종합사회복지관 화장실',
    sourceId: 'national-library-host-points',
    allowedSourceNames: Object.freeze(['울산남구종합사회복지관 작은도서관']),
  }),
  '202437300000100029': Object.freeze({
    nationalName: '언양종합상가 공중화장실',
    sourceId: 'national-traditional-market-host-points',
    allowedSourceNames: Object.freeze(['언양종합상가시장']),
  }),
  '202456900000101207': Object.freeze({
    nationalName: '고운뜰근린공원',
    sourceId: 'national-city-park-host-points',
    allowedSourceNames: Object.freeze(['고운뜰근린공원(근1-4)']),
  }),
  '202456900000101827': Object.freeze({
    nationalName: '시울문화공원',
    sourceId: 'national-city-park-host-points',
    allowedSourceNames: Object.freeze(['시울문화공원(문화4-2)']),
  }),
  '202456900000101338': Object.freeze({
    nationalName: '반곡새싹문화공원(문4-6)',
    sourceId: 'national-city-park-host-points',
    allowedSourceNames: Object.freeze(['반곡새싹문화공원(문화4-6)']),
  }),
  '202456900000101750': Object.freeze({
    nationalName: '도시상징광장',
    sourceId: 'national-parking-lot-host-points',
    allowedSourceNames: Object.freeze(['도시상징광장주차장']),
  }),
  '202534100000100145': Object.freeze({
    nationalName: '약령시한의약박물관',
    sourceId: 'national-museum-art-gallery-host-points',
    allowedSourceNames: Object.freeze(['대구약령시한의약박물관']),
  }),
  '202634600000100020': Object.freeze({
    nationalName: '사월책문화센터도서관',
    sourceId: 'national-library-host-points',
    allowedSourceNames: Object.freeze(['수성구립사월책문화센터도서관']),
  }),
  '202337300000100045': Object.freeze({
    nationalName: '도래공원',
    sourceId: 'national-city-park-host-points',
    allowedSourceNames: Object.freeze(['도래공원171']),
  }),
  '202437300000100006': Object.freeze({
    nationalName: '나슬공원',
    sourceId: 'national-city-park-host-points',
    allowedSourceNames: Object.freeze(['나슬공원169']),
  }),
});

export const REVIEWED_HOST_ADDRESS_KEY_ALIASES = Object.freeze({
  '202437300000100006': Object.freeze({
    sourceId: 'national-city-park-host-points',
    nationalAddressKey: 'road:울산광역시울주군청량읍상남리814-1',
    allowedHostAddressKeys: Object.freeze([
      'lot:울산광역시울주군청량읍상남리814-1',
    ]),
  }),
  '202437300000100010': Object.freeze({
    sourceId: 'national-city-park-host-points',
    nationalAddressKey: 'road:울산광역시울주군삼남읍방기리산88-8',
    allowedHostAddressKeys: Object.freeze([
      'lot:울산광역시울주군삼남읍방기리산88-8',
    ]),
  }),
  '202437300000100029': Object.freeze({
    sourceId: 'national-traditional-market-host-points',
    nationalAddressKey: 'road:울산광역시울주군언양읍남부리124-2',
    allowedHostAddressKeys: Object.freeze([
      'lot:울산광역시울주군언양읍남부리124-2',
    ]),
  }),
  '202437300000100043': Object.freeze({
    sourceId: 'national-city-park-host-points',
    nationalAddressKey: 'road:울산광역시울주군범서읍천상리322',
    allowedHostAddressKeys: Object.freeze([
      'lot:울산광역시울주군범서읍천상리322',
    ]),
  }),
  '202534100000100145': Object.freeze({
    sourceId: 'national-museum-art-gallery-host-points',
    nationalAddressKey: 'lot:대구광역시중구남성로51-1',
    allowedHostAddressKeys: Object.freeze([
      'road:대구광역시중구남성로51-1',
    ]),
  }),
});

function asText(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function firstField(row, names = []) {
  for (const name of names) {
    const value = asText(row?.[name]);
    if (value) return value;
  }
  return '';
}

function uniqueTexts(values) {
  return [...new Set(values.map(asText).filter(Boolean))];
}

function isoDate(value) {
  const match = asText(value).match(/(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/);
  return match
    ? `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
    : null;
}

function sourceScopeAddress(value) {
  return asText(value)
    .replace(/\s+/g, ' ')
    .replace(/^서울(?=\s|$)/, '서울특별시')
    .replace(/^서울시(?=\s|$)/, '서울특별시')
    .replace(/^대구시(?=\s|$)/, '대구광역시')
    .replace(/^울산시(?=\s|$)/, '울산광역시');
}

export function normalizeHostAddress(value) {
  return sourceScopeAddress(value)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[‐‑‒–—−﹣－]/g, '-')
    .replace(/[^\p{L}\p{N}-]+/gu, '');
}

export function normalizeHostName(value) {
  return asText(value)
    .replace(/\((?:주|유|재|사)\)/g, '')
    .replace(/공중\s*화장실|개방\s*화장실|화장실/g, '')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

function addressKey(kind, value) {
  const normalized = normalizeHostAddress(value);
  return normalized ? `${kind}:${normalized}` : '';
}

function stableHash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function cityKeyForAddress(value) {
  const address = sourceScopeAddress(value);
  for (const [cityKey, prefixes] of Object.entries(CITY_PREFIXES)) {
    if (prefixes.some(prefix => address.startsWith(prefix))) return cityKey;
  }
  return null;
}

function coordinateInCityBounds(latitude, longitude, cityKey) {
  const bounds = CITY_BOUNDS[cityKey];
  return Boolean(bounds)
    && Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= bounds.latitude[0]
    && latitude <= bounds.latitude[1]
    && longitude >= bounds.longitude[0]
    && longitude <= bounds.longitude[1];
}

async function checkedJson(fetchImpl, url) {
  const response = await fetchImpl(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': '119-helper-restroom-host-address-sync/1.0',
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 180);
    throw new Error(`${url}: HTTP ${response.status} ${detail}`.trim());
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${url}: JSON 응답을 해석하지 못했습니다.`);
  }
}

export async function downloadStandardHostRows(source, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const pageSize = Number(options.pageSize || STANDARD_PAGE_SIZE);
  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new Error(`${source.id}: 페이지 크기가 올바르지 않습니다.`);
  }
  const metadataUrl = new URL('/download/columList.json', DATA_GO_BASE_URL);
  metadataUrl.searchParams.set('pk', source.publicDataPk);
  metadataUrl.searchParams.set('ext', 'JSON');
  const metadata = await checkedJson(fetchImpl, metadataUrl);
  const totalCount = Number(metadata?.totalCount);
  if (
    !Number.isInteger(totalCount)
    || totalCount < source.minimumRows
    || totalCount > source.maximumRows
  ) {
    throw new Error(
      `${source.id}: 전체 ${Number.isFinite(totalCount) ? totalCount : '미확인'}행이 `
      + `허용 범위 ${source.minimumRows}~${source.maximumRows} 밖입니다.`,
    );
  }
  if (metadata?.tableVO?.svcTableNm !== source.serviceTableName) {
    throw new Error(`${source.id}: 표준데이터 서비스 테이블이 변경됐습니다.`);
  }

  const availableColumns = new Set(
    (metadata?.columList || []).map(column => asText(column?.columCode)),
  );
  const requiredColumns = [
    ...Object.values(source.fieldMap).flat(),
    ...(source.recordIdFields || []),
    ...(source.recordKeyFields || []),
    ...(source.eligibilityRules || []).map(rule => rule.field),
  ].filter(Boolean);
  for (const column of requiredColumns) {
    if (!availableColumns.has(column)) {
      throw new Error(`${source.id}: 필수 컬럼 ${column}이 없습니다.`);
    }
  }
  const requestColumns = metadata?.tableVO?.colNmList;
  if (!Array.isArray(requestColumns) || requestColumns.length === 0) {
    throw new Error(`${source.id}: 표준데이터 요청 컬럼을 확인할 수 없습니다.`);
  }

  const pageCount = Math.ceil(totalCount / pageSize);
  const pages = await Promise.all(Array.from({ length: pageCount }, async (_, index) => {
    const url = new URL('/download/standard.json', DATA_GO_BASE_URL);
    url.searchParams.set('publicDataPk', source.publicDataPk);
    url.searchParams.set('totalCount', String(totalCount));
    url.searchParams.set('svcTableNm', source.serviceTableName);
    url.searchParams.set('perPage', String(pageSize));
    url.searchParams.set('page', String(index + 1));
    for (const column of requestColumns) url.searchParams.append('colNmList', column);
    const rows = await checkedJson(fetchImpl, url);
    if (!Array.isArray(rows)) {
      throw new Error(`${source.id}: ${index + 1}페이지 응답이 배열이 아닙니다.`);
    }
    const expectedPageCount = index + 1 < pageCount
      ? pageSize
      : totalCount - (pageSize * index);
    if (rows.length !== expectedPageCount) {
      throw new Error(
        `${source.id}: ${index + 1}페이지 ${rows.length}행이 예상 ${expectedPageCount}행과 다릅니다.`,
      );
    }
    return rows;
  }));
  const pageFingerprints = pages.map(rows =>
    createHash('sha256').update(JSON.stringify(rows)).digest('hex')
  );
  if (new Set(pageFingerprints).size !== pageFingerprints.length) {
    throw new Error(`${source.id}: 서로 다른 페이지가 동일한 원본 행 묶음을 반환했습니다.`);
  }
  const rows = pages.flat();
  if (rows.length !== totalCount) {
    throw new Error(
      `${source.id}: ${rows.length}행만 받아 표준데이터 전체 ${totalCount}행을 충족하지 못했습니다.`,
    );
  }
  return { rows, sourceDate: null, metadata };
}

export function normalizeHostRows(rows, source, options = {}) {
  if (!Array.isArray(rows)) throw new Error(`${source.id}: 원본 행이 배열이 아닙니다.`);
  if (rows.length < source.minimumRows || rows.length > source.maximumRows) {
    throw new Error(
      `${source.id}: ${rows.length}행은 허용 범위 `
      + `${source.minimumRows}~${source.maximumRows} 밖입니다.`,
    );
  }
  const columns = new Set(rows.flatMap(row => Object.keys(row || {})));
  for (const field of ['name', 'roadAddress', 'latitude', 'longitude']) {
    const aliases = source.fieldMap[field] || [];
    if (aliases.length === 0 || !aliases.some(alias => columns.has(alias))) {
      throw new Error(`${source.id}: ${field} 필수 컬럼이 없습니다.`);
    }
  }
  for (const alias of source.fieldMap.lotAddress || []) {
    if (!columns.has(alias)) throw new Error(`${source.id}: lotAddress 컬럼 ${alias}이 없습니다.`);
  }
  for (const field of [
    ...(source.recordIdFields || []),
    ...(source.recordKeyFields || []),
    ...(source.eligibilityRules || []).map(rule => rule.field),
  ]) {
    if (!columns.has(field)) throw new Error(`${source.id}: 검증 컬럼 ${field}이 없습니다.`);
  }

  const fallbackSourceDate = isoDate(options.sourceDate);
  const items = [];
  let scopedRowCount = 0;
  let staleOrMissingDateCount = 0;
  let invalidCoordinateCount = 0;
  let missingIdentityCount = 0;
  let outOfDistrictCount = 0;
  let ineligibleHostCount = 0;

  for (const [index, row] of rows.entries()) {
    const roadAddresses = uniqueTexts((source.fieldMap.roadAddress || []).map(field => row?.[field]))
      .map(sourceScopeAddress);
    const lotAddresses = uniqueTexts((source.fieldMap.lotAddress || []).map(field => row?.[field]))
      .map(sourceScopeAddress);
    const rawAddresses = uniqueTexts([...roadAddresses, ...lotAddresses]);
    const cityKeys = new Set(rawAddresses.map(cityKeyForAddress).filter(Boolean));
    if (cityKeys.size !== 1) continue;
    const [cityKey] = cityKeys;
    if (!source.allowedCityKeys.includes(cityKey)) continue;
    scopedRowCount += 1;

    if (
      source.district
      && !rawAddresses.some(address =>
        normalizeHostAddress(address).startsWith(
          normalizeHostAddress(`${CITY_PREFIXES[cityKey][0]} ${source.district}`),
        )
      )
    ) {
      outOfDistrictCount += 1;
      continue;
    }

    const eligibilityEvidence = {};
    let eligible = true;
    for (const rule of source.eligibilityRules || []) {
      const value = asText(row?.[rule.field]).toUpperCase();
      eligibilityEvidence[rule.field] = value;
      if (!rule.allowedValues.map(asText).map(item => item.toUpperCase()).includes(value)) {
        eligible = false;
      }
    }
    if (!eligible) {
      ineligibleHostCount += 1;
      continue;
    }

    const rowSourceDate = isoDate(firstField(row, source.fieldMap.sourceDate))
      || fallbackSourceDate;
    if (!rowSourceDate || rowSourceDate < source.minimumSourceDate) {
      staleOrMissingDateCount += 1;
      continue;
    }

    const name = firstField(row, source.fieldMap.name);
    const roadAddressKeys = uniqueTexts(roadAddresses.map(address => addressKey('road', address)));
    const lotAddressKeys = uniqueTexts(lotAddresses.map(address => addressKey('lot', address)));
    const addressKeys = uniqueTexts([...roadAddressKeys, ...lotAddressKeys]);
    const providerCode = firstField(row, source.fieldMap.providerCode);
    const providerName = firstField(row, source.fieldMap.providerName)
      || asText(source.providerNameFixed);
    const providerIdentity = providerCode || providerName;
    const externalRecordId = firstField(row, source.recordIdFields || []);
    const recordKeyParts = (source.recordKeyFields || []).map(field => asText(row?.[field]));
    if (
      !name
      || addressKeys.length === 0
      || (source.requireProviderIdentity && !providerIdentity)
      || (!externalRecordId && recordKeyParts.some(value => !value))
    ) {
      missingIdentityCount += 1;
      continue;
    }
    const latitude = Number(firstField(row, source.fieldMap.latitude));
    const longitude = Number(firstField(row, source.fieldMap.longitude));
    if (!coordinateInCityBounds(latitude, longitude, cityKey)) {
      invalidCoordinateCount += 1;
      continue;
    }
    const sourceRecordKey = stableHash(JSON.stringify(
      externalRecordId
        ? [
          source.id,
          providerIdentity,
          externalRecordId,
          normalizeHostName(name),
          ...roadAddressKeys,
          ...lotAddressKeys,
        ]
        : [
          source.id,
          providerIdentity,
          ...recordKeyParts,
          ...roadAddressKeys,
          ...lotAddressKeys,
        ],
    ));
    const recordFingerprint = hostRecordFingerprint({
      sourceRecordKey,
      latitude,
      longitude,
      sourceDate: rowSourceDate,
    });

    items.push({
      sourceRowNumber: index + 2,
      sourceId: source.id,
      cityKey,
      name,
      normalizedName: normalizeHostName(name),
      roadAddresses,
      lotAddresses,
      roadAddressKeys,
      lotAddressKeys,
      addressKeys,
      addresses: addressKeys,
      latitude,
      longitude,
      sourceDate: rowSourceDate,
      providerCode,
      providerName,
      externalRecordId,
      sourceRecordKey,
      recordFingerprint,
      eligibilityEvidence,
    });
  }

  if (items.length < source.minimumValidScopedRows) {
    throw new Error(
      `${source.id}: 2025년 이후 관할 유효 좌표 ${items.length}행이 `
      + `검토 기준 최소 ${source.minimumValidScopedRows}행보다 적습니다.`,
    );
  }
  const sourceDate = items.map(item => item.sourceDate).sort().at(-1) || fallbackSourceDate;
  const minimumLatestSourceDate = source.minimumLatestSourceDate || source.minimumSourceDate;
  if (!sourceDate || sourceDate < minimumLatestSourceDate) {
    throw new Error(`${source.id}: 최신 기준일이 ${minimumLatestSourceDate}보다 오래됐습니다.`);
  }
  const itemBySourceRecordKey = new Map();
  const sourceRecordKeysByExternalId = new Map();
  let duplicateRecordKeyCount = 0;
  for (const item of items) {
    if (item.externalRecordId) {
      if (!sourceRecordKeysByExternalId.has(item.externalRecordId)) {
        sourceRecordKeysByExternalId.set(item.externalRecordId, new Set());
      }
      sourceRecordKeysByExternalId.get(item.externalRecordId).add(item.sourceRecordKey);
    }
    const existing = itemBySourceRecordKey.get(item.sourceRecordKey);
    if (!existing) {
      itemBySourceRecordKey.set(item.sourceRecordKey, item);
      continue;
    }
    if (existing.recordFingerprint !== item.recordFingerprint) {
      throw new Error(
        `${source.id}: 안정 레코드 키 ${item.sourceRecordKey}가 서로 다른 원본 행을 가리킵니다.`,
      );
    }
    duplicateRecordKeyCount += 1;
  }
  const externalRecordIdCollisionCount = [...sourceRecordKeysByExternalId.values()]
    .filter(keys => keys.size > 1).length;
  const matchableItems = [...itemBySourceRecordKey.values()];
  const validScopedRowsByCity = {};
  for (const item of matchableItems) {
    validScopedRowsByCity[item.cityKey] = (validScopedRowsByCity[item.cityKey] || 0) + 1;
  }
  for (const [cityKey, minimum] of Object.entries(
    source.minimumValidScopedRowsByCity || {},
  )) {
    const actual = Number(validScopedRowsByCity[cityKey] || 0);
    if (actual < Number(minimum)) {
      throw new Error(
        `${source.id}: ${cityKey} 관할 유효 고유행 ${actual}건이 `
        + `검토 기준 최소 ${minimum}건보다 적습니다.`,
      );
    }
  }

  return {
    source,
    sourceDate,
    rawCount: rows.length,
    scopedRowCount,
    validCoordinateCount: items.length,
    staleOrMissingDateCount,
    invalidCoordinateCount,
    missingIdentityCount,
    outOfDistrictCount,
    ineligibleHostCount,
    duplicateRecordKeyCount,
    externalRecordIdCollisionCount,
    validScopedRowsByCity,
    items: matchableItems,
  };
}

function mapHas(mapOrSet, id) {
  if (mapOrSet instanceof Set || mapOrSet instanceof Map) return mapOrSet.has(id);
  return Boolean(mapOrSet?.[id]);
}

function nationalRecord(raw) {
  const roadAddress = sourceScopeAddress(
    raw?.LCTN_ROAD_NM_ADDR ?? raw?.roadAddress ?? raw?.addr,
  );
  const lotAddress = sourceScopeAddress(raw?.LCTN_LOTNO_ADDR ?? raw?.lotAddress);
  const roadAddressKeys = uniqueTexts([addressKey('road', roadAddress)]);
  const lotAddressKeys = uniqueTexts([addressKey('lot', lotAddress)]);
  return {
    id: asText(raw?.MNG_NO ?? raw?.id),
    name: asText(raw?.RSTRM_NM ?? raw?.nm),
    roadAddress,
    lotAddress,
    roadAddressKeys,
    lotAddressKeys,
    addressKeys: uniqueTexts([...roadAddressKeys, ...lotAddressKeys]),
    cityKey: cityKeyForAddress(roadAddress || lotAddress),
  };
}

function approximateDistanceMeters(first, second) {
  return Math.hypot(
    (first.latitude - second.latitude) * 111_000,
    (first.longitude - second.longitude) * 90_000,
  );
}

function coordinateKey(item) {
  return `${Number(item.lat).toFixed(7)},${Number(item.lng).toFixed(7)}`;
}

export function hostRecordFingerprint(record) {
  const sourceRecordKey = asText(record?.sourceRecordKey);
  const latitude = Number(record?.latitude ?? record?.lat);
  const longitude = Number(record?.longitude ?? record?.lng);
  const sourceDate = asText(record?.sourceDate);
  if (
    !sourceRecordKey
    || !Number.isFinite(latitude)
    || !Number.isFinite(longitude)
    || !sourceDate
  ) {
    throw new Error('호스트 원천 레코드 지문 필드가 불완전합니다.');
  }
  return stableHash(
    `${sourceRecordKey}|${latitude.toFixed(7)}|${longitude.toFixed(7)}|${sourceDate}`,
  );
}

function sourceSummary(dataset) {
  return {
    id: dataset.source.id,
    sourceGroupId: dataset.source.sourceGroup,
    name: dataset.source.name,
    sourceUrl: dataset.source.sourceUrl,
    sourceDate: dataset.sourceDate,
    license: dataset.source.license,
    termsUrl: dataset.source.termsUrl,
    rawCount: dataset.rawCount,
    scopedRowCount: dataset.scopedRowCount,
    validCoordinateCount: dataset.validCoordinateCount,
    validScopedRowsByCity: dataset.validScopedRowsByCity,
    minimumValidScopedRowsByCity: dataset.source.minimumValidScopedRowsByCity,
    minimumLatestSourceDate: dataset.source.minimumLatestSourceDate,
    staleOrMissingDateCount: dataset.staleOrMissingDateCount,
    invalidCoordinateCount: dataset.invalidCoordinateCount,
    missingIdentityCount: dataset.missingIdentityCount,
    outOfDistrictCount: dataset.outOfDistrictCount,
    ineligibleHostCount: dataset.ineligibleHostCount,
    duplicateRecordKeyCount: dataset.duplicateRecordKeyCount,
    externalRecordIdCollisionCount: dataset.externalRecordIdCollisionCount,
    matchableRecordCount: dataset.items.length,
    eligibilityRules: dataset.source.eligibilityRules || [],
    unmatchedCount: 0,
    ambiguousAddressCount: 0,
    nameMismatchCount: 0,
    proposalCount: 0,
    acceptedTargetCount: 0,
    corroboratingAcceptedTargetCount: 0,
    coordinateConflictCount: 0,
  };
}

const MATCH_MODE_RANK = Object.freeze({
  'exact-normalized-host-name': 0,
  'host-name-contained-in-restroom-name': 1,
  'reviewed-host-name-alias': 2,
});

function hostNameMatchMode(targetId, nationalNameRaw, hostNameRaw, sourceId) {
  const nationalName = normalizeHostName(nationalNameRaw);
  const hostName = normalizeHostName(hostNameRaw);
  if (Math.min(nationalName.length, hostName.length) >= 4) {
    if (nationalName === hostName) return 'exact-normalized-host-name';
    if (nationalName.includes(hostName)) return 'host-name-contained-in-restroom-name';
  }
  const alias = REVIEWED_HOST_NAME_ALIASES[targetId];
  if (
    alias
    && alias.sourceId === sourceId
    && normalizeHostName(alias.nationalName) === nationalName
    && alias.allowedSourceNames.some(name => asText(name) === asText(hostNameRaw))
  ) {
    return 'reviewed-host-name-alias';
  }
  return null;
}

function originalAddressForKey(host, matchedAddressKey) {
  const [kind] = matchedAddressKey.split(':', 1);
  const addresses = kind === 'road' ? host.roadAddresses : host.lotAddresses;
  return addresses.find(address => addressKey(kind, address) === matchedAddressKey) || '';
}

function proposalEvidence(proposal, primary) {
  return {
    sourceId: proposal.source.id,
    sourceGroupId: proposal.source.sourceGroup,
    sourceName: proposal.source.name,
    sourceUrl: proposal.source.sourceUrl,
    sourceDate: proposal.host.sourceDate,
    sourceLicense: proposal.source.license,
    sourceTermsUrl: proposal.source.termsUrl,
    sourceRecordKey: proposal.host.sourceRecordKey,
    externalRecordId: proposal.host.externalRecordId,
    recordFingerprint: proposal.host.recordFingerprint,
    sourceRowNumber: proposal.host.sourceRowNumber,
    sourceFacilityName: proposal.host.name,
    sourceRoadAddresses: proposal.host.roadAddresses,
    sourceLotAddresses: proposal.host.lotAddresses,
    matchedAddressKey: proposal.matchedAddressKey,
    addressMatchMode: proposal.addressMatchMode,
    matchMode: proposal.matchMode,
    lat: proposal.host.latitude,
    lng: proposal.host.longitude,
    distanceFromPrimaryMeters: Math.round(
      approximateDistanceMeters(proposal.host, primary.host) * 10,
    ) / 10,
    providerCode: proposal.host.providerCode,
    providerName: proposal.host.providerName,
    eligibilityEvidence: proposal.host.eligibilityEvidence,
  };
}

function reviewedTuple(item) {
  return [
    item.id,
    item.cityKey,
    item.sourceGroupId,
    item.sourceId,
    item.sourceRecordKey,
    item.matchKey,
    item.addressMatchMode,
    item.matchMode,
    Number(item.lat).toFixed(7),
    Number(item.lng).toFixed(7),
    [...(item.corroboratingSourceIds || [])].sort().join(','),
    corroboratingRecordsReviewFingerprint(item.corroboratingRecords),
  ].join('|');
}

function corroboratingRecordsReviewFingerprint(records) {
  const tuples = (records || []).map(record => [
    asText(record?.sourceId),
    asText(record?.sourceRecordKey),
    asText(record?.matchedAddressKey),
    asText(record?.addressMatchMode),
    asText(record?.matchMode),
    Number(record?.lat).toFixed(7),
    Number(record?.lng).toFixed(7),
  ].join('|')).sort();
  return stableHash(tuples.join('\n'));
}

export function hostAddressPointReviewFingerprint(items) {
  return stableHash(
    [...(items || [])].sort((first, second) => String(first.id).localeCompare(String(second.id)))
      .map(reviewedTuple)
      .join('\n'),
  );
}

export function matchHostAddressPoints(
  nationalItems,
  datasets,
  existingCoordinateById = new Set(),
) {
  if (!Array.isArray(nationalItems)) throw new Error('전국 공중화장실 원본이 배열이 아닙니다.');
  if (!Array.isArray(datasets)) throw new Error('호스트 시설 원본이 배열이 아닙니다.');

  const allowedCities = new Set(datasets.flatMap(dataset => dataset.source.allowedCityKeys));
  const nationalById = new Map();
  const nationalByAddress = new Map();
  for (const raw of nationalItems) {
    const item = nationalRecord(raw);
    if (
      !item.id
      || !item.name
      || !allowedCities.has(item.cityKey)
      || mapHas(existingCoordinateById, item.id)
    ) {
      continue;
    }
    nationalById.set(item.id, item);
    for (const address of item.addressKeys) {
      if (!nationalByAddress.has(address)) nationalByAddress.set(address, new Set());
      nationalByAddress.get(address).add(item.id);
    }
  }

  const summaries = new Map(datasets.map(dataset => [
    dataset.source.id,
    sourceSummary(dataset),
  ]));
  const proposalsByTarget = new Map();
  for (const [sourcePriority, dataset] of datasets.entries()) {
    const summary = summaries.get(dataset.source.id);
    for (const host of dataset.items) {
      const candidateIds = new Set();
      const matchedAddressKeyByTarget = new Map();
      const addressMatchModeByTarget = new Map();
      for (const address of host.addressKeys) {
        const candidates = nationalByAddress.get(address);
        for (const id of candidates || []) {
          candidateIds.add(id);
          if (!matchedAddressKeyByTarget.has(id)) matchedAddressKeyByTarget.set(id, address);
          addressMatchModeByTarget.set(id, 'exact-typed-address');
        }
        for (const [id, alias] of Object.entries(REVIEWED_HOST_ADDRESS_KEY_ALIASES)) {
          if (
            alias.sourceId !== dataset.source.id
            || !alias.allowedHostAddressKeys.includes(address)
          ) {
            continue;
          }
          const national = nationalById.get(id);
          if (!national?.addressKeys.includes(alias.nationalAddressKey)) continue;
          candidateIds.add(id);
          if (!matchedAddressKeyByTarget.has(id)) matchedAddressKeyByTarget.set(id, address);
          if (!addressMatchModeByTarget.has(id)) {
            addressMatchModeByTarget.set(id, 'reviewed-address-field-variant');
          }
        }
      }
      if (candidateIds.size === 0) {
        summary.unmatchedCount += 1;
        continue;
      }
      if (candidateIds.size !== 1) {
        summary.ambiguousAddressCount += 1;
        continue;
      }

      const targetId = [...candidateIds][0];
      const national = nationalById.get(targetId);
      const matchedAddressKey = matchedAddressKeyByTarget.get(targetId);
      const addressMatchMode = addressMatchModeByTarget.get(targetId);
      const matchMode = hostNameMatchMode(
        targetId,
        national.name,
        host.name,
        dataset.source.id,
      );
      if (!matchMode) {
        summary.nameMismatchCount += 1;
        continue;
      }

      summary.proposalCount += 1;
      if (!proposalsByTarget.has(targetId)) proposalsByTarget.set(targetId, []);
      proposalsByTarget.get(targetId).push({
        source: dataset.source,
        sourcePriority,
        summary,
        host,
        national,
        matchedAddressKey,
        addressMatchMode,
        matchMode,
      });
    }
  }

  const items = [];
  let coordinateConflictCount = 0;
  for (const [targetId, proposals] of proposalsByTarget) {
    const coordinatesAgree = proposals.every((first, firstIndex) =>
      proposals.slice(firstIndex + 1).every(second =>
        approximateDistanceMeters(first.host, second.host) <= MATCH_DISTANCE_METERS
      )
    );
    if (!coordinatesAgree) {
      coordinateConflictCount += 1;
      for (const summary of new Set(proposals.map(proposal => proposal.summary))) {
        summary.coordinateConflictCount += 1;
      }
      continue;
    }

    proposals.sort((first, second) =>
      MATCH_MODE_RANK[first.matchMode] - MATCH_MODE_RANK[second.matchMode]
      || first.sourcePriority - second.sourcePriority
      || second.host.sourceDate.localeCompare(first.host.sourceDate)
      || first.host.sourceRecordKey.localeCompare(second.host.sourceRecordKey)
    );
    const chosen = proposals[0];
    chosen.summary.acceptedTargetCount += 1;
    for (const summary of new Set(proposals.map(proposal => proposal.summary))) {
      summary.corroboratingAcceptedTargetCount += 1;
    }
    const corroboratingRecords = proposals.map(proposal =>
      proposalEvidence(proposal, chosen)
    );
    const corroboratingSources = [];
    const seenCorroboratingSourceIds = new Set();
    for (const proposal of proposals) {
      if (seenCorroboratingSourceIds.has(proposal.source.id)) continue;
      seenCorroboratingSourceIds.add(proposal.source.id);
      corroboratingSources.push(proposalEvidence(proposal, chosen));
    }
    const corroboratingSourceIds = [...seenCorroboratingSourceIds].sort();

    items.push({
      id: targetId,
      nm: chosen.national.name,
      addr: chosen.national.roadAddress || chosen.national.lotAddress,
      cityKey: chosen.national.cityKey,
      lat: chosen.host.latitude,
      lng: chosen.host.longitude,
      coordinateKind: 'address_point',
      coordinateApproximate: true,
      precision: 'host-facility-representative-point',
      sourceGroupId: chosen.source.sourceGroup,
      sourceId: chosen.source.id,
      sourceName: chosen.source.name,
      sourceUrl: chosen.source.sourceUrl,
      sourceDate: chosen.host.sourceDate,
      sourceLicense: chosen.source.license,
      sourceTermsUrl: chosen.source.termsUrl,
      sourceAddress: originalAddressForKey(chosen.host, chosen.matchedAddressKey)
        || chosen.host.roadAddresses[0]
        || chosen.host.lotAddresses[0],
      sourceFacilityName: chosen.host.name,
      sourceProviderCode: chosen.host.providerCode,
      sourceProviderName: chosen.host.providerName,
      sourceRowNumber: chosen.host.sourceRowNumber,
      sourceRecordKey: chosen.host.sourceRecordKey,
      sourceExternalRecordId: chosen.host.externalRecordId,
      recordFingerprint: chosen.host.recordFingerprint,
      matchedAddressKey: chosen.matchedAddressKey,
      addressMatchMode: chosen.addressMatchMode,
      matchMode: chosen.matchMode,
      eligibilityEvidence: chosen.host.eligibilityEvidence,
      corroboratingSources,
      corroboratingSourceIds,
      corroboratingRecords,
      matchMethod: 'unique-exact-road-or-lot-address+host-name-containment+coordinate-consistent-proposals',
      matchKey: `${normalizeHostName(chosen.national.name)}|${chosen.matchedAddressKey}`,
      coverageGain: true,
      legacyCoordinateRepair: false,
    });
  }

  items.sort((first, second) => first.id.localeCompare(second.id));
  const cities = {};
  for (const item of items) cities[item.cityKey] = (cities[item.cityKey] || 0) + 1;
  const groupIds = uniqueTexts(datasets.map(dataset => dataset.source.sourceGroup));
  const groups = groupIds.map(groupId => {
    const groupItems = items.filter(item => item.sourceGroupId === groupId);
    const groupCities = {};
    for (const item of groupItems) {
      groupCities[item.cityKey] = (groupCities[item.cityKey] || 0) + 1;
    }
    return {
      id: groupId,
      sourceIds: datasets
        .filter(dataset => dataset.source.sourceGroup === groupId)
        .map(dataset => dataset.source.id)
        .sort(),
      total: groupItems.length,
      coverageGainCount: groupItems.length,
      uniquePointCount: new Set(groupItems.map(coordinateKey)).size,
      cities: groupCities,
      expectedIdsHash: stableHash(groupItems.map(item => item.id).sort().join('\n')),
      reviewedTupleHash: hostAddressPointReviewFingerprint(groupItems),
    };
  });
  return {
    version: 2,
    total: items.length,
    coverageGainCount: items.length,
    repairCount: 0,
    uniquePointCount: new Set(items.map(coordinateKey)).size,
    coordinateConflictCount,
    cities,
    groups,
    reviewFingerprint: hostAddressPointReviewFingerprint(items),
    sources: datasets.map(dataset => summaries.get(dataset.source.id)),
    items,
  };
}

export function assertHostAddressPointDrift(result, options = {}) {
  const usesDefaultReview = !Object.hasOwn(options, 'expectedIds');
  const expectedIds = options.expectedIds || REVIEWED_HOST_ADDRESS_POINT_IDS;
  const expectedCities = options.expectedCities || {
    seoul: 5,
    daegu: 35,
    sejong: 12,
    ulsan: 35,
  };
  const actualIds = new Set((result?.items || []).map(item => String(item.id)));
  if (actualIds.size !== (result?.items || []).length) {
    throw new Error('공식 호스트 시설 주소점 중앙 관리번호가 중복됐습니다.');
  }
  if (
    Number(result?.total) !== (result?.items || []).length
    || Number(result?.coverageGainCount)
      !== (result?.items || []).filter(item => item.coverageGain).length
    || Number(result?.uniquePointCount)
      !== new Set((result?.items || []).map(coordinateKey)).size
  ) {
    throw new Error('공식 호스트 시설 주소점 저장 합계가 실제 결과와 다릅니다.');
  }
  const recalculatedReviewFingerprint = hostAddressPointReviewFingerprint(result?.items || []);
  if (result?.reviewFingerprint !== recalculatedReviewFingerprint) {
    throw new Error(
      `공식 호스트 시설 주소점 저장 검토 지문 ${result?.reviewFingerprint || '없음'}이 `
      + `실제 지문 ${recalculatedReviewFingerprint}과 다릅니다.`,
    );
  }
  const missing = [...expectedIds].filter(id => !actualIds.has(id));
  const unexpected = [...actualIds].filter(id => !expectedIds.has(id));
  if (missing.length > 0 || unexpected.length > 0) {
    throw new Error(
      `공식 호스트 시설 주소점 검토 ID가 달라졌습니다. `
      + `누락 ${missing.slice(0, 5).join(', ') || '없음'}, `
      + `신규 ${unexpected.slice(0, 5).join(', ') || '없음'}.`,
    );
  }
  if (Number(result?.coordinateConflictCount) !== 0) {
    throw new Error('공식 호스트 시설 주소점에 40m 초과 좌표 충돌이 있습니다.');
  }
  const actualCityKeys = Object.keys(result?.cities || {}).sort();
  const expectedCityKeys = Object.keys(expectedCities).sort();
  if (JSON.stringify(actualCityKeys) !== JSON.stringify(expectedCityKeys)) {
    throw new Error(
      `공식 호스트 시설 주소점 도시 집합 ${actualCityKeys.join(', ')}이 `
      + `검토 기준 ${expectedCityKeys.join(', ')}과 다릅니다.`,
    );
  }
  for (const [cityKey, expected] of Object.entries(expectedCities)) {
    if (Number(result?.cities?.[cityKey] || 0) !== Number(expected)) {
      throw new Error(
        `공식 호스트 시설 주소점 ${cityKey} ${result?.cities?.[cityKey] || 0}건이 `
        + `검토 기준 ${expected}건과 다릅니다.`,
      );
    }
  }

  const expectedFingerprint = Object.hasOwn(options, 'expectedFingerprint')
    ? options.expectedFingerprint
    : usesDefaultReview
      ? REVIEWED_HOST_ADDRESS_POINT_FINGERPRINT
      : null;
  if (expectedFingerprint && recalculatedReviewFingerprint !== expectedFingerprint) {
    throw new Error(
      `공식 호스트 시설 주소점 검토 지문 ${recalculatedReviewFingerprint}이 `
      + `승인 지문 ${expectedFingerprint}과 다릅니다.`,
    );
  }

  const expectedGroups = Object.hasOwn(options, 'expectedGroups')
    ? options.expectedGroups
    : usesDefaultReview
      ? REVIEWED_HOST_ADDRESS_POINT_GROUPS
      : null;
  if (expectedGroups) {
    const actualGroups = new Map((result?.groups || []).map(group => [group.id, group]));
    const actualGroupIds = [...actualGroups.keys()].sort();
    const expectedGroupIds = Object.keys(expectedGroups).sort();
    if (JSON.stringify(actualGroupIds) !== JSON.stringify(expectedGroupIds)) {
      throw new Error('공식 호스트 시설 주소점 출처 그룹 집합이 검토 기준과 다릅니다.');
    }
    for (const [groupId, expected] of Object.entries(expectedGroups)) {
      const actual = actualGroups.get(groupId);
      const groupItems = (result?.items || [])
        .filter(item => item.sourceGroupId === groupId);
      const recalculatedCities = {};
      for (const item of groupItems) {
        recalculatedCities[item.cityKey] = (recalculatedCities[item.cityKey] || 0) + 1;
      }
      const recalculatedSourceIds = (result?.sources || [])
        .filter(source => source.sourceGroupId === groupId)
        .map(source => source.id)
        .sort();
      const recalculated = {
        total: groupItems.length,
        coverageGainCount: groupItems.filter(item => item.coverageGain).length,
        uniquePointCount: new Set(groupItems.map(coordinateKey)).size,
        expectedIdsHash: stableHash(groupItems.map(item => item.id).sort().join('\n')),
        reviewedTupleHash: hostAddressPointReviewFingerprint(groupItems),
        cities: recalculatedCities,
        sourceIds: recalculatedSourceIds,
      };
      for (const field of [
        'total',
        'coverageGainCount',
        'uniquePointCount',
        'expectedIdsHash',
        'reviewedTupleHash',
      ]) {
        if (String(actual?.[field]) !== String(recalculated[field])) {
          throw new Error(`공식 호스트 시설 주소점 ${groupId} 저장 ${field}가 실제 결과와 다릅니다.`);
        }
      }
      if (
        JSON.stringify([...(actual?.sourceIds || [])].sort())
          !== JSON.stringify(recalculated.sourceIds)
        || JSON.stringify(Object.entries(actual?.cities || {}).sort())
          !== JSON.stringify(Object.entries(recalculated.cities).sort())
      ) {
        throw new Error(`공식 호스트 시설 주소점 ${groupId} 저장 출처 또는 도시 집합이 다릅니다.`);
      }
      for (const field of [
        'total',
        'coverageGainCount',
        'uniquePointCount',
        'expectedIdsHash',
        'reviewedTupleHash',
      ]) {
        if (String(actual?.[field]) !== String(expected[field])) {
          throw new Error(`공식 호스트 시설 주소점 ${groupId} ${field}가 검토 기준과 다릅니다.`);
        }
      }
      if (
        JSON.stringify([...(actual?.sourceIds || [])].sort())
          !== JSON.stringify([...expected.sourceIds].sort())
        || JSON.stringify(Object.entries(actual?.cities || {}).sort())
          !== JSON.stringify(Object.entries(expected.cities).sort())
      ) {
        throw new Error(`공식 호스트 시설 주소점 ${groupId} 출처 또는 도시 집합이 다릅니다.`);
      }
    }
  }

  if (!usesDefaultReview && options.validateProvenance !== true) return;

  const sourceById = new Map((result?.sources || []).map(source => [String(source.id), source]));
  if (usesDefaultReview) {
    const expectedSourceIds = HOST_ADDRESS_SOURCES.map(source => source.id).sort();
    const actualSourceIds = [...sourceById.keys()].sort();
    if (
      sourceById.size !== (result?.sources || []).length
      || JSON.stringify(actualSourceIds) !== JSON.stringify(expectedSourceIds)
    ) {
      throw new Error('공식 호스트 시설 주소점 저장 출처 집합이 코드 검토 기준과 다릅니다.');
    }
    for (const expectedSource of HOST_ADDRESS_SOURCES) {
      const actualSource = sourceById.get(expectedSource.id);
      if (
        !actualSource
        || asText(actualSource.minimumLatestSourceDate)
          !== asText(expectedSource.minimumLatestSourceDate)
        || JSON.stringify(Object.entries(
          actualSource.minimumValidScopedRowsByCity || {},
        ).sort())
          !== JSON.stringify(Object.entries(
            expectedSource.minimumValidScopedRowsByCity || {},
          ).sort())
      ) {
        throw new Error(
          `공식 호스트 시설 주소점 ${expectedSource.id} 저장 완전성 게이트가 `
          + '코드 검토 기준과 다릅니다.',
        );
      }
    }
  }
  for (const source of sourceById.values()) {
    const validRowsByCity = source.validScopedRowsByCity || {};
    const validRowsByCityTotal = Object.values(validRowsByCity)
      .reduce((sum, value) => sum + Number(value || 0), 0);
    if (validRowsByCityTotal !== Number(source.matchableRecordCount)) {
      throw new Error(`공식 호스트 시설 주소점 ${source.id} 도시별 유효행 합계가 다릅니다.`);
    }
    for (const [cityKey, minimum] of Object.entries(
      source.minimumValidScopedRowsByCity || {},
    )) {
      if (Number(validRowsByCity[cityKey] || 0) < Number(minimum)) {
        throw new Error(
          `공식 호스트 시설 주소점 ${source.id} ${cityKey} 유효행이 최소치보다 적습니다.`,
        );
      }
    }
    if (
      asText(source.minimumLatestSourceDate)
      && asText(source.sourceDate) < asText(source.minimumLatestSourceDate)
    ) {
      throw new Error(`공식 호스트 시설 주소점 ${source.id} 최신 기준일이 최소치보다 오래됐습니다.`);
    }
  }
  if (usesDefaultReview) {
    const actualPrimaryCounts = Object.fromEntries(
      [...sourceById].map(([id, source]) => [id, Number(source.acceptedTargetCount || 0)]),
    );
    if (
      JSON.stringify(Object.entries(actualPrimaryCounts).sort())
      !== JSON.stringify(Object.entries(REVIEWED_HOST_PRIMARY_SOURCE_COUNTS).sort())
    ) {
      throw new Error('공식 호스트 시설 주소점 원천별 primary 채택 수가 검토 기준과 다릅니다.');
    }
  }
  for (const item of result?.items || []) {
    const source = sourceById.get(String(item.sourceId));
    if (!source || source.sourceGroupId !== item.sourceGroupId) {
      throw new Error(`공식 호스트 시설 주소점 primary 출처 그룹이 잘못됐습니다: ${item.id}`);
    }
    if (
      item.sourceId === 'national-traditional-market-host-points'
      && item.eligibilityEvidence?.PBLIC_TOILET_YN !== 'Y'
    ) {
      throw new Error(`공식 시장 주소점의 공중화장실 보유 여부가 Y가 아닙니다: ${item.id}`);
    }
    const sourceEvidence = Array.isArray(item.corroboratingSources)
      ? item.corroboratingSources
      : [];
    const sourceEvidenceIds = sourceEvidence.map(evidence => String(evidence.sourceId));
    if (
      new Set(sourceEvidenceIds).size !== sourceEvidenceIds.length
      || JSON.stringify([...sourceEvidenceIds].sort())
        !== JSON.stringify([...(item.corroboratingSourceIds || [])].sort())
    ) {
      throw new Error(`공식 호스트 시설 주소점 출처 교차검증 목록이 중복되거나 불일치합니다: ${item.id}`);
    }
    const chosenEvidence = sourceEvidence.filter(evidence =>
      String(evidence.sourceId) === String(item.sourceId)
    );
    if (
      chosenEvidence.length !== 1
      || chosenEvidence[0].sourceRecordKey !== item.sourceRecordKey
      || chosenEvidence[0].recordFingerprint !== item.recordFingerprint
      || chosenEvidence[0].sourceDate !== item.sourceDate
      || chosenEvidence[0].matchedAddressKey !== item.matchedAddressKey
      || Number(chosenEvidence[0].lat) !== Number(item.lat)
      || Number(chosenEvidence[0].lng) !== Number(item.lng)
    ) {
      throw new Error(`공식 호스트 시설 주소점 primary 근거가 불완전합니다: ${item.id}`);
    }
    const records = Array.isArray(item.corroboratingRecords)
      ? item.corroboratingRecords
      : [];
    const recordKeys = records.map(record =>
      `${asText(record.sourceId)}|${asText(record.sourceRecordKey)}`
    );
    const invalidRecord = records.find(record => {
      const latitude = Number(record.lat);
      const longitude = Number(record.lng);
      const recordedDistance = Number(record.distanceFromPrimaryMeters);
      const actualDistance = Math.round(Math.hypot(
        (latitude - Number(item.lat)) * 111_000,
        (longitude - Number(item.lng)) * 90_000,
      ) * 10) / 10;
      let expectedFingerprint = '';
      try {
        expectedFingerprint = hostRecordFingerprint(record);
      } catch {
        return true;
      }
      return (
        !sourceById.has(asText(record.sourceId))
        || !asText(record.sourceRecordKey)
        || !asText(record.recordFingerprint)
        || !asText(record.matchedAddressKey)
        || !Number.isFinite(latitude)
        || !Number.isFinite(longitude)
        || !Number.isFinite(recordedDistance)
        || recordedDistance > MATCH_DISTANCE_METERS
        || Math.abs(recordedDistance - actualDistance) > 0.05
        || record.recordFingerprint !== expectedFingerprint
      );
    });
    const primaryRecords = records.filter(record =>
      asText(record.sourceId) === asText(item.sourceId)
      && record.sourceRecordKey === item.sourceRecordKey
      && record.recordFingerprint === item.recordFingerprint
      && record.sourceDate === item.sourceDate
      && record.matchedAddressKey === item.matchedAddressKey
      && Number(record.lat) === Number(item.lat)
      && Number(record.lng) === Number(item.lng)
    );
    const sourceEvidenceMissingFromRecords = sourceEvidence.some(evidence =>
      !records.some(record =>
        asText(record.sourceId) === asText(evidence.sourceId)
        && record.sourceRecordKey === evidence.sourceRecordKey
        && record.recordFingerprint === evidence.recordFingerprint
        && record.sourceDate === evidence.sourceDate
        && record.matchedAddressKey === evidence.matchedAddressKey
        && Number(record.lat) === Number(evidence.lat)
        && Number(record.lng) === Number(evidence.lng)
      )
    );
    if (
      records.length === 0
      || new Set(recordKeys).size !== recordKeys.length
      || invalidRecord
      || primaryRecords.length !== 1
      || sourceEvidenceMissingFromRecords
    ) {
      throw new Error(`공식 호스트 시설 주소점 원천 레코드 근거가 불완전합니다: ${item.id}`);
    }
  }
}

export async function fetchOfficialHostAddressPoints(
  nationalItems,
  existingCoordinateById = new Set(),
  options = {},
) {
  const sources = options.sources || HOST_ADDRESS_SOURCES;
  const downloaded = await Promise.all(sources.map(async source => {
    const download = source.downloadKind === 'data-go-standard'
      ? await downloadStandardHostRows(source, { fetchImpl: options.fetchImpl })
      : await downloadSourceRows(source, { fetchImpl: options.fetchImpl });
    return normalizeHostRows(download.rows, source, { sourceDate: download.sourceDate });
  }));
  const result = matchHostAddressPoints(nationalItems, downloaded, existingCoordinateById);
  assertHostAddressPointDrift(result, options);
  return {
    ...result,
    generatedAt: (options.now ? options.now() : new Date()).toISOString(),
  };
}
