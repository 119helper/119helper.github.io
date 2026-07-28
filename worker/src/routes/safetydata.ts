import { fetchWithTimeout } from './publicData';

const SAFETYDATA_HOSTS = ['https://www.safetydata.go.kr', 'http://www.safetydata.go.kr'];
const RETRYABLE_STATUS = new Set([520, 521, 522, 523, 524, 525]);

interface SafetydataFetchOptions {
  label: string;
  attempts?: number;
  headers?: HeadersInit;
}

function compact(text: string): string {
  return text.replace(/\s+/g, ' ').slice(0, 140);
}

function isSafetydataEdgeError(status: number, text: string): boolean {
  return RETRYABLE_STATUS.has(status) || text.trimStart().toLowerCase().startsWith('error code:');
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchSafetydataJson(
  path: string,
  params: URLSearchParams,
  { label, attempts = 5, headers }: SafetydataFetchOptions,
): Promise<unknown> {
  let lastStatus = 0;
  let lastText = '';

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    for (const host of SAFETYDATA_HOSTS) {
      try {
        const res = await fetchWithTimeout(`${host}${path}?${params}`, {
          headers: {
            Accept: 'application/json',
            'Cache-Control': 'no-cache',
            'User-Agent': '119-helper-worker/1.0',
            ...headers,
          },
        });

        lastStatus = res.status;
        lastText = await res.text();

        if (!res.ok || isSafetydataEdgeError(res.status, lastText)) {
          continue;
        }

        return JSON.parse(lastText) as unknown;
      } catch (error) {
        lastText = error instanceof Error
          ? (error.name === 'AbortError' ? 'timeout' : error.message)
          : String(error);
      }
    }

    if (attempt < attempts - 1) {
      await delay(200 * (attempt + 1));
    }
  }

  throw new Error(`${label} ${lastStatus}: ${compact(lastText)}`);
}
