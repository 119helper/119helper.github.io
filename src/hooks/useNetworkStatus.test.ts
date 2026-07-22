import { describe, expect, it } from 'vitest';
import { nextNetworkState, type NetworkStatusState } from './useNetworkStatus';

describe('nextNetworkState', () => {
  const initial: NetworkStatusState = { state: 'online', lastSuccessAt: null };

  it('marks the connection unstable only after repeated request failures', () => {
    const first = nextNetworkState(initial, 'request-failure', 1);
    const second = nextNetworkState(first, 'request-failure', 2);
    expect(first.state).toBe('online');
    expect(second.state).toBe('unstable');
  });

  it('records a successful response and recovers the connection state', () => {
    expect(nextNetworkState({ state: 'unstable', lastSuccessAt: 10 }, 'request-success', 0, 1234)).toEqual({
      state: 'online',
      lastSuccessAt: 1234,
    });
  });

  it('gives explicit offline events priority', () => {
    expect(nextNetworkState(initial, 'offline', 0).state).toBe('offline');
  });
});
