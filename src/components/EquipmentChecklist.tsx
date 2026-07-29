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
      <div className="ui-card p-5 md:p-6">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <h2 className="ui-page-title">
              <span className="material-symbols-outlined ui-page-title-icon">check_circle</span>
              개인안전장비 점검
            </h2>
            <p className="ui-page-description">현장 활동 전 개인보호장비 이상 유무를 매일 확인하세요.</p>
          </div>
          
          <div className="flex items-center gap-3 w-full sm:w-auto mt-2 sm:mt-0">
            <div className="flex flex-col items-end flex-grow sm:flex-grow-0">
              <span className="text-xs text-on-surface-variant font-bold mb-1.5 tabular-nums">
                점검률: {checkedItemsCount} / {totalItemsCount} ({progressPercent}%)
              </span>
              <div
                className="w-full sm:w-36 h-2 bg-surface-container-high rounded-full overflow-hidden"
                role="progressbar"
                aria-label="개인안전장비 점검률"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progressPercent}
              >
                <div 
                  className={`h-full transition-all duration-500 ease-out ${progressPercent === 100 ? 'bg-success' : 'bg-primary'}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
            
            <button
              type="button"
              onClick={resetChecks}
              className="ui-button ui-button--secondary"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-lg">refresh</span>
              초기화
            </button>
          </div>
        </div>
      </div>

      {progressPercent === 100 && (
        <div className="rounded-xl border border-success/30 bg-success-container p-4 text-on-success-container shadow-sm" role="status">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="material-symbols-outlined text-success">verified</span>
            <p className="text-sm font-bold">모든 개인안전장비 점검이 완료되었습니다. 오늘도 안전한 현장 활동 되십시오.</p>
          </div>
        </div>
      )}

      {/* Checklist Sections */}
      <div className="space-y-4">
        {CHECKLIST_SECTIONS.map((section) => {
          const sectionTotal = section.items.length;
          const sectionChecked = section.items.filter(item => checkedItems[item.id]).length;
          const sectionDone = sectionTotal === sectionChecked;

          return (
            <section key={section.id} className="ui-card overflow-hidden">
              <div className="bg-surface-container px-4 py-3.5 border-b border-outline-variant/70 flex justify-between items-center">
                <h3 className="font-bold text-base text-on-surface flex items-center gap-2">
                  {sectionDone && <span aria-hidden="true" className="material-symbols-outlined text-success text-lg">check_circle</span>}
                  {section.title}
                </h3>
                <span className="ui-badge tabular-nums">
                  {sectionChecked} / {sectionTotal}
                </span>
              </div>
              <div className="divide-y divide-outline-variant/60">
                {section.items.map(item => (
                  <label 
                    key={item.id} 
                    className="flex min-h-14 items-center px-4 py-3.5 hover:bg-surface-container/70 cursor-pointer transition-colors group"
                  >
                    <div className="relative flex items-center">
                      <input 
                        type="checkbox" 
                        checked={!!checkedItems[item.id]}
                        onChange={() => toggleCheck(item.id)}
                        className="peer appearance-none w-6 h-6 border-2 border-outline rounded-md bg-surface-container checked:bg-primary checked:border-primary cursor-pointer transition-colors"
                      />
                      <span aria-hidden="true" className="material-symbols-outlined absolute left-0 text-on-primary opacity-0 peer-checked:opacity-100 pointer-events-none text-xl" style={{ marginLeft: '2px' }}>
                        check
                      </span>
                    </div>
                    <span className={`ml-4 text-sm font-semibold transition-colors ${checkedItems[item.id] ? 'text-on-surface-variant line-through' : 'text-on-surface'}`}>
                      {item.label}
                    </span>
                  </label>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
};

export default EquipmentChecklist;
