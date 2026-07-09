// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildSensitiveExportMessage, confirmSensitiveExport } from './sensitiveExport';

describe('sensitive export warning', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a warning that names sensitive export details', () => {
    const message = buildSensitiveExportMessage('대상물 정보 내보내기 파일', ['주소', '연락처']);

    expect(message).toContain('대상물 정보 내보내기 파일');
    expect(message).toContain('민감정보');
    expect(message).toContain('- 주소');
    expect(message).toContain('- 연락처');
  });

  it('returns the browser confirm decision', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);

    expect(confirmSensitiveExport('보고서 복사', ['GPS 위치 기록'])).toBe(false);
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('GPS 위치 기록'));
  });
});
