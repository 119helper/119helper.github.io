/*
 * A등급(오프라인 필수) 화면 청크 사전 로드
 *
 * 코드 스플리팅 후 각 화면 청크는 "방문해야" 서비스 워커 캐시에 들어간다.
 * 현장에서 처음 여는 탭이 오프라인이면 로딩이 실패하므로,
 * 신호가 있을 때(첫 로드 직후 유휴 시간) 핵심 화면을 미리 받아둔다.
 *
 * 대상: 오프라인에서 100% 동작해야 하는 정적/계산 기능
 *   - 대시보드 (오프라인 새로고침 기본 진입 화면)
 *   - 계산기 (수압·마찰손실·공기호흡기, Hazmat 이격거리, 단위변환 포함)
 *   - 대응 매뉴얼 (무전코드, SOP 체크리스트 포함)
 *   - 현장 타이머
 *   - 장비점검
 *   - 실전 법률방어 (정적 문서)
 *
 * 동적 import는 App.tsx의 lazy()와 동일한 모듈을 가리키므로
 * 같은 청크로 해석된다 — 별도 청크가 생기지 않는다.
 */

const CRITICAL_VIEW_LOADERS: Array<() => Promise<unknown>> = [
  () => import('../components/DashboardView'),
  () => import('../components/Calculators'),
  () => import('../components/ManualView'),
  () => import('../components/FieldTimer'),
  () => import('../components/EquipmentChecklist'),
  () => import('../components/LawDashboard'),
];

let started = false;

export function prefetchCriticalViews() {
  if (started) return;
  started = true;

  const run = async () => {
    // 오프라인이면 시도해봐야 실패만 쌓임 — 다시 온라인 되면 그때 받는다
    if (!navigator.onLine) {
      window.addEventListener('online', () => { started = false; prefetchCriticalViews(); }, { once: true });
      return;
    }
    // 순차 로드: 초기 렌더링/실데이터 요청과 대역폭 경쟁 최소화
    for (const load of CRITICAL_VIEW_LOADERS) {
      try {
        await load();
      } catch (err) {
        console.warn('[prefetch] 핵심 화면 사전 로드 실패 (다음 온라인 시 재시도):', err);
        started = false;
        window.addEventListener('online', () => prefetchCriticalViews(), { once: true });
        return;
      }
    }
  };

  // 첫 페인트와 초기 API 호출이 끝난 뒤 유휴 시간에 실행
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(() => run(), { timeout: 10_000 });
  } else {
    setTimeout(run, 4_000);
  }
}
