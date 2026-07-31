import {
  WORKSPACE_META,
  type WorkspaceMode,
} from '../app/navigation';

interface WorkspaceSwitcherProps {
  workspace: WorkspaceMode;
  incidentActive: boolean;
  incidentTitle?: string;
  onChange: (workspace: WorkspaceMode) => void;
}

const WORKSPACES: WorkspaceMode[] = ['routine', 'response'];

export default function WorkspaceSwitcher({
  workspace,
  incidentActive,
  incidentTitle,
  onChange,
}: WorkspaceSwitcherProps) {
  return (
    <nav
      aria-label="업무 공간 전환"
      className="shrink-0 border-b border-outline-variant/60 bg-surface-container-lowest px-3 py-2 sm:px-5"
    >
      <div className="mx-auto flex max-w-[1600px] rounded-xl bg-surface-container p-1">
        {WORKSPACES.map(item => {
          const meta = WORKSPACE_META[item];
          const selected = workspace === item;
          const responseActive = item === 'response' && incidentActive;
          const accessibleLabel = responseActive
            ? `${meta.label} 모드, ${incidentTitle || '출동'} 진행 중`
            : `${meta.label} 모드`;

          return (
            <button
              key={item}
              type="button"
              aria-label={accessibleLabel}
              aria-pressed={selected}
              onClick={() => onChange(item)}
              className={`flex min-h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-primary/30 ${
                selected
                  ? item === 'response'
                    ? 'bg-error text-on-error shadow-sm'
                    : 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              <span
                aria-hidden="true"
                className="material-symbols-outlined shrink-0 text-lg"
                style={selected ? { fontVariationSettings: "'FILL' 1" } : undefined}
              >
                {responseActive ? 'emergency' : meta.icon}
              </span>
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-xs font-extrabold sm:text-sm">{meta.label}</span>
                  {responseActive && (
                    <span
                      aria-hidden="true"
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        selected ? 'bg-on-error' : 'animate-pulse bg-error'
                      }`}
                    />
                  )}
                </span>
                <span className={`hidden truncate text-[10px] sm:block ${
                  selected ? 'opacity-80' : 'text-on-surface-variant'
                }`}>
                  {responseActive ? incidentTitle || '진행 중인 출동' : meta.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
