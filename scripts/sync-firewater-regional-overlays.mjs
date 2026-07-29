import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUTPUT_DIR = path.join(ROOT, 'public', 'firewater');
const MANIFEST_PATH = path.join(OUTPUT_DIR, 'manifest.json');
const REGISTRY_PATH = path.join(__dirname, 'firewater-regional-sources.json');
const DOWNLOAD_INFO_URL = 'https://www.data.go.kr/tcs/dss/selectFileDataDownload.do';
const REQUEST_TIMEOUT_MS = 30_000;

const FACILITY_TYPE_BY_CODE = {
  '1': '소화전',
  '01': '소화전',
  '2': '소화전',
  '02': '소화전',
  '3': '급수탑',
  '03': '급수탑',
  '4': '저수조',
  '04': '저수조',
  '5': '소화전',
  '05': '소화전',
  '6': '비상소화장치',
  '06': '비상소화장치',
};

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, JSON.stringify(value), 'utf8');
}

function asText(value) {
  return String(value ?? '').trim();
}

function isHydrantType(item) {
  return item.fcltySeNm === '소화전' || item.fcltySeNm === '비상소화장치';
}

function isWaterTowerType(item) {
  return item.fcltySeNm === '급수탑' || item.fcltySeNm === '저수조';
}

function sourceDateOf(item) {
  return asText(item.referenceDate || item.dataStdde || item.데이터기준일자);
}

function sourceRowKey(item) {
  return [
    asText(item.fcltyNo),
    asText(item.fcltySeCode),
    asText(item.sourceRdnmadr ?? item.rdnmadr),
    asText(item.sourceLnmadr ?? item.lnmadr),
    asText(item.sourceLatitude ?? item.latitude),
    asText(item.sourceLongitude ?? item.longitude),
    asText(item.descLc),
  ].join('|');
}

function addressWithDeclaredScope(value, source) {
  const original = asText(value);
  if (!original || /주소\s*없음/.test(original)) return original;
  const tokens = original.split(/\s+/);
  if (tokens[0] !== source.city || tokens[1] === source.district) return original;
  return [tokens[0], source.district, ...tokens.slice(1)].join(' ');
}

function latestDate(items) {
  return items.map(sourceDateOf).filter(Boolean).sort().at(-1) || null;
}

function earliestDate(items) {
  return items.map(sourceDateOf).filter(Boolean).sort().at(0) || null;
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

async function checkedFetch(url, init = {}) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 180);
    throw new Error(`${url}: HTTP ${response.status} ${detail}`.trim());
  }
  return response;
}

