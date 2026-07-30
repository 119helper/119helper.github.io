# 🚒 119 Helper Dashboard

소방 및 구급 대원의 신속한 출동과 현장 상황 파악을 지원하는 **종합 정보 대시보드**입니다.  
모바일 기기와 데스크탑 환경 모두에서 완벽하게 동작하는 반응형 웹 앱입니다.

🔗 **라이브:** [https://119.teemozipsa.com/](https://119.teemozipsa.com/)

---

## ✨ 주요 기능

### 📊 실시간 대시보드
- 현재 위치 기반 기온·습도·풍속·강수 등 기상 현황 요약
- 응급실 가용 병상 현황 실시간 요약
- 소방용수시설(소화전·급수탑·저수조) 현황

### 🌤️ 기상 정보
- 기상청 API Hub 연동 — 초단기실황, 단기예보, 중기예보
- 화재 위험도 자동 판정 (습도·풍속 기반)
- 체감온도(윈드칠) 자동 계산

### 🏥 응급실 실시간 현황
- 국립중앙의료원 실시간 가용병상 API 연동
- 병원별 응급병상·입원실·수술실·CT·MRI 현황
- 원클릭 전화 연결

### 🗺️ 소방용수시설 지도
- 카카오맵 SDK 기반 시설 위치 시각화
- 소화전·급수탑·저수조·비상소화장치 마커
- 클러스터링 + 커스텀 오버레이

### 🏢 건축물대장 현장 검색
- 주소 입력 → 건물 구조·층수·용도·면적·준공일 즉시 조회
- 카카오 Geocoder + 국토교통부 건축물대장 API

### ☢️ 유해화학물질(Hazmat) 대피 반경 계산기
- ERG 기반 초기이격거리 + 풍하향 방호구역 시뮬레이션
- 카카오맵 위 원형(이격구역) + 부채꼴(방호구역) 시각화

### 🧮 소방 계산기
- 수압(nozzle pressure) 계산
- 호스 전개 마찰손실 계산
- 공기호흡기 잔여 시간 계산

### 📅 달력 / 일정
- 교대근무 일정 관리
- 공휴일 API 연동 (빨간 날 자동 표시)

### 📝 메모장
- 인수인계 및 현장 메모 (localStorage 저장)

---

## 🛠️ 기술 스택

| 분류 | 기술 |
|---|---|
| Frontend | React 19 + TypeScript + Vite |
| Styling | TailwindCSS (Dark Theme) |
| Map | Kakao Maps JavaScript SDK |
| API | Cloudflare Worker 프록시 + 기상청 API Hub, 국립중앙의료원, 에어코리아, 국토교통부 |
| CI/CD | GitHub Actions → GitHub Pages |
| State | React Hooks (useState/useEffect) |

---

## 🚀 로컬 개발

```bash
git clone https://github.com/119helper/119helper.github.io.git
cd 119helper.github.io
npm install
mkdir -p ../key/119-helper
cp .env.example ../key/119-helper/.env
# ../key/119-helper/.env 에 VITE_KAKAO_MAP_KEY 설정
# 기본 예시는 로컬 Worker(http://localhost:8787)에 연결됨
# 운영 배포에서는 VITE_APP_TOKEN을 Worker의 APP_ACCESS_TOKEN과 동일하게 설정
npm run dev:worker
# 다른 터미널에서:
npm run dev -- --host
# → http://localhost:5173
```

공공데이터 API 키는 브라우저 번들에 넣지 않습니다. Worker secret으로 등록하세요.

```bash
cd worker
npm install
wrangler secret put KMA_API_KEY
wrangler secret put ER_API_KEY
# AED와 댐 방류는 같은 data.go.kr 계정 키를 재사용합니다.
# 별도 키를 분리하려면: wrangler secret put PUBLIC_DATA_API_KEY
npm run dev
# worker/wrangler.dev.toml이 ENVIRONMENT=development와 포트 8787을 고정하므로
# 로컬에서는 APP_ACCESS_TOKEN 없이 실행 가능
```

운영 참고: `VITE_APP_TOKEN`은 브라우저 번들에 포함되는 공개값이므로 완전한 비밀 인증 수단이 아닙니다.
현재 무료/무도메인 운영에서는 Worker의 Origin/토큰 검증과 rate limit binding을 기본 방어선으로 사용합니다. 대량 스크래핑이 실제 문제가 되면 도메인/Cloudflare zone 기반 WAF, Turnstile, 봇 차단 정책을 재검토하세요.

GitHub Actions 운영 배포에는 다음 secret도 필요합니다.

- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- `NEWS_CACHE_KV_ID`, `NEWS_CACHE_KV_PREVIEW_ID`
- `FIRE_WATER_API_KEY` (분기별 전국 소방용수시설 기준 원본 동기화용)

소방용수시설은 공공데이터 API에서, 공중화장실은 키가 필요 없는 LOCALDATA 공식
전국 CSV와 지자체 공식 CSV에서 직접 갱신합니다.

```bash
FIRE_WATER_API_KEY=... node scripts/sync-firewater.js
npm run sync:firewater-overlays
node scripts/sync-restrooms.js
# v2 최초 마이그레이션 때만: 마지막 v1 좌표를 Git 기준점에서 영구 인덱스로 보존
RESTROOM_LEGACY_COORDINATE_GIT_REF=HEAD node scripts/sync-restrooms.js
CIVIL_SHELTER_SYNC_API_KEY=... node scripts/sync-civil-shelters.js
TSUNAMI_SHELTER_API_KEY=... node scripts/sync-tsunami-shelters.js
npm run sync:fire-stats -- --complete-years 2024,2025 --partial-through 2026-07-28
npm run test:data-scripts
```

NFDS 화재통계 동기화는 별도 서비스 키 없이 공개 통계 화면의 조회 결과를 저빈도로
스냅샷화합니다. 2024·2025 완결과 2026 누계를 시도×월 단위로 보존하고, 전국·월·시도
합계가 일치하지 않으면 파일을 갱신하지 않습니다.

전국 소방용수 표준 원본 뒤에는 검증된 지역 최신 자료를 관할 단위로 오버레이합니다.
현재 광산구 2026 원본을 적용하며, 잘못된 최신 좌표는 그대로 지도에 넣지 않고 정확한
공식 주소가 하나의 이전 좌표로 수렴할 때만 출처를 남겨 보충합니다.

공중화장실은 좌표가 제거된 전국 표준행을 기준 목록으로 유지하고 서울시·서울교통공사·
제주시·부산 동래구 공식 CSV, 부산 갈맷길 공식 SHP, 대전 서구의 키 없는 공식 JSON
API를 결합합니다. 기본 규칙은 정규화한 시설명과 도로명/지번주소의 고유 1:1
일치입니다. 서울시 원천은 표기 차이를 복구하기 위해서만 정확 주소가 중앙의 한 시설로
유일하게 수렴하고, 양쪽 시설명이 4자 이상이면서 서로 포함되며, 중복 원천 행의 좌표까지
일치할 때 보수적 예외를 허용합니다. 서울교통공사 원천은 역명에 `역`을 보정한 뒤 3자
이상 이름 포함과 유일한 정확 주소를 함께 요구합니다. 이름만 또는 주소만 맞는 후보는
반영하지 않습니다.

2026-07-30 기준 공식 지역 좌표 신규 보충은 서울시 664곳(엄격 601곳, 보수적 예외
63곳)·서울 지하철 1~8호선 15곳·대전 서구 26곳·제주시 326곳·동래구 39곳·부산
갈맷길 24곳으로 총 1,094곳입니다.
기존 주소 대표점 중 서울 공식 자료와 엄격히 다시 일치한 3곳은 표시 건수를 늘리지 않고
시설 좌표로 정밀도만 개선합니다. 지원 도시 원본 17,341곳 중 지도 표시는 11,845곳
(68.3%), 시설 좌표는 10,783곳, 주소 대표점은 1,062곳, 좌표 미확인은 5,496곳이며
출처별 판정 수는 별도 인덱스와 manifest에 남깁니다.

부산의 좌표 미확인 시설은 [부산광역시 도로명주소 정보](https://www.data.go.kr/data/15028854/fileData.do)의
건물 대표점을 별도 오버레이로 사용합니다. 중앙 도로명주소가 원천의 단일 행과 정확히
일치하고 건물명이 대조된 신규 222곳만 반영하며, 기존 v1 좌표가 부산 밖을 가리킨 13곳도
옛 좌표를 원장에 보존한 뒤 주소 대표점으로 교정합니다. 총 235개 주소점은 주황색
`주소 대표점(근사)`으로 표시하며 실제 화장실 위치나 출입구 좌표로 간주하지 않습니다.

대구·세종·울산의 좌표 미확인 시설 중 82곳은 공공데이터포털의 2025년 이후
[도시공원](https://www.data.go.kr/data/15012890/standard.do)·
[주차장](https://www.data.go.kr/data/15012896/standard.do)·
[전통시장](https://www.data.go.kr/data/15012894/standard.do)·
[도서관](https://www.data.go.kr/data/15013109/standard.do)·
[박물관·미술관](https://www.data.go.kr/data/15017323/standard.do)·
[공공시설 개방](https://www.data.go.kr/data/15013117/standard.do) 표준자료의 호스트 시설
대표점으로 보충합니다. 서울 용산구는
[동주민센터 현황](https://www.data.go.kr/data/15116840/fileData.do) 5곳을 같은 근사
계층에 별도 그룹으로 둡니다. 도로명·지번 키를 섞지 않고, 4자 이상 이름의 단방향 포함
또는 명시 검토한 19개 변형만 허용하며, 전통시장은 `PBLIC_TOILET_YN=Y`인 행만 사용합니다.
전국 표준 82곳과 용산 5곳은 각각 ID·원천·주소키·좌표 지문이 달라지면 자동 갱신을
중단합니다.

민방위/지진해일 정적 데이터 manifest는 체크인된 JSON에서 기준일·지역별 수량·대조 상태를
다시 계산할 수 있습니다. 지진해일은 안전데이터 상세 메타데이터의 `updtymd`를 원본
갱신일로 기록하며, 행정안전부 발표 관리대장 수와 공개 API 수가 다르면 그 차이를 함께 표시합니다.

2026-07-29 API 승인 확인, 최신 공개자료 대조, 법령 교정 및 추가 API 우선순위는
[`docs/data-source-audit-2026-07-29.md`](docs/data-source-audit-2026-07-29.md)에 정리되어 있습니다.

```bash
node scripts/update-static-data-manifest.mjs
# 메타데이터를 자동으로 읽을 수 없는 비상 상황에서만 기준일을 강제 지정
TSUNAMI_SHELTER_API_KEY=... TSUNAMI_SOURCE_DATE=YYYY-MM-DD node scripts/sync-tsunami-shelters.js
```

운영 리스크와 후속 보완 과제는 [`docs/operational_risks.md`](docs/operational_risks.md)에 정리되어 있습니다.
최신성·지역범위·좌표·중복·공식 발표 대조를 분리하고 공개 인터넷 원천을 우선하는 기준은
[`docs/data-completeness-policy.md`](docs/data-completeness-policy.md)에 정리되어 있습니다.
2026-07 행정구역 개편 대응 범위와 검증 결과는
[`docs/administrative-region-audit-2026-07.md`](docs/administrative-region-audit-2026-07.md)에서 확인할 수 있습니다.
데이터를 갱신한 뒤에는 `npm run audit:regions`로 광주·인천 행정구역과 좌표 정합성을 검사합니다.

한국수자원공사 댐 방류정보는 2026-07-29 개발계정 승인을 확인해 운영 연동을
활성화했습니다. API는 15분 주기로 갱신되며, 현재 방류 기록이 없는 경우에도
정상 응답과 조회 시각을 표시합니다. 자체 배포 환경에서는 활용신청 승인 전까지
`DAM_DISCHARGE_ENABLED = "false"`를 유지하세요.

소방청 다중이용업소 영업장별 API도 2026-07-29 추가 신청과 자동 승인을 완료했습니다.
앱은 2025 개별 업소 API를 지역·업종별로 집계하고, 키 누락이나 외부 장애 시에는 같은
공식 CSV 154,873행에서 검증한 정적 집계로 자동 폴백합니다.

---

## 📄 라이선스

이 프로젝트는 소방 현장 활동 지원 목적으로 제작되었습니다.
