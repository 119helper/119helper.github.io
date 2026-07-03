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

### 2. Worker 배포 자동화가 없다

현재 CI는 GitHub Pages 프론트 배포를 자동화하지만, Worker 배포는 `worker/package.json`의 `wrangler deploy` 스크립트에 머물러 있다. 프론트와 Worker가 따로 배포되면 토큰 불일치, secret 누락, 라우트 변경 미반영이 발생할 수 있다.

권장 조치:
- GitHub Actions에 Worker deploy job을 추가한다.
- 필요한 GitHub secret:
  - `CLOUDFLARE_API_TOKEN`
  - `CLOUDFLARE_ACCOUNT_ID`
  - Worker secret들은 Cloudflare 쪽에 선등록한다.
- Worker 배포 후 `/api/health`와 주요 API 1~2개를 smoke test한다.

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

### 4. 정적 데이터 갱신 체계가 일부 데이터에만 있다

소방용수시설은 분기별 변환 워크플로가 있지만, 민방위 대피시설, 지진해일 대피소, 공중화장실 정적 데이터는 별도 갱신 체계가 부족하다. 이 데이터는 현장 의사결정에 쓰일 수 있으므로 오래된 상태가 명확히 표시되어야 한다.

권장 조치:
- `public/data/civil.json`, `public/data/tsunami.json`, `public/data/restrooms/**` 생성일 또는 원본 기준일을 metadata로 함께 저장한다.
- 데이터 갱신 workflow를 추가하거나, 수동 갱신 절차를 문서화한다.
- UI에 "데이터 기준일"을 표시한다.

완료 기준:
- 각 정적 데이터 묶음에 기준일이 포함된다.
- 갱신 실패 또는 기준일 초과 시 화면에 경고가 표시된다.

### 5. 실제 공공 API 계약 검증이 약하다

현재 단위 테스트는 대부분 upstream fetch를 mock한다. 입력 위생, 파싱 안정성은 검증하지만 공공 API 응답 구조 변경이나 인증 상태 변화는 운영에서 먼저 드러날 수 있다.

권장 조치:
- 운영 secret이 있는 scheduled workflow에서 주요 API smoke test를 실행한다.
- 최소 대상:
  - `/api/weather/now`
  - `/api/er/beds`
  - `/api/disaster-msg`
  - `/api/fire/`
  - `/api/building`
- 응답이 비어도 정상일 수 있는 API는 schema/상태 코드 중심으로 검증한다.

완료 기준:
- API 계약 깨짐이 사용자 신고 전에 GitHub Actions 또는 Cloudflare alert로 감지된다.

### 6. 로컬 민감 데이터 보존 정책이 아직 약하다

기기 저장 데이터 삭제 기능은 추가됐지만, 자동 만료나 잠금 기능은 없다. 현장 메모, 대상물 정보, 사진, GPS 포함 활동기록은 기기 분실이나 공용 기기 사용 시 민감할 수 있다.

권장 조치:
- 활동기록/메모/대상물 정보에 선택적 자동 만료 기간을 둔다.
- "공용 기기 모드"를 추가해 민감 데이터 저장을 기본 비활성화한다.
- 대상물 정보 내보내기 파일에 민감 정보 포함 경고를 표시한다.

완료 기준:
- 사용자가 데이터 보존 기간을 선택할 수 있다.
- 공용 기기에서 기록 저장 없이 사용할 수 있다.

## 우선순위

1. Cloudflare WAF rate limiting 설정
2. Worker 배포 자동화
3. 운영 API smoke test 확대
4. 정적 데이터 기준일/갱신 workflow
5. 보안 헤더를 적용할 수 있는 호스팅 구조 검토
6. 로컬 민감 데이터 자동 만료/공용 기기 모드
