// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
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
        viewState={{ selectedKey: null, page: 1, listScrollTop: 0 }}
        onViewStateChange={vi.fn()}
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
        viewState={{ selectedKey: null, page: 1, listScrollTop: 0 }}
        onViewStateChange={vi.fn()}
      />,
    );

    expect(screen.getByText('표시할 시설 데이터가 없습니다')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '검색·필터 초기화' })).not.toBeInTheDocument();
  });

  it('restores the selected facility and page after the list is remounted', () => {
    const facilities = Array.from({ length: 55 }, (_, index): FireFacility => ({
      ...facility,
      id: `H-${String(index + 1).padStart(3, '0')}`,
      address: `서울특별시 종로구 테스트로 ${index + 1}`,
    }));

    function Harness() {
      const [visible, setVisible] = useState(true);
      const [viewState, setViewState] = useState({ selectedKey: null as string | null, page: 1, listScrollTop: 0 });
      return (
        <>
          <button type="button" onClick={() => setVisible(false)}>다른 화면</button>
          <button type="button" onClick={() => setVisible(true)}>시설 화면</button>
          {visible ? (
            <FacilityList
              data={facilities}
              title="소화전 위치"
              icon="🚒"
              typeLabel="소화전"
              city="seoul"
              filterState={{ query: '', district: '전체' }}
              onFilterStateChange={vi.fn()}
              viewState={viewState}
              onViewStateChange={patch => setViewState(previous => ({ ...previous, ...patch }))}
            />
          ) : <div>대시보드 내용</div>}
        </>
      );
    }

    render(<Harness />);
    fireEvent.click(screen.getAllByRole('button', { name: '다음 페이지' })[0]);
    const selectedRow = screen.getByRole('row', { name: /H-051/ });
    fireEvent.click(selectedRow);
    expect(selectedRow).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('button', { name: '다른 화면' }));
    fireEvent.click(screen.getByRole('button', { name: '시설 화면' }));

    expect(screen.getAllByText('2 / 2')).not.toHaveLength(0);
    expect(screen.getByRole('row', { name: /H-051/ })).toHaveAttribute('aria-selected', 'true');
  });

  it('keeps rows with the same provider facility number independently selectable', () => {
    const duplicateIdFacilities: FireFacility[] = [
      {
        ...facility,
        id: '서부-화정-서부-2',
        address: '광주광역시 서구 무진대로',
        type: '소화전',
        district: '서구',
      },
      {
        ...facility,
        id: '서부-화정-서부-2',
        address: '광주광역시 서구 천변좌로 260-1',
        type: '비상소화장치',
        district: '서구',
      },
    ];

    function Harness() {
      const [viewState, setViewState] = useState({ selectedKey: null as string | null, page: 1, listScrollTop: 0 });
      return (
        <FacilityList
          data={duplicateIdFacilities}
          title="소화전 위치"
          icon="🚒"
          typeLabel="소방용수"
          city="gwangju"
          filterState={{ query: '', district: '전체' }}
          onFilterStateChange={vi.fn()}
          viewState={viewState}
          onViewStateChange={patch => setViewState(previous => ({ ...previous, ...patch }))}
        />
      );
    }

    render(<Harness />);
    const hydrantRow = screen.getByRole('row', { name: /광주광역시 서구 무진대로/ });
    const emergencyDeviceRow = screen.getByRole('row', { name: /광주광역시 서구 천변좌로 260-1/ });

    fireEvent.click(hydrantRow);

    expect(hydrantRow).toHaveAttribute('aria-selected', 'true');
    expect(emergencyDeviceRow).toHaveAttribute('aria-selected', 'false');
  });
});
