/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react';

const DEFAULT_DURATION_MS = 10_000;
const MAX_VISIBLE_TOASTS = 3;

export interface UndoToastAction {
  message: string;
  undo: () => void | Promise<void>;
  onExpire?: () => void | Promise<void>;
  durationMs?: number;
}

interface UndoToastView {
  id: string;
  message: string;
}

interface UndoToastRecord extends UndoToastView {
  undo: UndoToastAction['undo'];
  onExpire?: UndoToastAction['onExpire'];
  timeoutId: number | null;
  expiresAt: number;
  remainingMs: number;
  pausedBy: Set<'pointer' | 'focus' | 'document'>;
}

interface UndoToastContextValue {
  showUndo: (action: UndoToastAction) => string;
  finalizeAll: () => void;
}

const UndoToastContext = createContext<UndoToastContextValue | undefined>(undefined);

function runSafely(callback: (() => void | Promise<void>) | undefined) {
  if (!callback) return;
  try {
    void Promise.resolve(callback()).catch(error => {
      console.warn('[undo toast] action failed', error);
    });
  } catch (error) {
    console.warn('[undo toast] action failed', error);
  }
}

export function UndoToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<UndoToastView[]>([]);
  const recordsRef = useRef(new Map<string, UndoToastRecord>());
  const orderRef = useRef<string[]>([]);

  const finish = useCallback((id: string, outcome: 'undo' | 'expire') => {
    const record = recordsRef.current.get(id);
    if (!record) return;

    if (record.timeoutId !== null) window.clearTimeout(record.timeoutId);
    recordsRef.current.delete(id);
    orderRef.current = orderRef.current.filter(toastId => toastId !== id);
    setToasts(current => current.filter(toast => toast.id !== id));

    runSafely(outcome === 'undo' ? record.undo : record.onExpire);
  }, []);

  const startTimer = useCallback((id: string, durationMs: number) => {
    const record = recordsRef.current.get(id);
    if (!record) return;

    record.remainingMs = durationMs;
    record.expiresAt = Date.now() + durationMs;
    record.timeoutId = window.setTimeout(() => finish(id, 'expire'), durationMs);
  }, [finish]);

  const pauseTimer = useCallback((id: string, reason: 'pointer' | 'focus' | 'document') => {
    const record = recordsRef.current.get(id);
    if (!record || record.pausedBy.has(reason)) return;

    record.pausedBy.add(reason);
    if (record.pausedBy.size > 1) return;

    record.remainingMs = Math.max(0, record.expiresAt - Date.now());
    if (record.timeoutId !== null) window.clearTimeout(record.timeoutId);
    record.timeoutId = null;
  }, []);

  const resumeTimer = useCallback((id: string, reason: 'pointer' | 'focus' | 'document') => {
    const record = recordsRef.current.get(id);
    if (!record || !record.pausedBy.has(reason)) return;

    record.pausedBy.delete(reason);
    if (record.pausedBy.size > 0) return;
    startTimer(id, Math.max(1, record.remainingMs));
  }, [startTimer]);

  const finalizeAll = useCallback(() => {
    const records = [...recordsRef.current.values()];
    recordsRef.current.clear();
    orderRef.current = [];
    records.forEach(record => {
      if (record.timeoutId !== null) window.clearTimeout(record.timeoutId);
      runSafely(record.onExpire);
    });
    setToasts([]);
  }, []);

  const showUndo = useCallback((action: UndoToastAction) => {
    if (orderRef.current.length >= MAX_VISIBLE_TOASTS) {
      const oldestId = orderRef.current[0];
      if (oldestId) finish(oldestId, 'expire');
    }

    const id = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const durationMs = Math.max(1_000, action.durationMs ?? DEFAULT_DURATION_MS);
    const record: UndoToastRecord = {
      id,
      message: action.message,
      undo: action.undo,
      onExpire: action.onExpire,
      timeoutId: null,
      expiresAt: Date.now() + durationMs,
      remainingMs: durationMs,
      pausedBy: new Set(),
    };

    recordsRef.current.set(id, record);
    orderRef.current = [...orderRef.current, id];
    setToasts(current => [...current, { id, message: action.message }]);
    startTimer(id, durationMs);
    return id;
  }, [finish, startTimer]);

  useEffect(() => {
    const handleVisibility = () => {
      orderRef.current.forEach(id => {
        if (document.hidden) pauseTimer(id, 'document');
        else resumeTimer(id, 'document');
      });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [pauseTimer, resumeTimer]);

  useEffect(() => () => {
    recordsRef.current.forEach(record => {
      if (record.timeoutId !== null) window.clearTimeout(record.timeoutId);
      runSafely(record.onExpire);
    });
    recordsRef.current.clear();
    orderRef.current = [];
  }, []);

  const value = useMemo(() => ({ showUndo, finalizeAll }), [finalizeAll, showUndo]);

  const handleBlur = (event: FocusEvent<HTMLDivElement>, id: string) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      resumeTimer(id, 'focus');
    }
  };

  return (
    <UndoToastContext.Provider value={value}>
      {children}
      <div
        aria-label="실행 취소 알림"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(7.5rem+env(safe-area-inset-bottom))] z-[1100] flex flex-col items-center gap-2 px-2 lg:bottom-16"
      >
        {toasts.map(toast => (
          <div
            key={toast.id}
            role="status"
            onPointerEnter={() => pauseTimer(toast.id, 'pointer')}
            onPointerLeave={() => resumeTimer(toast.id, 'pointer')}
            onFocusCapture={() => pauseTimer(toast.id, 'focus')}
            onBlurCapture={event => handleBlur(event, toast.id)}
            className="pointer-events-auto flex w-full max-w-md animate-slide-in-bottom items-center gap-2 rounded-2xl border border-outline/30 bg-surface-container-highest px-3 py-2 text-on-surface shadow-2xl"
          >
            <span aria-hidden="true" className="material-symbols-outlined shrink-0 text-primary">restore</span>
            <span className="min-w-0 flex-1 text-sm font-bold">{toast.message}</span>
            <button
              type="button"
              onClick={() => finish(toast.id, 'undo')}
              className="shrink-0 rounded-xl bg-primary px-3 py-2 text-sm font-extrabold text-on-primary transition-colors hover:bg-primary/80"
            >
              실행 취소
            </button>
            <button
              type="button"
              aria-label="실행 취소 알림 닫기"
              onClick={() => finish(toast.id, 'expire')}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <span aria-hidden="true" className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        ))}
      </div>
    </UndoToastContext.Provider>
  );
}

export function useUndoToast(): UndoToastContextValue {
  const context = useContext(UndoToastContext);
  if (!context) throw new Error('useUndoToast must be used within UndoToastProvider');
  return context;
}
