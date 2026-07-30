import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchNewsThumbnail } from './newsApi';

describe('fetchNewsThumbnail', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('requests the Worker image proxy instead of the external image host', async () => {
    const image = new Blob(['image'], { type: 'image/webp' });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(image, {
      headers: {
        'Content-Type': 'image/webp',
        'Content-Length': String(image.size),
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchNewsThumbnail('https://cdn.example/fire.webp?width=800')).resolves.toEqual(image);

    const requestUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(requestUrl.origin).toBe('https://119-helper-api.teemozipsa.workers.dev');
    expect(requestUrl.pathname).toBe('/api/news/image');
    expect(requestUrl.searchParams.get('url')).toBe('https://cdn.example/fire.webp?width=800');
  });

  it('rejects unsafe input and non-image proxy responses', async () => {
    const fetchMock = vi.fn(async () => new Response('not image', {
      headers: { 'Content-Type': 'text/html' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchNewsThumbnail('javascript:alert(1)')).rejects.toThrow('유효하지 않은');
    expect(fetchMock).not.toHaveBeenCalled();

    await expect(fetchNewsThumbnail('https://cdn.example/not-image')).rejects.toThrow('이미지가 아닌');
  });
});
