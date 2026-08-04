// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import Calculators from './Calculators';
import HazmatCalc from './HazmatCalc';
import { FeedbackProvider } from '../contexts/FeedbackContext';

interface MockOverlay {
  setMap: ReturnType<typeof vi.fn>;
}

interface MockMap {
  setCenter: ReturnType<typeof vi.fn>;
}

interface KakaoMock {
  maps: {
    load: ReturnType<typeof vi.fn>;
    LatLng: ReturnType<typeof vi.fn>;
    Map: ReturnType<typeof vi.fn>;
    Marker: ReturnType<typeof vi.fn>;
    Circle: ReturnType<typeof vi.fn>;
    Polygon: ReturnType<typeof vi.fn>;
    event: {
      addListener: ReturnType<typeof vi.fn>;
    };
  };
}

function installKakaoMock(): KakaoMock {
  const createOverlay = (): MockOverlay => ({ setMap: vi.fn() });
  const createMap = (): MockMap => ({ setCenter: vi.fn() });

  const kakao = {
    maps: {
      load: vi.fn((callback: () => void) => callback()),
      LatLng: vi.fn(function LatLng(lat: number, lng: number) {
        return {
        getLat: () => lat,
        getLng: () => lng,
        };
      }),
      Map: vi.fn(function Map() {
        return createMap();
      }),
      Marker: vi.fn(function Marker() {
        return createOverlay();
      }),
      Circle: vi.fn(function Circle() {
        return createOverlay();
      }),
      Polygon: vi.fn(function Polygon() {
        return createOverlay();
      }),
      event: {
        addListener: vi.fn(),
      },
    },
  };

  Object.defineProperty(window, 'kakao', {
    value: kakao,
    configurable: true,
  });

  return kakao;
}

beforeEach(() => {
  installKakaoMock();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  Object.defineProperty(window, 'kakao', {
    value: undefined,
    configurable: true,
  });
});

describe('HazmatCalc', () => {
  it('updates calculated isolation/protection distances and redraws kakao overlays', async () => {
    const kakao = installKakaoMock();

    render(<FeedbackProvider><HazmatCalc /></FeedbackProvider>);

    const resultPanel = screen.getByText('계산 결과').closest('div');
    expect(resultPanel).not.toBeNull();
    expect(within(resultPanel as HTMLElement).getByText('30 m')).toBeInTheDocument();
    expect(within(resultPanel as HTMLElement).getByText('100 m')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /대량 누출/ }));

    expect(within(resultPanel as HTMLElement).getByText('300 m')).toBeInTheDocument();
    expect(within(resultPanel as HTMLElement).getByText('2.3 km')).toBeInTheDocument();
    expect(kakao.maps.Circle).toHaveBeenLastCalledWith(expect.objectContaining({ radius: 300 }));
    expect(kakao.maps.Polygon).toHaveBeenCalled();
  });
});

describe('Calculators hazmat tab', () => {
  it('starts with field tools in the response workspace context', () => {
    render(<FeedbackProvider><Calculators preferFieldTools /></FeedbackProvider>);

    expect(screen.getByRole('button', { name: /현장계산/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('송수압력 계산기')).toBeInTheDocument();
    expect(screen.queryByText('초과근무 수당 계산기')).not.toBeInTheDocument();
  });

  it('renders HazmatCalc from the calculators tab and keeps the calculation path interactive', () => {
    render(<FeedbackProvider><Calculators /></FeedbackProvider>);

    fireEvent.click(screen.getByRole('button', { name: /유해화학/ }));

    expect(screen.getByText('유해화학물질(Hazmat) 대피 반경 계산기')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /대량 누출/ }));

    const resultPanel = screen.getByText('계산 결과').closest('div');
    expect(resultPanel).not.toBeNull();
    expect(within(resultPanel as HTMLElement).getByText('300 m')).toBeInTheDocument();
    expect(within(resultPanel as HTMLElement).getByText('2.3 km')).toBeInTheDocument();
  });
});
