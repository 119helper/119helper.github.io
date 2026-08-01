import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TSUNAMI_PATH = path.join(__dirname, '..', 'public', 'data', 'tsunami.json');
const MANIFEST_PATH = path.join(__dirname, '..', 'public', 'data', 'manifest.json');
const SAFETY_PORTAL_ROOT = 'https://www.safekorea.go.kr/safekorea-kor';
const PROVINCE_CODES = ['26', '31', '47', '51'];
const MAX_RESPONSE_BYTES = 5_000_000;
const MAX_MAP_PAGES = 10;

function normalizedText(value) {
  return String(value ?? '')
    .normalize('NFC')
    .trim()
    .toLowerCase()
    .replace(/[\s·ㆍ.,()\-_]/g, '');
}

function coordinate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed.toFixed(5) : '';
}

function normalizedRecord(row, kind) {
  if (kind === 'primary') {
    return {
      manageGov: String(row.ARCD ?? '').slice(0, 5),
      name: row.SHNT_PLACE_NM,
      address: row.SHNT_PLACE_DTL_POSITION || row.RN_DTL_ADRES,
      lat: row.LA,
      lon: row.LO,
      region: String(row.SHNT_PLACE_DTL_POSITION || row.RN_DTL_ADRES || '').trim().split(/\s+/)[0],
      active: row.USE_AT !== 'N',
      modifiedAt: null,
    };
  }
  return {
    manageGov: row.manageGov,
    name: row.shelNm || row.title,
    address: row.address || row.adres,
    lat: row.lat ?? row.la,
    lon: row.lon ?? row.lo,
    region: row.sidoName || String(row.address || row.adres || '').trim().split(/\s+/)[0],
    active: row.delYn !== 'Y',
    modifiedAt: Number.isFinite(Number(row.modifyDate)) ? Number(row.modifyDate) : null,
  };
}

export function tsunamiPublicComparisonKey(row, kind) {
  const item = normalizedRecord(row, kind);
  const name = normalizedText(item.name);
  if (!name) throw new Error('교차검증 행의 대피소명이 비어 있습니다.');
  const lat = coordinate(item.lat);
  const lon = coordinate(item.lon);
  const location = lat && lon
    ? `${lat}:${lon}`
    : normalizedText(item.address);
  if (!location) throw new Error(`교차검증 행의 좌표와 주소가 모두 비어 있습니다: ${item.name}`);
  return `${String(item.manageGov || '').trim()}:${name}:${location}`;
}

function facilityIdentityKey(row, kind) {
  const item = normalizedRecord(row, kind);
  const authority = String(item.manageGov || '').trim();
  const name = normalizedText(item.name);
  if (!authority || !name) throw new Error('교차검증 행의 관할 코드 또는 대피소명이 비어 있습니다.');
  return `${authority}:${name}`;
}

