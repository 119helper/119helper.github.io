/**
 * 소방용수시설 데이터 구/군별 분할 스크립트 (범용)
 * 
 * 일정 건수 이상인 도시는 자동으로 시군구별 분할합니다.
 * 분할 기준: 5,000건 이상
 * 
 * 입력:  public/firewater/{도시}.json
 * 출력:  public/firewater/{도시}/index.json + 구별 JSON
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIREWATER_DIR = path.join(__dirname, '..', 'public', 'firewater');
const SPLIT_THRESHOLD = 5000; // 이 건수 이상이면 분할

// 앱에서 사용하는 도시 목록
const TARGET_CITIES = [
  '서울특별시', '부산광역시', '대구광역시', '인천광역시',
  '광주광역시', '대전광역시', '울산광역시', '세종특별자치시', '제주특별자치도'
];

console.log('🔍 소방용수시설 데이터 분석 중...\n');

let totalSplit = 0;

for (const cityName of TARGET_CITIES) {
  const inputPath = path.join(FIREWATER_DIR, `${cityName}.json`);
  if (!fs.existsSync(inputPath)) {
    console.log(`⚠️  ${cityName}.json 없음 — 건너뜀`);
    continue;
  }

  const raw = fs.readFileSync(inputPath, 'utf8');
  const data = JSON.parse(raw);
  const items = data.response?.body?.items || [];
  const sizeMB = (Buffer.byteLength(raw) / 1024 / 1024).toFixed(1);

  if (items.length < SPLIT_THRESHOLD) {
    console.log(`⏭️  ${cityName}: ${items.length}건 (${sizeMB}MB) — 분할 불필요`);
    continue;
  }

  console.log(`📂 ${cityName}: ${items.length}건 (${sizeMB}MB) — 분할 시작`);

  // 시군구별로 분류
  const byDistrict = {};
  for (const item of items) {
    const district = item.signguNm || '미분류';
    if (!byDistrict[district]) byDistrict[district] = [];
    byDistrict[district].push(item);
  }

  // 출력 디렉토리 생성
  const outputDir = path.join(FIREWATER_DIR, cityName);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // index.json 생성
  const index = { total: items.length, districts: {} };
  Object.keys(byDistrict).sort().forEach(district => {
    index.districts[district] = byDistrict[district].length;
  });
  fs.writeFileSync(path.join(outputDir, 'index.json'), JSON.stringify(index), 'utf8');

  // 구별 JSON 파일 생성
  let written = 0;
  for (const [district, districtItems] of Object.entries(byDistrict)) {
    const districtData = {
      response: {
        body: {
          items: districtItems,
          totalCount: districtItems.length
        }
      }
    };
    const content = JSON.stringify(districtData);
    fs.writeFileSync(path.join(outputDir, `${district}.json`), content, 'utf8');
    const sizeKB = (Buffer.byteLength(content) / 1024).toFixed(0);
    console.log(`   ✅ ${district}: ${districtItems.length}건 (${sizeKB}KB)`);
    written += districtItems.length;
  }

  // 검증
  if (written !== items.length) {
    console.error(`   ❌ 검증 실패! 원본=${items.length}, 분할합계=${written}`);
    process.exit(1);
  }
  console.log(`   ✅ 검증 통과 (${Object.keys(byDistrict).length}개 구/군)\n`);
  totalSplit++;
}

console.log(`\n🎉 완료! ${totalSplit}개 도시 분할됨`);
