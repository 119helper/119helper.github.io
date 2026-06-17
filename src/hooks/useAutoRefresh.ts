/**
 * 자동 새로고침 루프 훅
 *
 * App.tsx에서 분리. 다음 세 가지 효과를 캡슐화한다:
 *   1) 마운트 + refresh 콜백 변경(도시/구 변경) 시 즉시 1회 갱신
 *   2) refreshInterval(분)마다 주기 갱신 (0 이하면 수동 모드)
 *   3) 설정 변경 감지 — 다른 탭은 storage 이벤트, 같은 탭은 2초 폴링
 *
 * refreshInterval 상태와 갱신 주기는 이 훅이 전적으로 소유한다.
 */

import { useEffect, useState } from 'react';

const REFRESH_SETTING_KEY = '119helper-refresh';
const POLL_MS = 2000;

/** localStorage의 갱신 주기 설정을 안전하게 읽는다 (잘못된 값이면 5분) */
export function getSafeRefreshInterval(): number {
  const raw = Number.parseInt(localStorage.getItem(REFRESH_SETTING_KEY) || '5', 10);
  if (!Number.isFinite(raw) || raw < 0) return 5;
  return raw;
}

export function useAutoRefresh(refresh: () => void): { refreshInterval: number } {
  const [refreshInterval, setRefreshInterval] = useState(getSafeRefreshInterval);

  // 1) 최초 + refresh 콜백 변경(도시/구 변경) 시 즉시 갱신
  useEffect(() => {
    refresh();
  }, [refresh]);

  // 2) 주기 갱신 (0 이하 = 수동)
  useEffect(() => {
    if (refreshInterval <= 0) return;
    const id = setInterval(() => {
      refresh();
    }, refreshInterval * 60 * 1000);
    return () => clearInterval(id);
  }, [refreshInterval, refresh]);

  // 3) 설정 변경 감지 (다른 탭: storage 이벤트, 같은 탭: 폴링)
  useEffect(() => {
    const handleStorage = () => setRefreshInterval(getSafeRefreshInterval());
    window.addEventListener('storage', handleStorage);
    const pollId = setInterval(() => {
      const val = getSafeRefreshInterval();
      setRefreshInterval(prev => (prev !== val ? val : prev));
    }, POLL_MS);
    return () => {
      window.removeEventListener('storage', handleStorage);
      clearInterval(pollId);
    };
  }, []);

  return { refreshInterval };
}
