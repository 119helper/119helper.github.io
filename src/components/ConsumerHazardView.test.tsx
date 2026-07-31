// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConsumerHazardDataset, HazardItem } from '../services/consumerHazardApi';
import ConsumerHazardView from './ConsumerHazardView';

const apiMocks = vi.hoisted(() => ({
  fetchDataset: vi.fn(),
}));

vi.mock('../services/consumerHazardApi', () => ({
  fetchConsumerHazardDataset: (...args: unknown[]) => apiMocks.fetchDataset(...args),
}));

vi.mock('../services/apiClient', () => ({
  getStaleAt: () => null,
}));

function hazard(overrides: Partial<HazardItem>): HazardItem {
  return {
    id: '1',
    receiveDay: '2026-03-26',
    occurrenceDate: '2026-03-20',
    treatmentPeriod: '',
    age: '70',
    gender: '여자',
    itemMajor: '시설 및 서비스',
    itemMiddle: '욕실',
    itemMinor: '욕조',
    injuryReason: '미끄러짐·넘어짐',
    injuryPart: '머리',
    injurySymptoms: '타박상',
    occurrencePlace: '주택',
    ...overrides,
  };
}

const rows = [
  hazard({ id: '1' }),
  hazard({ id: '2', age: '5', itemMiddle: '주방가전', itemMinor: '전기포트', injuryReason: '고온물질', injuryPart: '손', injurySymptoms: '화상' }),
  hazard({ id: '3', age: '34', itemMiddle: '이동수단', itemMinor: '전동킥보드', injuryReason: '추락', injuryPart: '팔', injurySymptoms: '골절', occurrencePlace: '도로' }),
];

const dataset: ConsumerHazardDataset = {
  items: rows,
  totalCount: 26658,
  loadedCount: 3,
  pageSize: 1000,
  requestedPages: 3,
  loadedPages: 3,
  failedPages: [],
  latestReceiveDay: '2026-03-26',
  earliestReceiveDay: '2026-03-09',
  sourceName: '한국소비자원 소비자위해감시시스템(CISS)',
  sourceUrl: 'https://www.data.go.kr/data/15142643/openapi.do',
  partial: false,
};

describe('ConsumerHazardView', () => {
  beforeEach(() => {
    apiMocks.fetchDataset.mockResolvedValue(dataset);
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('shows coverage and clearly separates public trend data from real-time dispatch data', async () => {
    render(<ConsumerHazardView />);

    expect(await screen.findByText('생활안전 사고 인사이트')).toBeInTheDocument();
    expect(screen.getByText('실시간 출동정보가 아닙니다.')).toBeInTheDocument();
    expect(screen.getByText(/전체 26,658건 중 3건 분석/)).toBeInTheDocument();
    expect(screen.getByText('2026.03.26')).toBeInTheDocument();
  });

  it('filters the same evidence set by incident keyword and operational preset', async () => {
    render(<ConsumerHazardView />);
    await screen.findByText('생활안전 사고 인사이트');

    fireEvent.change(screen.getByLabelText('유사 사고 검색'), { target: { value: '전기포트 화상' } });
    expect(screen.getByText(/현재 조건 1건/)).toBeInTheDocument();
    expect(screen.getAllByText('전기포트').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByLabelText('검색어 지우기'));
    fireEvent.click(screen.getByRole('button', { name: /고령자/ }));
    expect(screen.getByText(/현재 조건 1건/)).toBeInTheDocument();
    expect(screen.getAllByText('욕조').length).toBeGreaterThan(0);
  });
});
