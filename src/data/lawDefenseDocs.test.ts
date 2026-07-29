import { describe, expect, it } from 'vitest';
import { LAW_DEFENSE_DOCS } from './lawDefenseDocs';

function searchableText(doc: (typeof LAW_DEFENSE_DOCS)[number]): string {
  return [
    doc.title,
    doc.summary,
    doc.fullText,
    doc.coreLaw,
    doc.officialBasis,
    ...doc.actionManual,
  ].join(' ');
}

describe('law defense reference cards', () => {
  it('only publishes reviewed cards with primary-law sources', () => {
    expect(LAW_DEFENSE_DOCS.length).toBeGreaterThanOrEqual(8);

    for (const doc of LAW_DEFENSE_DOCS) {
      expect(doc.lastReviewed).toBe('2026-07-29');
      expect(doc.sources.length).toBeGreaterThan(0);
      expect(doc.sources.every(source => source.url.startsWith('https://www.law.go.kr/'))).toBe(true);
      expect(doc.actionManual.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('does not reintroduce unverifiable cases or categorical immunity claims', () => {
    const text = LAW_DEFENSE_DOCS.map(searchableText).join(' ');

    expect(text).not.toMatch(/100%|완전 면책|전면 면책|전혀 없습니다|전원 무혐의|승소 사례/);
    expect(text).not.toMatch(/종로구 빌라|경기 구급대원 CPR|부산 구급차 흉기|한강 투신|대구 10대/);
  });

  it('keeps the corrected statutory anchors', () => {
    const text = LAW_DEFENSE_DOCS.map(searchableText).join(' ');

    expect(text).toContain('소방기본법 제25조제3항');
    expect(text).toContain('소방기본법 제16조의5');
    expect(text).toContain('119구조ㆍ구급에 관한 법률 제15조');
    expect(text).toContain('도로교통법 제29조');
    expect(text).toContain('개인정보 보호법 제15조');
    expect(text).toContain('제23조의2는 감염병환자 등의 이송');
  });
});
