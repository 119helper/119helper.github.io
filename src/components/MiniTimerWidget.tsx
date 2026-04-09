import { useTimer } from '../contexts/TimerContext';

interface Props {
  onNavigate: (id: any, subId?: string) => void;
}

export default function MiniTimerWidget({ onNavigate }: Props) {
  const { 
    timers, stopwatchStart, stopwatchElapsed, 
    formatTimeMs, formatTime, 
    WARN_THRESHOLD, DANGER_THRESHOLD 
  } = useTimer();

  const hasActivity = stopwatchStart !== null || timers.length > 0;

  if (!hasActivity) {
    return (
      <div 
        onClick={() => onNavigate('field-timer')}
        className="bg-surface-container-lowest border border-outline-variant/10 rounded-2xl p-4 hover:border-primary/20 hover:bg-surface-container/30 transition-all cursor-pointer group flex items-center justify-between shadow-sm"
      >
        <div className="flex items-center gap-3">
          <div className="p-2 bg-surface-container rounded-lg group-hover:bg-primary/10 transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant group-hover:text-primary transition-colors text-xl">timer</span>
          </div>
          <div>
            <h3 className="text-sm font-bold text-on-surface">현장 타이머</h3>
            <p className="text-[10px] text-on-surface-variant mt-0.5">활동 기록 대기 중</p>
          </div>
        </div>
        <button className="text-xs font-bold text-primary bg-primary/5 px-3 py-1.5 rounded-lg group-hover:bg-primary/15 transition-colors flex items-center gap-1">
          시작
        </button>
      </div>
    );
  }

  // Active State
  return (
    <div 
      onClick={() => onNavigate('field-timer')}
      className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-4 sm:p-5 hover:border-primary/40 transition-all cursor-pointer shadow-lg shadow-black/5 flex flex-col gap-3 relative overflow-hidden group"
    >
      <div className="flex items-center justify-between z-10 w-full relative">
        <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-2">
                <span className="relative flex h-2 w-2 mr-1">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                </span>
                <h3 className="text-sm font-bold text-on-surface">작전 진행 중</h3>
            </div>
            <span className="material-symbols-outlined text-on-surface-variant opacity-0 group-hover:opacity-100 transition-opacity text-[18px]">open_in_new</span>
        </div>
      </div>

      <div className="flex gap-4 items-center z-10">
        {stopwatchStart ? (
          <div className="flex-1 mt-1">
            <p className="text-[10px] text-on-surface-variant mb-1 font-bold">출동 경과 시간</p>
            <p className="text-4xl font-black font-mono tracking-tight text-blue-400 tabular-nums">
              {formatTimeMs(stopwatchElapsed)}
            </p>
          </div>
        ) : (
          <div className="flex-1 mt-1">
            <p className="text-[10px] text-on-surface-variant mb-1 font-bold">최단 잔여 시간</p>
            {(() => {
              const sorted = [...timers].sort((a,b) => a.remaining - b.remaining);
              const shortest = sorted[0];
              const isDanger = shortest.remaining <= shortest.totalSeconds * DANGER_THRESHOLD;
              return (
                <p className={`text-4xl font-black font-mono tracking-tight tabular-nums ${shortest.remaining <= 0 || isDanger ? 'text-red-400' : 'text-green-400'}`}>
                  {formatTime(shortest.remaining)}
                </p>
              );
            })()}
          </div>
        )}
      </div>

      {timers.length > 0 && (
        <div className="space-y-2.5 mt-2 z-10">
          {[...timers].sort((a,b) => a.remaining - b.remaining).slice(0, 2).map(t => {
            const ratio = t.remaining / t.totalSeconds;
            const progress = t.totalSeconds > 0 ? ((t.totalSeconds - t.remaining) / t.totalSeconds) * 100 : 0;
            const isDanger = ratio <= DANGER_THRESHOLD;
            const isWarn = ratio <= WARN_THRESHOLD;
            const colorClass = t.remaining <= 0 ? 'bg-red-500' : isDanger ? 'bg-red-500' : isWarn ? 'bg-yellow-500' : 'bg-green-500';

            return (
              <div key={t.id} className="w-full bg-surface-container/30 px-3 py-2 rounded-xl">
                <div className="flex justify-between items-end mb-1.5">
                  <span className="text-[10px] font-bold text-on-surface-variant truncate pr-2 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px] opacity-70">air</span>
                      {t.label}
                  </span>
                  <span className={`text-[11px] font-black font-mono tracking-wider tabular-nums ${t.remaining <= 0 || isDanger ? 'text-red-400' : 'text-on-surface'}`}>
                    {formatTime(t.remaining)}
                  </span>
                </div>
                <div className="h-1 w-full bg-surface-container-highest rounded-full overflow-hidden">
                  <div 
                    className={`h-full transition-all duration-1000 ${colorClass} ${isDanger && t.remaining > 0 ? 'animate-pulse' : ''}`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>
            );
          })}
          {timers.length > 2 && (
            <p className="text-[10px] text-center text-on-surface-variant pt-1 font-bold">+ 외 {timers.length - 2}개 공기호흡기</p>
          )}
        </div>
      )}

      {/* Decorative gradient background */}
      <div className="absolute -right-10 -bottom-10 w-40 h-40 bg-primary/5 rounded-full blur-3xl z-0 pointer-events-none" />
    </div>
  );
}
