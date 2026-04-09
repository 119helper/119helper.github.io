import { useState, useMemo } from 'react';
import { ShieldAlert, Info, FileText, Siren, Gavel, FileCheck } from 'lucide-react';
import { LAW_DEFENSE_DOCS, type DefenseCategory, type LawDefenseDoc } from '../data/lawDefenseDocs';

export default function LawDefenseShield() {
  const [activeCategory, setActiveCategory] = useState<DefenseCategory | 'ALL'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categories: { id: DefenseCategory | 'ALL'; label: string; icon: any }[] = [
    { id: 'ALL', label: '전체 보기', icon: ShieldAlert },
    { id: '강제처분', label: '강제처분/파손 면책', icon: Gavel },
    { id: '구급면책', label: '구급대원 방어권', icon: FileCheck },
    { id: '주취자방어', label: '주취자동폭행 방어', icon: Siren },
  ];

  const filteredDocs = useMemo(() => {
    if (activeCategory === 'ALL') return LAW_DEFENSE_DOCS;
    return LAW_DEFENSE_DOCS.filter(doc => doc.category === activeCategory);
  }, [activeCategory]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-sm text-on-surface-variant leading-relaxed">
          현장에서 주저하는 1초가 생명을 앗아갈 수 있습니다. <br className="hidden sm:block"/>
          이곳의 매뉴얼에 따라 행동하셨다면, 구상권 청구 및 소송으로부터 <strong className="text-amber-600 dark:text-amber-400">100% 면책 및 기관 차원의 보호</strong>를 받으실 수 있습니다.
        </p>
      </div>

      {/* 카테고리 필터 */}
      <div className="flex flex-wrap gap-2">
        {categories.map(cat => {
          const Icon = cat.icon;
          const isActive = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                isActive
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/20 scale-105'
                  : 'bg-surface-container border border-outline-variant/10 text-on-surface-variant hover:bg-surface-container-high'
              }`}
            >
              <Icon size={16} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* 방어망 데이터 리스트 */}
      <div className="space-y-4">
        {filteredDocs.map((doc: LawDefenseDoc) => {
          const isExpanded = expandedId === doc.id;

          return (
            <div 
              key={doc.id}
              className={`bg-surface-container-lowest border rounded-2xl overflow-hidden transition-all duration-300 ${
                isExpanded ? 'border-amber-500/40 shadow-md ring-2 ring-amber-500/10' : 'border-outline-variant/10 hover:border-amber-500/20'
              }`}
            >
              <button
                onClick={() => setExpandedId(isExpanded ? null : doc.id)}
                className="w-full text-left p-5 flex items-start gap-4"
              >
                <div className={`p-3 rounded-2xl shrink-0 transition-colors ${
                  isExpanded ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' : 'bg-surface-container-high text-on-surface'
                }`}>
                  <ShieldAlert size={24} />
                </div>
                
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-[10px] bg-amber-500/10 text-amber-700 dark:text-amber-300 px-2 py-0.5 rounded-full font-bold">
                      {doc.category}
                    </span>
                    <span className="text-xs text-on-surface-variant font-mono truncate">
                      {doc.coreLaw}
                    </span>
                  </div>
                  <h3 className={`text-lg font-extrabold transition-colors ${isExpanded ? 'text-amber-600 dark:text-amber-400' : 'text-on-surface'}`}>
                    {doc.title}
                  </h3>
                  {!isExpanded && (
                    <p className="text-sm text-on-surface-variant mt-2 line-clamp-2 leading-relaxed">
                      {doc.summary}
                    </p>
                  )}
                </div>
                
                <span className={`material-symbols-outlined text-on-surface-variant transition-transform duration-300 shrink-0 ${isExpanded ? 'rotate-180' : ''}`}>
                  expand_more
                </span>
              </button>

              {isExpanded && (
                <div className="px-5 pb-5 border-t border-outline-variant/10 pt-4 space-y-6">
                  {/* 근거 법령 및 해설 */}
                  <div>
                    <h4 className="text-sm font-bold text-on-surface mb-2 flex items-center gap-1.5">
                      <FileText size={16} className="text-amber-500" />
                      근거 법령 및 면책 원리
                    </h4>
                    <div className="p-4 bg-surface-container rounded-xl text-sm leading-relaxed text-on-surface border-l-2 border-amber-500">
                      {doc.fullText.split('\n').map((line, i) => <p key={i} className="mb-1 last:mb-0">{line}</p>)}
                    </div>
                  </div>

                  {/* 승소 판례 */}
                  <div>
                    <h4 className="text-sm font-bold text-on-surface mb-2 flex items-center gap-1.5">
                      <Gavel size={16} className="text-emerald-500" />
                      승소 및 면책 판례
                    </h4>
                    <div className="p-4 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-xl text-sm leading-relaxed text-emerald-900 dark:text-emerald-100 border border-emerald-500/20">
                      <strong>실제 사례: </strong> {doc.winPrecedent}
                    </div>
                  </div>

                  {/* 행동 매뉴얼 */}
                  <div>
                    <h4 className="text-sm font-bold text-on-surface mb-2 flex items-center gap-1.5">
                      <Siren size={16} className="text-red-500" />
                      현장 즉각 행동 매뉴얼 (대응 수칙)
                    </h4>
                    <div className="bg-surface-container rounded-xl border border-outline-variant/20 overflow-hidden">
                      {doc.actionManual.map((step, idx) => (
                        <div key={idx} className="flex gap-3 p-3 border-b border-outline-variant/10 last:border-0 hover:bg-surface-container-high transition-colors">
                          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-red-100 text-red-600 dark:bg-red-500/20 dark:text-red-400 font-black text-xs shrink-0">
                            {idx + 1}
                          </span>
                          <p className="text-sm font-medium text-on-surface leading-relaxed pt-0.5">
                            {step}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
