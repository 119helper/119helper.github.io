// 대상물 사진 저장소 — localStorage 용량 한계를 피해 IndexedDB(idb-keyval)에 보관한다.

import { createStore, del, get, set } from 'idb-keyval';

const photoStore = createStore('119-preplan', 'photos');

/** 첨부 사진을 리사이즈(최대 1024px, JPEG 0.7)해 dataURL로 변환한다. */
export function resizeImage(file: File, maxSize = 1024, quality = 0.7): Promise<string> {
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
  await set(key, dataUrl, photoStore);
}

export async function getPhoto(key: string): Promise<string | undefined> {
  return get<string>(key, photoStore);
}

export async function deletePhoto(key: string): Promise<void> {
  await del(key, photoStore);
}
