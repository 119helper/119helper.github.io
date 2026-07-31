// 대상물 사진 저장소 — localStorage 용량 한계를 피해 IndexedDB(idb-keyval)에 보관한다.

import { clear, createStore, del, get, set } from 'idb-keyval';
import { canPersistStorageKey } from './privacySettings';

const photoStore = createStore('119-preplan', 'photos');
const PREPLAN_STORAGE_KEY = '119helper-preplans';
export const MAX_PREPLAN_SOURCE_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_PREPLAN_PHOTO_DATA_URL_LENGTH = 2_500_000;

function assertSupportedPhoto(file: File): void {
  if (!file.type.startsWith('image/')) {
    throw new Error('지원하지 않는 사진 형식입니다.');
  }
  if (file.size > MAX_PREPLAN_SOURCE_PHOTO_BYTES) {
    throw new Error('사진 파일이 너무 큽니다.');
  }
}

function assertPhotoDataUrl(dataUrl: string): void {
  if (dataUrl.length > MAX_PREPLAN_PHOTO_DATA_URL_LENGTH) {
    throw new Error('사진 데이터가 너무 큽니다.');
  }
  if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(dataUrl)) {
    throw new Error('지원하지 않는 사진 데이터입니다.');
  }
}

/** 첨부 사진을 리사이즈(최대 1024px, JPEG 0.7)해 dataURL로 변환한다. */
export function resizeImage(file: File, maxSize = 1024, quality = 0.7): Promise<string> {
  assertSupportedPhoto(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('canvas context 없음'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export async function savePhoto(key: string, dataUrl: string): Promise<void> {
  assertPhotoDataUrl(dataUrl);
  if (!canPersistStorageKey(PREPLAN_STORAGE_KEY)) {
    throw new Error('공용 기기 모드에서는 대상물 사진을 저장하지 않습니다.');
  }
  await set(key, dataUrl, photoStore);
}

export async function getPhoto(key: string): Promise<string | undefined> {
  return get<string>(key, photoStore);
}

export async function deletePhoto(key: string): Promise<void> {
  await del(key, photoStore);
}

export async function clearPreplanPhotos(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await clear(photoStore);
}
