# 소방용수시설 CSV 데이터 관리

이 폴더에 각 도시의 소방용수시설 CSV 파일을 넣으면,  
`scripts/convert-firewater-csv.js`가 급수탑·저수조·비상소화장치를 추출하여  
`public/firewater/` JSON에 자동 병합합니다.

## 📥 CSV 다운로드 링크 (도시별)

### 🏆 전국 통합 데이터 (가장 권장 ⭐)
**한 파일로 9개 도시 전부 커버 가능!**

| 데이터 | URL | 비고 |
|--------|-----|------|
| 전국소방용수시설표준데이터 | **[data.go.kr/data/15034538](https://www.data.go.kr/data/15034538/standard.do)** | 소화전+급수탑+저수조+비상소화장치 전부 포함 |

> ⚠️ 위 표준데이터 CSV에 급수탑/저수조가 포함되어 있는지 다운로드 후 확인 필요.
> 포함 안 된 경우 아래 도시별 개별 데이터 사용.

---

### 도시별 개별 데이터

| # | 도시 | URL | 비고 |
|---|------|-----|------|
| 1 | **서울** | [data.seoul.go.kr/OA-21306](https://data.seoul.go.kr/dataList/OA-21306/S/1/datasetView.do) | 2025.12.31 기준 CSV ✅ |
| 2 | **부산** | [data.go.kr/15054974](https://www.data.go.kr/data/15054974/fileData.do) | 파일데이터 |
| 3 | **대구** | [data.daegu.go.kr](http://data.daegu.go.kr) → "소방용수시설" 검색 | 표준데이터 기반 |
| 4 | **인천** | [data.go.kr/15054972](https://www.data.go.kr/data/15054972/fileData.do) | 파일데이터 |
| 5 | **광주** | [data.go.kr/15054971](https://www.data.go.kr/data/15054971/fileData.do) | 파일데이터 |
| 6 | **대전** | [data.go.kr/15054973](https://www.data.go.kr/data/15054973/fileData.do) | 파일데이터 |
| 7 | **울산** | [data.go.kr/15049301](https://www.data.go.kr/data/15049301/fileData.do) | 파일데이터 |
| 8 | **세종** | [data.go.kr/15080965](https://www.data.go.kr/data/15080965/fileData.do) | 파일데이터 |
| 9 | **제주** | [data.go.kr/15072044](https://www.data.go.kr/data/15072044/fileData.do) | 파일데이터 |

---

## 🔄 사용법

### 수동 변환
```bash
# 1. CSV 파일을 이 폴더에 넣기
# 2. 변환 스크립트 실행 (급수탑/저수조/비상소화장치만 추출 + 소화전과 병합)
node scripts/convert-firewater-csv.js data/firewater-csv/서울시_소방용수시설.csv

# 여러 파일 한번에
for f in data/firewater-csv/*.csv; do node scripts/convert-firewater-csv.js "$f"; done
```

### 자동 최신화 (GitHub Actions)
- `.github/workflows/update-firewater.yml` → **분기별 (1/4/7/10월)** 자동 실행
- 이 폴더에 새 CSV 커밋 → 다음 실행 시 자동 변환 & 배포

## ⚠️ 주의
- **UTF-8 인코딩** 필수 (EUC-KR은 변환 필요)
- `시설유형코드` 필드: 1=소화전, 2=급수탑, 3=저수조 (또는 한글)
- 갱신 주기: 비정기 (자치단체별 상이)
