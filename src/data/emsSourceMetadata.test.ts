import { describe, expect, it } from 'vitest';
import { EMS_DRUGS } from './emsDrugs';
import { EMS_PROTOCOLS, EMS_SOURCE_INFO } from './emsProtocols';

describe('EMS static-reference provenance', () => {
  it('separates the operational baseline from the newer CPR-only guideline', () => {
    expect(EMS_SOURCE_INFO.baselineYear).toBe(2023);
    expect(EMS_SOURCE_INFO.latestCprGuideline).toContain('2025');
    expect(EMS_SOURCE_INFO.lastChecked).toBe('2026-07-29');
    expect(EMS_SOURCE_INFO.nfaUrl).toContain('nfa.go.kr');
    expect(EMS_SOURCE_INFO.kacprUrl).toContain('kacpr.org');
  });

  it('does not present KACPR as the blanket source for every protocol and drug', () => {
    expect(EMS_PROTOCOLS.every(item => item.source === EMS_SOURCE_INFO.operationalBaseline)).toBe(true);
    expect(EMS_DRUGS.every(item => item.source === EMS_SOURCE_INFO.operationalBaseline)).toBe(true);
  });
});
