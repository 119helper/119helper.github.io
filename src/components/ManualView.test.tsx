// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ManualView from './ManualView';

vi.mock('./FieldAssessment', () => ({
  default: () => <div>현장 평가 내용</div>,
}));

vi.mock('./RadioCodes', () => ({
  default: () => <div>무전 코드 내용</div>,
}));

vi.mock('./SOPChecklist', () => ({
  default: ({ initialSopId }: { initialSopId?: string }) => (
    <div>SOP 체크리스트 내용 {initialSopId ?? '목록'}</div>
  ),
}));

describe('ManualView', () => {
  afterEach(() => {
    cleanup();
  });

  it('opens the SOP tab directly from a subId route and resets when the route loses the subId', () => {
    const { rerender } = render(<ManualView subId="sop" />);

    expect(screen.getByRole('button', { name: /SOP 체크리스트/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('SOP 체크리스트 내용 목록')).toBeInTheDocument();
    expect(screen.queryByText('현장 평가 내용')).not.toBeInTheDocument();

    rerender(<ManualView />);

    expect(screen.getByRole('button', { name: /현장 평가/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('현장 평가 내용')).toBeInTheDocument();
    expect(screen.queryByText(/SOP 체크리스트 내용/)).not.toBeInTheDocument();
  });

  it('passes a directly searched SOP target into the checklist', () => {
    render(<ManualView subId="sop:vehicle-fire" />);

    expect(screen.getByRole('button', { name: /SOP 체크리스트/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('SOP 체크리스트 내용 vehicle-fire')).toBeInTheDocument();
  });
});
