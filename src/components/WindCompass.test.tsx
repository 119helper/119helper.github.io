// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { WindCompass } from './WindCompass';

afterEach(cleanup);

describe('WindCompass', () => {
  it('flags 강풍 위험 at wind speed >= 10 m/s', () => {
    const { container } = render(
      <WindCompass windSpeed={12} windDirectionDegree={0} windDirectionText="북" />
    );
    expect(container.textContent).toContain('강풍 위험');
    expect(container.textContent).toContain('12.0'); // 소수 1자리 표시
  });

  it('flags 바람 주의 in the 4~9 m/s band', () => {
    const { container } = render(
      <WindCompass windSpeed={5} windDirectionDegree={0} windDirectionText="북" />
    );
    expect(container.textContent).toContain('바람 주의');
    expect(container.textContent).not.toContain('강풍 위험');
  });

  it('shows 풍속 양호 below 4 m/s', () => {
    const { container } = render(
      <WindCompass windSpeed={2} windDirectionDegree={0} windDirectionText="북" />
    );
    expect(container.textContent).toContain('풍속 양호');
  });

  it('boundary: exactly 4 m/s is 주의, exactly 10 m/s is 위험', () => {
    const at4 = render(<WindCompass windSpeed={4} windDirectionDegree={0} windDirectionText="북" />);
    expect(at4.container.textContent).toContain('바람 주의');
    cleanup();
    const at10 = render(<WindCompass windSpeed={10} windDirectionDegree={0} windDirectionText="북" />);
    expect(at10.container.textContent).toContain('강풍 위험');
  });

  it('renders the wind-from direction label and rotates the arrow to the given bearing', () => {
    const { container } = render(
      <WindCompass windSpeed={3} windDirectionDegree={90} windDirectionText="동" />
    );
    expect(container.textContent).toContain('동풍');
    // 화살표 회전 컨테이너가 입력 방위각만큼 회전했는지
    const rotated = Array.from(container.querySelectorAll<HTMLElement>('[style*="rotate"]'))
      .some(el => el.getAttribute('style')?.includes('rotate(90deg)'));
    expect(rotated).toBe(true);
  });
});
