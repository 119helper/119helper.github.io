import type { ReactNode } from 'react';

type DataStateTone = 'loading' | 'empty' | 'error' | 'guidance';

interface DataStateAction {
  label: string;
  onClick: () => void;
  icon?: string;
}

interface DataStatePanelProps {
  title: string;
  description?: ReactNode;
  icon: string;
  tone?: DataStateTone;
  action?: DataStateAction;
  secondaryAction?: DataStateAction;
  className?: string;
}

const toneStyles: Record<DataStateTone, { panel: string; icon: string; action: string }> = {
  loading: {
    panel: 'border-primary/20 bg-primary/5',
    icon: 'bg-primary/10 text-primary',
    action: 'bg-primary text-on-primary hover:bg-primary/90',
  },
  empty: {
    panel: 'border-outline-variant/20 bg-surface-container-lowest',
    icon: 'bg-surface-container-high text-on-surface-variant',
    action: 'bg-primary text-on-primary hover:bg-primary/90',
  },
  error: {
    panel: 'border-error/30 bg-error/10',
    icon: 'bg-error/15 text-error',
    action: 'bg-error text-on-error hover:bg-error/90',
  },
  guidance: {
    panel: 'border-tertiary/25 bg-tertiary-container/20',
    icon: 'bg-tertiary/15 text-tertiary',
    action: 'bg-tertiary text-on-tertiary hover:bg-tertiary/90',
  },
};

function ActionButton({ action, primaryClass }: { action: DataStateAction; primaryClass?: string }) {
  return (
    <button
      type="button"
      onClick={action.onClick}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold transition-colors ${primaryClass ?? 'border border-outline-variant/30 bg-surface-container text-on-surface hover:bg-surface-container-high'}`}
    >
      {action.icon && <span aria-hidden="true" className="material-symbols-outlined text-lg">{action.icon}</span>}
      {action.label}
    </button>
  );
}

export default function DataStatePanel({
  title,
  description,
  icon,
  tone = 'empty',
  action,
  secondaryAction,
  className = '',
}: DataStatePanelProps) {
  const styles = toneStyles[tone];
  const loading = tone === 'loading';

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      aria-live={tone === 'error' ? 'assertive' : 'polite'}
      aria-busy={loading || undefined}
      className={`rounded-2xl border p-6 text-center ${styles.panel} ${className}`}
    >
      <span aria-hidden="true" className={`material-symbols-outlined inline-flex h-12 w-12 items-center justify-center rounded-2xl text-3xl ${styles.icon} ${loading ? 'animate-spin' : ''}`}>
        {icon}
      </span>
      <h3 className="mt-3 text-base font-extrabold text-on-surface">{title}</h3>
      {description && <div className="mx-auto mt-1.5 max-w-xl text-sm leading-6 text-on-surface-variant">{description}</div>}
      {(action || secondaryAction) && (
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {action && <ActionButton action={action} primaryClass={styles.action} />}
          {secondaryAction && <ActionButton action={secondaryAction} />}
        </div>
      )}
    </div>
  );
}
