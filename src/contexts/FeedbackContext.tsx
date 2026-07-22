/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';

const DEFAULT_UNDO_DURATION_MS = 10_000;
const DEFAULT_NOTICE_DURATION_MS = 4_500;
const MAX_VISIBLE_TOASTS = 3;

export type NoticeTone = 'info' | 'success' | 'warning' | 'error';
export type ConfirmTone = 'default' | 'warning' | 'danger';

export interface UndoAction {
  message: string;
  undo: () => void | Promise<void>;
  onExpire?: () => void | Promise<void>;
  durationMs?: number;
}

export interface NoticeAction {
  message: string;
  tone?: NoticeTone;
  durationMs?: number;
}

export interface ConfirmDialogOptions {
  title: string;
  message: string;
  details?: string[];
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
}

interface FeedbackToastView {
  id: string;
  message: string;
  kind: 'undo' | 'notice';
  tone: NoticeTone;
}

interface FeedbackToastRecord extends FeedbackToastView {
  undo?: UndoAction['undo'];
  onExpire?: UndoAction['onExpire'];
  timeoutId: number | null;
  expiresAt: number;
  remainingMs: number;
  pausedBy: Set<'pointer' | 'focus' | 'document'>;
}

interface ConfirmRequest extends ConfirmDialogOptions {
  id: string;
  resolve: (confirmed: boolean) => void;
  returnFocus: HTMLElement | null;
}

interface FeedbackContextValue {
  showUndo: (action: UndoAction) => string;
  showNotice: (action: NoticeAction) => string;
  confirmAction: (options: ConfirmDialogOptions) => Promise<boolean>;
  finalizeAll: () => void;
}

const FeedbackContext = createContext<FeedbackContextValue | undefined>(undefined);

