# 119 Helper 운영 리스크 및 후속 과제

작성일: 2026-07-03

이 문서는 코드 수정만으로 완전히 닫기 어려운 남은 약점과 운영 과제를 정리한다.
이미 반영된 보완 사항은 별도 섹션에 기록해, 이후 작업자가 같은 문제를 다시 추적하지 않게 한다.

## 운영 방침

- 이 프로젝트는 무료 공개 프로젝트로 유지한다.
- 운영 URL은 GitHub Pages 사용자 지정 도메인 `https://119.teemozipsa.com/`과
  Cloudflare Worker `https://119-helper-api.teemozipsa.workers.dev`를 사용한다.
- 기존 `https://119helper.github.io/` Origin은 설치형 PWA와 전환기 사용자를 위해
  API 허용 목록에 유지하되, 새로 안내하는 정식 주소는 사용자 지정 도메인으로 통일한다.
- 기존 Cloudflare zone은 `119` 서브도메인의 DNS 연결에만 사용하고, Pages 트래픽을
  프록시하거나 유료 호스팅으로 전환하지 않는다.
- 따라서 GitHub Pages 응답 헤더 한계와 Cloudflare WAF 미적용은 수용 리스크로 관리하고,
  코드·Worker·CI에서 가능한 방어를 우선한다.

## 이미 보완한 사항

- API 캐시 폴백은 더 이상 무기한 만료 캐시를 사용하지 않는다.
  - `maxStaleMs`가 지정되지 않은 API는 `cacheTtlMs`를 폴백 한계로 사용한다.
  - 관련 테스트: `src/services/apiClient.test.ts`
- 설정 화면에 기기 저장 사용자 데이터 삭제 기능을 추가했다.
  - 메모, 대상물 정보/사진, 활동 타임라인, 환자 분류, 일정, 최근 검색 기록을 삭제한다.
- GitHub Pages 배포 전에 운영 Worker `/api/health`를 실제 `VITE_APP_TOKEN`으로 확인한다.
- 운영 Worker smoke test를 주요 API까지 확대했다.
  - 배포 workflow와 6시간 주기 scheduled workflow가 같은 스크립트를 사용한다.
  - 대상: `/api/health`, `/api/weather/now`, `/api/er/beds`, `/api/disaster-msg`, `/api/fire/station`
  - 관련 스크립트: `scripts/smoke-production-api.mjs`
