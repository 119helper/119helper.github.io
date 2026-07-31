// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ACTIVITY_PRESETS } from '../data/activityStages';
import IncidentCloseReviewDialog from './IncidentCloseReviewDialog';

const preset = ACTIVITY_PRESETS.find(item => item.id === 'support')!;
const completeStamps = preset.stages
  .filter(stage => stage.id !== 'return')
  .map((stage, index) => ({
    stageId: stage.id,
    label: stage.label,
    time: 1_000 + index * 1_000,
    lat: null,
    lon: null,
  }));

afterEach(cleanup);

describe('IncidentCloseReviewDialog archive state', () => {
  it('keeps the incident open while an archive failure is visible', () => {
    const onConfirm = vi.fn();
    render(
      <IncidentCloseReviewDialog
        open
        preset={preset}
        stamps={completeStamps}
        timers={[]}
        stopwatchRunning={false}
        saving={false}
        saveError="브라우저 저장 공간을 확인해 주세요."
        onClose={vi.fn()}
        onOpenActivity={vi.fn()}
        onOpenTimers={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('종료하지 않았습니다');
    expect(screen.getByRole('alert')).toHaveTextContent('브라우저 저장 공간');
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('prevents duplicate confirmation while the snapshot is being saved', () => {
    const onConfirm = vi.fn();
    render(
      <IncidentCloseReviewDialog
        open
        preset={preset}
        stamps={completeStamps}
        timers={[]}
        stopwatchRunning={false}
        saving
        saveError=""
        onClose={vi.fn()}
        onOpenActivity={vi.fn()}
        onOpenTimers={vi.fn()}
        onConfirm={onConfirm}
      />,
    );

    const button = screen.getByRole('button', { name: '기록 보관 중…' });
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
