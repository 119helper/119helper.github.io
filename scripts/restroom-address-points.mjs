import {
  downloadSourceCsv,
  parseCsv,
} from './restroom-regional-overlays.mjs';

export const BUSAN_ADDRESS_SOURCE = Object.freeze({
  id: 'busan-road-address-building-points',
  downloadKind: 'data-go-file',
  publicDataPk: '15028854',
  publicDataDetailPk: 'uddi:917b553d-513e-449c-95b4-fa9560694055',
  sourceUrl: 'https://www.data.go.kr/data/15028854/fileData.do',
  encoding: 'euc-kr',
  name: '부산광역시 도로명주소 정보',
  license: '공공저작물 출처표시 제1유형',
  minimumSourceDate: '2026-04-21',
  minimumRows: 290_000,
  maximumRows: 310_000,
  latitudeRange: [34.98, 35.4],
  longitudeRange: [128.79, 129.3],
});

const REQUIRED_COLUMNS = Object.freeze([
  '순번',
  '시도명',
  '시군구명',
  '읍면동명',
  '도로명',
  '지하구분',
  '본번',
  '부번',
  '건물명',
  '건축물용도',
  '관할행정동',
  '위도',
  '경도',
]);

const REVIEWED_NEW_MATCHES = new Map([
  ['202433800000100321', '부산민락동우체국'],
  ['202433800000100322', '부산수영동우체국'],
  ['202433800000100323', '부산망미동우체국'],
  ['202433800000100324', '부산광안동우체국'],
  ['202233900000100313', '사상모라119안전센터'],
]);

export const REVIEWED_LEGACY_REPAIR_IDS = new Set([
  '202433600000100164',
  '202334000000100059',
  '202332700000100125',
  '202332700000100122',
  '202332700000100130',
  '202433200000100115',
  '202233900000100361',
  '202233900000100290',
  '202233900000100304',
  '202233900000100308',
  '202532600000100341',
  '202433700000100244',
  '202433700000100218',
]);

const REVIEWED_REPAIR_ALIASES = new Map([
  ['202433200000100115', '부산광역시종합연수원'],
  ['202433700000100244', '연산2동주민센터'],
  ['202433700000100218', '교대역'],
]);

function text(value) {
  return String(value ?? '').normalize('NFKC').trim();
}

function compactText(value) {
  return text(value).replace(/[^\p{L}\p{N}]/gu, '');
}

export function canonicalRoadAddress(value) {
  return text(value)
    .split(/[,(]/, 1)[0]
    .trim()
    .replace(/\s+/g, ' ');
}

function sourceRoadAddress(row) {
  const locality = /(?:읍|면)$/.test(text(row.읍면동명)) ? text(row.읍면동명) : '';
  const underground = text(row.지하구분);
  const mainNumber = String(Number(row.본번));
  const subNumber = Number(row.부번);
  const buildingNumber = subNumber > 0 ? `${mainNumber}-${subNumber}` : mainNumber;
  return [
    text(row.시도명),
    text(row.시군구명),
    locality,
    text(row.도로명),
    underground,
    buildingNumber,
  ].filter(Boolean).join(' ');
}

function coordinateInBounds(lat, lng, source) {
  return lat >= source.latitudeRange[0]
    && lat <= source.latitudeRange[1]
    && lng >= source.longitudeRange[0]
    && lng <= source.longitudeRange[1];
}

export function normalizeBusanAddressRows(rows, {
  source = BUSAN_ADDRESS_SOURCE,
  sourceDate,
} = {}) {
  if (!Array.isArray(rows)) throw new Error(`${source.id}: CSV 행이 배열이 아닙니다.`);
  if (rows.length < source.minimumRows || rows.length > source.maximumRows) {
    throw new Error(
      `${source.id}: ${rows.length.toLocaleString()}행은 허용 범위 `
      + `${source.minimumRows.toLocaleString()}~${source.maximumRows.toLocaleString()} 밖입니다.`,
    );
  }
  if (!sourceDate || sourceDate < source.minimumSourceDate) {
    throw new Error(
      `${source.id}: 원본 기준일 ${sourceDate || '미확인'}이 최소 ${source.minimumSourceDate}보다 오래됐습니다.`,
    );
  }

  const columns = Object.keys(rows[0] || {});
  if (
    columns.length !== REQUIRED_COLUMNS.length
    || REQUIRED_COLUMNS.some((column, index) => columns[index] !== column)
  ) {
    throw new Error(`${source.id}: 13개 공식 컬럼 순서가 변경됐습니다.`);
  }

  const items = rows.map((row, index) => {
    const rowNumber = index + 1;
    if (Number(row.순번) !== rowNumber) {
      throw new Error(`${source.id}: 순번 ${row.순번 || '없음'}이 예상 ${rowNumber}와 다릅니다.`);
    }
    if (text(row.시도명) !== '부산광역시') {
      throw new Error(`${source.id}: ${rowNumber}행이 부산광역시 범위 밖입니다.`);
    }
    const lat = Number(row.위도);
    const lng = Number(row.경도);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !coordinateInBounds(lat, lng, source)) {
      throw new Error(`${source.id}: ${rowNumber}행 좌표가 부산 경계 밖입니다.`);
    }
    const address = sourceRoadAddress(row);
    if (!address || !text(row.도로명) || !Number.isFinite(Number(row.본번))) {
      throw new Error(`${source.id}: ${rowNumber}행 도로명주소를 구성할 수 없습니다.`);
    }
    return {
      sourceRowNumber: rowNumber + 1,
      address,
      buildingName: text(row.건물명),
      buildingUse: text(row.건축물용도),
      administrativeDong: text(row.관할행정동),
      lat,
      lng,
    };
  });

  return {
    source,
    sourceDate,
    rawCount: rows.length,
    items,
  };
}

