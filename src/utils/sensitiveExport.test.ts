// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';
import { buildSensitiveExportMessage } from './sensitiveExport';

describe('sensitive export warning', () => {
  it('builds a warning that names sensitive export details', () => {
    const message = buildSensitiveExportMessage('대상물 정보 내보내기 파일', ['주소', '연락처']);

    expect(message).toContain('대상물 정보 내보내기 파일');
    expect(message).toContain('민감정보');
    expect(message).toContain('- 주소');
    expect(message).toContain('- 연락처');
  });
});
