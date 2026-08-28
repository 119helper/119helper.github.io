import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import shp from 'shpjs';
import { fetchWithRetry } from './fetch-with-retry.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_REGISTRY_PATH = path.join(__dirname, 'restroom-regional-sources.json');
const DATA_GO_DOWNLOAD_INFO_URL = 'https://www.data.go.kr/tcs/dss/selectFileDataDownload.do';
const REQUEST_TIMEOUT_MS = 60_000;

function asText(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function uniqueTexts(values) {
  return [...new Set(values.map(asText).filter(Boolean))];
}

function firstField(row, names = []) {
  for (const name of names) {
    const value = asText(row?.[name]);
    if (value) return value;
  }
  return '';
}

function allFields(row, names = []) {
  return uniqueTexts(names.map(name => row?.[name]));
}

function isoDate(value) {
  const text = asText(value);
  if (!text) return null;
  const match = text.match(/(\d{4})[-./년\s]*(\d{1,2})[-./월\s]*(\d{1,2})/);
  if (!match) return null;
  return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
}

function latestDate(values) {
  return values.map(isoDate).filter(Boolean).sort().at(-1) || null;
}

function sourceScopeAddress(value, source) {
  let text = asText(value).replace(/\s+/g, ' ');
  if (!text) return '';

  text = text
    .replace(/^서울(?=\s|$)/, '서울특별시')
    .replace(/^서울시(?=\s|$)/, '서울특별시')
    .replace(/^부산시(?=\s|$)/, '부산광역시')
    .replace(/^제주도(?=\s|$)/, '제주특별자치도');

  if (source?.district && text.startsWith(`${source.district} `)) {
    text = `${source.city} ${text}`;
  }
  return text;
}

function addressIsInSourceScope(value, source) {
  const normalized = normalizeAddress(value, source);
  if (!normalized) return false;
  const city = normalizeAddress(source.city);
  if (!normalized.startsWith(city)) return false;
  if (!source.district) return true;
  return normalized.startsWith(`${city}${normalizeAddress(source.district)}`);
}

function coordinateInBounds(latitude, longitude, source) {
  const [minimumLatitude, maximumLatitude] = source.latitudeRange || [33, 39];
  const [minimumLongitude, maximumLongitude] = source.longitudeRange || [124, 132];
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= minimumLatitude
    && latitude <= maximumLatitude
    && longitude >= minimumLongitude
    && longitude <= maximumLongitude;
}

function requiredFieldGroups(source) {
  return ['name', 'roadAddress', 'lotAddress', 'latitude', 'longitude']
    .filter(group => group !== 'lotAddress' || (source.fieldMap?.lotAddress?.length ?? 0) > 0);
}

function validateColumns(rows, source) {
  const columns = new Set(rows.flatMap(row => Object.keys(row || {})));
  for (const group of requiredFieldGroups(source)) {
    const aliases = source.fieldMap?.[group] || [];
    if (aliases.length === 0 || !aliases.some(alias => columns.has(alias))) {
      throw new Error(`${source.id}: ${group} 필수 컬럼이 없습니다.`);
    }
  }
}

function existingCoordinateStatus(existingCoordinateById, id) {
  if (!existingCoordinateById) return { exists: false, kind: null };
  if (existingCoordinateById instanceof Set) {
    return {
      exists: existingCoordinateById.has(id),
      kind: existingCoordinateById.has(id) ? 'facility_point' : null,
    };
  }

  const value = existingCoordinateById instanceof Map
    ? existingCoordinateById.get(id)
    : existingCoordinateById[id];
  if (!value) return { exists: false, kind: null };
  if (value === true) return { exists: true, kind: 'facility_point' };
  const latitude = Number(value.lat ?? value.latitude);
  const longitude = Number(value.lng ?? value.longitude);
  const exists = Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude !== 0
    && longitude !== 0;
  return {
    exists,
    kind: exists ? value.coordinateKind || 'facility_point' : null,
  };
}

function nationalRecord(item) {
  const id = asText(item?.MNG_NO ?? item?.id);
  const name = asText(item?.RSTRM_NM ?? item?.nm);
  const roadAddress = asText(item?.LCTN_ROAD_NM_ADDR ?? item?.roadAddress);
  const lotAddress = asText(item?.LCTN_LOTNO_ADDR ?? item?.lotAddress);
  return {
    id,
    name,
    roadAddress,
    lotAddress,
    addresses: uniqueTexts([roadAddress, lotAddress]),
  };
}

function matchKey(name, address, source) {
  const normalizedName = normalizeName(name);
  const normalizedAddress = normalizeAddress(address, source);
  return normalizedName && normalizedAddress ? `${normalizedName}|${normalizedAddress}` : '';
}

function sourceSummary(dataset) {
  const counts = reason => dataset.rejected.filter(item => item.reason === reason).length;
  return {
    id: dataset.source.id,
    label: dataset.source.label,
    displayLabel: dataset.source.displayLabel
      || (dataset.source.district || dataset.source.city),
    city: dataset.source.city,
    cityKey: dataset.source.cityKey,
    district: dataset.source.district || '전체',
    sourceUrl: dataset.source.sourceUrl,
    sourceDate: dataset.sourceDate,
    license: dataset.source.license,
    sourceTotal: dataset.rawCount,
    validCoordinateCount: dataset.items.length,
    invalidCoordinateCount: counts('invalid-coordinate'),
    outOfScopeCount: counts('out-of-scope'),
    missingIdentityCount: counts('missing-identity'),
    unmatchedCount: 0,
    ambiguousNationalMatchCount: 0,
    ambiguousAddressMatchCount: 0,
    addressNameMismatchCount: 0,
    duplicateRegionalMatchCount: 0,
    duplicateRegionalTargetCount: 0,
    consistentDuplicateRegionalRowCount: 0,
    consistentDuplicateRegionalTargetCount: 0,
    exactMatchedCount: 0,
    addressNameContainedMatchedCount: 0,
    existingCoordinateCount: 0,
    gainCount: 0,
    precisionUpgradeCount: 0,
  };
}

function assertSourceSummaryGates(source, summary) {
  const gates = source.summaryGates || {};
  for (const [field, minimum] of Object.entries(gates.minimum || {})) {
    const actual = Number(summary[field]);
    if (!Number.isFinite(actual) || actual < Number(minimum)) {
      throw new Error(
        `${source.id}: ${field} ${Number.isFinite(actual) ? actual : '미확인'}건이 `
        + `검토 기준 최소 ${minimum}건보다 적습니다.`,
      );
    }
  }
  for (const [field, maximum] of Object.entries(gates.maximum || {})) {
    const actual = Number(summary[field]);
    if (!Number.isFinite(actual) || actual > Number(maximum)) {
      throw new Error(
        `${source.id}: ${field} ${Number.isFinite(actual) ? actual : '미확인'}건이 `
        + `검토 기준 최대 ${maximum}건보다 많습니다.`,
      );
    }
  }
}

function extractSeoulSourceDate(html) {
  const match = String(html).match(
    /데이터\s*갱신일[\s\S]{0,300}?(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/,
  );
  return match
    ? `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`
    : null;
}

function extractDataGoContentUrl(html) {
  const match = String(html).match(/"contentUrl"\s*:\s*("(?:\\.|[^"\\])*")/);
  if (!match) return null;
  try {
    return JSON.parse(match[1]).replaceAll('&amp;', '&');
  } catch {
    return null;
  }
}

function extractDataGoFileDate(html) {
  const match = String(html).match(
    /파일데이터명[\s\S]{0,250}?_(\d{4})(\d{2})(\d{2})(?=[^0-9]|$)/,
  );
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function cookieHeader(response) {
  const values = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [response.headers.get('set-cookie')].filter(Boolean);
  return values.map(value => value.split(';', 1)[0]).join('; ');
}

function appendCookies(current, response) {
  const next = cookieHeader(response);
  if (!next) return current;
  const cookies = new Map();
  for (const pair of `${current}; ${next}`.split(';')) {
    const [name, ...value] = pair.trim().split('=');
    if (name && value.length > 0) cookies.set(name, value.join('='));
  }
  return [...cookies].map(([name, value]) => `${name}=${value}`).join('; ');
}

async function checkedFetch(fetchImpl, url, init = {}) {
  return fetchWithRetry(url, init, {
    fetchImpl,
    attempts: 3,
    timeoutMs: REQUEST_TIMEOUT_MS,
    label: '공중화장실 지역 원천 조회',
  });
}

async function downloadPublicJsonApi(source, fetchImpl) {
  const url = new URL(source.downloadUrl);
  url.searchParams.set('pageNo', '1');
  url.searchParams.set('numOfRows', String(source.apiPageSize || 1_000));
  const response = await checkedFetch(fetchImpl, url, {
    headers: {
      Accept: 'application/json',
      Referer: source.sourceUrl,
      'User-Agent': '119-helper-restroom-regional-sync/1.0',
    },
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new Error(`${source.id}: 공개 JSON API 응답을 해석하지 못했습니다.`);
  }

  const header = payload?.response?.header;
  const body = payload?.response?.body;
  const successCodes = source.successResultCodes || ['C00'];
  if (!header || !successCodes.includes(String(header.resultCode ?? ''))) {
    throw new Error(
      `${source.id}: 공개 JSON API 오류 ${header?.resultCode ?? '미확인'} `
      + `${header?.resultMsg ?? '응답 헤더 없음'}`,
    );
  }

  const rows = Array.isArray(body?.items)
    ? body.items
    : body?.items && typeof body.items === 'object' ? [body.items] : [];
  const totalCount = Number(body?.totalCnt);
  if (!Number.isInteger(totalCount) || totalCount < 0) {
    throw new Error(`${source.id}: 공개 JSON API 전체 건수가 올바르지 않습니다.`);
  }
  if (rows.length !== totalCount) {
    throw new Error(
      `${source.id}: 공개 JSON API ${rows.length}행만 받아 전체 ${totalCount}행을 충족하지 못했습니다.`,
    );
  }

  return { rows, sourceDate: null };
}

async function dataGoDownloadUrl(source, pageHtml, cookies, fetchImpl) {
  const contentUrl = extractDataGoContentUrl(pageHtml);
  if (contentUrl) return { url: contentUrl, cookies };

  if (!source.publicDataDetailPk) {
    throw new Error(`${source.id}: 최신 파일 URL과 publicDataDetailPk를 찾지 못했습니다.`);
  }

  const infoResponse = await checkedFetch(fetchImpl, DATA_GO_DOWNLOAD_INFO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookies,
      Referer: source.sourceUrl,
      'User-Agent': '119-helper-restroom-regional-sync/1.0',
    },
    body: new URLSearchParams({
      publicDataDetailPk: source.publicDataDetailPk,
      publicDataPk: source.publicDataPk,
      atchFileId: '',
      fileDetailSn: '',
    }),
  });
  cookies = appendCookies(cookies, infoResponse);
  const info = await infoResponse.json();
  if (info.status !== true || !info.atchFileId || !info.fileDetailSn) {
    throw new Error(`${source.id}: 공공데이터포털 최신 파일 식별자를 받지 못했습니다.`);
  }

  const url = new URL('/cmm/cmm/fileDownload.do', 'https://www.data.go.kr');
  url.searchParams.set('atchFileId', info.atchFileId);
  url.searchParams.set('fileDetailSn', info.fileDetailSn);
  url.searchParams.set('insertDataPrcus', 'N');
  return { url: url.toString(), cookies };
}

async function downloadSeoulCsv(source, fetchImpl) {
  const pageResponse = await checkedFetch(fetchImpl, source.sourceUrl, {
    headers: { 'User-Agent': '119-helper-restroom-regional-sync/1.0' },
  });
  const cookies = cookieHeader(pageResponse);
  const pageHtml = await pageResponse.text();
  const sourceDate = extractSeoulSourceDate(pageHtml);

  const response = await checkedFetch(fetchImpl, source.downloadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookies,
      Referer: source.sourceUrl,
      'User-Agent': '119-helper-restroom-regional-sync/1.0',
    },
    body: new URLSearchParams({
      srvType: 'S',
      infId: source.datasetId,
      serviceKind: '0',
      pageNo: '1',
      gridTotalCnt: '',
      ssUserId: 'SAMPLE_VIEW',
      strWhere: '',
      strOrderby: '',
      filterCol: '',
      txtFilter: '',
    }),
  });
  return {
    text: decodeCsv(await response.arrayBuffer(), source.encoding),
    sourceDate,
  };
}

