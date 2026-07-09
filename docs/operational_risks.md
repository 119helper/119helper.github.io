# 119 Helper 운영 리스크 및 후속 과제

작성일: 2026-07-03

이 문서는 코드 수정만으로 완전히 닫기 어려운 남은 약점과 운영 과제를 정리한다.
이미 반영된 보완 사항은 별도 섹션에 기록해, 이후 작업자가 같은 문제를 다시 추적하지 않게 한다.

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

## 남은 과제

### 1. 프론트 앱 토큰은 인증 수단이 아니다

현재 Worker는 `Origin` 검사, `X-App-Token`, rate limit을 함께 사용한다. 그러나 `VITE_APP_TOKEN`은 브라우저 번들에 포함되는 공개값이므로 공격자가 추출할 수 있다.

권장 조치:
- Cloudflare WAF Rate Limiting Rules를 운영 방어선으로 설정한다.
- 봇/스크래핑 트래픽이 실제 문제가 되면 Turnstile 또는 Bot Fight Mode 계열 설정을 검토한다.
- Worker 토큰은 계속 회전 가능하게 유지하되, "비밀 인증"으로 간주하지 않는다.

완료 기준:
- Cloudflare 대시보드에 Worker API 도메인 대상 WAF rate limit rule이 문서화되어 있다.
- 분당/시간당 기준, 차단 응답, 예외 Origin 정책이 운영 문서에 남아 있다.

### 2. Worker 배포 자동화의 secret/바인딩 운영 확인이 필요하다

CI가 Worker를 Pages보다 먼저 배포하도록 변경됐지만, GitHub secret과 Cloudflare 바인딩 값이 실제 운영 계정과 맞아야 한다.

권장 조치:
- GitHub Actions secret을 등록한다.
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - `NEWS_CACHE_KV_ID`
  - `NEWS_CACHE_KV_PREVIEW_ID`
- 운영 smoke workflow에 필요한 `VITE_APP_TOKEN` secret을 등록하고 실패 알림을 확인한다.
- Worker secret들은 Cloudflare 쪽에 선등록한다.
- Worker 배포 후 smoke workflow가 실제 운영 API까지 통과하는지 확인한다.

완료 기준:
- `main`/`master` 배포에서 Worker와 Pages가 같은 workflow 안에서 검증된다.
- Worker 배포 실패 시 Pages 배포가 진행되지 않는다.

### 3. GitHub Pages 보안 헤더 한계

`public/_headers`는 GitHub Pages에서 적용되지 않는다. 현재 운영 보호는 `index.html`의 meta CSP와 앱 부트스트랩의 프레임 차단 로직에 의존한다. `frame-ancestors`, `X-Frame-Options`, `X-Content-Type-Options` 같은 응답 헤더는 GitHub Pages 단독으로 강제하기 어렵다.

권장 조치:
- Cloudflare Pages 또는 Cloudflare proxy 앞단으로 이전해 응답 헤더를 설정한다.
- 최소 권장 헤더:
  - `Content-Security-Policy`
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Permissions-Policy`

완료 기준:
- 운영 URL에서 `curl -I https://119helper.github.io/` 또는 새 호스팅 URL로 보안 헤더가 확인된다.

### 4. 정적 데이터 원본 기준일이 일부 데이터에서 아직 미확인이다

소방용수시설과 공중화장실은 공공데이터 API 동기화 workflow로 전환했고, 정적 데이터 manifest도 추가했다. 다만 기존 체크인 데이터와 민방위 대피시설, 지진해일 대피소 파일에는 원본 기준일 필드가 없어 현재 manifest의 `sourceDate`가 `null`일 수 있다. 화면에는 "기준일 미확인"과 생성일이 표시된다.

권장 조치:
- 다음 소방용수시설/공중화장실 갱신 workflow 실행 결과에서 `sourceDate`가 채워지는지 확인한다.
- 원본 API에 기준일 필드가 없거나 계속 null이면 workflow_dispatch의 `source_date` 입력으로 수동 기준일을 남긴다.
- `public/data/civil.json`, `public/data/tsunami.json` 생성 스크립트 또는 수동 절차가 원본 기준일을 추출해 `public/data/manifest.json`에 쓰도록 보완한다.
- 민방위/지진해일 데이터 갱신 workflow 또는 수동 절차를 문서화한다.

완료 기준:
- 각 정적 데이터 묶음에 원본 기준일이 포함된다.
- 갱신 실패 또는 기준일 초과 시 화면에 경고가 표시된다.

### 5. 실제 공공 API 계약 검증은 지속 감시가 필요하다

운영 Worker smoke workflow가 추가됐지만, 단위 테스트는 여전히 대부분 upstream fetch를 mock한다. 입력 위생, 파싱 안정성은 검증하지만 공공 API 응답 구조 변경이나 인증 상태 변화는 운영 scheduled workflow와 Cloudflare 알림으로 감시해야 한다.

권장 조치:
- `api-smoke.yml` 실패 알림이 운영자에게 전달되도록 GitHub Actions notification을 확인한다.
- 건축물대장처럼 정상 호출에 실제 주소/코드가 필요한 API는 별도 fixture 기반 smoke test를 추가한다.
- 응답이 비어도 정상일 수 있는 API는 schema/상태 코드 중심으로 계속 검증한다.

완료 기준:
- API 계약 깨짐이 사용자 신고 전에 GitHub Actions 또는 Cloudflare alert로 감지된다.

### 6. 로컬 민감 데이터 내보내기/기기 보호는 추가 보완이 필요하다

기기 저장 데이터 삭제, 자동 만료, 공용 기기 모드, 대상물 사진 저장 차단은 추가됐다. 다만 현장 메모, 대상물 정보, 사진, GPS 포함 활동기록은 기기 분실이나 내보내기 파일 공유 시 여전히 민감할 수 있다.

권장 조치:
- 대상물 정보 내보내기 파일에 민감 정보 포함 경고를 표시한다.
- 필요 시 앱 잠금 또는 재인증 UX를 검토한다.

완료 기준:
- 내보내기 전에 민감 정보 포함 여부가 명확히 안내된다.
- 공용/공유 기기 사용 시 추가 잠금 정책 필요 여부가 결정된다.

## 우선순위

1. Cloudflare WAF rate limiting 설정
2. Worker CI secret/Cloudflare 바인딩 등록 확인
3. 운영 API smoke workflow 실패 알림 확인
4. 민방위/지진해일 원본 기준일 추출/갱신 절차 보강
5. 보안 헤더를 적용할 수 있는 호스팅 구조 검토
6. 민감 데이터 내보내기 경고/기기 잠금 검토
