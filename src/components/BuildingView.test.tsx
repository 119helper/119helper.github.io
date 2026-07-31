// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BuildingRegisterInfo } from '../services/buildingApi';
import { createBuildingWorkspaceState, type BuildingWorkspaceState } from '../types/buildingWorkspace';

const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;

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

function installSuccessfulGeocoder() {
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
}

function mockBuildingResult(overrides: Partial<BuildingRegisterInfo> = {}) {
  apiMocks.fetchBuildingRegister.mockResolvedValue({
    bldNm: '테스트센터',
    strctCdNm: '철근콘크리트구조',
    grndFlrCnt: 8,
    ugrndFlrCnt: 2,
    mainPurpsCdNm: '업무시설',
    totArea: 1234,
    archArea: 234,
    useAprDay: '20260102',
    ...overrides,
  });
}

function submitBuildingLookup() {
  fireEvent.change(screen.getByRole('textbox', { name: '건축물 주소' }), {
    target: { value: '서울특별시 종로구 세종대로 209' },
  });
  fireEvent.click(screen.getByRole('button', { name: '검색' }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}

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

function IncidentAddressHarness() {
  const [workspace, setWorkspace] = useState<BuildingWorkspaceState>(() => ({
    ...createBuildingWorkspaceState('서울특별시 종로구 이전로 1'),
    errorMsg: '이전 조회 오류',
    warningMsg: '이전 조회 경고',
    bldgInfo: {
      bldNm: '이전 조회 건물',
      searchedAddress: '서울특별시 종로구 이전로 1',
    },
    hasSearched: true,
    fireAccom: [{ bldNm: '이전 소방대상물' }],
    fireSys: [{ bldNm: '이전 소방시설' }],
    fireSido: '서울특별시',
    fireStatus: 'success',
    fireError: '이전 참고정보 오류',
  }));

  return (
    <BuildingView
      initialAddress="광주광역시 서구 내방로 111"
      workspace={workspace}
      onWorkspaceChange={patch => setWorkspace(previous => ({ ...previous, ...patch }))}
    />
  );
}

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  Reflect.deleteProperty(window, 'kakao');
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  if (originalScrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: originalScrollIntoView,
    });
  } else {
    Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
  }
  Reflect.deleteProperty(window, 'kakao');
});

