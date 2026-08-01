const CHUNK_RECOVERY_KEY = '119helper-chunk-load-recovery-at';
const CHUNK_RECOVERY_COOLDOWN_MS = 60_000;

interface RecoveryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface ChunkLoadRecoveryOptions {
  online?: boolean;
  now?: number;
  storage?: RecoveryStorage | null;
  reload?: () => void;
}

const CHUNK_LOAD_ERROR_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /chunkloaderror/i,
  /loading chunk .+ failed/i,
  /unable to preload css/i,
];

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === 'string' ? error : '';
}

export function isChunkLoadError(error: unknown): boolean {
  const message = errorMessage(error);
  return CHUNK_LOAD_ERROR_PATTERNS.some(pattern => pattern.test(message));
}

function browserSessionStorage(): RecoveryStorage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function reloadApp() {
  window.location.reload();
}

/**
 * 새 배포로 해시 청크가 바뀌었거나 일시적으로 청크 요청이 끊긴 경우 한 번만
 * 문서 전체를 다시 받아온다. sessionStorage 쿨다운은 같은 장애로 인한
 * 무한 새로고침을 막는다.
 */
export function attemptChunkLoadRecovery(
  error: unknown,
  options: ChunkLoadRecoveryOptions = {},
): boolean {
  if (!isChunkLoadError(error)) return false;

  const online = options.online
    ?? (typeof navigator !== 'undefined' && navigator.onLine);
  if (!online) return false;

  const storage = options.storage === undefined
    ? browserSessionStorage()
    : options.storage;
  if (!storage) return false;

  const now = options.now ?? Date.now();
  try {
    const previousAttempt = Number(storage.getItem(CHUNK_RECOVERY_KEY));
    if (Number.isFinite(previousAttempt)
      && previousAttempt > 0
      && now - previousAttempt < CHUNK_RECOVERY_COOLDOWN_MS) {
      return false;
    }
    storage.setItem(CHUNK_RECOVERY_KEY, String(now));
  } catch {
    return false;
  }

  (options.reload ?? reloadApp)();
  return true;
}
