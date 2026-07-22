import { describe, expect, it } from 'vitest';
import { readMainScrollTop, withMainScrollTop } from './historyScroll';

describe('history scroll state', () => {
  it('preserves existing history values while storing a safe scroll position', () => {
    const state = withMainScrollTop({ navigationId: 'shelter' }, 412.6);

    expect(state).toMatchObject({ navigationId: 'shelter' });
    expect(readMainScrollTop(state)).toBe(413);
  });

  it('normalizes invalid or negative scroll positions to the top', () => {
    expect(readMainScrollTop(null)).toBe(0);
    expect(readMainScrollTop(withMainScrollTop([], -20))).toBe(0);
    expect(readMainScrollTop(withMainScrollTop({}, Number.NaN))).toBe(0);
  });
});
