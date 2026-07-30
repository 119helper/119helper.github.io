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
- 광주 소방용수 지역 원본은 `scripts/sync-firewater-regional-overlays.mjs`에서
  교체와 부분 교차검증을 분리한다.
  - 광산구 2026-05-07 원본 1,560행은 기존 관할을 교체하며, 검증된 이전 좌표 보충을
    포함해 지도 1,559곳을 제공한다.
  - 북구 2025-08-22 원본 1,031행은 좌표가 없으므로 기존 1,088행을 교체하지 않는다.
    시설유형코드와 공백 제거 도로명주소가 원본·기존 양쪽에서 한 행인 698곳에만
    provenance를 추가하고, 미일치 246행과 중복/다의 87행은 수량만 남긴다.
  - 원본일·원본/대상/매칭 집계, 정렬한 source→target 튜플 지문, 기존 1,088행
    주소·좌표 본문 지문을 registry와 manifest에서 exact 비교한다. 공개 페이지의 현재
    `publicDataDetailPk`가 pinned UUID와 달라져도 자동 채택하지 않고 갱신을 실패시킨다.
- 공중화장실 정적 데이터 갱신 workflow를 추가했다.
  - 관련 스크립트: `scripts/sync-restrooms.js`
  - 원본 기준일 필드를 추출해 `public/data/manifest.json`의 `restrooms.sourceDate`에 기록한다.
  - LOCALDATA 전국 CSV와 서울시·서울교통공사·제주시·부산 동래구 공식 CSV, 부산
    갈맷길 공식 SHP, 대전 서구 공식 JSON API를 키 없이 내려받는다.
  - 기본 지역 좌표는 이름+도로명/지번주소의 고유 1:1 일치와 관할 좌표 경계를 모두
    통과한 중앙 관리번호에만 보충한다.
  - 서울시 표기 차이 예외는 유일한 정확 주소, 4자 이상 정규화 이름의 상호 포함,
    중복 원천 행 좌표 일치를 모두 요구한다. 서울교통공사 역명은 `역`을 한 번만 붙인
    3자 이상 이름과 유일한 정확 주소를 함께 요구한다. 주소·이름·좌표가 모호하면
    반영하지 않으며 출처별 엄격/예외/거절 수량을 별도 인덱스에 남긴다.
  - API 성공코드·전체 행 수신·필수 필드·행별 기준일·좌표 경계뿐 아니라 출처별 최소
    유효좌표/매칭 수와 최대 오류/모호성 수를 벗어나면 생성물을 갱신하지 않는다.
  - 부산 도로명주소 건물 대표점은 시설 좌표와 분리한 주소점 오버레이로만 제공한다.
    신규 222곳과 기존 오류 좌표 교정 13곳의 원천·매칭·교체 이력을 원장에 보존하고,
    앱에서는 실제 화장실 위치와 다를 수 있다는 경고를 표시한다.
  - 대구·세종·울산의 전국 표준 호스트 시설 주소점 82곳과 용산 동주민센터 주소점
    5곳도 `address_point` 근사 계층으로만 제공한다. 두 그룹은 다운로드 방식·기준일·
    도시·출처 집합을 따로 검증한다.
  - 표준 JSON은 서비스 테이블·필수 컬럼·페이지별 예상 행 수·전체 행 수를 모두
    검사한다. 도로명/지번 키와 숫자 하이픈을 보존해 주소 충돌을 막고, 전통시장은
    `PBLIC_TOILET_YN=Y`만 허용한다.
  - 호스트 주소점은 primary 원천, 안정 레코드 키, 검토된 이름·주소키, 좌표,
    비-primary 교차검증 레코드까지 SHA-256 지문으로 고정한다. 각 레코드의 좌표 거리와
    원천 지문을 다시 계산하고, 출처×도시별 유효 고유행 90% 하한과 출처별 최신 기준일
    하한을 함께 검사한다. 원천 구조나 검토 튜플이 바뀌면 자동 채택하지 않고 workflow를
    실패시킨다.
  - 갱신 workflow는 호스트 주소점 단위 테스트와
    `public/data/restroom-official-host-address-points.json`의 diff·커밋까지 같은
    생성물 범위에 포함한다.
- 정적 데이터 기준일/생성일 manifest를 추가하고, 시설 조회/오프라인 설정 화면에 표시한다.
  - `public/firewater/manifest.json`
  - `public/data/manifest.json`
