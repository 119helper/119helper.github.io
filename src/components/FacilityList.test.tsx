// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FireFacility } from '../data/mockData';
import FacilityList from './FacilityList';

vi.mock('./KakaoMap', () => ({
  default: () => <div data-testid="facility-map" />,
}));

const facility: FireFacility = {
  id: 'H-001',
  type: '소화전',
  address: '서울특별시 종로구 세종대로',
  lat: 37.57,
  lng: 126.98,
  district: '종로구',
  status: '정상',
};

afterEach(cleanup);

describe('FacilityList', () => {
  it('distinguishes an active-filter miss and offers to reset the conditions', () => {
    const onFilterStateChange = vi.fn();
    render(
      <FacilityList
        data={[facility]}
        title="소화전 위치"
        icon="🚒"
        typeLabel="소화전"
        city="seoul"
        filterState={{ query: '없는 주소', district: '전체' }}
        onFilterStateChange={onFilterStateChange}
      />,
    );

    expect(screen.getByText('검색·필터 결과가 없습니다')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '검색·필터 초기화' }));
    expect(onFilterStateChange).toHaveBeenCalledWith({ query: '', district: '전체' });
  });

  it('shows a data-empty explanation even when the API returned no rows', () => {
    render(
      <FacilityList
        data={[]}
        title="소화전 위치"
        icon="🚒"
        typeLabel="소화전"
        city="seoul"
        filterState={{ query: '', district: '전체' }}
        onFilterStateChange={vi.fn()}
      />,
    );

    expect(screen.getByText('표시할 시설 데이터가 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '검색·필터 초기화' })).not.toBeInTheDocument();
  });
});