async function downloadDataGoCsv(source, fetchImpl) {
  const pageResponse = await checkedFetch(fetchImpl, source.sourceUrl, {
    headers: { 'User-Agent': '119-helper-restroom-regional-sync/1.0' },
  });
  let cookies = cookieHeader(pageResponse);
  const pageHtml = await pageResponse.text();
  const download = await dataGoDownloadUrl(source, pageHtml, cookies, fetchImpl);
  cookies = download.cookies;
  const response = await checkedFetch(fetchImpl, download.url, {
    headers: {
      Cookie: cookies,
      Referer: source.sourceUrl,
      'User-Agent': '119-helper-restroom-regional-sync/1.0',
    },
  });
  return {
    text: decodeCsv(await response.arrayBuffer(), source.encoding),
    sourceDate: extractDataGoFileDate(pageHtml),
  };
}

export function rowsFromShapefileGeoJson(geoJson, source) {
  const collections = Array.isArray(geoJson) ? geoJson : [geoJson];
  const collection = source.shapefileName
    ? collections.find(item => item?.fileName === source.shapefileName)
    : collections.length === 1 ? collections[0] : null;
  if (!collection || collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error(`${source.id}: 대상 SHP FeatureCollection을 하나로 식별하지 못했습니다.`);
  }

  const indexes = source.shapefileFieldIndexes || {};
  const requiredIndexes = ['name', 'roadAddress', 'lotAddress']
    .filter(field => field !== 'lotAddress' || Number.isInteger(indexes.lotAddress));
  for (const field of requiredIndexes) {
    if (!Number.isInteger(indexes[field]) || indexes[field] < 0) {
      throw new Error(`${source.id}: SHP ${field} 필드 순번이 올바르지 않습니다.`);
    }
  }

  return collection.features.map((feature, index) => {
    if (feature?.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) {
      throw new Error(`${source.id}: ${index + 1}번째 SHP 지오메트리가 Point가 아닙니다.`);
    }
    const [geometryLongitude, geometryLatitude] = feature.geometry.coordinates.map(Number);
    if (!Number.isFinite(geometryLatitude) || !Number.isFinite(geometryLongitude)) {
      throw new Error(`${source.id}: ${index + 1}번째 SHP 좌표가 숫자가 아닙니다.`);
    }

    const values = Object.values(feature.properties || {});
    const fieldValue = field => Number.isInteger(indexes[field]) ? values[indexes[field]] : '';
    const propertyLatitude = Number(fieldValue('latitude'));
    const propertyLongitude = Number(fieldValue('longitude'));
    if (
      Number.isFinite(propertyLatitude)
      && Math.abs(propertyLatitude - geometryLatitude) > 1e-6
    ) {
      throw new Error(`${source.id}: ${index + 1}번째 SHP 위도 필드와 지오메트리가 다릅니다.`);
    }
    if (
      Number.isFinite(propertyLongitude)
      && Math.abs(propertyLongitude - geometryLongitude) > 1e-6
    ) {
      throw new Error(`${source.id}: ${index + 1}번째 SHP 경도 필드와 지오메트리가 다릅니다.`);
    }

    return {
      __name: fieldValue('name'),
      __roadAddress: fieldValue('roadAddress'),
      __lotAddress: fieldValue('lotAddress'),
      __latitude: geometryLatitude,
      __longitude: geometryLongitude,
      __sourceDate: fieldValue('sourceDate'),
    };
  });
}

