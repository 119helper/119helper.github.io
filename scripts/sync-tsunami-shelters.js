import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'data', 'tsunami.json');
const MANIFEST_PATH = path.join(__dirname, '..', 'public', 'data', 'manifest.json');
const API_KEY = process.env.TSUNAMI_SHELTER_API_KEY;
const SOURCE_DATE = process.env.TSUNAMI_SOURCE_DATE || '2025-07-16';
const SOURCE_URL = 'https://www.data.go.kr/data/15138870/openapi.do';
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

function updateManifest(total, generatedAt) {
  const manifest = fs.existsSync(MANIFEST_PATH)
    ? JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'))
    : { version: 1, datasets: {} };
  manifest.generatedAt = generatedAt;
  manifest.datasets = manifest.datasets || {};
  manifest.datasets.tsunami = {
    label: '지진해일 대피소',
    path: '/data/tsunami.json',
    sourceUrl: SOURCE_URL,
    apiUrl: `${HOSTS[0]}${API_PATH}`,
    sourceDate: SOURCE_DATE,
    sourceDateLabel: 'API 상세 수정일',
    sourceDateSource: '공공데이터포털 행정안전부_지진해일 긴급대피장소 수정일',
    generatedAt,
    maxAgeDays: 90,
    total,
  };
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

async function main() {
  const allItems = [];
  const seen = new Set();

  for (let pageNo = 1; ; pageNo += 1) {
    const items = await fetchPage(pageNo);
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

  allItems.sort((a, b) =>
    String(a.SHNT_PLACE_DTL_POSITION || '').localeCompare(String(b.SHNT_PLACE_DTL_POSITION || ''), 'ko')
    || String(a.SHNT_PLACE_NM || '').localeCompare(String(b.SHNT_PLACE_NM || ''), 'ko')
  );

  const generatedAt = new Date().toISOString();
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(allItems), 'utf8');
  updateManifest(allItems.length, generatedAt);
  console.log(`완료: 지진해일 대피소 ${allItems.length.toLocaleString()}건`);
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