describe('BuildingView', () => {
  it('automatically applies a new incident address and clears stale lookup results', async () => {
    render(<IncidentAddressHarness />);

    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: '건축물 주소' })).toHaveValue('광주광역시 서구 내방로 111');
    });
    expect(screen.getByRole('button', { name: '자동 적용됨' })).toBeDisabled();
    expect(screen.queryByText('이전 조회 건물')).not.toBeInTheDocument();
    expect(screen.queryByText('이전 조회 오류')).not.toBeInTheDocument();
    expect(screen.queryByText('이전 소방대상물')).not.toBeInTheDocument();
  });

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
    installSuccessfulGeocoder();
    mockBuildingResult();
    apiMocks.fetchFireObjectAccom.mockResolvedValue({ items: [] });
    apiMocks.fetchFireObjectFireSys.mockResolvedValue({
      items: [{ bldNm: '테스트 숙박시설', sprinklerInstlYn: 'Y' }],
    });

    render(<Harness />);
    submitBuildingLookup();

    expect(await screen.findByText('테스트센터')).toBeInTheDocument();
    expect(await screen.findByText('테스트 숙박시설')).toBeInTheDocument();
    expect(screen.getByText('조회 완료')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다른 화면' }));
    fireEvent.click(screen.getByRole('button', { name: '건축물 화면' }));

    expect(screen.getByText('테스트센터')).toBeInTheDocument();
    expect(screen.getByText('테스트 숙박시설')).toBeInTheDocument();
    expect(apiMocks.fetchBuildingRegister).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchFireObjectAccom).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchFireObjectFireSys).toHaveBeenCalledTimes(1);
  });

  it('distinguishes missing building metrics from actual zero values', async () => {
    installSuccessfulGeocoder();
    mockBuildingResult({
      grndFlrCnt: undefined,
      ugrndFlrCnt: undefined,
      totArea: undefined,
      archArea: 0,
      bcRat: undefined,
      vlRat: 0,
    });
    apiMocks.fetchFireObjectAccom.mockResolvedValue({ items: [] });
    apiMocks.fetchFireObjectFireSys.mockResolvedValue({ items: [] });

    render(<Harness />);
    submitBuildingLookup();

    expect(await screen.findByText('지하 확인불가 / 지상 확인불가')).toBeInTheDocument();
    expect(screen.getByText('확인불가 / 0%')).toBeInTheDocument();
    expect(screen.getByText('0 ㎡')).toBeInTheDocument();
    expect(screen.queryByText('지하 0층 / 지상 0층')).not.toBeInTheDocument();
  });

  it('focuses and scrolls to a completed result on compact viewports', async () => {
    const scrollIntoView = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({
      matches: query === '(max-width: 639px)',
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    installSuccessfulGeocoder();
    mockBuildingResult();
    apiMocks.fetchFireObjectAccom.mockResolvedValue({ items: [] });
    apiMocks.fetchFireObjectFireSys.mockResolvedValue({ items: [] });

    render(<Harness />);
    submitBuildingLookup();

    const resultHeading = await screen.findByRole('heading', { name: '테스트센터' });
    expect(resultHeading).toHaveFocus();
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
  });

  it('offers other recent lookups from a completed result', async () => {
    installSuccessfulGeocoder();
    mockBuildingResult();
    apiMocks.fetchFireObjectAccom.mockResolvedValue({ items: [] });
    apiMocks.fetchFireObjectFireSys.mockResolvedValue({ items: [] });

    render(<Harness />);
    const addressInput = screen.getByRole('textbox', { name: '건축물 주소' });
    const firstAddress = '서울특별시 종로구 세종대로 209';
    const secondAddress = '서울특별시 중구 세종대로 110';

    submitBuildingLookup();
    await screen.findByRole('heading', { name: '테스트센터' });
    fireEvent.change(addressInput, { target: { value: secondAddress } });
    fireEvent.click(screen.getByRole('button', { name: '검색' }));

    await waitFor(() => expect(apiMocks.fetchBuildingRegister).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole('heading', { name: '이전 조회로 전환' })).toBeInTheDocument();
    const previousLookup = screen.getByRole('button', { name: `${firstAddress} 다시 조회` });
    expect(screen.queryByRole('button', { name: `${secondAddress} 다시 조회` })).not.toBeInTheDocument();

    fireEvent.click(previousLookup);

    await waitFor(() => expect(apiMocks.fetchBuildingRegister).toHaveBeenCalledTimes(3));
    expect(addressInput).toHaveValue(firstAddress);
  });

  it('shows loading and preserves an explicit empty result after remounting', async () => {
    installSuccessfulGeocoder();
    mockBuildingResult();
    const accomResult = deferred<{ items: [] }>();
    const systemResult = deferred<{ items: [] }>();
    apiMocks.fetchFireObjectAccom.mockReturnValue(accomResult.promise);
    apiMocks.fetchFireObjectFireSys.mockReturnValue(systemResult.promise);

    render(<Harness />);
    submitBuildingLookup();

    expect(await screen.findByText('소방시설 참고정보 조회 중...')).toBeInTheDocument();
    expect(screen.getByText('조회 중')).toBeInTheDocument();
    await act(async () => {
      accomResult.resolve({ items: [] });
      systemResult.resolve({ items: [] });
      await Promise.all([accomResult.promise, systemResult.promise]);
    });

    expect(await screen.findByText('표시할 소방시설 참고정보가 없습니다')).toBeInTheDocument();
    expect(screen.getByText('결과 없음')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '다른 화면' }));
    fireEvent.click(screen.getByRole('button', { name: '건축물 화면' }));

    expect(screen.getByText('표시할 소방시설 참고정보가 없습니다')).toBeInTheDocument();
    expect(apiMocks.fetchFireObjectAccom).toHaveBeenCalledTimes(1);
    expect(apiMocks.fetchFireObjectFireSys).toHaveBeenCalledTimes(1);
  });

  it('distinguishes a complete fire-reference failure and offers recovery', async () => {
    installSuccessfulGeocoder();
    mockBuildingResult();
    apiMocks.fetchFireObjectAccom.mockRejectedValue(new Error('accommodation unavailable'));
    apiMocks.fetchFireObjectFireSys.mockRejectedValue(new Error('system unavailable'));

    render(<Harness />);
    submitBuildingLookup();

    const fireAlert = await screen.findByRole('alert');
    expect(fireAlert).toHaveTextContent('소방시설 참고정보를 불러오지 못했습니다.');
    expect(screen.getByText('조회 실패')).toBeInTheDocument();
    const retryButton = screen.getByRole('button', { name: '소방정보 다시 조회' });
    expect(retryButton).toBeInTheDocument();
    expect(screen.queryByText('표시할 소방시설 참고정보가 없습니다')).not.toBeInTheDocument();

    const accomResult = deferred<{ items: [] }>();
    const systemResult = deferred<{ items: [] }>();
    apiMocks.fetchFireObjectAccom.mockReturnValueOnce(accomResult.promise);
    apiMocks.fetchFireObjectFireSys.mockReturnValueOnce(systemResult.promise);
    fireEvent.click(retryButton);

    expect(screen.getByText('테스트센터')).toBeInTheDocument();
    expect(await screen.findByText('소방시설 참고정보 조회 중...')).toBeInTheDocument();
    expect(apiMocks.fetchBuildingRegister).toHaveBeenCalledTimes(1);
    await act(async () => {
      accomResult.resolve({ items: [] });
      systemResult.resolve({ items: [] });
      await Promise.all([accomResult.promise, systemResult.promise]);
    });

    expect(await screen.findByText('결과 없음')).toBeInTheDocument();
    expect(apiMocks.fetchFireObjectAccom).toHaveBeenCalledTimes(2);
    expect(apiMocks.fetchFireObjectFireSys).toHaveBeenCalledTimes(2);
  });

  it('keeps available results visible when only one fire-reference source fails', async () => {
    installSuccessfulGeocoder();
    mockBuildingResult();
    apiMocks.fetchFireObjectAccom.mockRejectedValue(new Error('accommodation unavailable'));
    apiMocks.fetchFireObjectFireSys.mockResolvedValue({
      items: [{ bldNm: '부분 확인 숙박시설', autoFirAlrmInstlYn: 'Y' }],
    });

    render(<Harness />);
    submitBuildingLookup();

    expect(await screen.findByText('부분 확인 숙박시설')).toBeInTheDocument();
    expect(screen.getByText('일부 확인')).toBeInTheDocument();
    expect(screen.getByText('일부 소방시설 참고정보를 불러오지 못했습니다.')).toBeInTheDocument();
  });
});