function createFeedbackId(prefix: string) {
  const suffix = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function runSafely(callback: (() => void | Promise<void>) | undefined) {
  if (!callback) return;
  try {
    void Promise.resolve(callback()).catch(error => {
      console.warn('[app feedback] action failed', error);
    });
  } catch (error) {
    console.warn('[app feedback] action failed', error);
  }
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<FeedbackToastView[]>([]);
  const [activeConfirm, setActiveConfirm] = useState<ConfirmRequest | null>(null);
  const toastRecordsRef = useRef(new Map<string, FeedbackToastRecord>());
  const toastOrderRef = useRef<string[]>([]);
  const activeConfirmRef = useRef<ConfirmRequest | null>(null);
  const confirmQueueRef = useRef<ConfirmRequest[]>([]);
  const confirmTitleId = useId();
  const confirmDescriptionId = useId();

  const finishToast = useCallback((id: string, outcome: 'undo' | 'expire') => {
    const record = toastRecordsRef.current.get(id);
    if (!record) return;

    if (record.timeoutId !== null) window.clearTimeout(record.timeoutId);
    toastRecordsRef.current.delete(id);
    toastOrderRef.current = toastOrderRef.current.filter(toastId => toastId !== id);
    setToasts(current => current.filter(toast => toast.id !== id));

    runSafely(outcome === 'undo' ? record.undo : record.onExpire);
  }, []);

  const startTimer = useCallback((id: string, durationMs: number) => {
    const record = toastRecordsRef.current.get(id);
    if (!record) return;

    record.remainingMs = durationMs;
    record.expiresAt = Date.now() + durationMs;
    record.timeoutId = window.setTimeout(() => finishToast(id, 'expire'), durationMs);
  }, [finishToast]);

  const pauseTimer = useCallback((id: string, reason: 'pointer' | 'focus' | 'document') => {
    const record = toastRecordsRef.current.get(id);
    if (!record || record.pausedBy.has(reason)) return;

    record.pausedBy.add(reason);
    if (record.pausedBy.size > 1) return;

    record.remainingMs = Math.max(0, record.expiresAt - Date.now());
    if (record.timeoutId !== null) window.clearTimeout(record.timeoutId);
    record.timeoutId = null;
  }, []);

  const resumeTimer = useCallback((id: string, reason: 'pointer' | 'focus' | 'document') => {
    const record = toastRecordsRef.current.get(id);
    if (!record || !record.pausedBy.has(reason)) return;

    record.pausedBy.delete(reason);
    if (record.pausedBy.size > 0) return;
    startTimer(id, Math.max(1, record.remainingMs));
  }, [startTimer]);

  const enqueueToast = useCallback((
    toast: Omit<FeedbackToastView, 'id'>,
    callbacks: Pick<FeedbackToastRecord, 'undo' | 'onExpire'>,
    durationMs: number,
  ) => {
    if (toastOrderRef.current.length >= MAX_VISIBLE_TOASTS) {
      const oldestId = toastOrderRef.current[0];
      if (oldestId) finishToast(oldestId, 'expire');
    }

    const id = createFeedbackId('feedback');
    const normalizedDuration = Math.max(1_000, durationMs);
    const record: FeedbackToastRecord = {
      id,
      ...toast,
      ...callbacks,
      timeoutId: null,
      expiresAt: Date.now() + normalizedDuration,
      remainingMs: normalizedDuration,
      pausedBy: new Set(),
    };

    toastRecordsRef.current.set(id, record);
    toastOrderRef.current = [...toastOrderRef.current, id];
    setToasts(current => [...current, { id, ...toast }]);
    startTimer(id, normalizedDuration);
    return id;
  }, [finishToast, startTimer]);

  const showUndo = useCallback((action: UndoAction) => enqueueToast(
    { message: action.message, kind: 'undo', tone: 'info' },
    { undo: action.undo, onExpire: action.onExpire },
    action.durationMs ?? DEFAULT_UNDO_DURATION_MS,
  ), [enqueueToast]);

  const showNotice = useCallback((action: NoticeAction) => enqueueToast(
    { message: action.message, kind: 'notice', tone: action.tone ?? 'info' },
    {},
    action.durationMs ?? (action.tone === 'error' ? 7_000 : DEFAULT_NOTICE_DURATION_MS),
  ), [enqueueToast]);

  const finalizeAll = useCallback(() => {
    const records = [...toastRecordsRef.current.values()];
    toastRecordsRef.current.clear();
    toastOrderRef.current = [];
    records.forEach(record => {
      if (record.timeoutId !== null) window.clearTimeout(record.timeoutId);
      runSafely(record.onExpire);
    });
    setToasts([]);
  }, []);

  const settleConfirm = useCallback((confirmed: boolean) => {
    const current = activeConfirmRef.current;
    if (!current) return;

    current.resolve(confirmed);
    const next = confirmQueueRef.current.shift() ?? null;
    activeConfirmRef.current = next;
    setActiveConfirm(next);

    if (!next) {
      window.requestAnimationFrame(() => {
        if (current.returnFocus?.isConnected && !current.returnFocus.closest('[inert]')) {
          current.returnFocus.focus({ preventScroll: true });
        }
      });
    }
  }, []);

  const confirmAction = useCallback((options: ConfirmDialogOptions) => new Promise<boolean>(resolve => {
    const request: ConfirmRequest = {
      ...options,
      id: createFeedbackId('confirm'),
      resolve,
      returnFocus: activeConfirmRef.current?.returnFocus
        ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null),
    };

    if (activeConfirmRef.current) {
      confirmQueueRef.current.push(request);
      return;
    }

    activeConfirmRef.current = request;
    setActiveConfirm(request);
  }), []);

  useEffect(() => {
    if (!activeConfirm) return;
    const appRoot = document.getElementById('root');
    const previousBodyOverflow = document.body.style.overflow;
    const wasRootInert = appRoot?.hasAttribute('inert') ?? false;
    const previousAriaHidden = appRoot?.getAttribute('aria-hidden') ?? null;

    document.body.style.overflow = 'hidden';
    if (appRoot) {
      appRoot.setAttribute('inert', '');
      appRoot.setAttribute('aria-hidden', 'true');
    }

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      if (appRoot) {
        if (wasRootInert) appRoot.setAttribute('inert', '');
        else appRoot.removeAttribute('inert');
        if (previousAriaHidden === null) appRoot.removeAttribute('aria-hidden');
        else appRoot.setAttribute('aria-hidden', previousAriaHidden);
      }
    };
  }, [activeConfirm]);

  const confirmDialogRef = useDialogAccessibility<HTMLDivElement>(
    Boolean(activeConfirm),
    () => settleConfirm(false),
  );

  useEffect(() => {
    if (!activeConfirm) return;
    const focusQueuedDialog = window.requestAnimationFrame(() => {
      const preferred = confirmDialogRef.current?.querySelector<HTMLElement>('[data-dialog-initial-focus]');
      (preferred ?? confirmDialogRef.current)?.focus({ preventScroll: true });
    });
    return () => window.cancelAnimationFrame(focusQueuedDialog);
  }, [activeConfirm, confirmDialogRef]);

  useEffect(() => {
    const handleVisibility = () => {
      toastOrderRef.current.forEach(id => {
        if (document.hidden) pauseTimer(id, 'document');
        else resumeTimer(id, 'document');
      });
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [pauseTimer, resumeTimer]);

  useEffect(() => () => {
    toastRecordsRef.current.forEach(record => {
      if (record.timeoutId !== null) window.clearTimeout(record.timeoutId);
      runSafely(record.onExpire);
    });
    toastRecordsRef.current.clear();
    toastOrderRef.current = [];
    activeConfirmRef.current?.resolve(false);
    confirmQueueRef.current.forEach(request => request.resolve(false));
    activeConfirmRef.current = null;
    confirmQueueRef.current = [];
  }, []);

  const value = useMemo(
    () => ({ showUndo, showNotice, confirmAction, finalizeAll }),
    [confirmAction, finalizeAll, showNotice, showUndo],
  );

  const handleBlur = (event: FocusEvent<HTMLDivElement>, id: string) => {
    if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
      resumeTimer(id, 'focus');
    }
  };

  const toastIcon = (toast: FeedbackToastView) => {
    if (toast.kind === 'undo') return { name: 'restore', className: 'text-primary' };
    if (toast.tone === 'success') return { name: 'check_circle', className: 'text-green-700 dark:text-green-300' };
    if (toast.tone === 'warning') return { name: 'warning', className: 'text-amber-700 dark:text-amber-300' };
    if (toast.tone === 'error') return { name: 'error', className: 'text-error' };
    return { name: 'info', className: 'text-primary' };
  };

  const confirmTone = activeConfirm?.tone ?? 'default';
  const confirmIcon = confirmTone === 'danger' ? 'delete_forever' : confirmTone === 'warning' ? 'privacy_tip' : 'help';
  const confirmIconClass = confirmTone === 'danger'
    ? 'bg-error/10 text-error'
    : confirmTone === 'warning'
      ? 'bg-amber-500/15 text-amber-800 dark:text-amber-300'
      : 'bg-primary/10 text-primary';
  const confirmButtonClass = confirmTone === 'danger'
    ? 'bg-error text-on-error hover:bg-error/85'
    : 'bg-primary text-on-primary hover:bg-primary/85';

  return (
    <FeedbackContext.Provider value={value}>
      {children}
      <div
        aria-label="앱 알림"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(9.5rem+env(safe-area-inset-bottom))] z-[1100] flex flex-col items-center gap-2 px-2 lg:bottom-16"
      >
        {toasts.map(toast => {
          const icon = toastIcon(toast);
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              onPointerEnter={() => pauseTimer(toast.id, 'pointer')}
              onPointerLeave={() => resumeTimer(toast.id, 'pointer')}
              onFocusCapture={() => pauseTimer(toast.id, 'focus')}
              onBlurCapture={event => handleBlur(event, toast.id)}
              className="pointer-events-auto flex w-full max-w-md animate-slide-in-bottom items-center gap-2 rounded-2xl border border-outline/30 bg-surface-container-highest px-3 py-2 text-on-surface shadow-2xl"
            >
              <span aria-hidden="true" className={`material-symbols-outlined shrink-0 ${icon.className}`}>{icon.name}</span>
              <span className="min-w-0 flex-1 text-sm font-bold">{toast.message}</span>
              {toast.kind === 'undo' && (
                <button
                  type="button"
                  onClick={() => finishToast(toast.id, 'undo')}
                  className="shrink-0 rounded-xl bg-primary px-3 py-2 text-sm font-extrabold text-on-primary transition-colors hover:bg-primary/80"
                >
                  실행 취소
                </button>
              )}
              <button
                type="button"
                aria-label={toast.kind === 'undo' ? '실행 취소 알림 닫기' : '알림 닫기'}
                onClick={() => finishToast(toast.id, 'expire')}
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
              >
                <span aria-hidden="true" className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>
          );
        })}
      </div>

      {activeConfirm && createPortal(
        <div
          className="fixed inset-0 z-[1300] flex items-end justify-center bg-black/60 p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={event => {
            if (event.target === event.currentTarget) settleConfirm(false);
          }}
        >
          <div
            ref={confirmDialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={confirmTitleId}
            aria-describedby={confirmDescriptionId}
            tabIndex={-1}
            className="max-h-[calc(100dvh-1rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-outline-variant/25 bg-surface-container-lowest p-5 text-on-surface shadow-2xl animate-slide-in-bottom sm:animate-fade-in"
            onMouseDown={event => event.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className={`material-symbols-outlined rounded-xl p-2.5 ${confirmIconClass}`}>{confirmIcon}</span>
              <div className="min-w-0 flex-1">
                <h2 id={confirmTitleId} className="text-lg font-extrabold font-headline">{activeConfirm.title}</h2>
                <p id={confirmDescriptionId} className="mt-2 whitespace-pre-line text-sm leading-6 text-on-surface-variant">{activeConfirm.message}</p>
                {activeConfirm.details && activeConfirm.details.length > 0 && (
                  <ul className="mt-3 space-y-1.5 rounded-xl bg-surface-container px-3 py-2.5 text-sm text-on-surface-variant">
                    {activeConfirm.details.map(detail => (
                      <li key={detail} className="flex items-start gap-2">
                        <span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current" />
                        <span>{detail}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                type="button"
                data-dialog-initial-focus
                onClick={() => settleConfirm(false)}
                className="rounded-xl border border-outline-variant/30 bg-surface-container px-4 py-3 text-sm font-bold text-on-surface transition-colors hover:bg-surface-container-high"
              >
                {activeConfirm.cancelLabel ?? '취소'}
              </button>
              <button
                type="button"
                onClick={() => settleConfirm(true)}
                className={`rounded-xl px-4 py-3 text-sm font-extrabold transition-colors ${confirmButtonClass}`}
              >
                {activeConfirm.confirmLabel ?? '확인'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </FeedbackContext.Provider>
  );
}

export function useAppFeedback(): FeedbackContextValue {
  const context = useContext(FeedbackContext);
  if (!context) throw new Error('useAppFeedback must be used within FeedbackProvider');
  return context;
}
