import { useState, useEffect } from 'react';

// --- 데이터 상수 ---
const RANK_DATA = [
  { rank: '소방령 (5급 상당)', overtime: 16960, night: 5653, holiday: 136331 },
  { rank: '소방경 (6급 상당)', overtime: 15082, night: 5027, holiday: 121237 },
  { rank: '소방위 (6급 상당)', overtime: 13779, night: 4593, holiday: 110763 },
  { rank: '소방장 (7급 상당)', overtime: 12934, night: 4311, holiday: 103969 },
  { rank: '소방교 (8급 상당)', overtime: 12584, night: 4195, holiday: 101153 },
  { rank: '소방사 (9급 상당)', overtime: 11175, night: 3725, holiday: 89830 },
  { rank: '소방사시보', overtime: 11175, night: 3725, holiday: 89830 },
];

export type ShiftId = 'FIRE' | 'DAY' | 'NIGHT';

export const SHIFT_TYPES: Record<ShiftId, { id: ShiftId; label: string; hours: number; hasNight: boolean; color: string }> = {
  FIRE: { id: 'FIRE', label: '당번', hours: 24, hasNight: true, color: 'bg-errorContainer text-onErrorContainer border-error/50' },
  DAY: { id: 'DAY', label: '주간', hours: 9, hasNight: false, color: 'bg-primaryContainer text-onPrimaryContainer border-primary/50' },
  NIGHT: { id: 'NIGHT', label: '야간', hours: 15, hasNight: true, color: 'bg-secondaryContainer text-onSecondaryContainer border-secondary/50' },
};