- 공용 기기 모드가 대상물 사진 IndexedDB 저장도 차단하도록 보강했다.
  - 관련 테스트: `src/services/preplanPhotos.test.ts`
- Worker 공공 API 키 인코딩 처리를 일부 구버전 라우트에서도 공통 헬퍼로 통일했다.
  - 대상: 대기질, 건축물대장, 기상청 API Hub
  - 관련 테스트: `worker/src/routes/proxyInput.test.ts`, `worker/src/routes/weather.test.ts`
- 뉴스 프록시의 og:image 보강 fetch와 썸네일 전달을 제한했다.
  - 최대 8개 item, 동시 4개, 2.5초 timeout으로 원 언론사 HTML 앞부분 128KB만 읽고
    로컬/사설 IP를 차단한다.
  - 브라우저는 외부 언론사 URL을 직접 열지 않고 인증된 Worker 프록시를 거쳐 `blob:`으로
    표시한다. 프록시는 래스터 이미지 MIME만 허용하고 응답당 3MB로 제한한다.
- Worker 문자열 입력 정규화가 HTML 태그 조각을 먼저 제거하도록 개선됐다.
- Worker의 직접 응답, Edge Cache 응답, XML 응답에도 중앙 CORS와 보안 헤더가 일관되게 적용된다.
  - 관련 테스트: `worker/src/middleware/cors.test.ts`
- 운영 Worker smoke test가 대표 공공 API 계약까지 감시하도록 확대됐다.
  - 추가 대상: 대기질, 공휴일, 화재피해, 다중이용업소, 산불위험, 산불정보, 사설 구급차, 소비자 위해, 연간화재통계 연도 매핑
  - 각 요청은 20초 timeout과 응답 구조 검증을 가진다.
- 구급통계 본부명과 응답 계약을 원 API로 전수 교정했다.
  - 2025-12 기준 앱 지원 17개 시·도 모두 실제 1건 이상 응답을 확인한다.
  - 6시간 주기 smoke가 17개 지역의 본부명, `gutCo` 응답 필드, 최신 제공월 자동 탐지를 감시한다.
  - 상세 구급정보는 원 명세대로 소방서 필수 조건과 `gutYm`/`stmtYm`을 구분한다.
- 공식 자료가 새로 공개됐는데 앱이 놓치는 경우를 감지하는 감사를 추가했다.
  - `scripts/audit-official-data-freshness.mjs`
  - 연간화재통계, 다중이용업소, 지역별 화재피해 공식 범위가 앱보다 앞서면 scheduled workflow가 실패한다.
  - 공급기관 원본 자체가 오래된 지진해일·소방용수는 실패로 위장하지 않고 `WARN`과 화면 경고로 구분한다.
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
- NFDS 공개 통계 화면의 시도×월 조회를 정적 스냅샷으로 보존한다.
  - 2024·2025 완결과 2026 누계를 제공하고, 월 총계와 시도 합계가 다르면 갱신을 실패시킨다.
  - 최신 집계와 2019~2023 개별 사고 목록은 별도 화면 계약으로 제공한다.
  - 매일 저빈도 갱신 workflow가 `collectedAt`과 자료기준일을 함께 저장한다.
- 소방청 공개본에서 2024·2025 경상북도 위험물 도 합계를 확보했다.
  - 2024 소방서 상세는 변경금지 통계연보의 교차검증에만 사용하고 앱에는 전재하지 않는다.
  - 2025 도 합계와 재가공 가능한 KOSIS 2023 소방서 상세를 합산·비례배분하지 않는다.

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

### 3. 지진해일은 최신이지만 공개 API와 관리대장 수가 다르다

지진해일 대피소 행에는 기준일 필드가 없어 재난안전데이터공유플랫폼 상세 메타데이터의
`updtymd`를 사용한다. 2026-07-30 원본 갱신일을 확인했고 DSSP-IF-10944를 운영 프록시로
캐시 우회 전수 조회한 결과도 강원·경북·부산·울산 647건이었다. 체크인 데이터와 복합
식별자·전 필드·정규화 SHA-256이 모두 같았지만, 행정안전부 점검 발표 관리대장은
680개소다.

권장 조치:
- 33곳을 임의 생성하지 않고 화면과 manifest에서 차이를 계속 표시한다.
- 국민안전24 공개 목록은 별칭·분할 차이 검토에만 사용하고, 재배포 조건이 불명확한
  데이터를 앱 원본에 합치지 않는다.
