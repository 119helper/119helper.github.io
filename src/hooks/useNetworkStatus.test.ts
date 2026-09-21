import { describe, expect, it } from 'vitest';
import { nextNetworkState, updateServiceHealth, type NetworkStatusState } from './useNetworkStatus';

describe('nextNetworkState', () => {
  it('keeps a failed service visible after another service succeeds and after reconnecting', () => {
    let state: NetworkStatusState = { state: 'online', lastSuccessAt: null };
    state = updateServiceHealth(state, '/api/er/beds', true, 100);
    state = updateServiceHealth(state, '/api/er/beds', false, 200);
    state = updateServiceHealth(state, '/api/weather/now', true, 300);
    expect(state.state).toBe('unstable');
    expect(state.services?.['/api/er/beds'].lastSuccessAt).toBe(100);
    state = nextNetworkState(nextNetworkState(state, 'offline', 0), 'online', 0);
    expect(state.state).toBe('unstable');
    expect(updateServiceHealth(state, '/api/er/beds', true, 400).state).toBe('online');
  });
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
