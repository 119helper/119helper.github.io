---
description: 웹 테스트 시 도구 선택 규칙 (Testing tool preference)
---

# 웹 테스트 도구 선택 규칙

## 핵심 원칙
- **기본값: `mcp_puppeteer` 사용** (navigate, evaluate, screenshot, click, fill 등)
- **`browser_subagent`는 절대 최후의 수단으로만 사용**

## 이유
1. `browser_subagent`는 토큰 소모가 매우 크고 느림
2. 무거운 페이지(서울 소방서 데이터 등) 로딩 시 무한 로딩 걸림
3. 백그라운드 로딩이 타임아웃되면 멈춤

## 도구 사용 가이드

| 작업 | 사용 도구 |
|------|----------|
| 페이지 이동/로딩 확인 | `mcp_puppeteer_puppeteer_navigate` |
| API 응답/DOM 확인 | `mcp_puppeteer_puppeteer_evaluate` |
| 스크린샷 | `mcp_puppeteer_puppeteer_screenshot` |
| 클릭/입력/폼 | `mcp_puppeteer_puppeteer_click`, `_fill`, `_select` |
| 복잡한 멀티스텝 UI 시나리오 (정말 필요할 때만) | `browser_subagent` |

## 주의사항
- 서울 데이터처럼 무거운 페이지 테스트 시 `puppeteer_evaluate`로 fetch API 직접 호출하는 것이 안전
- 페이지 로딩 완료를 기다릴 필요 있으면 evaluate에서 확인
