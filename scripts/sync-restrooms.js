import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data', 'restrooms');
const DATA_MANIFEST_PATH = path.join(__dirname, '..', 'public', 'data', 'manifest.json');

const API_KEY = process.env.RESTROOM_API_KEY || process.env.PUBLIC_DATA_API_KEY;
const SOURCE_DATE_OVERRIDE = process.env.RESTROOM_SOURCE_DATE || process.env.STATIC_DATA_SOURCE_DATE || '';
const BASE_URL = `https://apis.data.go.kr/1741000/public_restroom_info/info`;
const NUM_OF_ROWS = 1000;

function encodeServiceKey(key) {
  if (!key) {
    throw new Error('RESTROOM_API_KEY 또는 PUBLIC_DATA_API_KEY 환경변수가 필요합니다.');
  }
  return /%[0-9A-Fa-f]{2}/.test(key) ? key : encodeURIComponent(key);
}

// 앱에서 지원하는 도시 (키값 -> 주소 파싱용 한글명)
const SUPPORTED_CITIES = {
  seoul: '서울특별시',
  busan: '부산광역시',
  daegu: '대구광역시',
  incheon: '인천광역시',
  gwangju: '광주광역시',
  daejeon: '대전광역시',
  ulsan: '울산광역시',
  sejong: '세종특별자치시',
  jeju: '제주특별자치도'
};

// 불필요한 속성 제거해서 용량 최적화
function optimizeItem(item) {
  return {
    id: item.MNG_NO,
    nm: item.RSTRM_NM,
    lat: parseFloat(item.WGS84_LAT || '0'),
    lng: parseFloat(item.WGS84_LOT || '0'),
    addr: item.LCTN_ROAD_NM_ADDR || item.LCTN_LOTNO_ADDR || '주소 미상',
    isOpenAtNight: item.OPN_HR === '24시간' ? 'Y' : 'N',
    hasBell: item.EMRGNCBLL_INSTL_YN === 'Y' ? 'Y' : 'N',
    male: parseInt(item.MALE_TOILT_CNT || 0, 10),
    female: parseInt(item.FEMALE_TOILT_CNT || 0, 10),
    type: item.SE_NM || '공중화장실'
  };
}

function normalizeDate(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  const ymd = text.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymd) return `${ymd[1]}-${ymd[2]}-${ymd[3]}`;

  const separated = text.match(/^(\d{4})[-./\s년]+(\d{1,2})[-./\s월]+(\d{1,2})/);
  if (separated) {
    return `${separated[1]}-${String(separated[2]).padStart(2, '0')}-${String(separated[3]).padStart(2, '0')}`;
  }

  return text;
}

function sourceDateOf(item) {
  return normalizeDate(
    item.DATA_STD_DE ||
    item.DATA_CRTR_YMD ||
    item.DATA_BASE_DATE ||
    item.referenceDate ||
    item.dataStdde ||
    item.baseDate ||
    item.lastUpdtDt ||
    item.데이터기준일자 ||
    '',
  );
}

function inferSourceDate(items) {
  if (SOURCE_DATE_OVERRIDE) return normalizeDate(SOURCE_DATE_OVERRIDE);
  const dates = items.map(sourceDateOf).filter(Boolean).sort();
  return dates.at(-1) || null;
}

