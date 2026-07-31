// @vitest-environment jsdom

import '@testing-library/jest-dom/vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EQUIPMENT_CHECKLIST_DATE_STORAGE_KEY,
  EQUIPMENT_CHECKLIST_STORAGE_KEY,
  localDateKey,
} from '../services/equipmentChecklistState';
import EquipmentChecklist from './EquipmentChecklist';

const feedback = vi.hoisted(() => ({
  confirmAction: vi.fn(async () => true),
  showNotice: vi.fn(),
}));

vi.mock('../contexts/FeedbackContext', () => ({
  useAppFeedback: () => feedback,
}));

describe('EquipmentChecklist daily state', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(cleanup);

  it('does not carry an older checklist into today and starts clean on the first check', async () => {
    localStorage.setItem(EQUIPMENT_CHECKLIST_STORAGE_KEY, JSON.stringify({
      'scba-1': true,
      'ppe-1': true,
    }));
    localStorage.setItem(EQUIPMENT_CHECKLIST_DATE_STORAGE_KEY, JSON.stringify('2000-01-01'));

    render(<EquipmentChecklist />);

    const firstItem = screen.getByRole('checkbox', {
      name: '용기 잔압 및 제조사·소속 기관 기준 충족 여부',
    });
    expect(firstItem).not.toBeChecked();
    expect(screen.getByText(/점검률: 0 \/ 13 \(0%\)/)).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('이전 점검 기록은 오늘 점검에 포함하지 않았습니다');

    fireEvent.click(firstItem);

    await waitFor(() => {
      expect(JSON.parse(localStorage.getItem(EQUIPMENT_CHECKLIST_DATE_STORAGE_KEY) ?? 'null'))
        .toBe(localDateKey());
      expect(JSON.parse(localStorage.getItem(EQUIPMENT_CHECKLIST_STORAGE_KEY) ?? '{}'))
        .toEqual({ 'scba-1': true });
    });
  });

  it('counts only items that still exist in the current checklist', () => {
    localStorage.setItem(EQUIPMENT_CHECKLIST_STORAGE_KEY, JSON.stringify({
      'scba-1': true,
      'retired-item': true,
    }));
    localStorage.setItem(EQUIPMENT_CHECKLIST_DATE_STORAGE_KEY, JSON.stringify(localDateKey()));

    render(<EquipmentChecklist />);

    expect(screen.getByText(/점검률: 1 \/ 13 \(8%\)/)).toBeVisible();
  });
});