async function downloadPublicDataFile(source) {
  const pageResponse = await checkedFetch(source.sourceUrl, {
    headers: { 'User-Agent': '119-helper-regional-firewater-sync/1.0' },
  });
  let cookies = appendCookies('', pageResponse);
  await pageResponse.text();

  const infoResponse = await checkedFetch(DOWNLOAD_INFO_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookies,
      Referer: source.sourceUrl,
      'User-Agent': '119-helper-regional-firewater-sync/1.0',
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
    throw new Error(`${source.id}: 공공데이터포털 파일 식별자를 받지 못했습니다.`);
  }

  const downloadUrl = new URL('/cmm/cmm/fileDownload.do', 'https://www.data.go.kr');
  downloadUrl.searchParams.set('atchFileId', info.atchFileId);
  downloadUrl.searchParams.set('fileDetailSn', info.fileDetailSn);
  downloadUrl.searchParams.set('insertDataPrcus', 'N');
  const fileResponse = await checkedFetch(downloadUrl, {
    headers: {
      Cookie: cookies,
      Referer: source.sourceUrl,
      'User-Agent': '119-helper-regional-firewater-sync/1.0',
    },
  });
  const bytes = await fileResponse.arrayBuffer();
  return {
    text: new TextDecoder(source.encoding || 'utf-8').decode(bytes),
    portalMetadata: info.dataSetFileDetailInfo || {},
  };
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

export function normalizeRegionalRows(rows, source) {
  const requiredColumns = [
    '시설번호',
    '시설유형코드',
    '시도명',
    '시군구명',
    '위도',
    '경도',
    '데이터기준일자',
  ];
  for (const column of requiredColumns) {
    if (!rows.every(row => Object.hasOwn(row, column))) {
      throw new Error(`${source.id}: 필수 컬럼 ${column}이 없습니다.`);
    }
  }
  if (rows.length < source.minimumRows || rows.length > source.maximumRows) {
    throw new Error(
      `${source.id}: ${rows.length}행은 허용 범위 ${source.minimumRows}~${source.maximumRows} 밖입니다.`,
    );
  }

  const facilityNumberCounts = new Map();
  const items = rows.map((row, index) => {
    const facilityNumber = asText(row.시설번호);
    const facilityTypeCode = asText(row.시설유형코드);
    const facilityType = FACILITY_TYPE_BY_CODE[facilityTypeCode];
    if (!facilityNumber) throw new Error(`${source.id}: ${index + 2}행 시설번호가 비었습니다.`);
    if (!facilityType) throw new Error(`${source.id}: 알 수 없는 시설유형코드 ${facilityTypeCode}입니다.`);
    if (asText(row.시군구명) !== source.district) {
      throw new Error(`${source.id}: 범위 밖 시군구 ${asText(row.시군구명)}가 포함됐습니다.`);
    }
    facilityNumberCounts.set(facilityNumber, (facilityNumberCounts.get(facilityNumber) || 0) + 1);
    const sourceLatitude = asText(row.위도);
    const sourceLongitude = asText(row.경도);
    const sourceRdnmadr = asText(row.소재지도로명주소);
    const sourceLnmadr = asText(row.소재지지번주소);
    const rdnmadr = addressWithDeclaredScope(sourceRdnmadr, source);
    const lnmadr = addressWithDeclaredScope(sourceLnmadr, source);
    const latitude = Number(sourceLatitude);
    const longitude = Number(sourceLongitude);
    const [minimumLatitude, maximumLatitude] = source.latitudeRange || [33, 39];
    const [minimumLongitude, maximumLongitude] = source.longitudeRange || [124, 132];
    const sourceCoordinateValid = Number.isFinite(latitude)
      && Number.isFinite(longitude)
      && latitude >= minimumLatitude
      && latitude <= maximumLatitude
      && longitude >= minimumLongitude
      && longitude <= maximumLongitude;
    const item = {
      fcltyNo: facilityNumber,
      fcltySeCode: facilityTypeCode,
      fcltySeNm: facilityType,
      ctprvnNm: source.city,
      signguNm: source.district,
      signguCode: asText(row.시군구코드),
      rdnmadr,
      lnmadr,
      sourceRdnmadr,
      sourceLnmadr,
      addressScopeNormalized: rdnmadr !== sourceRdnmadr || lnmadr !== sourceLnmadr,
      latitude: sourceCoordinateValid ? sourceLatitude : '',
      longitude: sourceCoordinateValid ? sourceLongitude : '',
      sourceLatitude,
      sourceLongitude,
      coordinateSource: sourceCoordinateValid ? 'regional-source' : 'invalid-or-out-of-region',
      descLc: asText(row.상세위치),
      safeCnterNm: asText(row.안전센터명),
      prtcYn: asText(row.보호틀유무),
      usePsbltyYn: asText(row.사용가능여부),
      installationYear: asText(row.설치연도),
      pipeDepth: asText(row.배관깊이),
      waterPressr: asText(row.출수압력),
      pipeDiameter: asText(row.배관지름),
      institutionNm: asText(row.관할기관명),
      institutionPhoneNumber: asText(row.관할기관전화번호),
      referenceDate: asText(row.데이터기준일자),
      sourceDatasetId: source.publicDataPk,
    };
    return {
      ...item,
      sourceRowKey: sourceRowKey(item),
    };
  });
  const sourceDate = latestDate(items);
  if (!sourceDate || sourceDate < source.minimumSourceDate) {
    throw new Error(`${source.id}: 최신 기준일 ${sourceDate ?? '미확인'}이 최소 ${source.minimumSourceDate}보다 오래됐습니다.`);
  }

  const coordinateMappedCount = items.filter(item => item.coordinateSource === 'regional-source').length;
  const duplicateFacilityNumberEntries = [...facilityNumberCounts.entries()]
    .filter(([, count]) => count > 1);

  return {
    items,
    sourceDate,
    coordinateMappedCount,
    missingCoordinateCount: items.length - coordinateMappedCount,
    duplicateFacilityNumberCount: duplicateFacilityNumberEntries.length,
    duplicateFacilityNumberRows: duplicateFacilityNumberEntries
      .reduce((sum, [, count]) => sum + count, 0),
    normalizedAddressCount: items.filter(item => item.addressScopeNormalized).length,
    hydrants: items.filter(isHydrantType).length,
    waterTowers: items.filter(isWaterTowerType).length,
  };
}

function normalizedAddress(value) {
  return asText(value)
    .replace(/\s+/g, ' ')
    .replace(/도로명 주소 없음|주소 없음/g, '')
    .trim();
}

function validCoordinate(item, source) {
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  const [minimumLatitude, maximumLatitude] = source.latitudeRange || [33, 39];
  const [minimumLongitude, maximumLongitude] = source.longitudeRange || [124, 132];
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= minimumLatitude
    && latitude <= maximumLatitude
    && longitude >= minimumLongitude
    && longitude <= maximumLongitude;
}

function coordinateMatchKeys(item) {
  const type = asText(item.fcltySeNm || FACILITY_TYPE_BY_CODE[asText(item.fcltySeCode)]);
  return [item.rdnmadr, item.lnmadr]
    .map(normalizedAddress)
    .filter(Boolean)
    .map(address => `${type}:${address}`);
}

export function backfillVerifiedBaselineCoordinates(items, baselineItems, source) {
  const baselineByAddress = new Map();
  const previousBackfillBySourceRowKey = new Map();
  for (const item of baselineItems) {
    if (!validCoordinate(item, source)) continue;
    if (item.coordinateSource === 'national-standard-baseline-exact-address-match') {
      previousBackfillBySourceRowKey.set(item.sourceRowKey || sourceRowKey(item), item);
    }
    if (item.sourceDatasetId && item.coordinateSource !== 'national-standard-baseline-exact-address-match') {
      continue;
    }
    for (const key of coordinateMatchKeys(item)) {
      const matches = baselineByAddress.get(key) || [];
      matches.push(item);
      baselineByAddress.set(key, matches);
    }
  }

  let backfilledCount = 0;
  const mergedItems = items.map(item => {
    if (validCoordinate(item, source)) return item;
    const previousBackfill = previousBackfillBySourceRowKey.get(item.sourceRowKey);
    if (previousBackfill) {
      backfilledCount += 1;
      return {
        ...item,
        latitude: asText(previousBackfill.latitude),
        longitude: asText(previousBackfill.longitude),
        coordinateSource: 'national-standard-baseline-exact-address-match',
        coordinateSourceDate: previousBackfill.coordinateSourceDate || null,
      };
    }
    const singletonCoordinates = new Map();
    const allCoordinates = new Map();
    for (const key of coordinateMatchKeys(item)) {
      const candidatesForAddress = new Map();
      for (const candidate of baselineByAddress.get(key) || []) {
        const identity = `${candidate.latitude}:${candidate.longitude}`;
        candidatesForAddress.set(identity, candidate);
        allCoordinates.set(identity, candidate);
      }
      if (candidatesForAddress.size === 1) {
        const [entry] = candidatesForAddress.entries();
        singletonCoordinates.set(entry[0], entry[1]);
      }
    }
    const candidates = singletonCoordinates.size > 0 ? singletonCoordinates : allCoordinates;
    if (candidates.size !== 1) return item;
    const [candidate] = candidates.values();
    backfilledCount += 1;
    return {
      ...item,
      latitude: asText(candidate.latitude),
      longitude: asText(candidate.longitude),
      coordinateSource: 'national-standard-baseline-exact-address-match',
      coordinateSourceDate: candidate.coordinateSourceDate || sourceDateOf(candidate) || null,
    };
  });
  return {
    items: mergedItems,
    backfilledCount,
    coordinateMappedCount: mergedItems.filter(item => validCoordinate(item, source)).length,
  };
}

function readGitBaselineItems(source) {
  const repositoryPath = `public/firewater/${source.city}/${source.district}.json`;
  try {
    const text = execFileSync('git', ['show', `HEAD:${repositoryPath}`], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const payload = JSON.parse(text);
    return Array.isArray(payload.response?.body?.items) ? payload.response.body.items : [];
  } catch {
    return [];
  }
}

function envelope(items, metadata) {
  return {
    metadata,
    response: {
      body: {
        items,
        totalCount: items.length,
      },
    },
  };
}

function replaceOverlayInManifest(overlays, overlay) {
  return [...(overlays || []).filter(item => item.id !== overlay.id), overlay]
    .sort((a, b) => a.id.localeCompare(b.id));
}

function applyRegionalOverlay(source, normalized, portalMetadata, generatedAt) {
  const manifest = readJson(MANIFEST_PATH);
  const cityFile = path.join(OUTPUT_DIR, `${source.city}.json`);
  const districtFile = path.join(OUTPUT_DIR, source.city, `${source.district}.json`);
  const cityIndexFile = path.join(OUTPUT_DIR, source.city, 'index.json');
  const cityEnvelope = readJson(cityFile);
  const districtEnvelope = readJson(districtFile);
  const cityIndex = readJson(cityIndexFile);
  const cityItems = cityEnvelope.response?.body?.items;
  const previousDistrictItems = districtEnvelope.response?.body?.items;
  if (!Array.isArray(cityItems) || !Array.isArray(previousDistrictItems)) {
    throw new Error(`${source.id}: 기존 도시 또는 관할 JSON 형식이 잘못됐습니다.`);
  }

  const retainedItems = cityItems.filter(item =>
    asText(item.signguNm || item.sigunguNm) !== source.district
  );
  if (retainedItems.length + previousDistrictItems.length !== cityItems.length) {
    throw new Error(`${source.id}: 도시 전체 파일과 관할 파일의 기존 행 수가 다릅니다.`);
  }

  const coordinateMerge = backfillVerifiedBaselineCoordinates(
    normalized.items,
    [...previousDistrictItems, ...readGitBaselineItems(source)],
    source,
  );
  const regionalItems = coordinateMerge.items;
  const missingCoordinateCount = regionalItems.length - coordinateMerge.coordinateMappedCount;
  const mergedItems = [...retainedItems, ...regionalItems];
  const baselineSourceDate = manifest.baselineSourceDate
    || earliestDate(retainedItems)
    || manifest.cities?.[source.city]?.sourceDate
    || null;
  const overlay = {
    id: source.id,
    city: source.city,
    district: source.district,
    replacementScope: 'district',
    sourceDate: normalized.sourceDate,
    total: regionalItems.length,
    regionalCoordinateCount: normalized.coordinateMappedCount,
    baselineCoordinateBackfillCount: coordinateMerge.backfilledCount,
    coordinateMappedCount: coordinateMerge.coordinateMappedCount,
    missingCoordinateCount,
    duplicateFacilityNumberCount: normalized.duplicateFacilityNumberCount,
    duplicateFacilityNumberRows: normalized.duplicateFacilityNumberRows,
    normalizedAddressCount: normalized.normalizedAddressCount,
    hydrants: normalized.hydrants,
    waterTowers: normalized.waterTowers,
    sourceUrl: source.sourceUrl,
    publicDataPk: source.publicDataPk,
    license: source.license,
    sourceFileName: asText(portalMetadata.dataNm),
    generatedAt,
  };
  const cityOverlays = replaceOverlayInManifest(
    manifest.cities?.[source.city]?.regionalOverlays,
    overlay,
  );
  const rootOverlays = replaceOverlayInManifest(manifest.regionalOverlays, overlay);
  const cityMetadata = {
    ...(manifest.cities?.[source.city] || cityEnvelope.metadata || {}),
    dataset: '전국소방용수시설표준데이터 + 검증된 지역 원본 오버레이',
    city: source.city,
    sourceDate: baselineSourceDate,
    sourceDateLabel: '도시 전체 범위의 가장 오래된 원본 기준일',
    latestSourceDate: normalized.sourceDate,
    generatedAt,
    total: mergedItems.length,
    hydrants: mergedItems.filter(isHydrantType).length,
    waterTowers: mergedItems.filter(isWaterTowerType).length,
    coverageScope: 'mixed-provenance-partial-district-overlay',
    completenessStatus: 'partial',
    regionalOverlays: cityOverlays,
  };
  const districtMetadata = {
    dataset: asText(portalMetadata.publicDataSj) || '광산소방서 소방용수시설 현황',
    sourceUrl: source.sourceUrl,
    city: source.city,
    district: source.district,
    sourceDate: normalized.sourceDate,
    sourceDateLabel: '지역 원본 데이터기준일자',
    generatedAt,
    total: regionalItems.length,
    hydrants: normalized.hydrants,
    waterTowers: normalized.waterTowers,
    regionalCoordinateCount: normalized.coordinateMappedCount,
    baselineCoordinateBackfillCount: coordinateMerge.backfilledCount,
    coordinateMappedCount: coordinateMerge.coordinateMappedCount,
    missingCoordinateCount,
    duplicateFacilityNumberCount: normalized.duplicateFacilityNumberCount,
    duplicateFacilityNumberRows: normalized.duplicateFacilityNumberRows,
    normalizedAddressCount: normalized.normalizedAddressCount,
    coverageScope: 'district-complete-source-with-coordinate-gaps',
    completenessStatus: missingCoordinateCount > 0 ? 'partial' : 'complete',
    license: source.license,
  };

  writeJson(cityFile, envelope(mergedItems, cityMetadata));
  writeJson(districtFile, envelope(regionalItems, districtMetadata));
  writeJson(cityIndexFile, {
    ...cityIndex,
    total: cityMetadata.total,
    districts: {
      ...(cityIndex.districts || {}),
      [source.district]: regionalItems.length,
    },
    hydrants: cityMetadata.hydrants,
    waterTowers: cityMetadata.waterTowers,
    metadata: cityMetadata,
  });

  manifest.version = Math.max(2, Number(manifest.version) || 1);
  manifest.generatedAt = generatedAt;
  manifest.supportedCityCount = Object.keys(manifest.cities || {}).length;
  manifest.coverageScope = 'supported-cities-with-verified-regional-overlays';
  manifest.completenessStatus = 'partial';
  manifest.baselineSourceDate = baselineSourceDate;
  manifest.baselineSourceDateSource = '전국 표준 원본 행 데이터기준일자';
  manifest.coverageNote = '전국 표준 원본을 기본값으로 유지하고, 더 최신이며 좌표가 검증된 지역 원본만 관할 단위로 교체합니다.';
  manifest.regionalOverlays = rootOverlays;
  manifest.cities[source.city] = cityMetadata;
  writeJson(MANIFEST_PATH, manifest);

  return overlay;
}

async function main() {
  const registry = readJson(REGISTRY_PATH);
  const sources = (registry.sources || []).filter(source => source.enabled);
  if (sources.length === 0) throw new Error('활성화된 소방용수 지역 원천이 없습니다.');
  const generatedAt = new Date().toISOString();

  for (const source of sources) {
    console.log(`${source.city} ${source.district}: ${source.sourceUrl} 확인 중`);
    const { text, portalMetadata } = await downloadPublicDataFile(source);
    const normalized = normalizeRegionalRows(parseCsv(text), source);
    const overlay = applyRegionalOverlay(source, normalized, portalMetadata, generatedAt);
    console.log(
      `${overlay.city} ${overlay.district}: ${overlay.total.toLocaleString()}행 적용, `
      + `좌표 ${overlay.coordinateMappedCount.toLocaleString()}행, `
      + `좌표 미확인 ${overlay.missingCoordinateCount.toLocaleString()}행, `
      + `기준일 ${overlay.sourceDate}`,
    );
  }
}

const isDirectRun = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isDirectRun) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}
