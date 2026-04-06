import React from 'react';

interface WindCompassProps {
  windSpeed: number;
  windDirectionDegree: number;
  windDirectionText: string;
  variant?: 'default' | 'glass';
}

export const WindCompass: React.FC<WindCompassProps> = ({ windSpeed, windDirectionDegree, windDirectionText, variant = 'default' }) => {
  // 위험도 판단 (0~4: 양호, 4~9: 주의, 10~: 위험)
  const isDanger = windSpeed >= 10;
  const isWarning = windSpeed >= 4 && windSpeed < 10;
  
  const statusColor = isDanger ? (variant === 'glass' ? 'text-red-400' : 'text-error') : isWarning ? (variant === 'glass' ? 'text-amber-400' : 'text-tertiary') : (variant === 'glass' ? 'text-white' : 'text-primary');
  const statusBg = variant === 'glass' 
    ? (isDanger ? 'bg-red-500/20 border-red-500/40 backdrop-blur-md' : isWarning ? 'bg-amber-500/20 border-amber-500/40 backdrop-blur-md' : 'bg-black/40 border-white/10 backdrop-blur-md')
    : (isDanger ? 'bg-error/10 border-error/30 bg-surface shadow-sm' : isWarning ? 'bg-tertiary/10 border-tertiary/30 bg-surface shadow-sm' : 'bg-primary/10 border-primary/30 bg-surface shadow-sm');
  const statusText = isDanger ? '강풍 위험' : isWarning ? '바람 주의' : '풍속 양호';
  
  const labelTextClass = variant === 'glass' ? 'text-white/70 bg-white/10 border-white/20' : 'text-on-surface-variant bg-surface border-outline-variant';

  return (
    <div className={`flex items-center p-3 rounded-xl border ${statusBg} transition-colors duration-500`}>
      {/* 아날로그 나침반 영역 */}
      <div className={`relative w-16 h-16 mr-4 flex-shrink-0 rounded-full shadow-inner flex items-center justify-center border ${variant === 'glass' ? 'bg-white/10 border-white/20' : 'bg-surface-variant border-outline-variant/50'}`}>
        {/* N S E W 마커 */}
        <span className={`absolute top-0.5 text-[8px] font-bold ${variant === 'glass' ? 'text-white/80' : 'text-on-surface-variant'}`}>N</span>
        <span className={`absolute bottom-0.5 text-[8px] font-bold ${variant === 'glass' ? 'text-white/80' : 'text-on-surface-variant'}`}>S</span>
        <span className={`absolute right-1 text-[8px] font-bold ${variant === 'glass' ? 'text-white/80' : 'text-on-surface-variant'}`}>E</span>
        <span className={`absolute left-1 text-[8px] font-bold ${variant === 'glass' ? 'text-white/80' : 'text-on-surface-variant'}`}>W</span>
        
        {/* 회전하는 화살표 (바람이 불어오는 방향을 가리킴) */}
        <div 
          className="absolute w-full h-full flex flex-col items-center justify-start py-1.5 transition-transform duration-1000 ease-out z-10"
          style={{ transform: `rotate(${windDirectionDegree}deg)` }}
        >
          {/* 화살표 머리 (빨간색) */}
          <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-b-[18px] border-l-transparent border-r-transparent border-b-error" style={{ transform: 'translateY(-2px)' }} />
          {/* 꼬리 부분 (흰색/회색) */}
          <div className="w-0 h-0 border-l-[4px] border-r-[4px] border-t-[18px] border-l-transparent border-r-transparent border-t-on-surface-variant" style={{ transform: 'translateY(2px)' }} />
        </div>
        
        {/* 나침반 중앙 핀 */}
        <div className={`w-2 h-2 rounded-full z-20 shadow-sm border ${variant === 'glass' ? 'bg-white border-black/50' : 'bg-on-background border-surface'}`} />
      </div>

      {/* 정보 영역 */}
      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-xs font-bold px-1.5 py-0.5 rounded shadow-sm border uppercase ${labelTextClass}`}>
            {windDirectionText}풍
          </span>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isDanger ? 'bg-red-500 text-white animate-pulse' : isWarning ? 'bg-amber-500 text-white' : (variant === 'glass' ? 'bg-blue-500/80 text-white' : 'bg-primary text-white')}`}>
            {statusText}
          </span>
        </div>
        
        <div className="flex items-baseline gap-1">
          <span className={`text-2xl font-extrabold font-[Headline] ${statusColor}`}>
            {windSpeed.toFixed(1)}
          </span>
          <span className={`text-sm font-medium ${variant === 'glass' ? 'text-white/70' : 'text-on-surface-variant'}`}>m/s</span>
        </div>
      </div>
    </div>
  );
};
