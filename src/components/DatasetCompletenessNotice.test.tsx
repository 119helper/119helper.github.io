// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { DatasetFreshness } from '../services/dataFreshness';
import DatasetCompletenessNotice from './DatasetCompletenessNotice';

const meta: DatasetFreshness = {
  label: '민방위 대피시설',
  sourceDate: '2026-07-27',
  generatedAt: '2026-07-28T00:00:00.000Z',
  maxAgeDays: 14,
  total: 8_127,
  activeUpstreamTotal: 17_229,
  supportedCityCount: 9,
};

afterEach(cleanup);

describe('DatasetCompletenessNotice', () => {
  it('keeps dense provenance details collapsed when requested', () => {
    const { container } = render(<DatasetCompletenessNotice meta={meta} collapsible />);

    const details = container.querySelector('details');
    expect(details).toBeInTheDocument();
    expect(details).not.toHaveAttribute('open');
    expect(screen.getByText('자료 범위·검증 상세')).toBeInTheDocument();
    expect(screen.getByText(/앱 지원 9개 도시/)).toBeInTheDocument();
  });

  it('preserves the inline notice layout for readiness screens', () => {
    const { container } = render(<DatasetCompletenessNotice meta={meta} />);

    expect(container.querySelector('details')).not.toBeInTheDocument();
    expect(screen.getByText(/앱 지원 9개 도시/)).toBeVisible();
  });
});
