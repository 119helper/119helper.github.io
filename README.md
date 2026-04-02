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
| Frontend | React 18 + TypeScript + Vite |
| Styling | TailwindCSS (Dark Theme) |
| Map | Kakao Maps JavaScript SDK |
| API | 기상청 API Hub, 국립중앙의료원, 에어코리아, 국토교통부 |
| CI/CD | GitHub Actions → GitHub Pages |
| State | React Hooks (useState/useEffect) |

---

## 🚀 로컬 개발

```bash
git clone https://github.com/119helper/119helper.github.io.git
cd 119helper.github.io
npm install
cp .env.example .env    # API 키 설정
npm run dev -- --host
# → http://localhost:5173
```

---

## 📄 라이선스

이 프로젝트는 소방 현장 활동 지원 목적으로 제작되었습니다.
