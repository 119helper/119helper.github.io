import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'tsunami.json');
const MANIFEST_PATH = path.join(__dirname, '..', 'public', 'data', 'manifest.json');
const API_KEY = process.env.TSUNAMI_SHELTER_API_KEY;
const SOURCE_DATE_OVERRIDE = process.env.TSUNAMI_SOURCE_DATE?.trim() || '';
const ALLOW_SHRINK = process.env.TSUNAMI_ALLOW_SHRINK === '1';
const SOURCE_URL = 'https://www.safetydata.go.kr/disaster-data/view?dataSn=1340';
const SOURCE_METADATA_URL = 'https://www.safetydata.go.kr/disaster-data/getApiView?dataSn=1340';
const LEGACY_CATALOG_URL = 'https://www.data.go.kr/data/15138870/openapi.do';
const ANNOUNCEMENT_URL = 'https://www.mois.go.kr/frt/bbs/type010/commonSelectBoardArticle.do?bbsId=BBSMSTR_000000000008&nttId=127924';
const ANNOUNCED_TOTAL = 680;
const ANNOUNCED_AT = '2026-07-20';
const API_PATH = '/V2/api/DSSP-IF-10944';
const HOSTS = ['https://www.safetydata.go.kr', 'http://www.safetydata.go.kr'];
const NUM_OF_ROWS = 500;

function key() {
  const value = API_KEY?.trim();
  if (!value) throw new Error('TSUNAMI_SHELTER_API_KEY 환경변수가 필요합니다.');
  return value;
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(pageNo) {
  const params = new URLSearchParams({
    serviceKey: key(),
    numOfRows: String(NUM_OF_ROWS),
    pageNo: String(pageNo),
  });
  let lastMessage = '';

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    for (const host of HOSTS) {
      try {
        const response = await fetch(`${host}${API_PATH}?${params}`, {
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
            'User-Agent': '119-helper-data-sync/1.0',
          },
          signal: AbortSignal.timeout(20_000),
        });
        const text = await response.text();
        if (!response.ok || text.trimStart().toLowerCase().startsWith('error code:')) {
          lastMessage = `HTTP ${response.status}: ${text.replace(/\s+/g, ' ').slice(0, 160)}`;
          continue;
        }

        const json = JSON.parse(text);
        if (json.header?.resultCode !== '00') {
          throw new Error(`API_RESULT_${json.header?.resultCode ?? ''} ${json.header?.resultMsg || ''}`.trim());
        }
        return Array.isArray(json.body) ? json.body : [];
      } catch (error) {
        lastMessage = error instanceof Error ? error.message : String(error);
      }
    }
    if (attempt < 3) await delay(300 * attempt);
  }

  throw new Error(`지진해일 대피소 page ${pageNo}: ${lastMessage}`);
}

