import { createHash } from 'node:crypto';

export const TSUNAMI_CONTENT_HASH_ALGORITHM = 'sha256:stable-id+canonical-json-v1';

export function tsunamiShelterId(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    throw new TypeError('지진해일 대피소 행은 객체여야 합니다.');
  }

  const parts = ['ARCD', 'SHNTDTR_SN', 'SHNT_PLACE_SN']
    .map(field => String(item[field] ?? '').trim());
  if (parts.some(part => !part)) {
    throw new Error('지진해일 대피소 행의 복합 식별자가 비어 있습니다.');
  }
  return parts.join(':');
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize(value[key])]),
  );
}

export function fingerprintTsunamiShelters(items) {
  if (!Array.isArray(items)) {
    throw new TypeError('지진해일 대피소 데이터는 배열이어야 합니다.');
  }

  const seen = new Set();
  const canonicalRows = items
    .map(item => {
      const id = tsunamiShelterId(item);
      if (seen.has(id)) {
        throw new Error(`지진해일 대피소 복합 식별자가 중복됐습니다: ${id}`);
      }
      seen.add(id);
      return { id, item: canonicalize(item) };
    })
    .sort((a, b) => a.id.localeCompare(b.id))
    .map(({ item }) => item);

  return createHash('sha256')
    .update(JSON.stringify(canonicalRows))
    .digest('hex');
}
