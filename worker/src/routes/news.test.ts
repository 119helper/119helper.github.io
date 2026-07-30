import { afterEach, describe, expect, it, vi } from 'vitest';
import { newsHandler, newsImageHandler } from './news';

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>소방 뉴스</title>
      <description>테스트</description>
      <pubDate>Tue, 30 Jun 2026 05:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

describe('newsHandler', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('allowlists news type and clamps sanitized search queries before upstream fetch', async () => {
    const longQuery = `${'<script>alert(1)</script>'.repeat(20)}서울 소방`;
    const fetchMock = vi.fn(async (_input: RequestInfo | URL) => new Response(rss, {
      headers: { 'Content-Type': 'application/rss+xml' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await newsHandler(
      new Request(`https://api.example.test/api/news?type=../../nfa&query=${encodeURIComponent(longQuery)}`),
      {},
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const upstreamUrl = new URL(String(fetchMock.mock.calls[0][0]));
    expect(upstreamUrl.hostname).toBe('www.bing.com');
    expect(upstreamUrl.pathname).toBe('/news/search');
    expect(upstreamUrl.searchParams.get('q')).not.toContain('<');
    expect(upstreamUrl.searchParams.get('q')?.length).toBeLessThanOrEqual(120);
  });

  it('does not follow og:image redirects to blocked hosts', async () => {
    const rssWithLink = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>소방 뉴스</title>
      <link>https://news.example/article</link>
      <description>테스트</description>
      <pubDate>Tue, 30 Jun 2026 05:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes('bing.com')) {
        return new Response(rssWithLink, { headers: { 'Content-Type': 'application/rss+xml' } });
      }
      if (url === 'https://news.example/article') {
        return new Response(null, {
          status: 302,
          headers: { Location: 'http://127.0.0.1/admin' },
        });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await newsHandler(
      new Request('https://api.example.test/api/news?query=소방'),
      {},
    );

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[1][0])).toBe('https://news.example/article');
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ redirect: 'manual' });
    await expect(response.text()).resolves.not.toContain('<imageUrl>');
  });

  it('extracts relative og:image URLs from the bounded HTML prefix even when the full page is large', async () => {
    const rssWithLink = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>소방 뉴스</title>
      <link>https://news.example/articles/1</link>
      <description>테스트</description>
      <pubDate>Tue, 30 Jun 2026 05:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('bing.com')) {
        return new Response(rssWithLink, { headers: { 'Content-Type': 'application/rss+xml' } });
      }
      if (url === 'https://news.example/articles/1') {
        return new Response(
          '<html><head><meta content="../images/fire.jpg?width=800&amp;height=450" property="og:image"></head></html>',
          {
            headers: {
              'Content-Type': 'text/html',
              'Content-Length': String(1024 * 1024),
            },
          },
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await newsHandler(
      new Request('https://api.example.test/api/news?query=소방'),
      {},
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain(
      '<imageUrl><![CDATA[https://news.example/images/fire.jpg?width=800&height=450]]></imageUrl>',
    );
  });

  it('tries the distinct safe article mirror when the original article has no usable image', async () => {
    const rssWithBothLinks = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>소방 뉴스</title>
      <originallink>https://publisher.example/articles/1</originallink>
      <link>https://n.news.naver.com/article/001/0000000001</link>
      <description>테스트</description>
      <pubDate>Tue, 30 Jun 2026 05:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const url = String(input);
      if (url.includes('bing.com')) {
        return new Response(rssWithBothLinks, { headers: { 'Content-Type': 'application/rss+xml' } });
      }
      if (url === 'https://publisher.example/articles/1') {
        return new Response('<html><head><title>이미지 없음</title></head></html>');
      }
      if (url === 'https://n.news.naver.com/article/001/0000000001') {
        return new Response(
          '<html><head><meta property="og:image" content="https://imgnews.example/incidents/fire-1.jpg"></head></html>',
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await newsHandler(
      new Request('https://api.example.test/api/news?query=소방'),
      {},
    );
    const body = await response.text();

    expect(body).toContain(
      '<imageUrl><![CDATA[https://imgnews.example/incidents/fire-1.jpg]]></imageUrl>',
    );
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toEqual([
      expect.stringContaining('https://www.bing.com/news/search'),
      'https://publisher.example/articles/1',
      'https://n.news.naver.com/article/001/0000000001',
    ]);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({ redirect: 'manual' });
    expect(fetchMock.mock.calls[2][1]).toMatchObject({ redirect: 'manual' });
  });

  it('extracts og:image from the tenth item without scraping the eleventh', async () => {
    const itemXml = Array.from({ length: 11 }, (_, index) => {
      const itemNumber = index + 1;
      return `
    <item>
      <title>소방 뉴스 ${itemNumber}</title>
      <link>https://news.example/articles/${itemNumber}</link>
      <description>테스트 ${itemNumber}</description>
      <pubDate>Tue, 30 Jun 2026 05:00:00 GMT</pubDate>
    </item>`;
    }).join('');
    const rssWithElevenItems = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>${itemXml}
  </channel></rss>`;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('bing.com')) {
        return new Response(rssWithElevenItems, { headers: { 'Content-Type': 'application/rss+xml' } });
      }

      const match = url.match(/https:\/\/news\.example\/articles\/(\d+)$/);
      if (match) {
        return new Response(
          `<html><head><meta property="og:image" content="https://cdn.example/incidents/${match[1]}.jpg"></head></html>`,
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await newsHandler(
      new Request('https://api.example.test/api/news?query=소방'),
      {},
    );
    const body = await response.text();

    expect(body).toContain(
      '<imageUrl><![CDATA[https://cdn.example/incidents/10.jpg]]></imageUrl>',
    );
    expect(body).not.toContain(
      '<imageUrl><![CDATA[https://cdn.example/incidents/11.jpg]]></imageUrl>',
    );
    expect(fetchMock.mock.calls.map(([input]) => String(input))).toContain(
      'https://news.example/articles/10',
    );
    expect(fetchMock.mock.calls.map(([input]) => String(input))).not.toContain(
      'https://news.example/articles/11',
    );
  });

  it('filters generic feed and metadata thumbnails while retaining a real article image', async () => {
    const rssWithGenericImage = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>소방 뉴스</title>
      <link>https://news.example/articles/1</link>
      <News:Image>https://cdn.example/sns_thumbnail.jpg</News:Image>
      <description>테스트</description>
      <pubDate>Tue, 30 Jun 2026 05:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('bing.com')) {
        return new Response(rssWithGenericImage, { headers: { 'Content-Type': 'application/rss+xml' } });
      }
      if (url === 'https://news.example/articles/1') {
        return new Response(
          '<html><head>'
          + '<meta property="og:image" content="https://cdn.example/site-logo.png">'
          + '<meta property="og:image" content="https://cdn.example/banner.png">'
          + '<meta property="og:image" content="https://cdn.example/icon.png">'
          + '<meta property="og:image" content="https://cdn.example/incidents/fire-banner-2026.jpg">'
          + '</head></html>',
        );
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await newsHandler(
      new Request('https://api.example.test/api/news?query=소방'),
      {},
    );
    const body = await response.text();

    expect(body).not.toContain('<imageUrl><![CDATA[https://cdn.example/sns_thumbnail.jpg]]>');
    expect(body).not.toContain('<imageUrl><![CDATA[https://cdn.example/site-logo.png]]>');
    expect(body).not.toContain('<imageUrl><![CDATA[https://cdn.example/banner.png]]>');
    expect(body).not.toContain('<imageUrl><![CDATA[https://cdn.example/icon.png]]>');
    expect(body).toContain(
      '<imageUrl><![CDATA[https://cdn.example/incidents/fire-banner-2026.jpg]]></imageUrl>',
    );
  });

  it('preserves a cached successful image and its original timestamp when a refresh misses metadata', async () => {
    const articleLink = 'https://news.example/articles/1';
    const cachedImage = 'https://cdn.example/incidents/cached-fire.jpg';
    const cachedAt = Date.now() - (16 * 60 * 1000);
    const originalImageTimestamp = Date.now() - (2 * 60 * 60 * 1000);
    const cachedRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>이전 소방 뉴스</title>
      <link>${articleLink}</link>
      <imageUrl><![CDATA[${cachedImage}]]></imageUrl>
      <description>이전 테스트</description>
      <pubDate>Tue, 30 Jun 2026 04:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
    const refreshedRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>새 소방 뉴스</title>
      <link>${articleLink}</link>
      <description>새 테스트</description>
      <pubDate>Tue, 30 Jun 2026 05:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
    const kvGet = vi.fn(async () => ({
      text: cachedRss,
      ts: cachedAt,
      imageTimestamps: {
        [articleLink]: originalImageTimestamp,
      },
    }));
    const kvPut = vi.fn(async (
      _key: string,
      _value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
      _options?: KVNamespacePutOptions,
    ) => undefined);
    const newsCache = {
      get: kvGet,
      put: kvPut,
    } as unknown as KVNamespace;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('bing.com')) {
        return new Response(refreshedRss, { headers: { 'Content-Type': 'application/rss+xml' } });
      }
      if (url === articleLink) {
        return new Response('<html><head><title>일시적으로 OG 이미지 없음</title></head></html>');
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await newsHandler(
      new Request('https://api.example.test/api/news?query=소방'),
      { NEWS_CACHE: newsCache },
    );
    const body = await response.text();

    expect(body).toContain(`<imageUrl><![CDATA[${cachedImage}]]></imageUrl>`);
    expect(kvGet).toHaveBeenCalledWith(expect.stringContaining('news:v7:google:'), 'json');
    expect(kvPut).toHaveBeenCalledOnce();
    const storedEntry = JSON.parse(String(kvPut.mock.calls[0][1])) as {
      text: string;
      ts: number;
      imageTimestamps: Record<string, number>;
    };
    expect(storedEntry.text).toContain(cachedImage);
    expect(storedEntry.ts).toBeGreaterThan(cachedAt);
    expect(storedEntry.imageTimestamps[articleLink]).toBe(originalImageTimestamp);
  });

  it('does not reinsert a cached image after its per-link timestamp exceeds the stale limit', async () => {
    const articleLink = 'https://news.example/articles/expired';
    const cachedImage = 'https://cdn.example/incidents/expired-fire.jpg';
    const cachedRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>이전 소방 뉴스</title>
      <link>${articleLink}</link>
      <imageUrl><![CDATA[${cachedImage}]]></imageUrl>
      <description>이전 테스트</description>
      <pubDate>Tue, 30 Jun 2026 04:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
    const refreshedRss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <item>
      <title>새 소방 뉴스</title>
      <link>${articleLink}</link>
      <description>새 테스트</description>
      <pubDate>Tue, 30 Jun 2026 05:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;
    const kvGet = vi.fn(async () => ({
      text: cachedRss,
      ts: Date.now() - (16 * 60 * 1000),
      imageTimestamps: {
        [articleLink]: Date.now() - (7 * 60 * 60 * 1000),
      },
    }));
    const kvPut = vi.fn(async (
      _key: string,
      _value: string | ArrayBuffer | ArrayBufferView | ReadableStream,
      _options?: KVNamespacePutOptions,
    ) => undefined);
    const newsCache = {
      get: kvGet,
      put: kvPut,
    } as unknown as KVNamespace;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('bing.com')) {
        return new Response(refreshedRss, { headers: { 'Content-Type': 'application/rss+xml' } });
      }
      if (url === articleLink) {
        return new Response('<html><head><title>OG 이미지 없음</title></head></html>');
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);

    const response = await newsHandler(
      new Request('https://api.example.test/api/news?query=소방'),
      { NEWS_CACHE: newsCache },
    );
    const body = await response.text();
    const storedEntry = JSON.parse(String(kvPut.mock.calls[0][1])) as {
      text: string;
      imageTimestamps: Record<string, number>;
    };

    expect(body).not.toContain(cachedImage);
    expect(body).not.toContain('<imageUrl>');
    expect(storedEntry.text).not.toContain(cachedImage);
    expect(storedEntry.imageTimestamps).not.toHaveProperty(articleLink);
  });

  it('rejects oversized RSS responses before buffering all content', async () => {
    const oversized = '<rss><channel><item></item></channel></rss>'.padEnd(512 * 1024 + 10, 'x');
    const fetchMock = vi.fn(async () => new Response(oversized, {
      headers: {
        'Content-Type': 'application/rss+xml',
        'Content-Length': String(512 * 1024 + 10),
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await newsHandler(
      new Request('https://api.example.test/api/news?query=소방'),
      {},
    );

    expect(response.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('newsImageHandler', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns a bounded raster image with cache headers', async () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(bytes, {
      headers: {
        'Content-Type': 'image/jpeg',
        'Content-Length': String(bytes.byteLength),
      },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await newsImageHandler(
      new Request(`https://api.example.test/api/news/image?url=${encodeURIComponent('https://cdn.example/fire.jpg')}`),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('image/jpeg');
    expect(response.headers.get('Cache-Control')).toContain('max-age=86400');
    expect(fetchMock.mock.calls[0][1]).toMatchObject({ redirect: 'manual' });
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });

  it('blocks image redirects to private network targets', async () => {
    const fetchMock = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { Location: 'http://127.0.0.1/private.jpg' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await newsImageHandler(
      new Request(`https://api.example.test/api/news/image?url=${encodeURIComponent('https://cdn.example/fire.jpg')}`),
    );

    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects non-image and oversized image responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('<html>not an image</html>', {
        headers: { 'Content-Type': 'text/html' },
      }))
      .mockResolvedValueOnce(new Response(new Uint8Array([1]), {
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(3 * 1024 * 1024 + 1),
        },
      }));
    vi.stubGlobal('fetch', fetchMock);

    const nonImage = await newsImageHandler(
      new Request(`https://api.example.test/api/news/image?url=${encodeURIComponent('https://cdn.example/not-image')}`),
    );
    const oversized = await newsImageHandler(
      new Request(`https://api.example.test/api/news/image?url=${encodeURIComponent('https://cdn.example/large.png')}`),
    );

    expect(nonImage.status).toBe(415);
    expect(oversized.status).toBe(413);
  });
});
