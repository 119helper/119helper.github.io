import { afterEach, describe, expect, it, vi } from 'vitest';
import { newsHandler } from './news';

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
});
