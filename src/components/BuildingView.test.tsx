// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createBuildingWorkspaceState, type BuildingWorkspaceState } from '../types/buildingWorkspace';

const apiMocks = vi.hoisted(() => ({
  fetchBuildingRegister: vi.fn(),
  fetchFireObjectAccom: vi.fn(),
  fetchFireObjectFireSys: vi.fn(),
}));

vi.mock('../services/buildingApi', () => ({
  fetchBuildingRegister: apiMocks.fetchBuildingRegister,
}));

vi.mock('../services/apiClient', () => ({
  fetchFireObjectAccom: apiMocks.fetchFireObjectAccom,
  fetchFireObjectFireSys: apiMocks.fetchFireObjectFireSys,
  isStaleDataError: () => false,
}));

import BuildingView from './BuildingView';

function Harness() {
  const [visible, setVisible] = useState(true);
  const [workspace, setWorkspace] = useState<BuildingWorkspaceState>(() => createBuildingWorkspaceState());

  return (
    <>
      <button type="button" onClick={() => setVisible(false)}>다른 화면</button>
      <button type="button" onClick={() => setVisible(true)}>건축물 화면</button>
      {visible ? (
        <BuildingView
          workspace={workspace}
          onWorkspaceChange={patch => setWorkspace(previous => ({ ...previous, ...patch }))}
        />
      ) : <div>대시보드 내용</div>}
    </>
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  Reflect.deleteProperty(window, 'kakao');
});

afterEach(() => {
  cleanup();
  Reflect.deleteProperty(window, 'kakao');
});

describe('BuildingView', () => {
  it('restores the entered address and lookup error after the view is remounted', () => {
    render(<Harness />);

    const addressInput = screen.getByRole('textbox', { name: '건축물 주소' });
    fireEvent.change(addressInput, { target: { value: '서울특별시 종로구 세종대로 209' } });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));

    expect(screen.getByRole('alert')).toHaveTextContent('카카오 주소검색(Geocoder) 서비스 로드 실패');
    fireEvent.click(screen.getByRole('button', { name: '다른 화면' }));
    fireEvent.click(screen.getByRole('button', { name: '건축물 화면' }));

    expect(screen.getByRole('textbox', { name: '건축물 주소' })).toHaveValue('서울특별시 종로구 세종대로 209');
    expect(screen.getByRole('alert')).toHaveTextContent('카카오 주소검색(Geocoder) 서비스 로드 실패');
  });

  it('keeps completed building and fire-reference results without requesting them again', async () => {
    const addressSearch = vi.fn((
      _address: string,
      callback: (result: Array<{ address: Record<string, string> }>, status: string) => void,
    ) => {
      callback([{
        address: {
          address_name: '서울특별시 종로구 세종대로 209',
          b_code: '1111011900',
          main_address_no: '209',
          sub_address_no: '0',
          mountain_yn: 'N',
          region_1depth_name: '서울특별시',
        },
      }], 'OK');
    });
    class Geocoder {
      addressSearch = addressSearch;
    }
    Object.defineProperty(window, 'kakao', {
      configurable: true,
      value: { maps: { services: { Geocoder, Status: { OK: 'OK' } } } },
    });
    apiMocks.fetchBuildingRegister.mockResolvedValue({
      bldNm: '테스트센터',
      strctCdNm: '철근콘크리트구조',
      grndFlrCnt: 8,
      ugrndFlrCnt: 2,
      mainPurpsCdNm: '업무시설',
      totArea: 1234,
      archArea: 234,
      useAprDay: '20260102',
    });
    apiMocks.fetchFireObjectAccom.mockResolvedValue({ items: [] });
    apiMocks.fetchFireObjectFireSys.mockResolvedValue({
      items: [{ bldNm: '테스트 숙박시설', sprinklerInstlYn: 'Y' }],
    });

    render(<Harness />);
    fireEvent.change(screen.getByRole('textbox', { name: '건축물 주소' }), {
      target: { value: '서울특별시 종로구 세종대로 209' },
    });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));

    expect(await screen.findByText('테스트센터')).toBeInTheDocument();
    expect(await screen.findByText('테스트 숙박시설')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다른 화면' }));
    fireEvent.click(screen.getByRole('button', { name: '건축물 화면' }));

    expect(screen.getByText('테스트센터')).toBeInTheDocument();
    expect(screen.getByText('테스트 숙박시설')).toBeInTheDocument();
    expect(apiMocks.fetchBuildingRegister).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchFireObjectAccom).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchFireObjectFireSys).toHaveBeenCalledTimes(1);
  });
});
