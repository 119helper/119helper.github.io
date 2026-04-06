import React, { useEffect, useState } from 'react';
import { fetchWildfires, type WildfireItem } from '../services/wildfireApi';

export const WildfireTicker: React.FC = () => {
  const [ongoingFires, setOngoingFires] = useState<WildfireItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const loadFires = async () => {
      setIsLoading(true);
      const data = await fetchWildfires('20', '1');
      if (isMounted) {
        setOngoingFires(data.filter(f => f.isOngoing));
        setIsLoading(false);
      }
    };
    loadFires();
    
    // 5분마다 갱신
    const interval = setInterval(loadFires, 5 * 60 * 1000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  if (isLoading) return null;
  if (ongoingFires.length === 0) return null;

  return (
    <div className="w-full bg-red-600 text-white px-4 py-2 mt-2 mb-4 rounded-lg shadow-md flex items-center overflow-hidden relative group cursor-pointer animate-pulse"
         title="클릭 시 산불 현황 탭으로 이동 (미구현)">
      <div className="flex-shrink-0 font-bold mr-3 hidden sm:block shrink-0 bg-white/20 px-2 py-0.5 rounded text-sm">
        🚨 산불 속보
      </div>
      <div className="flex-shrink-0 sm:hidden mr-2">🚨</div>
      
      {/* CSS 마키(Marquee) 애니메이션 효과 */}
      <div className="flex-1 overflow-hidden whitespace-nowrap">
        <div className="inline-block animate-[marquee_20s_linear_infinite] group-hover:pause">
          {ongoingFires.map((fire) => (
            <span key={fire.id} className="mr-8">
              [🔥진화중] {fire.address} ({fire.occurredAt.substring(5, 16)} 발생)
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};
