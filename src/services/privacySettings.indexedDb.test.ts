// @vitest-environment jsdom

import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearPreplanPhotos, getPhoto, savePhoto } from './preplanPhotos';
import { clearSensitiveStoredData } from './privacySettings';

const photoDataUrl = 'data:image/jpeg;base64,AAAA';

describe('clearSensitiveStoredData IndexedDB integration', () => {
  beforeEach(async () => {
    localStorage.clear();
    await clearPreplanPhotos();
  });

  afterEach(async () => {
    await clearPreplanPhotos();
  });

  it('removes a stored preplan photo from the live IndexedDB store', async () => {
    await savePhoto('photo-to-clear', photoDataUrl);
    expect(await getPhoto('photo-to-clear')).toBe(photoDataUrl);

    await clearSensitiveStoredData();

    expect(await getPhoto('photo-to-clear')).toBeUndefined();
  });
});