- GitHub Actions 배포에 필요한 Cloudflare secret과 KV binding을 실제 운영 계정 기준으로 확인했다.
  - `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `NEWS_CACHE_KV_ID`, `NEWS_CACHE_KV_PREVIEW_ID`
  - Worker 배포, Pages 배포, 운영 API smoke test가 같은 workflow에서 통과했다.
- GitHub Actions 배포에서 Worker를 Pages 배포 전에 먼저 배포하도록 추가했다.
  - CI에서 `NEWS_CACHE_KV_ID`, `NEWS_CACHE_KV_PREVIEW_ID`로 `wrangler.ci.toml`을 생성한다.
  - Worker 배포 실패 또는 운영 smoke test 실패 시 Pages 배포가 진행되지 않는다.
- 소방용수시설 정적 데이터 갱신 workflow가 공공데이터 API를 직접 호출하도록 변경됐다.
  - 관련 스크립트: `scripts/sync-firewater.js`
  - 필요한 GitHub secret: `FIRE_WATER_API_KEY`
- 공중화장실 정적 데이터 갱신 workflow를 추가했다.
  - 관련 스크립트: `scripts/sync-restrooms.js`
  - 원본 기준일 필드를 추출해 `public/data/manifest.json`의 `restrooms.sourceDate`에 기록한다.
  - 필요한 GitHub secret: `RESTROOM_API_KEY`, 없으면 `FIRE_WATER_API_KEY` 또는 `PUBLIC_DATA_API_KEY`를 재사용한다.
- 정적 데이터 기준일/생성일 manifest를 추가하고, 시설 조회/오프라인 설정 화면에 표시한다.
  - `public/firewater/manifest.json`
  - `public/data/manifest.json`
- 공용 기기 모드가 대상물 사진 IndexedDB 저장도 차단하도록 보강했다.
  - 관련 테스트: `src/services/preplanPhotos.test.ts`
- Worker 공공 API 키 인코딩 처리를 일부 구버전 라우트에서도 공통 헬퍼로 통일했다.
  - 대상: 대기질, 건축물대장, 기상청 API Hub
  - 관련 테스트: `worker/src/routes/proxyInput.test.ts`, `worker/src/routes/weather.test.ts`
- 뉴스 프록시의 og:image 보강 fetch를 제한했다.
  - 최대 6개 item, 동시 3개, 1.5초 timeout, 128KB HTML 상한, 로컬/사설 IP 차단.
- Worker 문자열 입력 정규화가 HTML 태그 조각을 먼저 제거하도록 개선됐다.
- Worker의 직접 응답, Edge Cache 응답, XML 응답에도 중앙 CORS와 보안 헤더가 일관되게 적용된다.
  - 관련 테스트: `worker/src/middleware/cors.test.ts`
- 운영 Worker smoke test가 대표 공공 API 계약까지 감시하도록 확대됐다.
  - 추가 대상: 대기질, 공휴일, 화재피해, 다중이용업소, 산불위험, 산불정보, 사설 구급차, 소비자 위해, 연간화재통계 연도 매핑
  - 각 요청은 20초 timeout과 응답 구조 검증을 가진다.
- 민감 데이터 내보내기/복사 전에 확인 경고를 표시한다.
  - 대상물 정보 백업에는 주소, 관계인 연락처, 위험요소, 현장 사진 포함 가능성을 안내한다.
  - 활동보고서 JSON/복사에는 타임라인, GPS, 사건 정보, 환자 분류 집계 포함 가능성을 안내한다.
  - 관련 테스트: `src/utils/sensitiveExport.test.ts`
- 앱 잠금 기능을 추가했다.
  - 설정한 잠금 코드는 평문 저장하지 않고 salt+hash로 저장한다.
  - 해제 상태는 탭 세션에만 보관되며, 미사용 시간 또는 탭 전환 설정에 따라 다시 잠긴다.
  - 관련 테스트: `src/services/appLock.test.ts`
- 정적 데이터 manifest 보강 스크립트를 추가했다.
  - 민방위 대피시설은 `DAT_UPDT_PNT`/`LAST_MDFCN_PNT` 등 날짜 필드에서 원본 기준일을 추출한다.
  - 지진해일 대피소처럼 원본 파일에 날짜 필드가 없는 데이터는 공공데이터포털 API 상세의 `수정일`을 `API 수정일`로 남긴다.
  - 관련 스크립트: `scripts/update-static-data-manifest.mjs`
- 국립중앙의료원 AED 위치정보와 한국수자원공사 댐 방류정보 활용승인을 실제
  API 응답으로 확인했다.
  - AED 시설 조회와 댐 방류정보 `resultCode=00` 응답을 확인했다.
  - 댐 연동을 2026-07-29 활성화하고, 두 API를 운영 smoke 검사에 추가했다.

## 남은 과제

### 1. 프론트 앱 토큰은 인증 수단이 아니다

현재 Worker는 `Origin` 검사, `X-App-Token`, rate limit을 함께 사용한다. 그러나 `VITE_APP_TOKEN`은 브라우저 번들에 포함되는 공개값이므로 공격자가 추출할 수 있다.

권장 조치:
- 무료/무도메인 운영 방침에서는 현재 Worker Origin 검사, 앱 토큰, Cloudflare Worker rate limit binding, smoke workflow를 기본 방어선으로 유지한다.
- Worker 토큰은 계속 회전 가능하게 유지하되, "비밀 인증"으로 간주하지 않는다.
- 봇/스크래핑 트래픽이 실제 문제가 되면 그때 도메인/Cloudflare zone 기반 WAF, Turnstile, Bot Fight Mode 계열 설정을 재검토한다.

완료 기준:
- `VITE_APP_TOKEN`은 공개 방어선이라는 점이 README와 운영 문서에 명시되어 있다.
- 토큰 회전 절차와 smoke workflow 실패 알림이 유지된다.

### 2. GitHub Pages 보안 헤더 한계

`public/_headers`는 GitHub Pages에서 적용되지 않는다. 현재 운영 보호는 `index.html`의 meta CSP, 앱 부트스트랩의 프레임 차단 로직, Worker 응답 보안 헤더에 의존한다. `frame-ancestors`, `X-Frame-Options`, `X-Content-Type-Options` 같은 프론트 정적 파일 응답 헤더는 GitHub Pages 단독으로 강제하기 어렵다.

권장 조치:
- 무료/무도메인 운영 방침에서는 이 한계를 수용한다.
- 프론트는 meta CSP와 런타임 frame guard를 유지한다.
- Worker API 응답은 중앙 보안 헤더 적용을 계속 유지한다.
- 추후 도메인 운영을 결정하면 Cloudflare Pages 또는 Cloudflare proxy 앞단으로 이전해 응답 헤더를 설정한다.

완료 기준:
- 현재 무료/무도메인 운영 방침이 유지되는 동안에는 "수용 리스크"로 표시한다.
- Worker API URL의 응답 보안 헤더는 배포 후 smoke 또는 수동 확인으로 유지된다.

### 3. 지진해일 데이터는 행별 기준일이 아니라 API 수정일을 사용한다

소방용수시설, 공중화장실, 민방위 대피시설은 공공데이터 API 동기화 또는 manifest 보강 스크립트로 기준일을 남긴다. 지진해일 대피소 파일은 현재 체크인된 원본에 날짜 필드가 없어서, 공공데이터포털의 `행정안전부_지진해일 긴급대피장소` API 상세에 표시된 수정일 `2025-07-16`을 `sourceDate`에 기록하고 화면에는 `API 수정일`로 표시한다.

권장 조치:
- 다음 소방용수시설/공중화장실 갱신 workflow 실행 결과에서 `sourceDate`가 채워지는지 확인한다.
- 지진해일 원본 API/수동 갱신 시 공공데이터포털 상세의 수정일을 확인한 뒤 `TSUNAMI_SOURCE_DATE=YYYY-MM-DD node scripts/update-static-data-manifest.mjs`로 남긴다.
- 향후 행별 기준일 필드가 제공되면 API 수정일보다 행별 기준일을 우선 사용한다.
- 민방위/지진해일 데이터 갱신 workflow 또는 수동 절차를 추가 문서화한다.

완료 기준:
- 각 정적 데이터 묶음에 원본 기준일 또는 공식 API 수정일이 포함된다.
- 갱신 실패 또는 기준일 초과 시 화면에 경고가 표시된다.

### 4. 다중이용업소 승인 API와 검증된 정적 폴백을 함께 사용한다

2026-07-29 현재 기존 `소방청_다중이용업소 현황` API의 최신 집계는 2024년이다. 별도 데이터셋
`소방청_다중이용업소 영업장별 고유 일련번호_20250915`의 자동변환 API를 추가 신청해
자동 승인과 HTTP 200 응답(`totalCount=154873`)을 확인했다.

- CP949 CSV 154,873행을 파싱하고 영업상태 `정상` 113,235행만 사용한다.
- 앱 지원 9개 지역은 주소 첫 행정구역명으로 구분해 업종별 정적 집계로 체크인한다.
- 전남광주통합특별시 요청은 원본 기준시점의 종전 광주 5개 구 집계와 연결한다.
- 승인 API를 지역·영업상태 조건으로 조회해 업종별 집계를 만들고 30일 캐시한다.
- 키 누락, API 장애, 페이지 누락 시에는 동일 원본으로 검증한 정적 집계를 제공한다.

### 5. 실제 공공 API 계약 검증은 지속 감시가 필요하다

운영 Worker smoke workflow가 대표 공공 API까지 확대됐지만, 단위 테스트는 여전히 대부분 upstream fetch를 mock한다. 입력 위생, 파싱 안정성은 검증하지만 공공 API 제공기관의 간헐 장애나 비핵심 엔드포인트 변경은 운영 scheduled workflow와 GitHub Actions 알림으로 감시해야 한다.

권장 조치:
- `api-smoke.yml` 실패 알림이 운영자에게 전달되도록 GitHub Actions notification을 확인한다.
- 건축물대장처럼 정상 호출에 실제 주소/코드가 필요한 API는 별도 fixture 기반 smoke test를 추가한다.
- 응답이 비어도 정상일 수 있는 API는 schema/상태 코드 중심으로 계속 검증한다.

완료 기준:
- API 계약 깨짐이 사용자 신고 전에 GitHub Actions 또는 Cloudflare alert로 감지된다.

### 6. 로컬 민감 데이터 기기 보호는 추가 보완이 필요하다

기기 저장 데이터 삭제, 자동 만료, 공용 기기 모드, 대상물 사진 저장 차단, 내보내기/복사 전 민감정보 경고, 앱 잠금은 추가됐다. 다만 브라우저 기반 앱 잠금은 OS/기기 암호나 저장소 암호화를 대체하지 않는다.

권장 조치:
- 더 강한 보호가 필요하면 기기 자체 잠금, MDM, 브라우저 프로필 분리 같은 운영 정책을 사용한다.

완료 기준:
- 무료 공개 프로젝트 범위에서는 앱 잠금으로 캐주얼 접근 방어를 제공하고, 강한 기기 보안은 운영 정책으로 분리한다.

## 우선순위

1. 운영 API smoke workflow 실패 알림 확인
2. 지진해일 API 수정일 확인 후 manifest 갱신 유지
3. 봇/스크래핑 남용이 실제로 발생할 때만 도메인/WAF/Turnstile 재검토
