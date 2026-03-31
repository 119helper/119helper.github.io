import { useState, useEffect } from 'react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  city: string;
  onCityChange: (c: string) => void;
  cityNames: Record<string, string>;
}

export default function SettingsModal({ isOpen, onClose, city, onCityChange, cityNames }: SettingsModalProps) {
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState('5');
  const [theme, setTheme] = useState('dark');

  useEffect(() => {
    setSoundEnabled(localStorage.getItem('119helper-sound') === 'true');
    setRefreshInterval(localStorage.getItem('119helper-refresh') || '5');
    setTheme(localStorage.getItem('119helper-theme') || 'dark');
  }, [isOpen]);

  const handleSave = () => {
    localStorage.setItem('119helper-sound', soundEnabled.toString());
    localStorage.setItem('119helper-refresh', refreshInterval);
    localStorage.setItem('119helper-theme', theme);
    // 향후 다크/라이트 모드 지원을 위한 플러그
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-surface-container border border-outline-variant/20 rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low">
          <h2 className="text-lg font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">settings</span>
            환경 설정
          </h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-container-high transition-colors">
            <span className="material-symbols-outlined text-on-surface-variant">close</span>
          </button>
        </div>
        
        <div className="p-5 space-y-6">
          {/* Section 1 */}
          <div>
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3 block">알림 설정</label>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-on-surface">긴급 상황 경고음</p>
                <p className="text-xs text-on-surface-variant">재난 알림 / 중증 환자 발생 시</p>
              </div>
              <button 
                onClick={() => setSoundEnabled(!soundEnabled)}
                className={`w-11 h-6 rounded-full transition-colors relative ${soundEnabled ? 'bg-primary' : 'bg-surface-container-highest'}`}
              >
                <span className={`absolute top-1 w-4 h-4 rounded-full transition-all ${soundEnabled ? 'left-6 bg-on-primary' : 'left-1 bg-on-surface-variant'}`} />
              </button>
            </div>
          </div>

          {/* Section 2 */}
          <div>
            <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-3 block">데이터 설정</label>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-on-surface">자동 새로고침</p>
                  <p className="text-xs text-on-surface-variant">데이터 갱신 주기</p>
                </div>
                <select 
                  value={refreshInterval}
                  onChange={e => setRefreshInterval(e.target.value)}
                  className="bg-surface-container-high text-on-surface text-sm rounded-lg px-2 py-1.5 border border-outline-variant/20 focus:outline-none focus:border-primary"
                >
                  <option value="1">1분마다</option>
                  <option value="5">5분마다</option>
                  <option value="10">10분마다</option>
                  <option value="0">수동 갱신</option>
                </select>
              </div>
              
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-on-surface">기본 관심 지역</p>
                  <p className="text-xs text-on-surface-variant">접속 시 최초 로딩 지역</p>
                </div>
                <select 
                  value={city}
                  onChange={e => onCityChange(e.target.value)}
                  className="bg-surface-container-high text-on-surface text-sm rounded-lg px-2 py-1.5 border border-outline-variant/20 focus:outline-none focus:border-primary"
                >
                  {Object.entries(cityNames).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t border-outline-variant/20 bg-surface-container-low flex justify-end gap-2">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-on-surface-variant hover:bg-surface-container-high rounded-xl transition-colors"
          >
            취소
          </button>
          <button 
            onClick={handleSave}
            className="px-4 py-2 text-sm font-bold bg-primary text-on-primary hover:bg-primary/90 rounded-xl shadow-lg shadow-primary/20 transition-all cursor-pointer"
          >
            저장하기
          </button>
        </div>
      </div>
    </div>
  );
}