function regionCounts(rows, kind) {
  const counts = {};
  for (const row of rows) {
    const region = normalizedRecord(row, kind).region || '지역 미상';
    counts[region] = (counts[region] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(counts).sort(([left], [right]) => left.localeCompare(right, 'ko')));
}

function keySummary(rows, kind) {
  const keys = new Set();
  const identityKeys = new Set();
  let duplicateCount = 0;
  for (const row of rows) {
    const key = tsunamiPublicComparisonKey(row, kind);
    if (keys.has(key)) duplicateCount += 1;
    keys.add(key);
    identityKeys.add(facilityIdentityKey(row, kind));
  }
  return { keys, identityKeys, duplicateCount };
}

function differenceCount(left, right) {
  let count = 0;
  for (const key of left) if (!right.has(key)) count += 1;
  return count;
}

function intersectionCount(left, right) {
  let count = 0;
  for (const key of left) if (right.has(key)) count += 1;
  return count;
}

export function buildTsunamiCrosscheckReport(
  primaryRows,
  staticRows,
  mapRows,
  announcedTotal = 680,
) {
  for (const [label, rows] of [
    ['공개 API', primaryRows],
    ['국민안전24 정적 목록', staticRows],
    ['국민안전24 안전지도', mapRows],
  ]) {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error(`${label}이 비어 있습니다.`);
  }

  const primary = keySummary(primaryRows, 'primary');
  const staticList = keySummary(staticRows, 'static');
  const safetyMap = keySummary(mapRows, 'map');
  const activeMapRows = mapRows.filter(row => normalizedRecord(row, 'map').active);
  const latestModifyTime = mapRows.reduce((latest, row) => (
    Math.max(latest, normalizedRecord(row, 'map').modifiedAt || 0)
  ), 0);

  return {
    method: 'official-public-list-coordinate-name-crosscheck-v1',
    announcedTotal,
    officialApi: {
      total: primaryRows.length,
      uniqueComparisonKeys: primary.keys.size,
      duplicateComparisonKeys: primary.duplicateCount,
      regionCounts: regionCounts(primaryRows, 'primary'),
    },
    safetyPortalStatic: {
      total: staticRows.length,
      uniqueComparisonKeys: staticList.keys.size,
      duplicateComparisonKeys: staticList.duplicateCount,
      regionCounts: regionCounts(staticRows, 'static'),
    },
    safetyMap: {
      total: mapRows.length,
      activeTotal: activeMapRows.length,
      uniqueComparisonKeys: safetyMap.keys.size,
      duplicateComparisonKeys: safetyMap.duplicateCount,
      latestSourceModifyAt: latestModifyTime > 0 ? new Date(latestModifyTime).toISOString() : null,
      regionCounts: regionCounts(mapRows, 'map'),
    },
    publicListsAgreement: {
      matched: intersectionCount(staticList.keys, safetyMap.keys),
      staticOnly: differenceCount(staticList.keys, safetyMap.keys),
      mapOnly: differenceCount(safetyMap.keys, staticList.keys),
    },
    primaryComparison: {
      matchedWithSafetyMap: intersectionCount(primary.keys, safetyMap.keys),
      primaryOnly: differenceCount(primary.keys, safetyMap.keys),
      safetyMapOnly: differenceCount(safetyMap.keys, primary.keys),
      matchedByAuthorityAndName: intersectionCount(primary.identityKeys, safetyMap.identityKeys),
      primaryOnlyByAuthorityAndName: differenceCount(primary.identityKeys, safetyMap.identityKeys),
      safetyMapOnlyByAuthorityAndName: differenceCount(safetyMap.identityKeys, primary.identityKeys),
    },
    countGaps: {
      officialApiToAnnouncement: primaryRows.length - announcedTotal,
      safetyPortalToAnnouncement: staticRows.length - announcedTotal,
    },
    sourceUrls: {
      officialApi: 'https://www.safetydata.go.kr/disaster-data/view?dataSn=1340',
      safetyPortalStaticTemplate: `${SAFETY_PORTAL_ROOT}/nas-files/tsunamiShelter/{sggCode}.json`,
      safetyMap: `${SAFETY_PORTAL_ROOT}/flsm/flsm/facilityDataList.do`,
    },
    note: '국민안전24 두 목록은 독립 교차검증용이며 공개 API 행을 임의로 대체하거나 합치지 않습니다.',
  };
}

async function responseJson(response, label) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => undefined);
    throw new Error(`${label}: 응답이 너무 큽니다 (${contentLength} bytes)`);
  }
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) {
    throw new Error(`${label}: 응답이 너무 큽니다 (>${MAX_RESPONSE_BYTES} bytes)`);
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label}: JSON 응답이 아닙니다.`);
  }
}

async function fetchJson(url, init, label, allowNotFound = false) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/json',
          'User-Agent': '119-helper-tsunami-crosscheck/1.0',
          ...init?.headers,
        },
        signal: AbortSignal.timeout(20_000),
      });
      if (allowNotFound && response.status === 404) {
        await response.body?.cancel().catch(() => undefined);
        return null;
      }
      if (!response.ok) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error(`HTTP_${response.status}`);
      }
      return await responseJson(response, label);
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(`${label}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

