/*
 * 캐시 폴백 데이터 신선도 배지
 *
 * 네트워크 실패로 마지막 저장값을 표시 중일 때 "○분 전 데이터"를 명시한다.
 * 응급실 병상·기상 같은 실시간 수치를 현재값으로 오인하지 않게 하는 안전장치.
 * at이 null이면 (= 신선한 데이터) 아무것도 렌더링하지 않는다.
 */

import { useEffect, useState } from 'react';

function formatElapsed(at: number): string {
  const mins = Math.max(1, Math.round((Date.now() - at) / 60_000));
  if (mins < 60) return `${mins}분 전`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export default function StaleBadge({ at, className = '' }: { at: number | null; className?: string }) {
  // 표시 중에는 1분마다 경과 시간을 갱신
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!at) return;
    const timer = setInterval(() => setTick(t => t + 1), 60_000);
    return () => clearInterval(timer);
  }, [at]);

  if (!at) return null;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-400 ${className}`}
      title={`네트워크 연결 실패로 마지막 저장값을 표시 중입니다 (${new Date(at).toLocaleString('ko-KR')})`}
    >
      <span className="material-symbols-outlined text-[13px]">history</span>
      {formatElapsed(at)} 데이터
    </span>
  );
}
