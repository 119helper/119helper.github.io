function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function errorMessage(error) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause ? `; 원인: ${errorMessage(error.cause)}` : '';
  return `${error.name}: ${error.message}${cause}`;
}

function isRetryableStatus(status) {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

class NonRetryableResponseError extends Error {}

/**
 * 공식 데이터 파일·페이지를 제한된 횟수만 재시도한다. 각 시도마다 새 timeout
 * signal을 만들며, 4xx 영구 오류는 즉시 실패하고 연결 오류·429·5xx만 재시도한다.
 */
export async function fetchWithRetry(url, init = {}, options = {}) {
  const attempts = Math.max(1, Number(options.attempts) || 3);
  const timeoutMs = Math.max(1, Number(options.timeoutMs) || 60_000);
  const baseDelayMs = Math.max(0, Number(options.baseDelayMs) || 1_000);
  const fetchImpl = options.fetchImpl || fetch;
  const delayImpl = options.delayImpl || wait;
  const label = options.label || '공식 데이터 조회';
  const onRetry = options.onRetry || (({ attempt, error, nextDelayMs }) => {
    console.warn(
      `${label}: ${attempt}/${attempts}회 시도 실패 (${errorMessage(error)}), `
      + `${nextDelayMs}ms 후 재시도`,
    );
  });
  let lastError;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const signal = init.signal
        ? AbortSignal.any([init.signal, timeoutSignal])
        : timeoutSignal;
      const response = await fetchImpl(url, { ...init, signal });
      if (response.ok) return response;

      const detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 180);
      const responseError = new Error(
        `HTTP ${response.status}${detail ? ` ${detail}` : ''}`,
      );
      if (!isRetryableStatus(response.status)) {
        throw new NonRetryableResponseError(responseError.message, { cause: responseError });
      }
      lastError = responseError;
    } catch (error) {
      if (error instanceof NonRetryableResponseError) {
        throw new Error(`${label}: ${errorMessage(error)}`, { cause: error });
      }
      lastError = error;
    }

    if (attempt < attempts) {
      const nextDelayMs = Math.min(8_000, baseDelayMs * (2 ** (attempt - 1)));
      onRetry({ attempt, attempts, error: lastError, nextDelayMs, url: String(url) });
      await delayImpl(nextDelayMs);
    }
  }

  throw new Error(
    `${label}: ${attempts}회 시도 후 실패 (${errorMessage(lastError)})`,
    { cause: lastError },
  );
}
