import { useState, useMemo } from 'react';
import { ShieldAlert, FileText, Siren, Gavel, FileCheck, type LucideIcon } from 'lucide-react';
import { LAW_DEFENSE_DOCS, type DefenseCategory, type LawDefenseDoc } from '../data/lawDefenseDocs';

export default function LawDefenseShield() {
  const [activeCategory, setActiveCategory] = useState<DefenseCategory | 'ALL'>('ALL');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const categories: { id: DefenseCategory | 'ALL'; label: string; icon: LucideIcon }[] = [
    { id: 'ALL', label: '전체 보기', icon: ShieldAlert },
    { id: '강제처분', label: '강제처분·손실보상', icon: Gavel },
    { id: '구급활동', label: '구급활동·기록', icon: FileCheck },
    { id: '현장안전', label: '현장안전·법률지원', icon: Siren },
  ];

  const filteredDocs = useMemo(() => {
    if (activeCategory === 'ALL') return LAW_DEFENSE_DOCS;
    return LAW_DEFENSE_DOCS.filter(doc => doc.category === activeCategory);
  }, [activeCategory]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <p className="text-sm text-on-surface-variant leading-relaxed">
          긴급한 현장 판단을 돕기 위해 현행 법령에서 직접 확인한 범위만 정리했습니다. <br className="hidden sm:block"/>
          <strong className="text-amber-600 dark:text-amber-400">실제 권한·보상·법적 책임 여부</strong>는 상황별 사실관계, 필요성·상당성, 기관 지침과 절차 준수 여부에 따라 달라질 수 있습니다.
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
              type="button"
              aria-pressed={isActive}
              onClick={() => {
                setActiveCategory(cat.id);
                setExpandedId(null);
              }}
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
                type="button"
                aria-expanded={isExpanded}
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
                      근거 법령 및 판단 기준
                    </h4>
                    <div className="p-4 bg-surface-container rounded-xl text-sm leading-relaxed text-on-surface border-l-2 border-amber-500">
                      {doc.fullText.split('\n').map((line, i) => <p key={i} className="mb-1 last:mb-0">{line}</p>)}
                    </div>
                  </div>

                  {/* 공식 법령 확인사항 */}
                  <div>
                    <h4 className="text-sm font-bold text-on-surface mb-2 flex items-center gap-1.5">
                      <Gavel size={16} className="text-emerald-500" />
                      공식 법령 확인사항
                    </h4>
                    <div className="p-4 bg-emerald-500/5 dark:bg-emerald-500/10 rounded-xl text-sm leading-relaxed text-emerald-900 dark:text-emerald-100 border border-emerald-500/20">
                      {doc.officialBasis}
                    </div>
                  </div>

                  {/* 행동 매뉴얼 */}
                  <div>
                    <h4 className="text-sm font-bold text-on-surface mb-2 flex items-center gap-1.5">
                      <Siren size={16} className="text-red-500" />
                      현장 대응 참고 수칙
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

                  {/* 메타데이터 (공식 원문, 기준일) */}
                  <div className="pt-2 flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-on-surface-variant/70 border-t border-outline-variant/10 mt-4">
                    {doc.sources.map(source => (
                      <a
                        key={source.url}
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 underline underline-offset-2 hover:text-primary"
                      >
                          <span className="material-symbols-outlined text-[14px]">link</span>
                          {source.label}
                      </a>
                    ))}
                    <span className="flex items-center gap-1">
                      <span className="material-symbols-outlined text-[14px]">update</span>
                      현행 여부 확인: {doc.lastReviewed}
                    </span>
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