function nationalRecord(raw) {
  const roadAddressRaw = text(raw.LCTN_ROAD_NM_ADDR ?? raw.roadAddress ?? raw.addr);
  return {
    id: text(raw.MNG_NO ?? raw.id),
    name: text(raw.RSTRM_NM ?? raw.nm),
    roadAddress: canonicalRoadAddress(roadAddressRaw),
    roadAddressRaw,
    lotAddress: text(raw.LCTN_LOTNO_ADDR ?? raw.lotAddress),
  };
}

function directBuildingCorroboration(national, buildingName) {
  const building = compactText(buildingName);
  if (!building) return false;
  return [national.name, national.roadAddressRaw, national.lotAddress]
    .map(compactText)
    .some(value => value.includes(building));
}

function mapHas(mapOrSet, id) {
  if (mapOrSet instanceof Set) return mapOrSet.has(id);
  if (mapOrSet instanceof Map) return mapOrSet.has(id);
  return Boolean(mapOrSet?.[id]);
}

function mapValue(mapOrObject, id) {
  if (mapOrObject instanceof Map) return mapOrObject.get(id);
  return mapOrObject?.[id];
}

function coordinateKey(item) {
  return `${Number(item.lat).toFixed(7)},${Number(item.lng).toFixed(7)}`;
}

