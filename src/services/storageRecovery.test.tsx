// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StorageStatus from '../components/StorageStatus';
import { useLocalStorageState } from '../hooks/useLocalStorageState';
import { getPendingStorageCount, loadStoredJson, removeStoredJson, retryPendingStorage, savePrivacySettings, loadPrivacySettings, saveStoredJson } from './privacySettings';
import { loadActivitySession, saveActivitySession, ACTIVITY_SESSION_KEY } from './activitySession';

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); removeStoredJson('119helper-notes'); removeStoredJson(ACTIVITY_SESSION_KEY); cleanup(); });
function Notes() {
  const [text, setText] = useLocalStorageState('119helper-notes', '');
  return <><input aria-label="메모" value={text} onChange={event => setText(event.target.value)} /><StorageStatus /></>;
}
it('retains failed note edits across focus and navigation, then retries the newest value', async () => {
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Full', 'QuotaExceededError'); });
  const view = render(<Notes />);
  fireEvent.change(screen.getByLabelText('메모'), { target: { value: '현장 메모' } });
  fireEvent(window, new Event('focus'));
  expect(screen.getByLabelText('메모')).toHaveValue('현장 메모');
  expect(screen.getByRole('alert')).toHaveTextContent('기기에 저장하지 못한 자료');
  view.unmount();
  render(<Notes />);
  expect(screen.getByLabelText('메모')).toHaveValue('현장 메모');
  write.mockRestore();
  fireEvent.click(screen.getByRole('button', { name: '저장 다시 시도' }));
  await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('기기에 저장했습니다'));
  expect(JSON.parse(localStorage.getItem('119helper-notes')!)).toBe('현장 메모');
  expect(getPendingStorageCount()).toBe(0);
});
it('allows subsequent activity mutations to read a failed write without pretending it is durable', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); });
  const session = { presetId: 'fire', title: '현장', note: '', stamps: [] };
  saveActivitySession(session);
  expect(loadActivitySession().title).toBe('현장');
  expect(localStorage.getItem(ACTIVITY_SESSION_KEY)).toBeNull();
  expect(getPendingStorageCount()).toBe(1);
  vi.restoreAllMocks();
  expect(retryPendingStorage()).toBe(true);
  expect(JSON.parse(localStorage.getItem(ACTIVITY_SESSION_KEY)!).title).toBe('현장');
});
it('never resurrects pending sensitive data when public device mode is enabled', () => {
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Full'); });
  expect(saveStoredJson('119helper-notes', ['private'])).toBe(false);
  write.mockRestore();
  savePrivacySettings({ ...loadPrivacySettings(), publicDeviceMode: true });
  expect(retryPendingStorage()).toBe(true);
  expect(loadStoredJson('119helper-notes', [])).toEqual([]);
  expect(localStorage.getItem('119helper-notes')).toBeNull();
});
