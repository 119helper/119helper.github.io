interface MedicalDisclaimerProps {
  /** 데이터 출처 (예: '소방청 119구급대원 현장응급처치 표준지침') */
  source: string;
  /** 출처 개정/발간 연도 (예: 2023) */
  revisedYear: number | string;
  /** 추가 안내 문구 (선택) */
  note?: string;
}

/**
 * 임상 정보 화면 최상단에 강제로 노출하는 의료 면책 배너.
 * 사용자가 의료 비전문가이므로 "참고용 · 현장 판단/의료지도 우선" + 출처/개정연도를 항상 표기한다.
 */
export default function MedicalDisclaimer({ source, revisedYear, note }: MedicalDisclaimerProps) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 border border-amber-500/40 bg-amber-500/10 rounded-xl p-3 md:p-4"
    >
      <span className="material-symbols-outlined text-amber-700 dark:text-amber-300 text-xl shrink-0 mt-0.5">warning</span>
      <div className="text-sm leading-relaxed">
        <p className="font-bold text-amber-800 dark:text-amber-200">
          참고용 정보입니다 — 실제 처치는 의료지도·표준지침·현장 판단을 우선하십시오.
        </p>
        <p className="text-on-surface-variant mt-1">
          출처: {source} ({revisedYear})
        </p>
        {note && <p className="text-on-surface-variant mt-1">{note}</p>}
      </div>
    </div>
  );
}
