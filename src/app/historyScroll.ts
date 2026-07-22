const MAIN_SCROLL_STATE_KEY = '__119helperMainScrollTop';

type HistoryStateRecord = Record<string, unknown>;

const isHistoryStateRecord = (value: unknown): value is HistoryStateRecord => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

export function readMainScrollTop(state: unknown): number {
  if (!isHistoryStateRecord(state)) return 0;
  const value = state[MAIN_SCROLL_STATE_KEY];
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0;
}

export function withMainScrollTop(state: unknown, scrollTop: number): HistoryStateRecord {
  const safeScrollTop = Number.isFinite(scrollTop) ? Math.max(0, Math.round(scrollTop)) : 0;
  return {
    ...(isHistoryStateRecord(state) ? state : {}),
    [MAIN_SCROLL_STATE_KEY]: safeScrollTop,
  };
}
