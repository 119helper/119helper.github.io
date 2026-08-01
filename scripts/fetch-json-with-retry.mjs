function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 동일한 공식 원천의 HTTPS/HTTP 대체 주소를 순서대로 시도하고, 연결·HTTP·JSON
 * 오류가 있으면 제한된 횟수만 재시도한다.
 */
export async function fetchJsonWithRetry(urls, options = {}) {
  const candidates = [...new Set(urls)].filter(Boolean);
  if (candidates.length === 0) throw new Error('JSON 조회 주소가 필요합니다.');

  const attempts = Math.max(1, Number(options.attempts) || 3);
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || 20_000);
  const label = options.label || 'JSON 조회';
  const fetchImpl = options.fetchImpl || fetch;
  const delayImpl = options.delayImpl || wait;
  let lastMessage = '';

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    for (const url of candidates) {
      try {
        const response = await fetchImpl(url, {
          headers: options.headers,
          signal: AbortSignal.timeout(timeoutMs),
        });
        const text = await response.text();
        if (!response.ok || text.trimStart().toLowerCase().startsWith('error code:')) {
          lastMessage = `HTTP ${response.status}: ${text.replace(/\s+/g, ' ').slice(0, 160)}`;
          continue;
        }
        return JSON.parse(text);
      } catch (error) {
        lastMessage = error instanceof Error ? error.message : String(error);
      }
    }

    if (attempt < attempts) await delayImpl(300 * attempt);
  }

  throw new Error(`${label}: ${lastMessage || '응답 없음'}`);
}