export default function OvertimeCalc() {
  const [activeTab, setActiveTab] = useState<'calendar' | 'simple'>('calendar');
  const [selectedRankName, setSelectedRankName] = useState('소방사 (9급 상당)');
  const [rates, setRates] = useState({
    overtime: RANK_DATA[5].overtime,
    night: RANK_DATA[5].night,
    holiday: RANK_DATA[5].holiday,
  });
  const [showRateSettings, setShowRateSettings] = useState(false);
  const [includeFlatPay, setIncludeFlatPay] = useState(true);
  const [flatPayHours, setFlatPayHours] = useState(10);
  const [totalAmount, setTotalAmount] = useState(0);

  const [simpleOvertime, setSimpleOvertime] = useState('');
  const [simpleNightHours, setSimpleNightHours] = useState('');
  const [simpleHolidayCount, setSimpleHolidayCount] = useState('');

  const [currentDate, setCurrentDate] = useState(new Date());
  const [shifts, setShifts] = useState<Record<string, ShiftId>>({});
  const [holidays, setHolidays] = useState<Record<string, boolean>>({});

  const [manualWeekdays, setManualWeekdays] = useState(0);
  const [otherOvertime, setOtherOvertime] = useState('');
  const [vacationDays, setVacationDays] = useState('');

  const [calOvertime, setCalOvertime] = useState(0);
  const [calNightCount, setCalNightCount] = useState(0);
  const [calHolidayCount, setCalHolidayCount] = useState(0);

  const floorToTen = (num: number) => Math.floor(num / 10) * 10;
  const calculatePay = (qty: number, rate: number) => floorToTen(qty * rate);
  const formatCurrency = (num: number) => new Intl.NumberFormat('ko-KR').format(Math.floor(num));

  const handleRankChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const rankName = e.target.value;
    setSelectedRankName(rankName);
    const rankInfo = RANK_DATA.find((r) => r.rank === rankName);
    if (rankInfo) {
      setRates({
        overtime: rankInfo.overtime,
        night: rankInfo.night,
        holiday: rankInfo.holiday,
      });
    }
  };

  const handleRateChange = (field: keyof typeof rates, value: string) => {
    setRates((prev) => ({ ...prev, [field]: Number(value) }));
  };

  const getMonthInfo = (date: Date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayOfMonth = new Date(year, month, 1).getDay();
    return { daysInMonth, firstDayOfMonth, year, month };
  };

  const handleCalendarReset = () => {
    setShifts({});
    setHolidays({});
    setOtherOvertime('');
    setVacationDays('');

    const { year, month, daysInMonth } = getMonthInfo(currentDate);
    let autoWeekdaysCount = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const dayOfWeek = new Date(year, month, d).getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        autoWeekdaysCount++;
      }
    }
    setManualWeekdays(autoWeekdaysCount);

    setCalOvertime(0);
    setCalNightCount(0);
    setCalHolidayCount(0);
    setTotalAmount(0);
  };

  const checkIsHoliday = (year: number, month: number, day: number) => {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dateObj = new Date(year, month, day);
    const dayOfWeek = dateObj.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    return isWeekend || !!holidays[dateKey];
  };

  const handleDateClick = (day: number) => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    setShifts((prev) => {
      const current = prev[dateKey];
      let next: ShiftId | null = null;
      if (!current) next = 'FIRE';
      else if (current === 'FIRE') next = 'DAY';
      else if (current === 'DAY') next = 'NIGHT';
      else next = null;

      if (next) return { ...prev, [dateKey]: next };
      const newShifts = { ...prev };
      delete newShifts[dateKey];
      return newShifts;
    });
  };

  const toggleHoliday = (e: React.MouseEvent, day: number) => {
    e.stopPropagation();
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

    setHolidays((prev) => {
      if (prev[dateKey]) {
        const newHols = { ...prev };
        delete newHols[dateKey];
        return newHols;
      }
      return { ...prev, [dateKey]: true };
    });
  };

  useEffect(() => {
    const { year, month, daysInMonth } = getMonthInfo(currentDate);
    let autoWeekdaysCount = 0;

    for (let d = 1; d <= daysInMonth; d++) {
      if (!checkIsHoliday(year, month, d)) {
        autoWeekdaysCount++;
      }
    }
    setManualWeekdays(autoWeekdaysCount);
  }, [currentDate, holidays]);

  useEffect(() => {
    let finalOvertime = 0;
    let finalNightHours = 0;
    let finalHolidayCount = 0;

    if (activeTab === 'simple') {
      finalOvertime = Number(simpleOvertime);
      finalNightHours = Number(simpleNightHours);
      finalHolidayCount = Number(simpleHolidayCount);
    } else {
      const { year, month } = getMonthInfo(currentDate);

      let totalWorkHours = 0;
      let nightCnt = 0;
      let holidayCnt = 0;
      let holidayDeductionHours = 0;

      Object.entries(shifts).forEach(([dateKey, shiftType]) => {
        const [sYear, sMonth, sDay] = dateKey.split('-').map(Number);
        if (sYear === year && sMonth === month + 1) {
          const typeInfo = SHIFT_TYPES[shiftType];
          const isHoliday = checkIsHoliday(sYear, sMonth - 1, sDay);

          totalWorkHours += typeInfo.hours;

          if (typeInfo.hasNight) nightCnt += 1;

          if (isHoliday) {
            if (shiftType === 'FIRE' || shiftType === 'DAY') {
              holidayCnt += 1;
              holidayDeductionHours += 8;
            }
          }
        }
      });

      const standardDeduction = manualWeekdays * 8;
      const extra = Number(otherOvertime);
      const vacationCredit = Number(vacationDays) * 8;

      const calcOvertime = Math.max(
        0,
        totalWorkHours - standardDeduction - holidayDeductionHours + extra + vacationCredit
      );

      setCalOvertime(Math.max(0, Number((calcOvertime).toFixed(1))));
      setCalNightCount(Math.max(0, Number((nightCnt * 8).toFixed(1))));
      setCalHolidayCount(Math.max(0, Number((holidayCnt).toFixed(1))));

      finalOvertime = calcOvertime;
      finalNightHours = nightCnt * 8;
      finalHolidayCount = holidayCnt;
    }

    const overtimePay = calculatePay(finalOvertime, rates.overtime);
    const nightPay = calculatePay(finalNightHours, rates.night);
    const holidayPay = calculatePay(finalHolidayCount, rates.holiday);
    const flatPay = includeFlatPay ? calculatePay(flatPayHours, rates.overtime) : 0;

    setTotalAmount(overtimePay + nightPay + holidayPay + flatPay);
  }, [
    activeTab,
    simpleOvertime,
    simpleNightHours,
    simpleHolidayCount,
    shifts,
    rates,
    includeFlatPay,
    flatPayHours,
    currentDate,
    manualWeekdays,
    otherOvertime,
    vacationDays,
    holidays,
  ]);

  const renderCalendar = () => {
    const { daysInMonth, firstDayOfMonth, year, month } = getMonthInfo(currentDate);
    const days = [];

    for (let i = 0; i < firstDayOfMonth; i++) {
      days.push(
        <div
          key={`empty-${i}`}
          className="h-16 sm:h-20 bg-surface-container-lowest border-r border-b border-outline-variant/10"
        />
      );
    }

    for (let d = 1; d <= daysInMonth; d++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const shiftType = shifts[dateKey];
      const shiftInfo = shiftType ? SHIFT_TYPES[shiftType] : null;

      const isManualHoliday = !!holidays[dateKey];
      const dateObj = new Date(year, month, d);
      const dayOfWeek = dateObj.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isHolidayDate = isWeekend || isManualHoliday;

      const dateColor =
        dayOfWeek === 0 || isManualHoliday ? 'text-error' : dayOfWeek === 6 ? 'text-secondary' : 'text-on-surface';
      const bgColor = isHolidayDate ? 'bg-error/5' : 'bg-surface';

      days.push(
        <button
          key={d}
          onClick={() => handleDateClick(d)}
          className={`h-16 sm:h-20 border-r border-b border-outline-variant/10 flex flex-col items-center justify-start pt-1.5 relative transition-colors hover:bg-surface-variant font-medium ${
            shiftInfo ? shiftInfo.color.split(' ')[0] + '/20' : bgColor
          }`}
        >
          <div className="w-full flex justify-between px-1.5">
            <span className={`text-sm ${dateColor}`}>{d}</span>
            <div
              onClick={(e) => toggleHoliday(e, d)}
              className={`text-[10px] cursor-pointer px-1 rounded transition-colors ${
                isManualHoliday
                  ? 'bg-error text-onError'
                  : 'text-on-surface-variant/30 hover:text-on-surface-variant'
              }`}
            >
              휴
            </div>
          </div>
          {shiftInfo && (
            <span
              className={`mt-1 text-xs font-bold px-2 py-0.5 rounded-md border ${shiftInfo.color}`}
            >
              {shiftInfo.label}
            </span>
          )}
        </button>
      );
    }

    return (
      <div className="mt-4">
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() - 1)))}
            className="p-2 hover:bg-surface-variant rounded-full text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined shrink-0 text-xl">chevron_left</span>
          </button>
          <span className="font-bold text-on-surface text-lg">
            {currentDate.getFullYear()}년 {currentDate.getMonth() + 1}월
          </span>
          <button
            onClick={() => setCurrentDate(new Date(currentDate.setMonth(currentDate.getMonth() + 1)))}
            className="p-2 hover:bg-surface-variant rounded-full text-on-surface-variant transition-colors"
          >
            <span className="material-symbols-outlined shrink-0 text-xl">chevron_right</span>
          </button>
        </div>
        <div className="grid grid-cols-7 text-center mb-1 bg-surface-container rounded-t-lg overflow-hidden border border-outline-variant/10 border-b-0">
          {['일', '월', '화', '수', '목', '금', '토'].map((day, i) => (
            <div
              key={day}
              className={`text-sm font-semibold py-2 border-r border-outline-variant/10 last:border-r-0 ${
                i === 0 ? 'text-error' : i === 6 ? 'text-secondary' : 'text-on-surface-variant'
              }`}
            >
              {day}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 rounded-b-lg overflow-hidden border-l border-t border-outline-variant/10">
          {days}
        </div>
        <p className="text-xs text-on-surface-variant mt-2 text-center">
          *숫자 클릭: 근무 변경 / <span className="inline-block bg-error text-onError px-1 rounded mx-0.5">휴</span>클릭: 휴일 지정
        </p>
      </div>
    );
  };

  return (
    <div className="bg-surface border border-outline-variant/20 rounded-2xl overflow-hidden flex flex-col h-full shadow-sm">
      {/* Header */}
      <div className="bg-primary p-6 text-onPrimary text-center relative overflow-hidden">
        <div className="absolute top-4 left-4 opacity-50">
          <span className="material-symbols-outlined text-4xl">payments</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight mb-1">초과근무 수당 계산기</h1>
        <p className="text-primaryContainer text-sm font-medium">2026년 단가 적용</p>
      </div>

      {/* Content */}
      <div className="p-4 sm:p-6 space-y-6 flex-1 overflow-y-auto w-full max-w-4xl mx-auto">
        {/* Section 1: Settings */}
        <div className="bg-surface-container-lowest rounded-xl p-4 border border-outline-variant/10 space-y-4">
          <div className="flex items-center space-x-2 text-on-surface font-semibold">
            <span className="material-symbols-outlined text-primary">calculate</span>
            <h2>계급 및 기준 단가</h2>
          </div>
          <select
            value={selectedRankName}
            onChange={handleRankChange}
            className="w-full p-3 bg-surface border border-outline-variant/30 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/50 text-on-surface font-medium text-sm appearance-none"
          >
            {RANK_DATA.map((r) => (
              <option key={r.rank} value={r.rank}>
                {r.rank}
              </option>
            ))}
          </select>
          <div className="bg-surface-container rounded-lg p-3">
            <button
              onClick={() => setShowRateSettings(!showRateSettings)}
              className="w-full flex items-center justify-between text-sm text-on-surface-variant font-medium hover:text-primary transition-colors py-1"
            >
              <span>단가 수정 (기본 시간당 {formatCurrency(rates.overtime)}원)</span>
              <span className="material-symbols-outlined text-[18px]">
                {showRateSettings ? 'expand_less' : 'expand_more'}
              </span>
            </button>
            {showRateSettings && (
              <div className="mt-3 grid grid-cols-1 gap-3 pt-3 border-t border-outline-variant/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-on-surface-variant">시간외</span>
                  <div className="flex items-center">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={rates.overtime}
                      onChange={(e) => handleRateChange('overtime', e.target.value)}
                      className="w-24 text-right text-sm font-bold bg-surface border border-outline-variant rounded p-1.5 focus:outline-none focus:border-primary"
                    />
                    <span className="text-xs ml-2 text-on-surface-variant/70">원</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-secondary">야간</span>
                  <div className="flex items-center">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={rates.night}
                      onChange={(e) => handleRateChange('night', e.target.value)}
                      className="w-24 text-right text-sm font-bold text-secondary bg-surface border border-secondary/30 rounded p-1.5 focus:outline-none focus:border-secondary"
                    />
                    <span className="text-xs ml-2 text-on-surface-variant/70">원</span>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-error">휴일(일)</span>
                  <div className="flex items-center">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={rates.holiday}
                      onChange={(e) => handleRateChange('holiday', e.target.value)}
                      className="w-24 text-right text-sm font-bold text-error bg-surface border border-error/30 rounded p-1.5 focus:outline-none focus:border-error"
                    />
                    <span className="text-xs ml-2 text-on-surface-variant/70">원</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-surface-container rounded-lg p-1 flex">
          <button
            onClick={() => setActiveTab('calendar')}
            className={`flex-1 py-2.5 rounded-md transition-colors flex justify-center items-center gap-1.5 font-bold text-sm ${
              activeTab === 'calendar'
                ? 'bg-surface text-primary shadow-sm ring-1 ring-outline-variant/10'
                : 'text-on-surface-variant hover:bg-surface-variant/50'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">calendar_month</span>
            달력 자동계산
          </button>
          <button
            onClick={() => setActiveTab('simple')}
            className={`flex-1 py-2.5 rounded-md transition-colors flex justify-center items-center gap-1.5 font-bold text-sm ${
              activeTab === 'simple'
                ? 'bg-surface text-primary shadow-sm ring-1 ring-outline-variant/10'
                : 'text-on-surface-variant hover:bg-surface-variant/50'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">edit_square</span>
            단순 수동입력
          </button>
        </div>

        {/* Section 2: Input Area */}
        <div className="space-y-4">
          {activeTab === 'calendar' && (
            <div className="animate-in fade-in duration-300">
              <div className="flex justify-between items-end mb-2">
                <h3 className="text-base font-bold text-on-surface">근무 캘린더</h3>
                <button
                  onClick={handleCalendarReset}
                  className="text-xs text-on-surface-variant flex items-center hover:text-primary bg-surface-container px-3 py-1.5 rounded-full"
                >
                  <span className="material-symbols-outlined text-[14px] mr-1">refresh</span>초기화
                </button>
              </div>
              {renderCalendar()}
              
              <div className="mt-6 space-y-3 bg-surface-container p-4 rounded-xl">
                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-on-surface flex items-center">
                      평일 일수 (공제)
                    </span>
                    <span className="text-xs text-on-surface-variant mt-0.5">주말·지정휴일 자동 제외({manualWeekdays}일 산출됨)</span>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="number"
                      inputMode="decimal"
                      value={manualWeekdays}
                      onChange={(e) => setManualWeekdays(Number(e.target.value))}
                      className="w-16 text-center text-sm font-bold bg-surface border border-outline-variant/30 rounded-lg p-2 focus:ring-2 focus:ring-primary/50 focus:outline-none"
                    />
                    <span className="text-xs ml-2 text-on-surface-variant font-medium">일</span>
                  </div>
                </div>

                <div className="h-px bg-outline-variant/20 my-2"></div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-on-surface flex items-center">
                      초과시간 가산/감산
                    </span>
                    <span className="text-xs text-on-surface-variant mt-0.5">교육, 출장 등 기타 수동 가감</span>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={otherOvertime}
                      onChange={(e) => setOtherOvertime(e.target.value)}
                      className="w-16 text-center text-sm font-bold bg-surface border border-outline-variant/30 rounded-lg p-2 focus:ring-2 focus:ring-primary/50 focus:outline-none"
                    />
                    <span className="text-xs ml-2 text-on-surface-variant font-medium">h</span>
                  </div>
                </div>

                <div className="h-px bg-outline-variant/20 my-2"></div>

                <div className="flex items-center justify-between">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-on-surface flex items-center">
                      연가/병가
                    </span>
                    <span className="text-xs text-on-surface-variant mt-0.5">휴가일수 × 8h로 인정</span>
                  </div>
                  <div className="flex items-center">
                    <input
                      type="number"
                      inputMode="decimal"
                      placeholder="0"
                      value={vacationDays}
                      onChange={(e) => setVacationDays(e.target.value)}
                      className="w-16 text-center text-sm font-bold bg-surface border border-outline-variant/30 rounded-lg p-2 focus:ring-2 focus:ring-primary/50 focus:outline-none"
                    />
                    <span className="text-xs ml-2 text-on-surface-variant font-medium">일</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'simple' && (
            <div className="space-y-4 animate-in fade-in duration-300">
              <div className="flex justify-between items-center mb-2">
                 <h3 className="text-base font-bold text-on-surface">종합시간 직접입력</h3>
                 <button
                   onClick={() => {
                     setSimpleOvertime('');
                     setSimpleNightHours('');
                     setSimpleHolidayCount('');
                   }}
                   className="text-xs text-on-surface-variant flex items-center hover:text-primary bg-surface-container px-3 py-1.5 rounded-full"
                 >
                   <span className="material-symbols-outlined text-[14px] mr-1">refresh</span>초기화
                 </button>
               </div>
              <div className="flex items-center justify-between bg-surface-container-lowest p-4 rounded-xl border border-outline-variant/20">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-on-surface">시간외 근무 인정분</span>
                </div>
                <div className="flex items-center">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    value={simpleOvertime}
                    onChange={(e) => setSimpleOvertime(e.target.value)}
                    className="w-20 bg-surface border border-outline-variant/50 rounded-lg p-2 text-center text-sm font-bold text-on-surface focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
                  />
                  <span className="ml-2 text-sm text-on-surface-variant font-medium">h</span>
                </div>
              </div>
              <div className="flex items-center justify-between bg-secondaryContainer/20 p-4 rounded-xl border border-secondary/20">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-secondary">야간 근무 시간</span>
                  <span className="text-xs text-secondary/70 mt-1">22:00~06:00 내역만 합산</span>
                </div>
                <div className="flex items-center">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    value={simpleNightHours}
                    onChange={(e) => setSimpleNightHours(e.target.value)}
                    className="w-20 bg-surface border border-secondary/40 rounded-lg p-2 text-center text-sm font-bold text-secondary focus:outline-none focus:border-secondary focus:ring-2 focus:ring-secondary/30"
                  />
                  <span className="ml-2 text-sm text-secondary/70 font-medium">h</span>
                </div>
              </div>
              <div className="flex items-center justify-between bg-errorContainer/20 p-4 rounded-xl border border-error/20">
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-error">휴일 근무 일수</span>
                  <span className="text-xs text-error/70 mt-1">당번/주간 휴일근무에 해당하는 일수</span>
                </div>
                <div className="flex items-center">
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="0"
                    value={simpleHolidayCount}
                    onChange={(e) => setSimpleHolidayCount(e.target.value)}
                    className="w-20 bg-surface border border-error/40 rounded-lg p-2 text-center text-sm font-bold text-error focus:outline-none focus:border-error focus:ring-2 focus:ring-error/30"
                  />
                  <span className="ml-2 text-sm text-error/70 font-medium">일</span>
                </div>
              </div>
            </div>
          )}

          {/* 정액분 옵션 */}
          <div className="bg-surface-container-lowest border border-outline-variant/10 rounded-xl p-4 flex items-center justify-between mt-4">
            <div className="flex items-center gap-3">
              <label className="relative flex cursor-pointer items-center rounded-full">
                <input
                  type="checkbox"
                  className="peer h-5 w-5 cursor-pointer appearance-none rounded-md border-2 border-outline-variant transition-all checked:border-primary checked:bg-primary"
                  checked={includeFlatPay}
                  onChange={() => setIncludeFlatPay(!includeFlatPay)}
                />
                <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-onPrimary opacity-0 transition-opacity peer-checked:opacity-100">
                  <span className="material-symbols-outlined text-[16px] font-bold">check</span>
                </div>
              </label>
              <span className="text-sm font-bold text-on-surface" onClick={() => setIncludeFlatPay(!includeFlatPay)}>정액분 기본 10시간 포함</span>
            </div>
            {includeFlatPay && (
              <div className="flex items-center border border-outline-variant/30 rounded-lg bg-surface px-2 py-1">
                <input
                  type="number"
                  value={flatPayHours}
                  onChange={(e) => setFlatPayHours(Number(e.target.value))}
                  className="w-10 text-center text-sm font-bold bg-transparent outline-none"
                />
                <span className="text-xs text-on-surface-variant ml-1 font-medium">h</span>
              </div>
            )}
          </div>
        </div>

        {/* Section 3: Result */}
        <div className="bg-surface-container-highest rounded-2xl p-6 shadow-sm border border-outline-variant/20 mt-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-40 h-40 bg-primary rounded-full mix-blend-overlay filter blur-3xl opacity-10 drop-shadow-2xl"></div>
          
          <div className="relative z-10">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-on-surface-variant flex items-center gap-1.5"><span className="material-symbols-outlined text-[18px]">receipt_long</span>총 실지급 예상액 (세전)</h3>
            </div>
            
            <div className="text-3xl sm:text-4xl font-extrabold text-on-surface tracking-tight font-mono mb-6">
              {formatCurrency(totalAmount)}
              <span className="text-lg text-primary ml-2 font-medium tracking-normal">원</span>
            </div>

            <div className="space-y-3 pt-4 border-t border-outline-variant/20 text-sm font-medium">
              <div className="flex justify-between items-center text-on-surface-variant">
                <span>시간외 <span className="px-1.5 py-0.5 bg-surface-variant/30 rounded ml-1">{activeTab === 'simple' ? simpleOvertime || 0 : calOvertime}h</span></span>
                <span className="font-mono text-on-surface">{formatCurrency(calculatePay(activeTab === 'simple' ? Number(simpleOvertime) : calOvertime, rates.overtime))} 원</span>
              </div>
              
              {Number(activeTab === 'simple' ? simpleNightHours : calNightCount * 8) > 0 && (
                <div className="flex justify-between items-center text-secondary">
                  <span>야간 <span className="px-1.5 py-0.5 bg-secondary/10 rounded ml-1">{activeTab === 'simple' ? simpleNightHours : calNightCount * 8}h</span></span>
                  <span className="font-mono">+ {formatCurrency(calculatePay(activeTab === 'simple' ? Number(simpleNightHours) : calNightCount * 8, rates.night))} 원</span>
                </div>
              )}
              
              {Number(activeTab === 'simple' ? simpleHolidayCount : calHolidayCount) > 0 && (
                <div className="flex justify-between items-center text-error">
                  <span>휴일 <span className="px-1.5 py-0.5 bg-error/10 rounded ml-1">{activeTab === 'simple' ? simpleHolidayCount : calHolidayCount}일</span></span>
                  <span className="font-mono">+ {formatCurrency(calculatePay(activeTab === 'simple' ? Number(simpleHolidayCount) : calHolidayCount, rates.holiday))} 원</span>
                </div>
              )}
              
              {includeFlatPay && (
                <div className="flex justify-between items-center text-primary">
                  <span>정액분 <span className="px-1.5 py-0.5 bg-primary/10 rounded ml-1">{flatPayHours}h</span></span>
                  <span className="font-mono">+ {formatCurrency(calculatePay(flatPayHours, rates.overtime))} 원</span>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
