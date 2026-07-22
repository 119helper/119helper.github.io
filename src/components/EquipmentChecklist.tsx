import React from 'react';
import { CHECKLIST_SECTIONS } from '../data/equipmentChecklist';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { useAppFeedback } from '../contexts/FeedbackContext';

const EquipmentChecklist: React.FC = () => {
  const { confirmAction, showNotice } = useAppFeedback();
  const [checkedItems, setCheckedItems] = useLocalStorageState<Record<string, boolean>>('119helper-equipment-checklist', {});

  const toggleCheck = (id: string) => {
    setCheckedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const resetChecks = async () => {
    const approved = await confirmAction({
      title: '장비 점검 내역 초기화',
      message: '체크리스트 점검 내역을 모두 초기화할까요? 보통 다음 출근 시 새 점검을 시작할 때 사용합니다.',
      confirmLabel: '초기화',
      tone: 'danger',
    });
    if (!approved) return;
    setCheckedItems({});
    showNotice({ message: '장비 점검 내역을 초기화했습니다.', tone: 'success' });
  };

  const totalItemsCount = CHECKLIST_SECTIONS.reduce((acc, sec) => acc + sec.items.length, 0);
  const checkedItemsCount = Object.values(checkedItems).filter(Boolean).length;
  const progressPercent = totalItemsCount === 0 ? 0 : Math.round((checkedItemsCount / totalItemsCount) * 100);

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20">
      {/* Header section */}
      <div className="bg-gradient-to-r from-slate-900 to-slate-800 rounded-xl p-6 shadow-lg border border-slate-700">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-white flex items-center gap-2">
              <span className="material-symbols-outlined text-orange-400">check_circle</span>
              개인안전장비 점검
            </h2>
            <p className="text-slate-400 text-sm mt-1">현장 활동 전 본보호장비 이상 유무를 매일 확인하세요.</p>
          </div>
          
          <div className="flex items-center gap-4 w-full sm:w-auto mt-2 sm:mt-0">
            <div className="flex flex-col items-end flex-grow sm:flex-grow-0">
              <span className="text-sm text-slate-300 font-bold mb-1">
                점검률: {checkedItemsCount} / {totalItemsCount} ({progressPercent}%)
              </span>
              <div className="w-full sm:w-32 h-2 bg-slate-700 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-500 ease-out ${progressPercent === 100 ? 'bg-green-500' : 'bg-orange-500'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            
            <button 
              onClick={resetChecks}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 outline-none text-white rounded-lg shadow-sm font-medium transition-colors border border-slate-600 flex items-center gap-1 min-w-max"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              초기화
            </button>
          </div>
        </div>
      </div>

      {progressPercent === 100 && (
        <div className="bg-green-500/10 border-l-4 border-green-500 p-4 rounded-md shadow-sm">
          <div className="flex items-center">
            <span className="material-symbols-outlined text-green-500 mr-2">verified</span>
            <p className="text-green-400 font-bold">모든 개인안전장비 점검이 완료되었습니다. 오늘도 안전한 현장활동 되십시오!</p>
          </div>
        </div>
      )}

      {/* Checklist Sections */}
      <div className="space-y-6">
        {CHECKLIST_SECTIONS.map((section) => {
          const sectionTotal = section.items.length;
          const sectionChecked = section.items.filter(item => checkedItems[item.id]).length;
          const sectionDone = sectionTotal === sectionChecked;

          return (
            <div key={section.id} className="bg-slate-800 rounded-xl overflow-hidden shadow-sm border border-slate-700 p-1">
              <div className="bg-slate-900/50 px-4 py-3 border-b border-slate-700 flex justify-between items-center rounded-t-lg">
                <h3 className="font-bold text-lg text-white flex items-center gap-2">
                  {sectionDone && <span className="material-symbols-outlined text-green-500 text-sm">check_circle</span>}
                  {section.title}
                </h3>
                <span className="text-xs font-semibold px-2 py-1 bg-slate-800 text-slate-300 rounded-md border border-slate-600">
                  {sectionChecked} / {sectionTotal}
                </span>
              </div>
              <div className="divide-y divide-slate-700/50">
                {section.items.map(item => (
                  <label 
                    key={item.id} 
                    className="flex items-center px-4 py-4 hover:bg-slate-700/30 cursor-pointer transition-colors group"
                  >
                    <div className="relative flex items-center">
                      <input 
                        type="checkbox" 
                        checked={!!checkedItems[item.id]}
                        onChange={() => toggleCheck(item.id)}
                        className="peer appearance-none w-6 h-6 border-2 border-slate-500 rounded bg-slate-800 checked:bg-orange-500 checked:border-orange-500 cursor-pointer transition-colors"
                      />
                      <span className="material-symbols-outlined absolute left-0 text-white opacity-0 peer-checked:opacity-100 pointer-events-none text-xl" style={{ marginLeft: '2px' }}>
                        check
                      </span>
                    </div>
                    <span className={`ml-4 text-[15px] font-medium transition-colors ${checkedItems[item.id] ? 'text-slate-400 line-through' : 'text-slate-200 group-hover:text-white'}`}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default EquipmentChecklist;
