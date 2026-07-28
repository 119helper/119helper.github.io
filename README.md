# 🚒 119 Helper Dashboard

소방 및 구급 대원의 신속한 출동과 현장 상황 파악을 지원하는 **종합 정보 대시보드**입니다.  
모바일 기기와 데스크탑 환경 모두에서 완벽하게 동작하는 반응형 웹 앱입니다.

🔗 **라이브:** [https://119helper.github.io/](https://119helper.github.io/)

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
- `FIRE_WATER_API_KEY` (분기별 소방용수시설 정적 데이터 동기화용)
- `RESTROOM_API_KEY` 또는 기존 공공데이터 포털 키(`FIRE_WATER_API_KEY`/`PUBLIC_DATA_API_KEY`) (분기별 공중화장실 정적 데이터 동기화용)

소방용수시설과 공중화장실 정적 데이터는 공공데이터 API에서 직접 갱신합니다.

```bash
FIRE_WATER_API_KEY=... node scripts/sync-firewater.js
RESTROOM_API_KEY=... node scripts/sync-restrooms.js
# v2 최초 마이그레이션 때만: 마지막 v1 좌표를 Git 기준점에서 영구 인덱스로 보존
RESTROOM_API_KEY=... RESTROOM_LEGACY_COORDINATE_GIT_REF=HEAD node scripts/sync-restrooms.js
CIVIL_SHELTER_SYNC_API_KEY=... node scripts/sync-civil-shelters.js
TSUNAMI_SHELTER_API_KEY=... node scripts/sync-tsunami-shelters.js
```

민방위/지진해일 정적 데이터 manifest는 체크인된 JSON에서 기준일과 건수를 보강할 수 있습니다. 지진해일 원본 파일에는 행별 기준일 필드가 없어 공공데이터포털 API 상세의 수정일을 `API 수정일`로 기록합니다.

```bash
node scripts/update-static-data-manifest.mjs
TSUNAMI_SOURCE_DATE=2025-07-16 node scripts/update-static-data-manifest.mjs
```

운영 리스크와 후속 보완 과제는 [`docs/operational_risks.md`](docs/operational_risks.md)에 정리되어 있습니다.
2026-07 행정구역 개편 대응 범위와 검증 결과는
[`docs/administrative-region-audit-2026-07.md`](docs/administrative-region-audit-2026-07.md)에서 확인할 수 있습니다.
데이터를 갱신한 뒤에는 `npm run audit:regions`로 광주·인천 행정구역과 좌표 정합성을 검사합니다.

한국수자원공사 댐 방류정보 활용신청이 승인되면 `worker/wrangler.toml`의
`DAM_DISCHARGE_ENABLED`를 `"true"`로 바꾼 뒤 Worker를 배포합니다. 승인 전에는
화면에 심의 대기 상태만 표시하며 업스트림 API를 호출하지 않습니다.

---

## 📄 라이선스

이 프로젝트는 소방 현장 활동 지원 목적으로 제작되었습니다.