function kstDateFromMilliseconds(value) {
  const timestamp = Number(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}

async function fetchSourceMetadata() {
  const response = await fetch(SOURCE_METADATA_URL, {
    headers: {
      Accept: 'application/json',
      'Cache-Control': 'no-cache',
      'User-Agent': '119-helper-data-sync/1.0',
    },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`지진해일 메타데이터 HTTP ${response.status}`);
  const metadata = await response.json();
  const sourceDate = SOURCE_DATE_OVERRIDE || kstDateFromMilliseconds(metadata.updtymd);
  if (!sourceDate) throw new Error('안전데이터 상세에서 데이터 갱신일(updtymd)을 읽지 못했습니다.');
  return {
    sourceDate,
    sourceDateSource: SOURCE_DATE_OVERRIDE
      ? 'workflow manual override'
      : '재난안전데이터공유플랫폼 상세 메타데이터 updtymd',
    updateInterval: String(metadata.updtIntvCn || ''),
    department: String(metadata.tkcgDeptNm || ''),
    contact: String(metadata.tkcgDeptTelno || ''),
    interfaceId: String(metadata.intrfId || ''),
  };
}

function updateManifest(stats, generatedAt, metadata) {
  const manifest = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : { version: 1, datasets: {} };
  manifest.generatedAt = generatedAt;
  manifest.datasets = manifest.datasets || {};
  manifest.datasets.tsunami = {
    label: '지진해일 대피소',
    path: '/data/tsunami.json',
    sourceUrl: SOURCE_URL,
    sourceMetadataUrl: SOURCE_METADATA_URL,
    legacyCatalogUrl: LEGACY_CATALOG_URL,
    apiUrl: `${HOSTS[0]}${API_PATH}`,
    sourceDate: metadata.sourceDate,
    sourceDateLabel: '안전데이터 원본 갱신일',
    sourceDateSource: metadata.sourceDateSource,
    updateInterval: metadata.updateInterval,
    sourceDepartment: metadata.department,
    sourceContact: metadata.contact,
    interfaceId: metadata.interfaceId,
    generatedAt,
    maxAgeDays: 90,
    coverageScope: 'covered-regions-official-api',
    completenessStatus: stats.uniqueTotal === ANNOUNCED_TOTAL ? 'complete' : 'upstream-mismatch',
    total: stats.uniqueTotal,
    rawTotal: stats.rawTotal,
    uniqueTotal: stats.uniqueTotal,
    activeTotal: stats.activeTotal,
    duplicateCount: stats.duplicateCount,
    regionCounts: stats.regionCounts,
    announcedTotal: ANNOUNCED_TOTAL,
    announcedAt: ANNOUNCED_AT,
    announcementUrl: ANNOUNCEMENT_URL,
    countDelta: stats.uniqueTotal - ANNOUNCED_TOTAL,
    reconciliationStatus: stats.uniqueTotal === ANNOUNCED_TOTAL ? 'matched' : 'upstream-mismatch',
    reconciliationNote: stats.uniqueTotal === ANNOUNCED_TOTAL
      ? '행정안전부 발표 관리대장 수와 공개 API 수가 일치합니다.'
      : '행정안전부 발표 관리대장 수와 공개 API 원본 수가 다릅니다. 누락 행을 임의 생성하지 않습니다.',
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

async function main() {
  const allItems = [];
  const seen = new Set();
  let rawTotal = 0;
  const metadata = await fetchSourceMetadata();

  for (let pageNo = 1; ; pageNo += 1) {
    const items = await fetchPage(pageNo);
    rawTotal += items.length;
    for (const item of items) {
      const id = `${item.ARCD ?? ''}:${item.SHNTDTR_SN ?? ''}:${item.SHNT_PLACE_SN ?? ''}`;
      if (seen.has(id)) continue;
      seen.add(id);
      allItems.push(item);
    }
    console.log(`지진해일 대피소 ${pageNo}페이지: 누적 ${allItems.length.toLocaleString()}건`);
    if (items.length < NUM_OF_ROWS) break;
    await delay(150);
  }

  const previousItems = fs.existsSync(OUTPUT_PATH)
    ? JSON.parse(fs.readFileSync(OUTPUT_PATH, 'utf8'))
    : [];
  const previousTotal = Array.isArray(previousItems) ? previousItems.length : 0;
  if (!ALLOW_SHRINK && previousTotal > 0 && allItems.length < Math.floor(previousTotal * 0.9)) {
    throw new Error(
      `지진해일 대피소가 ${previousTotal}건에서 ${allItems.length}건으로 급감하여 기존 파일을 보존합니다. `
      + '공식 축소를 확인했다면 TSUNAMI_ALLOW_SHRINK=1로 다시 실행하세요.',
    );
  }

  allItems.sort((a, b) =>
    String(a.SHNT_PLACE_DTL_POSITION || '').localeCompare(String(b.SHNT_PLACE_DTL_POSITION || ''), 'ko')
    || String(a.SHNT_PLACE_NM || '').localeCompare(String(b.SHNT_PLACE_NM || ''), 'ko')
  );

  const generatedAt = new Date().toISOString();
  const regionCounts = Object.fromEntries(
    [...allItems.reduce((counts, item) => {
      const region = String(item.SHNT_PLACE_DTL_POSITION || item.RN_DTL_ADRES || '지역 미상')
        .trim()
        .split(/\s+/)[0] || '지역 미상';
      counts.set(region, (counts.get(region) || 0) + 1);
      return counts;
    }, new Map())].sort((a, b) => String(a[0]).localeCompare(String(b[0]), 'ko')),
  );
  const stats = {
    rawTotal,
    uniqueTotal: allItems.length,
    activeTotal: allItems.filter(item => item.USE_AT === 'Y').length,
    duplicateCount: rawTotal - allItems.length,
    regionCounts,
  };
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allItems), 'utf8');
  updateManifest(stats, generatedAt, metadata);
  console.log(`완료: 지진해일 대피소 ${allItems.length.toLocaleString()}건 (원본 갱신일 ${metadata.sourceDate})`);
  if (allItems.length !== ANNOUNCED_TOTAL) {
    console.warn(`공개 API ${allItems.length.toLocaleString()}건 / 행정안전부 발표 ${ANNOUNCED_TOTAL.toLocaleString()}건 — 공급기관 차이 ${allItems.length - ANNOUNCED_TOTAL}건`);
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
