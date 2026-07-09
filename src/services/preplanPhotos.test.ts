// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { set } from 'idb-keyval';
import { savePhoto } from './preplanPhotos';

vi.mock('idb-keyval', () => ({
  createStore: vi.fn(() => ({})),
  del: vi.fn(),
  get: vi.fn(),
  set: vi.fn(),
}));

const photoDataUrl = 'data:image/jpeg;base64,AAAA';

describe('preplanPhotos', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('stores pre-plan photos when persistence is allowed', async () => {
    await savePhoto('photo-1', photoDataUrl);

    expect(set).toHaveBeenCalledWith('photo-1', photoDataUrl, expect.anything());
  });

  it('blocks pre-plan photo persistence in public device mode', async () => {
    localStorage.setItem('119helper-privacy-settings', JSON.stringify({
      publicDeviceMode: true,
      retentionDays: 30,
    }));

    await expect(savePhoto('photo-1', photoDataUrl)).rejects.toThrow('공용 기기 모드');
    expect(set).not.toHaveBeenCalled();
  });
});
