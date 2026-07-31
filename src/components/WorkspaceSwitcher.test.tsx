// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import WorkspaceSwitcher from './WorkspaceSwitcher';

describe('WorkspaceSwitcher', () => {
  it('shows the selected workspace and changes it explicitly', () => {
    const onChange = vi.fn();
    render(
      <WorkspaceSwitcher
        workspace="routine"
        incidentActive={false}
        onChange={onChange}
      />,
    );

    expect(screen.getByRole('button', { name: '평시 업무 모드' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: '출동 대응 모드' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: '출동 대응 모드' }));
    expect(onChange).toHaveBeenCalledWith('response');
  });

  it('keeps an active incident visible while routine workspace is selected', () => {
    render(
      <WorkspaceSwitcher
        workspace="routine"
        incidentActive
        incidentTitle="○○동 상가 화재"
        onChange={() => undefined}
      />,
    );

    expect(screen.getByRole('button', {
      name: '출동 대응 모드, ○○동 상가 화재 진행 중',
    })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('○○동 상가 화재')).toBeVisible();
  });
});
