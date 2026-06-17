// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import StaleBadge from './StaleBadge';

afterEach(cleanup);

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('StaleBadge', () => {
  it('renders nothing for fresh data (at = null) — must not warn when current', () => {
    const { container } = render(<StaleBadge at={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows minutes for recent fallback data', () => {
    const { container } = render(<StaleBadge at={Date.now() - 5 * MIN} />);
    expect(container.textContent).toContain('5분 전');
    expect(container.textContent).toContain('데이터');
  });

  it('shows hours past 60 minutes', () => {
    const { container } = render(<StaleBadge at={Date.now() - 3 * HOUR} />);
    expect(container.textContent).toContain('3시간 전');
  });

  it('shows days past 24 hours', () => {
    const { container } = render(<StaleBadge at={Date.now() - 2 * DAY} />);
    expect(container.textContent).toContain('2일 전');
  });

  it('exposes a tooltip explaining the fallback', () => {
    const { container } = render(<StaleBadge at={Date.now() - 10 * MIN} />);
    const badge = container.querySelector('[title]');
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute('title')).toContain('마지막 저장값');
  });
});
