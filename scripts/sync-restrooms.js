import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'data', 'restrooms');

const API_KEY = '189a16b141d49948bf119eeb2cb8f583b70e5be4b3d407f4cf8a5901b9283b1e';
const BASE_URL = `https://apis.data.go.kr/1741000/public_restroom_info/info`;
const NUM_OF_ROWS = 1000;

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

async function fetchPage(pageNo) {
  const url = `${BASE_URL}?serviceKey=${API_KEY}&type=json&numOfRows=${NUM_OF_ROWS}&pageNo=${pageNo}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
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
      console.error(`❌ Page ${pageNo} fetch failed:`, err.message);
      break;
    }
  }

  console.log(`\n✅ 총 ${allItems.length}건 데이터 다운로드 완료. 지역별 분할 시작...`);

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
    const indexData = { total: 0, districts: {} };
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

  console.log('\n🎉 공중화장실 데이터 분할이 모두 완료되었습니다!');
}

main().catch(console.error);