async function fetchDistricts() {
  const districts = [];
  for (const provinceCode of PROVINCE_CODES) {
    const rows = await fetchJson(
      `${SAFETY_PORTAL_ROOT}/data/map/sgg/${provinceCode}.json`,
      undefined,
      `국민안전24 ${provinceCode} 시군구`,
    );
    if (!Array.isArray(rows)) throw new Error(`국민안전24 ${provinceCode} 시군구 응답이 배열이 아닙니다.`);
    for (const row of rows) {
      const code = String(row?.code ?? '').trim();
      if (/^\d{5}$/.test(code)) districts.push(code);
    }
  }
  return [...new Set(districts)];
}

async function fetchDistrictRows(sggCode) {
  const staticPayload = await fetchJson(
    `${SAFETY_PORTAL_ROOT}/nas-files/tsunamiShelter/${sggCode}.json`,
    { headers: { Referer: 'https://www.safekorea.go.kr/' } },
    `국민안전24 정적 목록 ${sggCode}`,
    true,
  );
  const staticRows = staticPayload === null
    ? []
    : Array.isArray(staticPayload)
      ? staticPayload
      : (() => { throw new Error(`국민안전24 정적 목록 ${sggCode} 응답이 배열이 아닙니다.`); })();

  const firstMapPayload = await fetchJson(
    `${SAFETY_PORTAL_ROOT}/flsm/flsm/facilityDataList.do`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        Referer: 'https://www.safekorea.go.kr/',
      },
      body: new URLSearchParams({
        tableNm: 'TFK_TSUNAMI_SHELTER_TEMP',
        tableKorNm: '지진해일대피소',
        sggCd: sggCode,
        page: '1',
        size: '1000',
      }),
    },
    `국민안전24 안전지도 ${sggCode} 1페이지`,
  );
  if (!firstMapPayload || !Array.isArray(firstMapPayload.mapList)) {
    throw new Error(`국민안전24 안전지도 ${sggCode} 응답 형식이 올바르지 않습니다.`);
  }
  const totalPages = Number(firstMapPayload.totalPages) || 1;
  if (totalPages > MAX_MAP_PAGES) throw new Error(`국민안전24 안전지도 ${sggCode} 페이지 한도를 초과했습니다.`);
  const mapRows = [...firstMapPayload.mapList];
  for (let page = 2; page <= totalPages; page += 1) {
    const payload = await fetchJson(
      `${SAFETY_PORTAL_ROOT}/flsm/flsm/facilityDataList.do`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Referer: 'https://www.safekorea.go.kr/',
        },
        body: new URLSearchParams({
          tableNm: 'TFK_TSUNAMI_SHELTER_TEMP',
          tableKorNm: '지진해일대피소',
          sggCd: sggCode,
          page: String(page),
          size: '1000',
        }),
      },
      `국민안전24 안전지도 ${sggCode} ${page}페이지`,
    );
    if (!payload || !Array.isArray(payload.mapList)) {
      throw new Error(`국민안전24 안전지도 ${sggCode} ${page}페이지 응답 형식이 올바르지 않습니다.`);
    }
    mapRows.push(...payload.mapList);
  }
  return { staticRows, mapRows };
}

async function pooledMap(values, concurrency, mapper) {
  const results = new Array(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(values[index]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, values.length) }, () => worker()));
  return results;
}

async function main() {
  const primaryRows = JSON.parse(fs.readFileSync(TSUNAMI_PATH, 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const districts = await fetchDistricts();
  const districtRows = await pooledMap(districts, 5, fetchDistrictRows);
  const staticRows = districtRows.flatMap(result => result.staticRows);
  const mapRows = districtRows.flatMap(result => result.mapRows);
  const announcedTotal = Number(manifest.datasets?.tsunami?.announcedTotal) || 680;
  const report = buildTsunamiCrosscheckReport(primaryRows, staticRows, mapRows, announcedTotal);

  manifest.datasets.tsunami.publicListCrosscheck = report;
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  console.log(
    `지진해일 교차검증: API ${report.officialApi.total} / 정적 목록 ${report.safetyPortalStatic.total}`
    + ` / 안전지도 ${report.safetyMap.total} / 발표 ${report.announcedTotal}`,
  );
  console.log(
    `국민안전24 목록 일치: ${report.publicListsAgreement.matched}`
    + ` (정적만 ${report.publicListsAgreement.staticOnly}, 지도만 ${report.publicListsAgreement.mapOnly})`,
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
