import { useState, useEffect, useId, useRef, useCallback } from 'react';
import { getStaticHolidays } from '../data/holidays';
import { getShiftForDate, SHIFT_CYCLE_DANGBIBI, type ShiftSetting } from '../utils/shiftCalculator';
import { useDialogAccessibility } from '../hooks/useDialogAccessibility';
import { useUnsavedChangesGuard } from '../hooks/useUnsavedChangesGuard';
import { useAppFeedback } from '../contexts/FeedbackContext';
import {
  isCompletedSchedule,
  isTrackedSchedule,
  loadSchedules,
  saveSchedules,
  SCHEDULE_STORAGE_KEY,
  SCHEDULES_UPDATED_EVENT,
  type Schedule,
} from '../services/scheduleStore';
import { buildSensitiveExportMessage } from '../utils/sensitiveExport';

const TYPE_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  '근무': { bg: 'bg-blue-500/20', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-600 dark:bg-blue-400' },
  '점검': { bg: 'bg-red-500/20', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-600 dark:bg-red-400' },
  '교육': { bg: 'bg-green-500/20', text: 'text-green-700 dark:text-green-300', dot: 'bg-green-600 dark:bg-green-400' },
  '기타': { bg: 'bg-purple-500/20', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-600 dark:bg-purple-400' },
};

const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

const formatLocalDate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const getCurrentTimestamp = () => Date.now();

const isValidShiftSetting = (value: unknown): value is ShiftSetting => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<ShiftSetting>;
  return (
    typeof candidate.isActive === 'boolean' &&
    typeof candidate.baseDate === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(candidate.baseDate) &&
    candidate.baseShift !== undefined &&
    SHIFT_CYCLE_DANGBIBI.includes(candidate.baseShift)
  );
};

const escapeIcsText = (value: string) =>
  value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,');

const foldIcsLine = (line: string) => {
  const chunks: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    chunks.push(rest.slice(0, 75));
    rest = ` ${rest.slice(75)}`;
  }
  chunks.push(rest);
  return chunks.join('\r\n');
};