async function downloadDataGoShapefile(source, fetchImpl) {
  const pageResponse = await checkedFetch(fetchImpl, source.sourceUrl, {
    headers: { 'User-Agent': '119-helper-restroom-regional-sync/1.0' },
  });
  let cookies = cookieHeader(pageResponse);
  const pageHtml = await pageResponse.text();
  const download = await dataGoDownloadUrl(source, pageHtml, cookies, fetchImpl);
  cookies = download.cookies;
  const response = await checkedFetch(fetchImpl, download.url, {
    headers: {
      Cookie: cookies,
      Referer: source.sourceUrl,
      'User-Agent': '119-helper-restroom-regional-sync/1.0',
    },
  });
  const archive = new Uint8Array(await response.arrayBuffer());
  return {
    rows: rowsFromShapefileGeoJson(await shp(archive), source),
    sourceDate: extractDataGoFileDate(pageHtml),
  };
}

export function decodeCsv(bytes, encoding = 'utf-8') {
  return new TextDecoder(encoding || 'utf-8').decode(bytes);
}

export function parseCsv(text) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n') {
      record.push(field.replace(/\r$/, ''));
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field || record.length > 0) {
    record.push(field.replace(/\r$/, ''));
    records.push(record);
  }
  if (quoted) throw new Error('CSV 따옴표가 닫히지 않았습니다.');
  if (records.length < 2) throw new Error('CSV에 헤더와 데이터 행이 없습니다.');

  const headers = records[0].map((value, index) =>
    (index === 0 ? value.replace(/^\uFEFF/, '') : value).trim()
  );
  return records.slice(1)
    .filter(values => values.some(value => value.trim()))
    .map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

