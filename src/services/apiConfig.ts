export const API_BASE = import.meta.env.VITE_API_BASE || 'https://119-helper-api.teemozipsa.workers.dev';

const APP_TOKEN = import.meta.env.VITE_APP_TOKEN || '';

export function workerHeaders(extra?: HeadersInit): HeadersInit {
  const headers = new Headers(extra);
  if (APP_TOKEN) headers.set('X-App-Token', APP_TOKEN);
  return headers;
}