function updateDataManifest({ sourceDate, generatedAt, total }) {
  let manifest = {
    version: 1,
    generatedAt,
    datasets: {},
  };

  if (fs.existsSync(DATA_MANIFEST_PATH)) {
    manifest = JSON.parse(fs.readFileSync(DATA_MANIFEST_PATH, 'utf8'));
  }

  manifest.generatedAt = generatedAt;
  manifest.datasets = manifest.datasets || {};
  manifest.datasets.restrooms = {
    label: '공중화장실',
    path: '/data/restrooms',
    sourceUrl: BASE_URL,
    sourceDate,
    generatedAt,
    maxAgeDays: 90,
    total,
  };

  fs.writeFileSync(DATA_MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
}

async function fetchPage(pageNo) {
  const url = `${BASE_URL}?serviceKey=${encodeServiceKey(API_KEY)}&type=json&numOfRows=${NUM_OF_ROWS}&pageNo=${pageNo}`;
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.replace(/\s+/g, ' ').slice(0, 160)}`);

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`JSON 응답이 아닙니다. ${text.replace(/\s+/g, ' ').slice(0, 160)}`);
  }

  const header = data.response?.header || data.header || {};
  const resultCode = String(header.resultCode || '00');
  if (!/^0+$/.test(resultCode)) {
    throw new Error(`API_RESULT_${resultCode} ${header.resultMsg || header.returnAuthMsg || ''}`.trim());
  }

  const items = data.response?.body?.items?.item || [];
  const totalCount = data.response?.body?.totalCount || 0;
  return { items, totalCount };
}

async function main() {
  console.log('🚀 전국 공중화장실 데이터 동기화 시작 (최대 55,000건 예상)...\n');

  let allItems = [];
  let pageNo = 1;
  let totalCount = 1;

  while (allItems.length < totalCount) {
    try {
      console.log(`📡 Fetching page ${pageNo}...`);
      const res = await fetchPage(pageNo);
      
      if (pageNo === 1) {
        totalCount = res.totalCount;
        console.log(`📋 API Report Total: ${totalCount} items.`);
      }

      if (res.items.length === 0) break;
      allItems = allItems.concat(res.items);
      pageNo++;

      // 서버 부하 방지
      await new Promise(r => setTimeout(r, 200)); 
    } catch (err) {
      throw new Error(`Page ${pageNo} fetch failed: ${err.message}`);
    }
  }

  console.log(`\n✅ 총 ${allItems.length}건 데이터 다운로드 완료. 지역별 분할 시작...`);
  const generatedAt = new Date().toISOString().slice(0, 10);
  const sourceDate = inferSourceDate(allItems);

  // 도시 단위 분류 구조 준비
  const byCity = {};
  for (const key of Object.keys(SUPPORTED_CITIES)) {
    byCity[key] = {}; // city -> { district: [items] }
  }

  // 필터링 및 할당
  let matchedCount = 0;
  for (const item of allItems) {
    const rawAddr = item.LCTN_ROAD_NM_ADDR || item.LCTN_LOTNO_ADDR;
    if (!rawAddr) continue;

    const optItem = optimizeItem(item);
    if (optItem.lat === 0 || optItem.lng === 0) continue;

    // 지원하는 도시인지 확인
    for (const [cityKey, cityPrefix] of Object.entries(SUPPORTED_CITIES)) {
      if (rawAddr.startsWith(cityPrefix)) {
        // 구/군 추출 (예: '서울특별시 종로구 ...' -> '종로구')
        const parts = rawAddr.split(' ').filter(Boolean);
        const district = parts.length > 1 ? parts[1] : '기타';
        
        if (!byCity[cityKey][district]) {
          byCity[cityKey][district] = [];
        }
        byCity[cityKey][district].push(optItem);
        matchedCount++;
        break; // 다른 도시는 검사할 필요 없음
      }
    }
  }

  console.log(`\n🎯 매칭된 지원 도시 화장실 수: ${matchedCount}건\n`);

  // 파일 쓰기 로직
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const [cityKey, districtMap] of Object.entries(byCity)) {
    const districts = Object.keys(districtMap);
    if (districts.length === 0) continue;

    let cityTotal = 0;
    const indexData = {
      total: 0,
      districts: {},
      metadata: {
        dataset: '전국공중화장실표준데이터',
        sourceUrl: BASE_URL,
        city: cityKey,
        sourceDate,
        generatedAt,
      },
    };
    const cityDir = path.join(OUTPUT_DIR, cityKey);
    if (!fs.existsSync(cityDir)) fs.mkdirSync(cityDir, { recursive: true });

    for (const [district, arr] of Object.entries(districtMap)) {
      cityTotal += arr.length;
      indexData.districts[district] = arr.length;
      
      const content = JSON.stringify({ items: arr });
      fs.writeFileSync(path.join(cityDir, `${district}.json`), content, 'utf8');
    }
    indexData.total = cityTotal;
    fs.writeFileSync(path.join(cityDir, 'index.json'), JSON.stringify(indexData), 'utf8');
    
    console.log(`📁 ${cityKey} 저장 완료 (총 ${cityTotal}건, ${districts.length}개 구/군)`);
  }

  updateDataManifest({ sourceDate, generatedAt, total: matchedCount });
  console.log('\n🎉 공중화장실 데이터 분할이 모두 완료되었습니다!');
}

main().catch(console.error);
