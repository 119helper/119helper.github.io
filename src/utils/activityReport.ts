// 현장활동 타임라인 → 소요시간 계산 + 표준 보고서 초안 생성.

export interface StageStamp {
  label: string;
  time: number;            // epoch ms
  lat?: number | null;
  lon?: number | null;
}

export interface StageDuration extends StageStamp {
  deltaFromPrevMs: number; // 이전 단계로부터 경과 (첫 단계는 0)
}

/**
 * mm:ss 또는 h:mm:ss 형태로 ms를 사람이 읽는 시간으로 변환.
 */
export function formatDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

/**
 * 단계별 이전 대비 경과시간을 계산한다. 입력은 기록 순서를 가정한다.
 */
export function computeStageDurations(stamps: StageStamp[]): StageDuration[] {
  return stamps.map((s, i) => ({
    ...s,
    deltaFromPrevMs: i === 0 ? 0 : s.time - stamps[i - 1].time,
  }));
}

/**
 * 첫 단계부터 마지막 단계까지 총 소요시간(ms). 단계가 2개 미만이면 0.
 */
export function totalDurationMs(stamps: StageStamp[]): number {
  if (stamps.length < 2) return 0;
  return stamps[stamps.length - 1].time - stamps[0].time;
}

export interface ReportOptions {
  title: string;
  stamps: StageStamp[];
  note?: string;
  author?: string; // 작성자 표기 (예: '소방교 홍길동 / ○○센터')
}

/**
 * 표준 양식 텍스트 보고서 초안을 생성한다.
 */
export function buildReportDraft({ title, stamps, note, author }: ReportOptions): string {
  const durations = computeStageDurations(stamps);
  const fmtClock = (ms: number) =>
    new Date(ms).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const lines: string[] = [];
  lines.push(`[현장활동 보고서 초안] ${title}`);
  if (author && author.trim()) lines.push(`작성자: ${author.trim()}`);
  lines.push('');
  lines.push('■ 활동 타임라인');
  durations.forEach(d => {
    const delta = d.deltaFromPrevMs > 0 ? ` (+${formatDuration(d.deltaFromPrevMs)})` : '';
    const gps = d.lat != null && d.lon != null ? ` [GPS ${d.lat.toFixed(5)}, ${d.lon.toFixed(5)}]` : '';
    lines.push(`- ${fmtClock(d.time)}  ${d.label}${delta}${gps}`);
  });
  lines.push('');
  lines.push(`■ 총 활동시간: ${formatDuration(totalDurationMs(stamps))}`);
  if (note && note.trim()) {
    lines.push('');
    lines.push('■ 특이사항');
    lines.push(note.trim());
  }
  return lines.join('\n');
}

export interface ReportIncidentContext {
  title: string;
  type?: string;
  address?: string;
  startedAt?: number;
}

export interface ReportTimerSummary {
  label: string;
  remainingSeconds: number;
  totalSeconds: number;
  running: boolean;
}

export interface ReportPackageOptions extends ReportOptions {
  incident?: ReportIncidentContext | null;
  timers?: ReportTimerSummary[];
  triageCounts?: Partial<Record<'red' | 'yellow' | 'green' | 'black', number>>;
}

function formatClockDate(ms: number): string {
  return new Date(ms).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export function buildReportPackageText(options: ReportPackageOptions): string {
  const lines = [buildReportDraft(options)];

  if (options.incident) {
    lines.push('');
    lines.push('■ 출동 상황판');
    lines.push(`- 제목: ${options.incident.title || options.title}`);
    if (options.incident.type) lines.push(`- 유형: ${options.incident.type}`);
    if (options.incident.address) lines.push(`- 위치: ${options.incident.address}`);
    if (options.incident.startedAt) lines.push(`- 시작: ${formatClockDate(options.incident.startedAt)}`);
  }

  if (options.timers && options.timers.length > 0) {
    lines.push('');
    lines.push('■ 현장 타이머');
    options.timers.forEach(timer => {
      const usedMs = Math.max(0, timer.totalSeconds - timer.remainingSeconds) * 1000;
      lines.push(`- ${timer.label}: 경과 ${formatDuration(usedMs)} / 전체 ${formatDuration(timer.totalSeconds * 1000)}${timer.running ? ' (진행 중)' : ''}`);
    });
  }

  if (options.triageCounts) {
    const red = options.triageCounts.red ?? 0;
    const yellow = options.triageCounts.yellow ?? 0;
    const green = options.triageCounts.green ?? 0;
    const black = options.triageCounts.black ?? 0;
    if (red + yellow + green + black > 0) {
      lines.push('');
      lines.push('■ 환자 분류 집계');
      lines.push(`- 긴급 I: ${red}명`);
      lines.push(`- 응급 II: ${yellow}명`);
      lines.push(`- 경증 III: ${green}명`);
      lines.push(`- 사망/지연 0: ${black}명`);
    }
  }

  return lines.join('\n');
}