export function matchBusanAddressPoints(
  nationalItems,
  dataset,
  existingCoordinateById = new Set(),
  { legacyRepairCoordinates = new Map() } = {},
) {
  if (!Array.isArray(nationalItems)) throw new Error('전국 공중화장실 원본이 배열이 아닙니다.');
  if (!dataset?.source || !Array.isArray(dataset.items)) {
    throw new Error('부산 도로명주소 정규화 결과가 올바르지 않습니다.');
  }

  const sourceByAddress = new Map();
  for (const item of dataset.items) {
    if (!sourceByAddress.has(item.address)) sourceByAddress.set(item.address, []);
    sourceByAddress.get(item.address).push(item);
  }

  let exactAddressCandidateCount = 0;
  let existingCoordinateCount = 0;
  let directBuildingMatchCount = 0;
  let reviewedNewMatchCount = 0;
  let reviewedAliasRepairCount = 0;
  const items = [];

  for (const raw of nationalItems) {
    const national = nationalRecord(raw);
    if (!national.id || !national.name || !national.roadAddress.startsWith('부산광역시 ')) continue;
    const sourceMatches = sourceByAddress.get(national.roadAddress) || [];
    if (sourceMatches.length !== 1) continue;
    exactAddressCandidateCount += 1;

    const isRepair = REVIEWED_LEGACY_REPAIR_IDS.has(national.id)
      && Boolean(mapValue(legacyRepairCoordinates, national.id));
    if (mapHas(existingCoordinateById, national.id)) {
      existingCoordinateCount += 1;
      continue;
    }

    const sourceItem = sourceMatches[0];
    const directMatch = directBuildingCorroboration(national, sourceItem.buildingName);
    const reviewedNewMatch = compactText(sourceItem.buildingName)
      === REVIEWED_NEW_MATCHES.get(national.id);
    const reviewedRepairAlias = isRepair
      && compactText(sourceItem.buildingName) === REVIEWED_REPAIR_ALIASES.get(national.id);
    if (!sourceItem.buildingName || (!directMatch && !reviewedNewMatch && !reviewedRepairAlias)) continue;
    if (REVIEWED_LEGACY_REPAIR_IDS.has(national.id) && !isRepair) {
      throw new Error(`${dataset.source.id}: ${national.id} 오류 좌표 교체 이력이 없습니다.`);
    }

    let matchMethod = 'unique-exact-road-address+building-name-corroboration';
    if (isRepair) {
      matchMethod = reviewedRepairAlias
        ? 'invalid-legacy-coordinate+unique-exact-road-address+reviewed-building-alias'
        : 'invalid-legacy-coordinate+unique-exact-road-address+building-name-corroboration';
      if (reviewedRepairAlias) reviewedAliasRepairCount += 1;
    } else if (reviewedNewMatch && !directMatch) {
      matchMethod = 'unique-exact-road-address+reviewed-building-name-variant';
      reviewedNewMatchCount += 1;
    }
    if (directMatch) directBuildingMatchCount += 1;

    const replaced = isRepair ? mapValue(legacyRepairCoordinates, national.id) : null;
    items.push({
      id: national.id,
      nm: national.name,
      addr: national.roadAddress || national.lotAddress,
      lat: sourceItem.lat,
      lng: sourceItem.lng,
      coordinateKind: 'address_point',
      coordinateApproximate: true,
      precision: 'building-address-point',
      sourceId: dataset.source.id,
      sourceName: dataset.source.name,
      sourceUrl: dataset.source.sourceUrl,
      sourceDate: dataset.sourceDate,
      sourceLicense: dataset.source.license,
      sourceAddress: sourceItem.address,
      sourceBuildingName: sourceItem.buildingName,
      sourceBuildingUse: sourceItem.buildingUse,
      sourceRowNumber: sourceItem.sourceRowNumber,
      matchMethod,
      matchKey: national.roadAddress,
      coverageGain: !isRepair,
      legacyCoordinateRepair: isRepair,
      ...(replaced ? {
        replacedSourceId: replaced.coordinateSourceId || 'restroom-v1-wgs84-snapshot',
        replacedLat: Number(replaced.lat),
        replacedLng: Number(replaced.lng),
      } : {}),
    });
  }

  items.sort((a, b) => a.id.localeCompare(b.id));
  const repairCount = items.filter(item => item.legacyCoordinateRepair).length;
  const coverageGainCount = items.length - repairCount;
  return {
    version: 1,
    source: {
      id: dataset.source.id,
      name: dataset.source.name,
      sourceUrl: dataset.source.sourceUrl,
      sourceDate: dataset.sourceDate,
      license: dataset.source.license,
      rawCount: dataset.rawCount,
    },
    total: items.length,
    coverageGainCount,
    repairCount,
    uniquePointCount: new Set(items.map(coordinateKey)).size,
    exactAddressCandidateCount,
    existingCoordinateCount,
    directBuildingMatchCount,
    reviewedNewMatchCount,
    reviewedAliasRepairCount,
    items,
  };
}

export function assertBusanAddressPointDrift(result, expected = {}) {
  const gates = {
    total: 235,
    coverageGainCount: 222,
    repairCount: 13,
    uniquePointCount: 206,
    directBuildingMatchCount: 227,
    reviewedNewMatchCount: 5,
    reviewedAliasRepairCount: 3,
    ...expected,
  };
  for (const [field, expectedValue] of Object.entries(gates)) {
    if (expectedValue === undefined) continue;
    if (Number(result?.[field]) !== Number(expectedValue)) {
      throw new Error(
        `${BUSAN_ADDRESS_SOURCE.id}: ${field}=${result?.[field] ?? '없음'}, `
        + `검토 기준=${expectedValue}. 자동 반영을 중단합니다.`,
      );
    }
  }
}

export async function downloadBusanAddressDataset(options = {}) {
  const source = options.source || BUSAN_ADDRESS_SOURCE;
  const download = await downloadSourceCsv(source, { fetchImpl: options.fetchImpl });
  const rows = parseCsv(download.text);
  return normalizeBusanAddressRows(rows, {
    source,
    sourceDate: download.sourceDate,
  });
}

export async function fetchBusanAddressPoints(
  nationalItems,
  existingCoordinateById = new Set(),
  options = {},
) {
  const dataset = options.dataset || await downloadBusanAddressDataset(options);
  const result = matchBusanAddressPoints(
    nationalItems,
    dataset,
    existingCoordinateById,
    { legacyRepairCoordinates: options.legacyRepairCoordinates },
  );
  assertBusanAddressPointDrift(result, options.expected);
  return {
    ...result,
    generatedAt: (options.now ? options.now() : new Date()).toISOString(),
  };
}