export function normalizeName(value) {
  return asText(value).replace(/[^\p{L}\p{N}]/gu, '');
}

export function normalizeAddress(value, source = undefined) {
  return sourceScopeAddress(value, source).replace(/[^\p{L}\p{N}]/gu, '');
}

export function normalizeRegionalRows(rows, source, options = {}) {
  if (!Array.isArray(rows)) throw new Error(`${source.id}: CSV 행이 배열이 아닙니다.`);
  if (rows.length < source.minimumRows || rows.length > source.maximumRows) {
    throw new Error(
      `${source.id}: ${rows.length}행은 허용 범위 ${source.minimumRows}~${source.maximumRows} 밖입니다.`,
    );
  }
  validateColumns(rows, source);

  const rejected = [];
  const items = [];
  for (const [index, row] of rows.entries()) {
    const rawName = firstField(row, source.fieldMap.name);
    const nameSuffix = asText(source.nameSuffix);
    const name = rawName && nameSuffix && !rawName.endsWith(nameSuffix)
      ? `${rawName}${nameSuffix}`
      : rawName;
    const roadAddresses = allFields(row, source.fieldMap.roadAddress)
      .map(value => sourceScopeAddress(value, source));
    const lotAddresses = allFields(row, source.fieldMap.lotAddress)
      .map(value => sourceScopeAddress(value, source));
    const addresses = uniqueTexts([...roadAddresses, ...lotAddresses]);
    const latitude = Number(firstField(row, source.fieldMap.latitude));
    const longitude = Number(firstField(row, source.fieldMap.longitude));

    if (!name || addresses.length === 0) {
      rejected.push({ rowNumber: index + 2, reason: 'missing-identity' });
      continue;
    }
    if (!addresses.some(address => addressIsInSourceScope(address, source))) {
      rejected.push({ rowNumber: index + 2, reason: 'out-of-scope' });
      continue;
    }
    if (!coordinateInBounds(latitude, longitude, source)) {
      rejected.push({ rowNumber: index + 2, reason: 'invalid-coordinate' });
      continue;
    }

    items.push({
      sourceRowNumber: index + 2,
      sourceId: source.id,
      name,
      roadAddresses: uniqueTexts(roadAddresses),
      lotAddresses: uniqueTexts(lotAddresses),
      addresses,
      latitude,
      longitude,
      sourceDate: firstField(row, source.fieldMap.sourceDate),
    });
  }

  const sourceDate = latestDate([
    options.sourceDate,
    ...rows.map(row => firstField(row, source.fieldMap.sourceDate)),
  ]);
  if (!sourceDate || sourceDate < source.minimumSourceDate) {
    throw new Error(
      `${source.id}: 최신 기준일 ${sourceDate ?? '미확인'}이 최소 ${source.minimumSourceDate}보다 오래됐습니다.`,
    );
  }
  const rowSourceDates = rows.map(row =>
    isoDate(firstField(row, source.fieldMap.sourceDate))
  );
  if (
    source.requireSourceDateForEveryRow === true
    && rowSourceDates.some(date => !date)
  ) {
    throw new Error(`${source.id}: 기준일을 확인할 수 없는 원본 행이 있습니다.`);
  }
  if (
    source.requireSourceDateForEveryValidRow === true
    && items.some(item => !isoDate(item.sourceDate))
  ) {
    throw new Error(`${source.id}: 유효한 원본 행 중 기준일을 확인할 수 없는 행이 있습니다.`);
  }
  const oldestRowSourceDate = rowSourceDates.filter(Boolean).sort()[0] || null;
  if (
    source.minimumRowSourceDate
    && (!oldestRowSourceDate || oldestRowSourceDate < source.minimumRowSourceDate)
  ) {
    throw new Error(
      `${source.id}: 가장 오래된 행 기준일 ${oldestRowSourceDate ?? '미확인'}이 `
      + `최소 ${source.minimumRowSourceDate}보다 오래됐습니다.`,
    );
  }
  return {
    source,
    sourceDate,
    rawCount: rows.length,
    items,
    rejected,
  };
}

