import { describe, expect, it, vi } from 'vitest';
import { attemptChunkLoadRecovery, isChunkLoadError } from './chunkLoadRecovery';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('chunkLoadRecovery', () => {
  it.each([
    'Failed to fetch dynamically imported module: https://119.test/assets/DashboardView-old.js',
    'Importing a module script failed.',
    'ChunkLoadError: Loading chunk 42 failed',
    'Unable to preload CSS for /assets/view-old.css',
  ])('recognizes a lazy chunk failure: %s', message => {
    expect(isChunkLoadError(new Error(message))).toBe(true);
  });

  it('does not classify an ordinary render exception as a chunk failure', () => {
    expect(isChunkLoadError(new Error('Cannot read properties of undefined'))).toBe(false);
  });

  it('reloads once while online and prevents a reload loop during the cooldown', () => {
    const storage = memoryStorage();
    const reload = vi.fn();
    const error = new Error('Failed to fetch dynamically imported module: /assets/view-old.js');

    expect(attemptChunkLoadRecovery(error, {
      online: true,
      now: 10_000,
      storage,
      reload,
    })).toBe(true);
    expect(attemptChunkLoadRecovery(error, {
      online: true,
      now: 20_000,
      storage,
      reload,
    })).toBe(false);
    expect(attemptChunkLoadRecovery(error, {
      online: true,
      now: 70_001,
      storage,
      reload,
    })).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('does not reload an uncached chunk while offline', () => {
    const reload = vi.fn();
    expect(attemptChunkLoadRecovery(
      new Error('Error loading dynamically imported module'),
      { online: false, storage: memoryStorage(), reload },
    )).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });
});