const generateICS = (schedulesToExport: Schedule[]) => {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//119Helper//KO',
    'CALSCALE:GREGORIAN',
  ];

  schedulesToExport.forEach(s => {
    const dtstart = s.date.replace(/-/g, '');
    
    // For all-day events, DTEND is DTSTART + 1 day
    const [y, m, d] = s.date.split('-').map(Number);
    const endDate = new Date(y, m - 1, d + 1);
    const dtend = `${endDate.getFullYear()}${String(endDate.getMonth() + 1).padStart(2, '0')}${String(endDate.getDate()).padStart(2, '0')}`;

    lines.push(
      'BEGIN:VEVENT',
      `UID:${s.id}@119helper.local`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').split('.')[0]}Z`,
      `DTSTART;VALUE=DATE:${dtstart}`,
      `DTEND;VALUE=DATE:${dtend}`,
      `SUMMARY:${escapeIcsText(`[${s.type}] ${s.title}`)}`,
      `DESCRIPTION:${escapeIcsText(s.memo)}`,
      'END:VEVENT'
    );
  });

  lines.push('END:VCALENDAR');
  return lines.map(foldIcsLine).join('\r\n');
};
export default function Calendar() {
  const { showUndo, showNotice, confirmAction } = useAppFeedback();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<string | null>(() => formatLocalDate(new Date()));
  const [schedules, setSchedules] = useState<Schedule[]>(loadSchedules);
  const [today, setToday] = useState(new Date());
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newType, setNewType] = useState<Schedule['type']>('점검');
  const [newMemo, setNewMemo] = useState('');
  const [newTrackCompletion, setNewTrackCompletion] = useState(true);
  const [addDateRollover, setAddDateRollover] = useState<string | null>(null);
  const [titleError, setTitleError] = useState('');
  
  const [shiftSetting, setShiftSetting] = useState<ShiftSetting | null>(null);

  useEffect(() => {
    const loadSetting = () => {
      try {
        const saved = localStorage.getItem('119helper-shift-setting');
        if (saved) {
          const parsed = JSON.parse(saved);
          setShiftSetting(isValidShiftSetting(parsed) ? parsed : null);
        } else setShiftSetting(null);
      } catch {
        setShiftSetting(null);
      }
    };
    loadSetting();
    const handleCustomChange = () => loadSetting();
    window.addEventListener('119helper-settings-updated', handleCustomChange);
    return () => {
      window.removeEventListener('119helper-settings-updated', handleCustomChange);
    };
  }, []);

  useEffect(() => {
    const reloadSchedules = () => setSchedules(loadSchedules());
    const handleStorage = (event: StorageEvent) => {
      if (event.key === SCHEDULE_STORAGE_KEY || event.key === null) reloadSchedules();
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener(SCHEDULES_UPDATED_EVENT, reloadSchedules);
    window.addEventListener('119helper-settings-updated', reloadSchedules);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener(SCHEDULES_UPDATED_EVENT, reloadSchedules);
      window.removeEventListener('119helper-settings-updated', reloadSchedules);
    };
  }, []);

  const commitSchedules = useCallback((updater: (current: Schedule[]) => Schedule[]) => {
    const latest = loadSchedules();
    const next = updater(latest);
    const saved = saveSchedules(next);
    setSchedules(saved ? next : loadSchedules());
    window.dispatchEvent(new Event(SCHEDULES_UPDATED_EVENT));
    return { previous: latest, next, saved };
  }, []);

  useEffect(() => {
    const refreshToday = () => {
      const nextToday = new Date();
      const previousKey = formatLocalDate(today);
      const nextKey = formatLocalDate(nextToday);
      if (previousKey === nextKey) return;

      const wasFollowingToday = selectedDate === previousKey;
      setToday(nextToday);
      if (showAddModal) {
        if (wasFollowingToday) setAddDateRollover(nextKey);
        return;
      }
      if (wasFollowingToday) {
        setSelectedDate(nextKey);
        setCurrentDate(nextToday);
      }
    };

    refreshToday();
    const timer = window.setInterval(refreshToday, 60_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshToday();
    };
    window.addEventListener('focus', refreshToday);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshToday);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [selectedDate, showAddModal, today]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayStr = formatLocalDate(today);

  // 공휴일 데이터 — 정적 데이터에서 즉시 로드 (API 불필요)
  const holidays = getStaticHolidays(year, month + 1);

  const prevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
    setSelectedDate(null);
  };
  const nextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
    setSelectedDate(null);
  };
  const goToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDate(formatLocalDate(now));
  };

  const dateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const getSchedulesForDate = (day: number) =>
    schedules.filter(s => s.date === dateStr(day));

  // Calculate shift for a given date
  const getShift = (day: number): string | null => {
    if (!shiftSetting?.isActive) return null;
    return getShiftForDate(dateStr(day), shiftSetting);
  };

  const shiftColor = (shift: string) => {
    if (shift.includes('주간') || shift.includes('주')) return 'text-amber-700 dark:text-amber-300 bg-amber-500/10';
    if (shift.includes('야간') || shift.includes('야')) return 'text-indigo-700 dark:text-indigo-300 bg-indigo-500/10';
    if (shift.includes('비번') || shift.includes('비')) return 'text-green-700 dark:text-green-300 bg-green-500/10';
    if (shift.includes('휴무') || shift.includes('휴')) return 'text-gray-700 dark:text-gray-300 bg-gray-500/10';
    if (shift.includes('당직') || shift.includes('당')) return 'text-red-700 dark:text-red-300 bg-red-500/10';
    return 'text-primary bg-primary/10';
  };

  const closeAddModal = () => {
    if (addDateRollover) {
      const [rolloverYear, rolloverMonth, rolloverDay] = addDateRollover.split('-').map(Number);
      const rolloverDate = new Date(rolloverYear, rolloverMonth - 1, rolloverDay);
      setCurrentDate(rolloverDate);
      setSelectedDate(addDateRollover);
    }
    setShowAddModal(false);
    setNewTitle('');
    setNewMemo('');
    setNewType('점검');
    setNewTrackCompletion(true);
    setAddDateRollover(null);
    setTitleError('');
  };
  const addDialogTitleId = useId();
  const titleInputId = useId();
  const titleErrorId = useId();
  const memoInputId = useId();
  const addScheduleButtonRef = useRef<HTMLButtonElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const addDraftDirty = newTitle.length > 0
    || newMemo.length > 0
    || newType !== '점검'
    || newTrackCompletion !== true;
  const requestCloseAddModal = useUnsavedChangesGuard({
    isDirty: addDraftDirty,
    onDiscard: closeAddModal,
    title: '작성 중인 일정을 버릴까요?',
    message: '아직 추가하지 않은 일정 내용이 있습니다. 닫으면 입력한 내용이 사라집니다.',
  });
  const addDialogRef = useDialogAccessibility<HTMLDivElement>(
    showAddModal,
    () => void requestCloseAddModal(),
    addScheduleButtonRef,
  );

  const addSchedule = () => {
    if (!selectedDate) return;
    if (!newTitle.trim()) {
      setTitleError('일정 제목을 입력하세요.');
      window.requestAnimationFrame(() => titleInputRef.current?.focus());
      return;
    }
    const schedule: Schedule = {
      id: window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: selectedDate,
      title: newTitle.trim(),
      type: newType,
      memo: newMemo.trim(),
      ...(newTrackCompletion ? { trackCompletion: true } : {}),
    };
    const { saved } = commitSchedules(current => [...current, schedule]);
    if (!saved) {
      showNotice({
        message: '일정을 저장하지 못했습니다. 공용기기 모드 또는 이 기기의 저장 공간을 확인하세요.',
        tone: 'error',
      });
      return;
    }
    closeAddModal();
    showNotice({ message: '일정을 추가했습니다.', tone: 'success' });
  };

  const deleteSchedule = (id: string) => {
    const latest = loadSchedules();
    const index = latest.findIndex(schedule => schedule.id === id);
    const removed = latest[index];
    if (!removed) return;

    const { saved } = commitSchedules(current => current.filter(schedule => schedule.id !== id));
    if (!saved) {
      showNotice({ message: '일정을 삭제하지 못했습니다. 기기 저장 설정을 확인하세요.', tone: 'error' });
      return;
    }
    showUndo({
      message: '일정을 삭제했습니다.',
      undo: () => {
        const undoResult = commitSchedules(current => {
          if (current.some(schedule => schedule.id === removed.id)) return current;
          const restored = [...current];
          restored.splice(Math.min(index, restored.length), 0, removed);
          return restored;
        });
        if (!undoResult.saved) {
          showNotice({ message: '삭제한 일정을 복원하지 못했습니다.', tone: 'error' });
        }
      },
    });
  };

  const setCompletionTracking = (id: string, trackCompletion: boolean) => {
    const { saved } = commitSchedules(current => current.map(schedule => {
      if (schedule.id !== id) return schedule;
      if (trackCompletion) return { ...schedule, trackCompletion: true };
      return { ...schedule, trackCompletion: undefined };
    }));
    if (!saved) {
      showNotice({ message: '완료 상태 설정을 저장하지 못했습니다.', tone: 'error' });
      return;
    }
    showNotice({
      message: trackCompletion ? '업무 완료 상태를 추적합니다.' : '일반 일정으로 변경했습니다.',
      tone: 'success',
    });
  };

  const toggleScheduleCompletion = (id: string) => {
    const target = loadSchedules().find(schedule => schedule.id === id);
    if (!target || !isTrackedSchedule(target)) return;
    const markCompleted = !isCompletedSchedule(target);
    const completionTime = getCurrentTimestamp();

    const { saved } = commitSchedules(current => current.map(schedule => (
      schedule.id === id
        ? {
            ...schedule,
            ...(markCompleted ? { completedAt: completionTime } : { completedAt: undefined }),
          }
        : schedule
    )));
    if (!saved) {
      showNotice({ message: '업무 완료 상태를 저장하지 못했습니다.', tone: 'error' });
      return;
    }
    if (markCompleted) {
      showUndo({
        message: '업무를 완료로 표시했습니다.',
        undo: () => {
          const undoResult = commitSchedules(current => current.map(schedule => (
            schedule.id === id && schedule.completedAt === completionTime
              ? { ...schedule, completedAt: undefined }
              : schedule
          )));
          if (!undoResult.saved) {
            showNotice({ message: '완료 표시를 되돌리지 못했습니다.', tone: 'error' });
          }
        },
      });
    } else {
      showNotice({
        message: '업무를 미완료로 되돌렸습니다.',
        tone: 'success',
      });
    }
  };

  const openScheduleDate = (date: string) => {
    const [scheduleYear, scheduleMonth] = date.split('-').map(Number);
    setCurrentDate(new Date(scheduleYear, scheduleMonth - 1, 1));
    setSelectedDate(date);
  };

  const exportICS = async (type: 'all' | 'month') => {
    let targets = loadSchedules();
    if (type === 'month') {
      const prefix = `${year}-${String(month + 1).padStart(2, '0')}`;
      targets = targets.filter(s => s.date.startsWith(prefix));
    }
    
    if (targets.length === 0) {
      showNotice({ message: '내보낼 일정이 없습니다.', tone: 'info' });
      return;
    }

    const approved = await confirmAction({
      title: '민감정보 내보내기',
      message: buildSensitiveExportMessage('일정 .ics 파일', [
        '일정 제목과 날짜',
        '일정 메모의 내부 업무 내용',
        '대상물명·민원·연락 정보가 포함된 경우 해당 내용',
      ]),
      confirmLabel: '내보내기 계속',
      tone: 'warning',
    });
    if (!approved) return;

    const icsContent = generateICS(targets);
    const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = type === 'all' ? '119helper-schedules-all.ics' : `119helper-schedules-${year}-${String(month + 1).padStart(2, '0')}.ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const selectedSchedules = selectedDate
    ? schedules.filter(s => s.date === selectedDate)
    : [];
  const overdueSchedules = schedules
    .filter(schedule => (
      isTrackedSchedule(schedule)
      && !isCompletedSchedule(schedule)
      && schedule.date < todayStr
    ))
    .sort((left, right) => left.date.localeCompare(right.date));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="ui-page-title">
            <span className="material-symbols-outlined ui-page-title-icon">calendar_month</span>
            달력 / 일정
          </h2>
          <p className="text-sm text-on-surface-variant mt-1">근무·점검·교육 일정 관리</p>
        </div>
        <div className="flex flex-col items-start sm:items-end w-full sm:w-auto">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void exportICS('month')}
              className="text-xs font-bold px-3 py-1.5 bg-surface-container border border-outline-variant/20 rounded-lg hover:bg-surface-container-high transition-colors flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              {month + 1}월 내보내기
            </button>
            <button
              type="button"
              onClick={() => void exportICS('all')}
              className="text-xs font-bold px-3 py-1.5 bg-secondary text-on-secondary rounded-lg hover:bg-secondary/90 transition-colors flex items-center gap-1 shadow-sm shadow-secondary/20"
            >
              <span className="material-symbols-outlined text-sm">cloud_download</span>
              전체 내보내기 (.ics)
            </button>
          </div>
          <p className="text-[10px] text-error font-medium mt-1.5 flex items-center gap-1">
            <span className="material-symbols-outlined text-[10px]">warning</span>
            제목·메모가 파일에 포함됩니다. 외부 캘린더와 <b>자동 동기화되지 않으며</b>, 중복 가져오기에 주의하세요.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Calendar Grid */}
        <div className="lg:col-span-8 bg-surface-container-lowest border border-outline-variant/10 rounded-xl overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-outline-variant/10">
            <div className="flex items-center gap-3">
              <button type="button" onClick={prevMonth} className="p-1.5 rounded-lg hover:bg-surface-container transition-colors">
                <span className="material-symbols-outlined text-on-surface-variant">chevron_left</span>
              </button>
              <h3 className="text-xl font-bold text-on-surface font-headline min-w-[140px] text-center">
                {year}년 {month + 1}월
              </h3>
              <button type="button" onClick={nextMonth} className="p-1.5 rounded-lg hover:bg-surface-container transition-colors">
                <span className="material-symbols-outlined text-on-surface-variant">chevron_right</span>
              </button>
            </div>
            <button type="button" onClick={goToday} className="text-xs bg-primary/10 text-primary px-3 py-1.5 rounded-lg font-bold hover:bg-primary/20 transition-colors">
              오늘
            </button>
          </div>

          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b border-outline-variant/10">
            {DAYS.map((d, i) => (
              <div key={d} className={`py-2 text-center text-xs font-bold uppercase tracking-wider ${i === 0 ? 'text-red-700 dark:text-red-300' : i === 6 ? 'text-blue-700 dark:text-blue-300' : 'text-on-surface-variant'}`}>
                {d}
              </div>
            ))}
          </div>

          {/* Date Grid */}
          <div className="grid grid-cols-7">
            {/* Empty cells before first day */}
            {Array.from({ length: firstDay }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[90px] border-b border-r border-outline-variant/5 bg-surface-container-lowest/50" />
            ))}

            {/* Date cells */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1;
              const ds = dateStr(day);
              const isToday = ds === todayStr;
              const isSelected = ds === selectedDate;
              const daySchedules = getSchedulesForDate(day);
              const dayOfWeek = (firstDay + i) % 7;
              const shift = getShift(day);
              const holidayNames = holidays.get(ds) || [];
              const isHoliday = holidayNames.length > 0;

              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => setSelectedDate(ds)}
                  className={`min-h-[90px] p-1.5 text-left border-b border-r border-outline-variant/5 transition-colors relative
                    ${isSelected ? 'bg-primary/10 ring-1 ring-primary/30' : 'hover:bg-surface-container/50'}
                    ${isToday ? 'bg-primary/5' : ''}
                  `}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full
                      ${isToday ? 'bg-primary text-on-primary' : isHoliday || dayOfWeek === 0 ? 'text-red-700 dark:text-red-300' : dayOfWeek === 6 ? 'text-blue-700 dark:text-blue-300' : 'text-on-surface'}
                    `}>
                      {day}
                    </span>
                    {shift && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${shiftColor(shift)}`}>
                        {shift}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 space-y-0.5">
                    {holidayNames.map((name, hi) => (
                      <div key={`h-${hi}`} className="text-[9px] truncate px-1 py-0.5 rounded bg-red-500/15 text-red-700 dark:text-red-300 font-bold">
                        🎌 {name}
                      </div>
                    ))}
                    {daySchedules.slice(0, 2).map(s => {
                      const tc = TYPE_COLORS[s.type];
                      const completed = isCompletedSchedule(s);
                      return (
                        <div
                          key={s.id}
                          className={`text-[9px] truncate px-1 py-0.5 rounded ${tc.bg} ${tc.text} font-medium ${completed ? 'line-through opacity-60' : ''}`}
                        >
                          {completed ? '✓ ' : ''}{s.title}
                        </div>
                      );
                    })}
                    {daySchedules.length > 2 && (
                      <div className="text-[9px] text-on-surface-variant">+{daySchedules.length - 2}건</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Side Panel */}
        <div className="lg:col-span-4 space-y-4">
          {overdueSchedules.length > 0 && (
            <section
              aria-label="이전 미완료 업무"
              className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4"
            >
              <div className="flex items-start gap-2">
                <span aria-hidden="true" className="material-symbols-outlined text-amber-700 dark:text-amber-300">assignment_late</span>
                <div>
                  <h4 className="text-sm font-extrabold text-on-surface">
                    이전 미완료 업무 {overdueSchedules.length}건
                  </h4>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-on-surface-variant">
                    원래 예정일을 유지해 누락을 막습니다 · 이 기기에 저장된 상태
                  </p>
                </div>
              </div>
              <div className="mt-3 max-h-64 space-y-2 overflow-y-auto">
                {overdueSchedules.map(schedule => (
                  <div
                    key={schedule.id}
                    className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-surface-container-lowest p-2.5"
                  >
                    <button
                      type="button"
                      aria-label={`${schedule.title} 원래 날짜 보기`}
                      onClick={() => openScheduleDate(schedule.date)}
                      className="min-w-0 flex-1 rounded-md text-left focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                      <p className="text-[10px] font-bold text-amber-700 dark:text-amber-300">
                        {schedule.date.slice(5).replace('-', '.')} · {schedule.type}
                      </p>
                      <p className="truncate text-sm font-bold text-on-surface">{schedule.title}</p>
                      <span className="mt-0.5 block text-[10px] font-bold text-primary">메모·원래 날짜 보기</span>
                    </button>
                    <button
                      type="button"
                      aria-label={`${schedule.title} 이전 업무 완료 표시`}
                      onClick={() => toggleScheduleCompletion(schedule.id)}
                      className="shrink-0 rounded-lg bg-primary px-3 py-2 text-xs font-extrabold text-on-primary hover:bg-primary/85"
                    >
                      완료
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Selected Date Detail */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-bold text-on-surface">
                {selectedDate
                  ? `${selectedDate.split('-')[1]}월 ${selectedDate.split('-')[2]}일`
                  : '날짜를 선택하세요'}
              </h4>
              {selectedDate && (
                <button
                  ref={addScheduleButtonRef}
                  type="button"
                  onClick={() => setShowAddModal(true)}
                  className="text-xs bg-primary text-on-primary px-3 py-1.5 rounded-lg font-bold hover:bg-primary/80 transition-colors flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">add</span> 추가
                </button>
              )}
            </div>

            {selectedDate ? (
              selectedSchedules.length > 0 ? (
                <div className="space-y-2">
                  {selectedSchedules.map(s => {
                    const tc = TYPE_COLORS[s.type];
                    const tracked = isTrackedSchedule(s);
                    const completed = isCompletedSchedule(s);
                    return (
                      <div key={s.id} className={`${tc.bg} rounded-lg p-3 group ${completed ? 'opacity-75' : ''}`}>
                        <div className="flex items-start gap-2">
                          {tracked && (
                            <button
                              type="button"
                              aria-label={`${s.title} ${completed ? '미완료로 되돌리기' : '완료 표시'}`}
                              aria-pressed={completed}
                              onClick={() => toggleScheduleCompletion(s.id)}
                              className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                                completed
                                  ? 'border-success bg-success text-on-success'
                                  : 'border-outline-variant/50 bg-surface-container-lowest text-on-surface-variant hover:border-primary hover:text-primary'
                              }`}
                            >
                              <span aria-hidden="true" className="material-symbols-outlined text-lg">
                                {completed ? 'check' : 'radio_button_unchecked'}
                              </span>
                            </button>
                          )}
                          <div className="min-w-0 flex-1">
                            <span className={`text-[10px] font-bold ${tc.text} uppercase`}>{s.type}</span>
                            <p className={`text-sm font-bold text-on-surface mt-0.5 ${completed ? 'line-through' : ''}`}>
                              {s.title}
                            </p>
                            {s.memo && <p className="text-xs text-on-surface-variant mt-1">{s.memo}</p>}
                          </div>
                          <button
                            type="button"
                            aria-label={`${s.title} 일정 삭제`}
                            onClick={() => deleteSchedule(s.id)}
                            className="flex h-11 w-11 items-center justify-center rounded-lg opacity-100 transition-all hover:bg-error/10 sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 focus:opacity-100"
                          >
                            <span className="material-symbols-outlined text-on-surface-variant text-lg hover:text-error">close</span>
                          </button>
                        </div>
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-current/10 pt-2">
                          <label className="flex min-h-8 cursor-pointer items-center gap-2 text-[11px] font-bold text-on-surface-variant">
                            <input
                              type="checkbox"
                              aria-label={`${s.title} 완료 상태 관리`}
                              checked={tracked}
                              onChange={event => setCompletionTracking(s.id, event.target.checked)}
                              className="h-4 w-4 rounded border-outline text-primary focus:ring-primary/30"
                            />
                            완료 상태 관리
                          </label>
                          <span className={`text-[10px] font-bold ${completed ? 'text-success' : 'text-on-surface-variant'}`}>
                            {tracked
                              ? completed ? '완료 처리됨' : '미완료 업무'
                              : '일반 일정 · 미완료 집계 제외'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-sm text-on-surface-variant text-center py-6">일정이 없습니다</p>
              )
            ) : (
              <p className="text-sm text-on-surface-variant text-center py-6">좌측 달력에서 날짜를 클릭하세요</p>
            )}
          </div>

          {/* Shift Settings Notice */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full -z-0"></div>
            <h4 className="text-sm font-bold text-on-surface mb-2 flex items-center gap-2 relative z-10">
              <span className="material-symbols-outlined text-primary text-lg">calendar_month</span>
              근무 스케줄 연동
            </h4>
            <p className="text-xs text-on-surface-variant relative z-10 leading-relaxed">
              우측 상단의 <strong className="text-primary">⚙️ 설정</strong> 아이콘을 눌러 <strong>[내 근무]</strong> 탭에서 당비비 패턴 등 근무조를 설정하면, 달력에 일정이 자동 연동됩니다.
            </p>
            {shiftSetting?.isActive && (
              <div className="mt-4 p-3 bg-primary/10 border border-primary/20 rounded-lg relative z-10">
                <p className="text-xs font-bold text-primary flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm">check_circle</span>
                  현재 연동 완료
                </p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-on-surface-variant">기준일</span>
                  <span className="text-xs font-bold text-on-surface">{shiftSetting.baseDate}</span>
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[10px] text-on-surface-variant">기준 근무</span>
                  <span className="text-xs font-bold text-primary">{shiftSetting.baseShift}</span>
                </div>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-5">
            <h4 className="text-sm font-bold text-on-surface mb-3">범례</h4>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(TYPE_COLORS).map(([type, c]) => (
                <div key={type} className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`}></span>
                  <span className="text-xs text-on-surface-variant">{type}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Add Schedule Modal */}
      {showAddModal && selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => void requestCloseAddModal()}>
          <div
            ref={addDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={addDialogTitleId}
            tabIndex={-1}
            className="bg-surface-container-lowest border border-outline-variant/20 rounded-2xl p-6 w-full max-w-[420px] shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <h3 id={addDialogTitleId} className="text-lg font-bold text-on-surface mb-4">
              📅 일정 추가 — {selectedDate.split('-')[1]}월 {selectedDate.split('-')[2]}일
            </h3>
            {addDateRollover && (
              <div
                role="status"
                className="mb-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-on-surface"
              >
                <p className="font-bold">작성 중 날짜가 바뀌었습니다.</p>
                <p className="mt-1 leading-relaxed text-on-surface-variant">
                  지금 추가하면 {selectedDate.slice(5, 7)}월 {selectedDate.slice(8, 10)}일 일정으로 저장됩니다.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    openScheduleDate(addDateRollover);
                    setAddDateRollover(null);
                  }}
                  className="mt-2 rounded-lg bg-primary px-3 py-1.5 font-extrabold text-on-primary"
                >
                  오늘({addDateRollover.slice(5, 7)}월 {addDateRollover.slice(8, 10)}일)로 변경
                </button>
              </div>
            )}
            <form
              className="space-y-3"
              onSubmit={event => {
                event.preventDefault();
                addSchedule();
              }}
            >
              <div>
                <span id={`${addDialogTitleId}-type`} className="text-xs text-on-surface-variant font-bold">유형</span>
                <div className="flex flex-wrap gap-2 mt-1" role="group" aria-labelledby={`${addDialogTitleId}-type`}>
                  {(Object.keys(TYPE_COLORS) as Schedule['type'][]).map(t => {
                    const tc = TYPE_COLORS[t];
                    return (
                      <button
                        key={t}
                        type="button"
                        aria-pressed={newType === t}
                        onClick={() => {
                          setNewType(t);
                          setNewTrackCompletion(t === '점검' || t === '기타');
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                          newType === t
                            ? `${tc.bg} ${tc.text} border-current`
                            : 'border-outline-variant/20 text-on-surface-variant hover:bg-surface-container'
                        }`}
                      >
                        {t}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label htmlFor={titleInputId} className="text-xs text-on-surface-variant font-bold">제목</label>
                <input
                  ref={titleInputRef}
                  id={titleInputId}
                  data-dialog-initial-focus
                  type="text"
                  value={newTitle}
                  aria-invalid={Boolean(titleError)}
                  aria-describedby={titleError ? titleErrorId : undefined}
                  onChange={e => {
                    setNewTitle(e.target.value);
                    setTitleError('');
                  }}
                  placeholder="예: OO빌딩 종합점검"
                  className={`w-full mt-1 bg-surface-container border rounded-lg px-4 py-2.5 text-on-surface text-sm focus:outline-none focus:ring-2 placeholder:text-outline ${titleError ? 'border-error focus:ring-error/20' : 'border-outline-variant/20 focus:ring-primary/30'}`}
                  autoFocus
                />
                {titleError && <p id={titleErrorId} role="alert" className="mt-1.5 text-xs font-bold text-error">{titleError}</p>}
              </div>
              <div>
                <label htmlFor={memoInputId} className="text-xs text-on-surface-variant font-bold">메모 (선택)</label>
                <textarea
                  id={memoInputId}
                  value={newMemo}
                  onChange={e => setNewMemo(e.target.value)}
                  placeholder="상세 내용..."
                  rows={3}
                  className="w-full mt-1 bg-surface-container border border-outline-variant/20 rounded-lg px-4 py-2.5 text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-outline"
                />
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-outline-variant/20 bg-surface-container p-3">
                <input
                  type="checkbox"
                  aria-label="완료 상태 관리"
                  aria-describedby={`${addDialogTitleId}-completion-help`}
                  checked={newTrackCompletion}
                  onChange={event => setNewTrackCompletion(event.target.checked)}
                  className="mt-0.5 h-5 w-5 rounded border-outline text-primary focus:ring-primary/30"
                />
                <span>
                  <span className="block text-sm font-bold text-on-surface">완료 상태 관리</span>
                  <span
                    id={`${addDialogTitleId}-completion-help`}
                    className="mt-0.5 block text-[11px] leading-relaxed text-on-surface-variant"
                  >
                    처리할 업무라면 완료 여부를 기록하고, 지나간 미완료 업무도 계속 표시합니다.
                  </span>
                </span>
              </label>
              <p aria-live="polite" className={`flex items-center gap-1 text-xs font-bold ${addDraftDirty ? 'text-amber-700 dark:text-amber-300' : 'text-on-surface-variant'}`}>
                <span aria-hidden="true" className="material-symbols-outlined text-sm">{addDraftDirty ? 'edit' : 'info'}</span>
                {addDraftDirty ? '아직 추가하지 않은 일정입니다.' : '제목을 입력해 일정을 추가하세요.'}
              </p>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => void requestCloseAddModal()} className="flex-1 py-2.5 rounded-lg border border-outline-variant/20 text-on-surface-variant text-sm font-bold hover:bg-surface-container transition-colors">
                  취소
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 rounded-lg bg-primary text-on-primary text-sm font-bold hover:bg-primary/80 transition-colors"
                >
                  추가
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
