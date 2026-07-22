import React, { useEffect, useState } from 'react';
import { fetchWildfires, type WildfireItem } from '../services/wildfireApi';

export const WildfireTicker: React.FC<{ cityName?: string; onClick?: () => void }> = ({ cityName, onClick }) => {
  const [ongoingFires, setOngoingFires] = useState<WildfireItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadFires = async () => {
      setIsLoading(true);
      try {
        const data = await fetchWildfires('200', '1');
        if (!isMounted) return;
        let ongoing = data.filter(f => f.isOngoing);
        if (cityName) {
          ongoing = ongoing.filter(f => {
            if (cityName === '광주') {
              return f.address.includes('광주광역시') || (f.address.includes('광주') && !f.address.includes('경기'));
            }
            return f.address.includes(cityName);
          });
        }
        setOngoingFires(ongoing);
      } catch (err) {
        console.warn('[WildfireTicker] failed:', err);
        if (isMounted) setOngoingFires([]);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };
    loadFires();
    
    // 5분마다 갱신
    const interval = setInterval(loadFires, 5 * 60 * 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [cityName]);

  if (isLoading) return null;
  if (ongoingFires.length === 0) return null;

  const tickerContent = (
    <>
      <div className="flex-shrink-0 font-bold mr-3 hidden sm:block shrink-0 bg-white/20 px-2 py-0.5 rounded text-sm">
        🚨 산불 속보
      </div>
      <div className="flex-shrink-0 sm:hidden mr-2">🚨</div>
      
      {/* CSS 마키(Marquee) 애니메이션 효과 */}
      <div className="flex-1 overflow-hidden whitespace-nowrap">
        <div 
          className="inline-block animate-marquee group-hover:[animation-play-state:paused]"
          style={{ '--marquee-duration': `${Math.max(20, ongoingFires.length * 15)}s` } as React.CSSProperties}
        >
          {ongoingFires.map((fire) => (
            <span key={fire.id} className="mr-8">
              [🔥진화중] {fire.address} ({fire.occurredAt?.length >= 16 ? fire.occurredAt.substring(5, 16) : (fire.occurredAt || '시간 미상')} 발생)
            </span>
          ))}
        </div>
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full bg-red-600 text-white text-left px-4 py-2 mt-2 mb-4 rounded-lg shadow-md flex items-center overflow-hidden relative group animate-pulse cursor-pointer"
        title="산불 현황 탭으로 이동"
      >
        {tickerContent}
      </button>
    );
  }

  return (
    <div
      className="w-full bg-red-600 text-white px-4 py-2 mt-2 mb-4 rounded-lg shadow-md flex items-center overflow-hidden relative group animate-pulse"
      title="진화 중인 산불 속보"
      role="status"
    >
      {tickerContent}
    </div>
  );
};
