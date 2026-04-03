/**
 * 소방용수시설 CSV → JSON 변환 스크립트
 * 
 * 사용법:
 *   node scripts/convert-firewater-csv.js <CSV파일경로>
 * 
 * CSV 파일을 읽어서:
 * 1. 급수탑/저수조/비상소화장치만 필터링
 * 2. 표준 JSON 포맷으로 변환
 * 3. 기존 소화전 데이터와 병합하여 저장
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIREWATER_DIR = path.join(__dirname, '..', 'public', 'firewater');

// CSV 파싱 (간단한 파서 — 외부 의존성 없음)
function parseCSV(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // BOM 제거
  let header = lines[0].replace(/^\uFEFF/, '');
  
  // 헤더 파싱
  const headers = parseCSVLine(header);
  
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length !== headers.length) continue;
    
    const row = {};
    headers.forEach((h, idx) => {
      row[h.trim()] = (values[idx] || '').trim();
    });
    rows.push(row);
  }
  return rows;
}

// CSV 라인 파싱 (따옴표 처리)
function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current);
  return result;
}

// 컬럼명 매핑 (다양한 CSV 포맷 지원)
const FIELD_MAP = {
  // 시설유형
  '시설유형코드': 'fcltySeNm',
  '시설유형명': 'fcltySeNm',
  '시설구분명': 'fcltySeNm',
  'fcltySeNm': 'fcltySeNm',
  'fcltySeCode': 'fcltySeNm',
  
  // 시설번호
  '시설번호': 'fcltyNo',
  'fcltyNo': 'fcltyNo',
  
  // 시도명
  '시도명': 'ctprvnNm',
  'ctprvnNm': 'ctprvnNm',
  
  // 시군구명
  '시군구명': 'signguNm',
  'signguNm': 'signguNm',
  
  // 도로명주소
  '소재지도로명주소': 'rdnmadr',
  '도로명주소': 'rdnmadr',
  'rdnmadr': 'rdnmadr',
  
  // 지번주소
  '소재지지번주소': 'lnmadr',
  '지번주소': 'lnmadr',
  'lnmadr': 'lnmadr',
  
  // 위도
  '위도': 'latitude',
  'latitude': 'latitude',
  
  // 경도
  '경도': 'longitude',
  'longitude': 'longitude',
  
  // 상세위치
  '상세위치': 'detailLocation',
  
  // 안전센터명
  '안전센터명': 'safeCenterNm',
  
  // 설치연도
  '설치연도': 'installYear',
  
  // 사용가능여부
  '사용가능여부': 'usableYn',
};

// 시설유형 키워드 → 표준 명칭
function normalizeType(raw) {
  if (!raw) return null;
  if (raw.includes('급수탑')) return '급수탑';
  if (raw.includes('저수조')) return '저수조';
  if (raw.includes('비상소화장치') || raw.includes('비상소화')) return '비상소화장치';
  if (raw.includes('소화전')) return '소화전';
  return raw;
}

// 시도명에서 도시 파일명 추출
function getCityFileName(ctprvnNm) {
  const cityMap = {
    '서울': '서울특별시',
    '부산': '부산광역시',
    '대구': '대구광역시',
    '인천': '인천광역시',
    '광주': '광주광역시',
    '대전': '대전광역시',
    '울산': '울산광역시',
    '세종': '세종특별자치시',
    '제주': '제주특별자치도',
  };
  
  for (const [key, full] of Object.entries(cityMap)) {
    if (ctprvnNm?.includes(key)) return full;
  }
  return ctprvnNm || '기타';
}

function main() {
  const csvPath = process.argv[2];
  
  if (!csvPath) {
    console.log('사용법: node scripts/convert-firewater-csv.js <CSV파일경로>');
    console.log('');
    console.log('예시:');
    console.log('  node scripts/convert-firewater-csv.js ./data/서울시_소방용수시설_20251231.csv');
    console.log('');
    console.log('CSV 파일에서 급수탑/저수조/비상소화장치를 필터링하여');
    console.log('public/firewater/ 디렉토리의 기존 JSON에 병합합니다.');
    process.exit(1);
  }

  if (!fs.existsSync(csvPath)) {
    console.error(`❌ 파일을 찾을 수 없습니다: ${csvPath}`);
    process.exit(1);
  }

  console.log(`📂 CSV 파일 읽는 중: ${csvPath}`);
  
  // 인코딩 자동 감지 (EUC-KR or UTF-8)
  let text;
  try {
    const buf = fs.readFileSync(csvPath);
    // UTF-8 BOM 확인
    if (buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF) {
      text = buf.toString('utf-8');
    } else {
      // UTF-8로 시도
      text = buf.toString('utf-8');
      // 깨진 문자 감지
      if (text.includes('�')) {
        console.log('⚠️  EUC-KR 인코딩 감지. UTF-8로 변환해주세요.');
        console.log('   PowerShell: Get-Content file.csv -Encoding byte | Set-Content file-utf8.csv -Encoding utf8');
        process.exit(1);
      }
    }
  } catch (err) {
    console.error(`❌ 파일 읽기 실패: ${err.message}`);
    process.exit(1);
  }

  const rows = parseCSV(text);
  console.log(`📊 총 ${rows.length}행 파싱됨`);
  
  // 컬럼 매핑
  const sampleRow = rows[0];
  const columnMap = {};
  for (const key of Object.keys(sampleRow)) {
    if (FIELD_MAP[key]) {
      columnMap[key] = FIELD_MAP[key];
    }
  }
  
  console.log(`🔗 매핑된 컬럼: ${Object.entries(columnMap).map(([k,v]) => `${k}→${v}`).join(', ')}`);
  
  // 데이터 변환 + 필터링
  const byCity = {};
  let totalFiltered = 0;
  let skippedNoCoords = 0;
  
  const typeCounts = {};
  
  for (const row of rows) {
    // 표준 필드로 변환
    const item = {};
    for (const [csvCol, stdCol] of Object.entries(columnMap)) {
      item[stdCol] = row[csvCol];
    }
    
    const type = normalizeType(item.fcltySeNm);
    typeCounts[type || '(없음)'] = (typeCounts[type || '(없음)'] || 0) + 1;
    
    // 급수탑, 저수조, 비상소화장치만 필터링
    if (type !== '급수탑' && type !== '저수조' && type !== '비상소화장치') continue;
    
    // 좌표 유효성 검사
    const lat = parseFloat(item.latitude);
    const lng = parseFloat(item.longitude);
    if (!lat || !lng || lat < 33 || lat > 39 || lng < 124 || lng > 132) {
      skippedNoCoords++;
      continue;
    }
    
    item.fcltySeNm = type;
    
    const city = getCityFileName(item.ctprvnNm);
    if (!byCity[city]) byCity[city] = [];
    byCity[city].push(item);
    totalFiltered++;
  }

  console.log('');
  console.log('📈 시설유형별 건수:');
  for (const [type, count] of Object.entries(typeCounts).sort((a, b) => b[1] - a[1])) {
    const marker = (type === '급수탑' || type === '저수조' || type === '비상소화장치') ? ' ✅' : '';
    console.log(`   ${type}: ${count.toLocaleString()}건${marker}`);
  }
  
  console.log('');
  console.log(`🎯 필터링 결과: ${totalFiltered}건 (급수탑+저수조+비상소화장치)`);
  if (skippedNoCoords > 0) {
    console.log(`⚠️  좌표 없어서 제외: ${skippedNoCoords}건`);
  }
  
  if (totalFiltered === 0) {
    console.log('');
    console.log('❌ 급수탑/저수조/비상소화장치 데이터가 없습니다.');
    console.log('   이 CSV에는 소화전만 포함되어 있을 수 있습니다.');
    process.exit(0);
  }

  // 도시별 병합 + 저장
  console.log('');
  for (const [city, items] of Object.entries(byCity)) {
    const jsonPath = path.join(FIREWATER_DIR, `${city}.json`);
    
    let existingItems = [];
    if (fs.existsSync(jsonPath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        existingItems = existing?.response?.body?.items || [];
        // 기존 소화전만 유지 (급수탑/저수조 중복 방지)
        existingItems = existingItems.filter(i => 
          normalizeType(i.fcltySeNm) === '소화전'
        );
      } catch { /* 새 파일 생성 */ }
    }
    
    const merged = [...existingItems, ...items];
    
    const output = {
      response: {
        body: {
          items: merged,
          totalCount: merged.length,
        }
      }
    };
    
    fs.writeFileSync(jsonPath, JSON.stringify(output), 'utf-8');
    
    const typeBreakdown = {};
    items.forEach(i => { typeBreakdown[i.fcltySeNm] = (typeBreakdown[i.fcltySeNm] || 0) + 1; });
    const breakdown = Object.entries(typeBreakdown).map(([t, c]) => `${t}:${c}`).join(', ');
    
    console.log(`💾 ${city}.json: 기존 소화전 ${existingItems.length} + 추가 ${items.length} (${breakdown}) = 총 ${merged.length}건`);
  }
  
  console.log('');
  console.log('✅ 변환 완료! 프론트엔드에서 자동으로 인식됩니다.');
}

main();