export function matchOfficialRegionalCoordinates(
  nationalItems,
  regionalDatasets,
  existingCoordinateById = new Map(),
) {
  if (!Array.isArray(nationalItems)) throw new Error('전국 공중화장실 원본이 배열이 아닙니다.');
  if (!Array.isArray(regionalDatasets)) throw new Error('지역 공중화장실 원본이 배열이 아닙니다.');

  const summaries = new Map(regionalDatasets.map(dataset => [
    dataset.source.id,
    sourceSummary(dataset),
  ]));
  const proposals = [];

  for (const dataset of regionalDatasets) {
    const source = dataset.source;
    const summary = summaries.get(source.id);
    const nationalByKey = new Map();
    const nationalByAddress = new Map();
    const nationalById = new Map();

    for (const rawItem of nationalItems) {
      const item = nationalRecord(rawItem);
      if (!item.id || !item.name) continue;
      const scopedAddresses = item.addresses
        .map(address => sourceScopeAddress(address, source))
        .filter(address => addressIsInSourceScope(address, source));
      if (scopedAddresses.length === 0) continue;
      nationalById.set(item.id, item);
      for (const address of scopedAddresses) {
        const key = matchKey(item.name, address, source);
        if (!key) continue;
        if (!nationalByKey.has(key)) nationalByKey.set(key, new Set());
        nationalByKey.get(key).add(item.id);

        const addressKey = normalizeAddress(address, source);
        if (!nationalByAddress.has(addressKey)) nationalByAddress.set(addressKey, new Set());
        nationalByAddress.get(addressKey).add(item.id);
      }
    }

    for (const regionalItem of dataset.items) {
      const candidateIds = new Set();
      const keys = new Set();
      for (const address of regionalItem.addresses) {
        const key = matchKey(regionalItem.name, address, source);
        if (!key) continue;
        keys.add(key);
        for (const id of nationalByKey.get(key) || []) candidateIds.add(id);
      }
      if (candidateIds.size === 0) {
        if (source.allowUniqueAddressNameContainment !== true) {
          summary.unmatchedCount += 1;
          continue;
        }

        const addressCandidateIds = new Set();
        for (const address of regionalItem.addresses) {
          const addressKey = normalizeAddress(address, source);
          if (!addressKey) continue;
          for (const id of nationalByAddress.get(addressKey) || []) {
            addressCandidateIds.add(id);
          }
        }
        if (addressCandidateIds.size === 0) {
          summary.unmatchedCount += 1;
          continue;
        }
        if (addressCandidateIds.size !== 1) {
          summary.ambiguousAddressMatchCount += 1;
          continue;
        }

        const targetId = [...addressCandidateIds][0];
        const nationalItem = nationalById.get(targetId);
        const nationalName = normalizeName(nationalItem.name);
        const regionalName = normalizeName(regionalItem.name);
        const minimumNameLength = source.uniqueAddressNameMinimumLength ?? 4;
        if (
          Math.min(nationalName.length, regionalName.length) < minimumNameLength
          || (!nationalName.includes(regionalName) && !regionalName.includes(nationalName))
        ) {
          summary.addressNameMismatchCount += 1;
          continue;
        }

        const matchedAddress = regionalItem.addresses.find(address =>
          nationalByAddress.get(normalizeAddress(address, source))?.has(targetId)
        ) || regionalItem.addresses[0];
        const matchedAddressKey = normalizeAddress(matchedAddress, source);
        proposals.push({
          source,
          summary,
          regionalItem,
          nationalItem,
          targetId,
          matchedAddress,
          matchedKey: `${nationalName}~${regionalName}|${matchedAddressKey}`,
          matchMethod: 'unique-exact-address+normalized-name-containment',
        });
        continue;
      }
      if (candidateIds.size !== 1) {
        summary.ambiguousNationalMatchCount += 1;
        continue;
      }

      const targetId = [...candidateIds][0];
      const nationalItem = nationalById.get(targetId);
      const matchedKey = [...keys].find(key => nationalByKey.get(key)?.has(targetId));
      const matchedAddress = regionalItem.addresses.find(
        address => matchKey(regionalItem.name, address, source) === matchedKey,
      ) || regionalItem.addresses[0];
      proposals.push({
        source,
        summary,
        regionalItem,
        nationalItem,
        targetId,
        matchedKey,
        matchedAddress,
        matchMethod: 'normalized-name+exact-road-or-lot-address',
      });
    }
  }

  const proposalsByTarget = new Map();
  for (const proposal of proposals) {
    if (!proposalsByTarget.has(proposal.targetId)) proposalsByTarget.set(proposal.targetId, []);
    proposalsByTarget.get(proposal.targetId).push(proposal);
  }

  const items = [];
  for (const targetProposals of proposalsByTarget.values()) {
    let proposal;
    if (targetProposals.length !== 1) {
      const firstProposal = targetProposals[0];
      const sameSource = targetProposals.every(
        item => item.source.id === firstProposal.source.id,
      );
      const fallbackOnly = targetProposals.every(
        item => item.matchMethod === 'unique-exact-address+normalized-name-containment',
      );
      const tolerance = Number(firstProposal.source.consistentCoordinateTolerance ?? 1e-7);
      const consistentCoordinates = targetProposals.every(item =>
        Math.abs(item.regionalItem.latitude - firstProposal.regionalItem.latitude) <= tolerance
        && Math.abs(item.regionalItem.longitude - firstProposal.regionalItem.longitude) <= tolerance
      );

      if (sameSource && fallbackOnly && consistentCoordinates) {
        proposal = firstProposal;
        proposal.summary.consistentDuplicateRegionalRowCount += targetProposals.length - 1;
        proposal.summary.consistentDuplicateRegionalTargetCount += 1;
      } else {
        for (const duplicateProposal of targetProposals) {
          duplicateProposal.summary.duplicateRegionalMatchCount += 1;
        }
        for (const summary of new Set(targetProposals.map(item => item.summary))) {
          summary.duplicateRegionalTargetCount += 1;
        }
        continue;
      }
    } else {
      [proposal] = targetProposals;
    }

    if (proposal.matchMethod === 'normalized-name+exact-road-or-lot-address') {
      proposal.summary.exactMatchedCount += 1;
    } else {
      proposal.summary.addressNameContainedMatchedCount += 1;
    }
    const existing = existingCoordinateStatus(existingCoordinateById, proposal.targetId);
    if (existing.exists && existing.kind !== 'address_point') {
      proposal.summary.existingCoordinateCount += 1;
      continue;
    }

    const precisionUpgrade = existing.exists && existing.kind === 'address_point';
    if (precisionUpgrade) {
      proposal.summary.precisionUpgradeCount += 1;
    } else {
      proposal.summary.gainCount += 1;
    }
    items.push({
      id: proposal.targetId,
      nm: proposal.nationalItem.name,
      addr: proposal.nationalItem.roadAddress || proposal.nationalItem.lotAddress,
      lat: proposal.regionalItem.latitude,
      lng: proposal.regionalItem.longitude,
      sourceId: proposal.source.id,
      sourceUrl: proposal.source.sourceUrl,
      sourceDate: proposal.summary.sourceDate,
      sourceName: proposal.regionalItem.name,
      sourceAddress: proposal.matchedAddress,
      matchMethod: proposal.matchMethod,
      matchKey: proposal.matchedKey,
      coverageGain: !precisionUpgrade,
      precisionUpgrade,
    });
  }

  items.sort((a, b) => a.id.localeCompare(b.id));
  for (const dataset of regionalDatasets) {
    assertSourceSummaryGates(dataset.source, summaries.get(dataset.source.id));
  }
  return {
    version: 1,
    total: items.length,
    gainCount: items.filter(item => item.coverageGain).length,
    precisionUpgradeCount: items.filter(item => item.precisionUpgrade).length,
    items,
    sources: regionalDatasets.map(dataset => summaries.get(dataset.source.id)),
  };
}