- 680행 공식 공개 명부 또는 DSSP 정정본이 게시되는지 정기 감사한다.
- 원본 갱신 주기와 맞춰 매일 전수 동기화하고, 체크인 데이터의 정규화 SHA-256을
  manifest와 감사 스크립트에서 대조한다.
- 수동 기준일을 쓰면 `sourceDateSource=workflow manual override`를 남긴다.
- 향후 행별 기준일 필드가 제공되면 메타데이터 날짜보다 행별 기준일을 우선한다.

완료 기준:
- 공개 API 행과 680개 관리대장을 식별자 기준으로 대조한다.
- 차이 사유가 확인되거나 API가 관리대장과 일치한다.
- 갱신 실패·기준일 초과·수량 불일치가 서로 다른 경고로 표시된다.

### 4. 다중이용업소 승인 API와 검증된 정적 폴백을 함께 사용한다

2026-07-29 현재 기존 `소방청_다중이용업소 현황` API의 최신 집계는 2024년이다. 별도 데이터셋
`소방청_다중이용업소 영업장별 고유 일련번호_20250915`의 자동변환 API를 추가 신청해
자동 승인과 HTTP 200 응답(`totalCount=154873`)을 확인했다.

- CP949 CSV 154,873행을 파싱하고 영업상태 `정상` 113,235행만 사용한다.
- 앱 지원 9개 지역은 주소 첫 행정구역명으로 구분해 업종별 정적 집계로 체크인한다.
- 전남광주통합특별시 요청은 원본 기준시점의 종전 광주 5개 구 집계와 연결한다.
- 통합 시도명은 공급자 요청에만 사용하고, 사용자 화면에서는 광주 5개 구 권역을 `광주광역시`로 표시한다.
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

### 6. ITS 도로 재난 API는 운영 egress 경로가 필요하다

2026-07-31 확인 결과 국가교통정보센터 공식 공개키 `test`는 요청 좌표·기간과 무관한
고정 샘플 3건을 반환하므로 실시간 데이터로 사용할 수 없다. Worker는 이 키를
명시적으로 거부해 샘플을 현장 정보로 표시하지 않는다. 로컬 국내 회선에서는 공식
`https://openapi.its.go.kr:9443/disasterInfo`가 빠르게 응답하지만 Cloudflare Worker
egress에서는 연결이 timeout되므로, 운영 화면은 이 경로를 0건이 아닌 조회 불가로
fail-closed 처리한다.

권장 조치:
- 국가교통정보센터에서 실제 운영 인증키를 발급받는다.
- Cloudflare에서 공식 원 API에 직접 연결되는지 다시 확인한다.
- 계속 차단되면 국내 egress relay를 운영하고, TLS·인증키·rate limit·장애 감시를
  Worker와 동일한 수준으로 적용한다.
- 배포 smoke에서는 이 경로를 비차단 감시하되, 6시간 주기 smoke 실패 알림은 유지한다.

완료 기준:
- 발급 키로 실제 현재 기간·좌표 조건이 반영된 응답을 확인한다.
- 운영 Worker 경로가 정규화 계약을 통과하고, 샘플 데이터가 아닌 실제 조회 결과임을
  운영 smoke에서 검증한다.

### 7. 로컬 민감 데이터 기기 보호는 추가 보완이 필요하다

기기 저장 데이터 삭제, 자동 만료, 공용 기기 모드, 대상물 사진 저장 차단, 내보내기/복사 전 민감정보 경고, 앱 잠금은 추가됐다. 다만 브라우저 기반 앱 잠금은 OS/기기 암호나 저장소 암호화를 대체하지 않는다.

권장 조치:
- 더 강한 보호가 필요하면 기기 자체 잠금, MDM, 브라우저 프로필 분리 같은 운영 정책을 사용한다.

완료 기준:
- 무료 공개 프로젝트 범위에서는 앱 잠금으로 캐주얼 접근 방어를 제공하고, 강한 기기 보안은 운영 정책으로 분리한다.

## 우선순위

1. ITS 운영 인증키 및 국내 egress 경로 확보
2. 운영 API smoke workflow 실패 알림 확인
3. 지진해일 API 수정일 확인 후 manifest 갱신 유지
4. 봇/스크래핑 남용이 실제로 발생할 때만 도메인/WAF/Turnstile 재검토
