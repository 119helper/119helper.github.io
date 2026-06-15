import { describe, expect, it } from 'vitest';
import { computeStageDurations, totalDurationMs, formatDuration, buildReportDraft, type StageStamp } from './activityReport';

const t0 = new Date('2026-06-15T10:00:00').getTime();
const stamps: StageStamp[] = [
  { label: '출동', time: t0 },
  { label: '현장도착', time: t0 + 5 * 60 * 1000 },     // +5분
  { label: '방수개시', time: t0 + 8 * 60 * 1000 },     // +3분
  { label: '귀소', time: t0 + 68 * 60 * 1000 },        // +60분
];

describe('activity report utilities', () => {
  it('formats durations as mm:ss and h:mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00');
    expect(formatDuration(90 * 1000)).toBe('01:30');
    expect(formatDuration(3725 * 1000)).toBe('1:02:05');
  });

  it('computes per-stage deltas from the previous stamp', () => {
    const d = computeStageDurations(stamps);
    expect(d[0].deltaFromPrevMs).toBe(0);
    expect(d[1].deltaFromPrevMs).toBe(5 * 60 * 1000);
    expect(d[2].deltaFromPrevMs).toBe(3 * 60 * 1000);
    expect(d[3].deltaFromPrevMs).toBe(60 * 60 * 1000);
  });

  it('computes total duration from first to last', () => {
    expect(totalDurationMs(stamps)).toBe(68 * 60 * 1000);
    expect(totalDurationMs([])).toBe(0);
    expect(totalDurationMs([stamps[0]])).toBe(0);
  });

  it('builds a report draft containing stages, total and notes', () => {
    const report = buildReportDraft({ title: '○○동 화재', stamps, note: '인명피해 없음' });
    expect(report).toContain('○○동 화재');
    expect(report).toContain('방수개시');
    expect(report).toContain('총 활동시간: 1:08:00');
    expect(report).toContain('인명피해 없음');
  });
});
