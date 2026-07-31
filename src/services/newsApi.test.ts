// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  fetchLocalNews,
  fetchNewsThumbnail,
  formatNewsPubDate,
  isLikelyPlaceholderImageUrl,
  normalizeNewsText,
} from './newsApi';
import { API_BASE } from './apiConfig';

describe('news feed normalization', () => {
  it('removes markup, decodes named and numeric entities, and cleans whitespace', () => {
    expect(normalizeNewsText(
      '  <b>전공노</b>\n&amp;quot;징계&amp;quot; &amp; 안전 &#39;대응&#39; &#x1F525;  ',
    )).toBe('전공노 "징계" & 안전 \'대응\' 🔥');

    expect(normalizeNewsText('&amp;lt;em&amp;gt;구조 소식&amp;lt;/em&amp;gt;&nbsp;')).toBe('구조 소식');
    expect(normalizeNewsText('&amp;ldquo;현장&amp;rdquo;&amp;hellip; 안전&amp;ndash;점검&amp;middot;확인')).toBe('“현장”… 안전–점검·확인');
  });

  it('filters only filename-shaped generic thumbnails and keeps article photos', () => {
    expect(isLikelyPlaceholderImageUrl('https://fpn.example/images/sns_thumbnail.jpg')).toBe(true);
    expect(isLikelyPlaceholderImageUrl('https://news.example/assets/publisher-logo.png')).toBe(true);
    expect(isLikelyPlaceholderImageUrl('https://news.example/images/default-image.webp')).toBe(true);
    expect(isLikelyPlaceholderImageUrl('https://news.example/assets/banner.png')).toBe(true);
    expect(isLikelyPlaceholderImageUrl('https://news.example/assets/icon-256x256.png')).toBe(true);
    expect(isLikelyPlaceholderImageUrl('https://logo-news.example/photos/fire-scene-2026.jpg')).toBe(false);
    expect(isLikelyPlaceholderImageUrl('https://news.example/common/images/fire-banner-2026.jpg')).toBe(false);
    expect(isLikelyPlaceholderImageUrl('https://news.example/photos/safety-icon-award.jpg')).toBe(false);
    expect(isLikelyPlaceholderImageUrl('https://news.example/photos/article_2026.jpg')).toBe(false);
  });

  it('includes the year only when an article is from a different year', () => {
    const now = new Date('2026-07-30T12:00:00+09:00');

    expect(formatNewsPubDate('2026-07-30T09:00:00+09:00', now)).not.toContain('2026');
    expect(formatNewsPubDate('2020-11-23T10:50:00+09:00', now)).toContain('2020');
  });

  it('normalizes parsed feed fields and removes a generic feed thumbnail', async () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <rss><channel><item>
        <title>전공노 &amp;amp;quot;징계&amp;amp;quot; - 광주&amp;amp;일보</title>
        <link>https://news.example/article</link>
        <pubDate>Thu, 30 Jul 2026 09:00:00 GMT</pubDate>
        <source>광주&amp;amp;일보</source>
        <description><![CDATA[<b>현장</b>&nbsp; 구조 대응 &#xC18C;&#xC2DD;입니다]]></description>
        <imageUrl>https://news.example/images/sns_thumbnail.jpg</imageUrl>
      </item></channel></rss>`;
    vi.stubGlobal('fetch', vi.fn(async () => new Response(xml, {
      headers: { 'Content-Type': 'application/rss+xml' },
    })));

    const items = await fetchLocalNews('정규화테스트', true);

    expect(items[0]).toMatchObject({
      title: '전공노 "징계"',
      source: '광주&일보',
      description: '현장 구조 대응 소식입니다',
      imageUrl: '',
    });
  });
});

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
    expect(requestUrl.origin).toBe(new URL(API_BASE).origin);
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