export async function downloadSourceCsv(source, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  if (source.downloadKind === 'seoul-sheet-csv') {
    return downloadSeoulCsv(source, fetchImpl);
  }
  if (source.downloadKind === 'data-go-file') {
    return downloadDataGoCsv(source, fetchImpl);
  }
  throw new Error(`${source.id}: 지원하지 않는 다운로드 방식 ${source.downloadKind}입니다.`);
}

export async function downloadSourceRows(source, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  if (source.downloadKind === 'public-json-api') {
    return downloadPublicJsonApi(source, fetchImpl);
  }
  if (source.downloadKind === 'data-go-shapefile') {
    return downloadDataGoShapefile(source, fetchImpl);
  }
  const csv = await downloadSourceCsv(source, { fetchImpl });
  return {
    rows: parseCsv(csv.text),
    sourceDate: csv.sourceDate,
  };
}

export function loadRestroomRegionalSourceRegistry(registryPath = DEFAULT_REGISTRY_PATH) {
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  if (registry?.version !== 1 || !Array.isArray(registry.sources)) {
    throw new Error('공중화장실 지역 원천 registry 형식이 올바르지 않습니다.');
  }
  return registry;
}

export async function fetchOfficialRegionalCoordinates(
  nationalItems,
  existingCoordinateById = new Map(),
  options = {},
) {
  const registry = options.registry || loadRestroomRegionalSourceRegistry(options.registryPath);
  const enabledSources = registry.sources.filter(source => source.enabled !== false);
  const downloaded = await Promise.all(enabledSources.map(async source => {
    const download = await downloadSourceRows(source, { fetchImpl: options.fetchImpl });
    return normalizeRegionalRows(download.rows, source, { sourceDate: download.sourceDate });
  }));
  const matched = matchOfficialRegionalCoordinates(
    nationalItems,
    downloaded,
    existingCoordinateById,
  );
  return {
    ...matched,
    generatedAt: (options.now ? options.now() : new Date()).toISOString(),
  };
}
