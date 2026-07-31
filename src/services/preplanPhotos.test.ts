// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clear, set } from 'idb-keyval';
import { clearPreplanPhotos, savePhoto } from './preplanPhotos';

vi.mock('idb-keyval', () => ({
  clear: vi.fn(),
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
    vi.stubGlobal('indexedDB', {});
  });

  afterEach(() => vi.unstubAllGlobals());

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

  it('clears the same photo store used for persistence', async () => {
    await clearPreplanPhotos();

    expect(clear).toHaveBeenCalledWith(expect.anything());
  });
});
