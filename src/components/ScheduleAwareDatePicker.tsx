import { useState, useMemo } from 'react';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  CalendarRange,
  Info,
  Check,
  X
} from 'lucide-react';
import type { GroupCalendarEvent } from '../types';
import { 
  getMonthCalendarMatrix, 
  toDateString, 
  isDateInRange, 
  calculateDayCount,
  formatDateRange 
} from '../utils/dateUtils';
import { getCategoryStyle } from './GroupCalendar';

interface ScheduleAwareDatePickerProps {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  onChangeRange: (startDate: string, endDate: string) => void;
  events: GroupCalendarEvent[];
  excludeEventId?: string; // Exclude currently edited event so it doesn't collide with itself
}

export default function ScheduleAwareDatePicker({
  startDate,
  endDate,
  onChangeRange,
  events,
  excludeEventId,
}: ScheduleAwareDatePickerProps) {
  // Whether the schedule-aware calendar popup is open
  const [isOpen, setIsOpen] = useState<boolean>(false);

  // Picker month reference date (initializes from startDate or today)
  const initialDate = useMemo(() => {
    if (startDate) {
      const parsed = new Date(startDate + 'T00:00:00');
      if (!isNaN(parsed.getTime())) return parsed;
    }
    return new Date();
  }, [startDate]);

  const [pickerYear, setPickerYear] = useState<number>(initialDate.getFullYear());
  const [pickerMonth, setPickerMonth] = useState<number>(initialDate.getMonth()); // 0-indexed

  // Selecting step inside the calendar: 'start' or 'end'
  const [activeStep, setActiveStep] = useState<'start' | 'end'>('start');

  // Temporary selection inside modal
  const [tempStart, setTempStart] = useState<string>(startDate);
  const [tempEnd, setTempEnd] = useState<string>(endDate);

  // Synchronize when opening
  const handleOpenPicker = (initialStep: 'start' | 'end' = 'start') => {
    setTempStart(startDate);
    setTempEnd(endDate);
    setActiveStep(initialStep);
    if (startDate) {
      const parsed = new Date(startDate + 'T00:00:00');
      if (!isNaN(parsed.getTime())) {
        setPickerYear(parsed.getFullYear());
        setPickerMonth(parsed.getMonth());
      }
    }
    setIsOpen(true);
  };

  const handleApply = () => {
    onChangeRange(tempStart, tempEnd || tempStart);
    setIsOpen(false);
  };

  const handleCancel = () => {
    setTempStart(startDate);
    setTempEnd(endDate);
    setIsOpen(false);
  };

  // Month navigation
  const prevMonth = () => {
    if (pickerMonth === 0) {
      setPickerYear((y) => y - 1);
      setPickerMonth(11);
    } else {
      setPickerMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (pickerMonth === 11) {
      setPickerYear((y) => y + 1);
      setPickerMonth(0);
    } else {
      setPickerMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    const now = new Date();
    setPickerYear(now.getFullYear());
    setPickerMonth(now.getMonth());
  };

  // 6x7 Month Calendar matrix grouped into 7-day weeks
  const weeks = useMemo(() => {
    const flatMatrix = getMonthCalendarMatrix(pickerYear, pickerMonth);
    const result: (typeof flatMatrix)[] = [];
    for (let i = 0; i < flatMatrix.length; i += 7) {
      result.push(flatMatrix.slice(i, i + 7));
    }
    return result;
  }, [pickerYear, pickerMonth]);

  const todayStr = toDateString(new Date());

  // Filter out the event currently being edited
  const filteredEvents = useMemo(() => {
    if (!excludeEventId) return events;
    return events.filter((e) => e.id !== excludeEventId);
  }, [events, excludeEventId]);

  // Pre-calculate continuous event bars and track allocation identical to main calendar
  const weeksLayout = useMemo(() => {
    return weeks.map((week) => {
      const weekStartStr = week[0]?.dateString || '';
      const weekEndStr = week[6]?.dateString || '';

      // Overlapping events in this week
      const overlapping = filteredEvents.filter((ev) => {
        const s = ev.startDate || ev.date || '';
        let e = ev.endDate || s;
        if (!s) return false;
        if (e < s) e = s;
        return !(e < weekStartStr || s > weekEndStr);
      });

      // Map to columns and continuation info
      const items = overlapping.map((ev) => {
        const s = ev.startDate || ev.date || '';
        let e = ev.endDate || s;
        if (!s) return null;
        if (e < s) e = s;
        const isMultiDay = s !== e;

        let startCol = 0;
        let continuesFromPrevWeek = false;
        if (s < weekStartStr) {
          startCol = 0;
          continuesFromPrevWeek = true;
        } else {
          const idx = week.findIndex((d) => d.dateString === s);
          startCol = idx >= 0 ? idx : 0;
        }

        let endCol = 6;
        let continuesToNextWeek = false;
        if (e > weekEndStr) {
          endCol = 6;
          continuesToNextWeek = true;
        } else {
          const idx = week.findIndex((d) => d.dateString === e);
          endCol = idx >= 0 ? idx : 6;
        }

        const span = Math.max(1, endCol - startCol + 1);

        return {
          event: ev,
          startCol,
          endCol,
          span,
          isMultiDay,
          continuesFromPrevWeek,
          continuesToNextWeek,
          startDate: s,
        };
      }).filter((item): item is NonNullable<typeof item> => item !== null);

      // Sort: multi-day first, longer span first, earlier start column first
      items.sort((a, b) => {
        if (a.isMultiDay !== b.isMultiDay) {
          return a.isMultiDay ? -1 : 1;
        }
        if (b.span !== a.span) {
          return b.span - a.span;
        }
        if (a.startCol !== b.startCol) {
          return a.startCol - b.startCol;
        }
        return a.startDate.localeCompare(b.startDate);
      });

      // Assign tracks
      const tracks: boolean[][] = [];
      const positioned: Array<{
        event: GroupCalendarEvent;
        startCol: number;
        endCol: number;
        span: number;
        track: number;
        isMultiDay: boolean;
        continuesFromPrevWeek: boolean;
        continuesToNextWeek: boolean;
      }> = [];

      for (const item of items) {
        let t = 0;
        while (true) {
          if (!tracks[t]) {
            tracks[t] = new Array(7).fill(false);
          }
          let hasConflict = false;
          for (let c = item.startCol; c <= item.endCol; c++) {
            if (tracks[t][c]) {
              hasConflict = true;
              break;
            }
          }
          if (!hasConflict) {
            for (let c = item.startCol; c <= item.endCol; c++) {
              tracks[t][c] = true;
            }
            positioned.push({
              ...item,
              track: t,
            });
            break;
          }
          t++;
        }
      }

      // Dynamic total tracks needed in this week (at least 2 tracks for compact modal height)
      const totalTracks = positioned.length > 0
        ? Math.max(2, ...positioned.map((p) => p.track + 1))
        : 2;

      return {
        visibleEvents: positioned,
        totalTracks,
      };
    });
  }, [weeks, filteredEvents]);

  // Duration in days
  const currentDuration = useMemo(() => {
    return calculateDayCount(startDate, endDate);
  }, [startDate, endDate]);

  const tempDuration = useMemo(() => {
    return calculateDayCount(tempStart, tempEnd);
  }, [tempStart, tempEnd]);

  // Handle clicking a date in the calendar
  const handleDateClick = (clickedDateStr: string) => {
    if (activeStep === 'start') {
      // Setting start date
      if (tempEnd && clickedDateStr > tempEnd) {
        setTempStart(clickedDateStr);
        setTempEnd(clickedDateStr);
      } else {
        setTempStart(clickedDateStr);
        if (!tempEnd) setTempEnd(clickedDateStr);
      }
      setActiveStep('end');
    } else {
      // Setting end date
      if (clickedDateStr < tempStart) {
        setTempStart(clickedDateStr);
        setTempEnd(clickedDateStr);
        setActiveStep('end');
      } else {
        setTempEnd(clickedDateStr);
        setActiveStep('start');
      }
    }
  };

  // Quick duration helper inside picker
  const handleQuickDuration = (days: number) => {
    const startStr = tempStart || todayStr;
    if (!tempStart) setTempStart(startStr);
    const base = new Date(startStr + 'T00:00:00');
    const end = new Date(base);
    end.setDate(end.getDate() + (days - 1));
    setTempEnd(toDateString(end));
  };

  return (
    <div className="space-y-2">
      {/* 1. Closed State: Two clean start/end cards + prominent "달력에서 선택" button */}
      <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800 shrink-0">
            <CalendarRange className="w-4 h-4 text-blue-600" />
            <span>일정 기간</span>
          </div>
          <span className="text-[11px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200 whitespace-nowrap shrink-0">
            {currentDuration === 1 ? '당일 일정 (1일)' : `총 ${currentDuration}일간의 일정`}
          </span>
        </div>

        {/* Start / End Date Display Cards (Clicking opens calendar with focus) */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => handleOpenPicker('start')}
            className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 bg-white hover:bg-blue-50/40 text-left transition-all cursor-pointer group shadow-2xs"
          >
            <span className="text-[10px] font-bold text-slate-500 group-hover:text-blue-600 uppercase tracking-wider block mb-0.5">
              시작 날짜
            </span>
            <div className="text-xs sm:text-sm font-bold font-mono text-slate-900 flex items-center justify-between">
              <span>{startDate || '날짜 선택'}</span>
              <CalendarIcon className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
            </div>
          </button>

          <button
            type="button"
            onClick={() => handleOpenPicker('end')}
            className="p-2.5 rounded-xl border border-slate-200 hover:border-blue-400 bg-white hover:bg-blue-50/40 text-left transition-all cursor-pointer group shadow-2xs"
          >
            <span className="text-[10px] font-bold text-slate-500 group-hover:text-blue-600 uppercase tracking-wider block mb-0.5">
              종료 날짜
            </span>
            <div className="text-xs sm:text-sm font-bold font-mono text-slate-900 flex items-center justify-between">
              <span>{endDate || '날짜 선택'}</span>
              <CalendarIcon className="w-3.5 h-3.5 text-slate-400 group-hover:text-blue-600" />
            </div>
          </button>
        </div>

        {/* Prominent Button to open the exact schedule calendar */}
        <button
          type="button"
          onClick={() => handleOpenPicker('start')}
          className="w-full py-2.5 px-3 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.99] shadow-2xs"
        >
          <CalendarRange className="w-4 h-4 text-blue-600" />
          <span>📅 기존 일정 표시 달력에서 시작/끝 날짜 선택</span>
        </button>
      </div>

      {/* 2. Open Modal State: Full-fidelity schedule calendar */}
      {isOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl border border-slate-200 overflow-hidden max-h-[94vh] flex flex-col animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-100 bg-slate-50/80">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CalendarRange className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                    일정 기간 달력에서 선택
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    메인 달력과 동일하게 기존 일정 바(Bar)와 칸 연결을 확인하며 선택할 수 있습니다.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleCancel}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                title="닫기"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-3 sm:p-4 overflow-y-auto space-y-3 flex-1">
              {/* Step indicator & current temp range */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setActiveStep('start')}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                    activeStep === 'start'
                      ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 shadow-2xs'
                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-[10px] font-bold ${activeStep === 'start' ? 'text-blue-700' : 'text-slate-500'}`}>
                      1. 시작일 {activeStep === 'start' && '● 선택 중'}
                    </span>
                  </div>
                  <div className="font-bold text-xs sm:text-sm font-mono text-slate-900">
                    {tempStart || '선택 대기'}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveStep('end')}
                  className={`p-2 rounded-xl border text-left transition-all cursor-pointer ${
                    activeStep === 'end'
                      ? 'bg-blue-50 border-blue-500 ring-2 ring-blue-500/20 shadow-2xs'
                      : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between mb-0.5">
                    <span className={`text-[10px] font-bold ${activeStep === 'end' ? 'text-blue-700' : 'text-slate-500'}`}>
                      2. 종료일 {activeStep === 'end' && '● 선택 중'}
                    </span>
                  </div>
                  <div className="font-bold text-xs sm:text-sm font-mono text-slate-900">
                    {tempEnd || '선택 대기'}
                  </div>
                </button>
              </div>

              {/* Quick duration presets */}
              <div className="flex items-center gap-1.5 flex-wrap text-[11px]">
                <span className="text-slate-400 font-medium text-[10px]">빠른 기간:</span>
                {[
                  { label: '당일 (1일)', days: 1 },
                  { label: '2일', days: 2 },
                  { label: '3일', days: 3 },
                  { label: '5일', days: 5 },
                  { label: '1주일 (7일)', days: 7 },
                  { label: '2주일 (14일)', days: 14 }
                ].map((preset) => (
                  <button
                    key={preset.days}
                    type="button"
                    onClick={() => handleQuickDuration(preset.days)}
                    className={`px-2 py-0.5 rounded-lg border text-[11px] font-semibold transition-all cursor-pointer ${
                      tempDuration === preset.days && tempStart
                        ? 'bg-blue-600 text-white border-blue-600 shadow-2xs'
                        : 'bg-white hover:bg-slate-100 border-slate-200 text-slate-600'
                    }`}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>

              {/* Month Navigation Header */}
              <div className="flex items-center justify-between pt-1">
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={prevMonth}
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="이전 달"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs sm:text-sm font-extrabold text-slate-900 px-1 font-mono">
                    {pickerYear}년 {pickerMonth + 1}월
                  </span>
                  <button
                    type="button"
                    onClick={nextMonth}
                    className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                    title="다음 달"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-500 hidden sm:inline">
                    달력의 날짜를 클릭하여 시작일과 종료일을 지정하세요
                  </span>
                  <button
                    type="button"
                    onClick={goToday}
                    className="px-2 py-1 text-[11px] font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors cursor-pointer"
                  >
                    오늘
                  </button>
                </div>
              </div>

              {/* Exact Continuous Bar Matrix with Connected Cell Borders */}
              <div className="relative isolate bg-slate-50/70 rounded-xl p-1 sm:p-2 border border-slate-200">
                {/* Day of Week Headers */}
                <div className="grid grid-cols-7 gap-0.5 sm:gap-1 text-center mb-1">
                  {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => (
                    <div
                      key={day}
                      className={`py-1 text-[11px] sm:text-xs font-bold ${
                        idx === 0 ? 'text-rose-500' : idx === 6 ? 'text-blue-500' : 'text-slate-500'
                      }`}
                    >
                      {day}
                    </div>
                  ))}
                </div>

                {/* Calendar Week Rows */}
                <div className="space-y-0.5 sm:space-y-1">
                  {weeks.map((week, wIdx) => {
                    const weekLayout = weeksLayout[wIdx] || {
                      visibleEvents: [],
                      totalTracks: 2,
                    };

                    // Dynamic row height that expands vertically when events increase
                    const cellMinHeight = Math.max(58, 26 + weekLayout.totalTracks * 22 + 6);

                    return (
                      <div key={`week_row_${wIdx}`} className="relative">
                        {/* Layer 1: Background Day Cells (7 columns) */}
                        <div className="grid grid-cols-7 gap-0.5 sm:gap-1 relative z-0">
                          {week.map((cell, cIdx) => {
                            const isCurrentMonthDay = cell.date.getMonth() === pickerMonth;
                            const dStr = cell.dateString;
                            const isStart = dStr === tempStart;
                            const isEnd = dStr === tempEnd;
                            const inSelectedRange = isDateInRange(dStr, tempStart, tempEnd);
                            const isToday = dStr === todayStr;
                            const isSunday = cIdx === 0;
                            const isSaturday = cIdx === 6;

                            // Connected borders check identical to main calendar
                            const hasMultiDayLeft = cIdx > 0 && filteredEvents.some((ev) => {
                              const s = ev.startDate || ev.date || '';
                              let e = ev.endDate || s;
                              if (e < s) e = s;
                              if (s === e) return false;
                              return isDateInRange(week[cIdx - 1]?.dateString || '', s, e) && isDateInRange(dStr, s, e);
                            });

                            const hasMultiDayRight = cIdx < 6 && filteredEvents.some((ev) => {
                              const s = ev.startDate || ev.date || '';
                              let e = ev.endDate || s;
                              if (e < s) e = s;
                              if (s === e) return false;
                              return isDateInRange(dStr, s, e) && isDateInRange(week[cIdx + 1]?.dateString || '', s, e);
                            });

                            const continuesFromPrevWeek = isSunday && filteredEvents.some((ev) => {
                              const s = ev.startDate || ev.date || '';
                              let e = ev.endDate || s;
                              if (e < s) e = s;
                              if (s === e) return false;
                              return s < dStr && e >= dStr;
                            });

                            const continuesToNextWeek = isSaturday && filteredEvents.some((ev) => {
                              const s = ev.startDate || ev.date || '';
                              let e = ev.endDate || s;
                              if (e < s) e = s;
                              if (s === e) return false;
                              return s <= dStr && e > dStr;
                            });

                            const isMultiDaySpan = hasMultiDayLeft || hasMultiDayRight || continuesFromPrevWeek || continuesToNextWeek;

                            const connectLeft = !inSelectedRange && (hasMultiDayLeft || continuesFromPrevWeek);
                            const connectRight = !inSelectedRange && (hasMultiDayRight || continuesToNextWeek);

                            // Range selection connectivity (connecting cells from start date to end date)
                            const isRangeSingleDay = tempStart && tempEnd && tempStart === tempEnd;
                            const isRangeMultiDay = Boolean(tempStart && tempEnd && tempStart < tempEnd);

                            const rangeConnectLeft = Boolean(
                              isRangeMultiDay &&
                              inSelectedRange &&
                              cIdx > 0 &&
                              isDateInRange(week[cIdx - 1]?.dateString || '', tempStart, tempEnd)
                            );

                            const rangeConnectRight = Boolean(
                              isRangeMultiDay &&
                              inSelectedRange &&
                              cIdx < 6 &&
                              isDateInRange(week[cIdx + 1]?.dateString || '', tempStart, tempEnd)
                            );

                            let roundedClasses = 'rounded-lg sm:rounded-xl';
                            let borderClasses = 'border border-slate-200/90 bg-white';
                            let zIndexClass = 'z-0';

                            if (inSelectedRange) {
                              zIndexClass = 'z-1';
                              if (isRangeSingleDay || (!rangeConnectLeft && !rangeConnectRight)) {
                                roundedClasses = 'rounded-lg sm:rounded-xl';
                                borderClasses = 'border-2 border-blue-600 bg-blue-50/90 shadow-2xs';
                              } else if (rangeConnectLeft && rangeConnectRight) {
                                // Middle of selected range in this week row
                                roundedClasses = 'rounded-none';
                                borderClasses = 'border-y-2 border-x-0 border-blue-600 bg-blue-50/90';
                              } else if (rangeConnectRight) {
                                // Start of selected range (or start of week row within range)
                                roundedClasses = 'rounded-l-lg sm:rounded-l-xl rounded-r-none';
                                borderClasses = 'border-y-2 border-l-2 border-r-0 border-blue-600 bg-blue-50/90';
                              } else if (rangeConnectLeft) {
                                // End of selected range (or end of week row within range)
                                roundedClasses = 'rounded-r-lg sm:rounded-r-xl rounded-l-none';
                                borderClasses = 'border-y-2 border-r-2 border-l-0 border-blue-600 bg-blue-50/90';
                              }
                            } else if (connectLeft && connectRight) {
                              roundedClasses = 'rounded-none';
                              borderClasses = 'border-y border-x-0 border-blue-300 bg-white';
                            } else if (connectLeft) {
                              roundedClasses = 'rounded-r-lg sm:rounded-r-xl rounded-l-none';
                              borderClasses = 'border-y border-r border-l-0 border-blue-300 bg-white';
                            } else if (connectRight) {
                              roundedClasses = 'rounded-l-lg sm:rounded-l-xl rounded-r-none';
                              borderClasses = 'border-y border-l border-r-0 border-blue-300 bg-white';
                            } else if (isMultiDaySpan) {
                              roundedClasses = 'rounded-lg sm:rounded-xl';
                              borderClasses = 'border border-blue-300 bg-white';
                            } else {
                              borderClasses = 'border border-slate-200 bg-white';
                            }

                            return (
                              <div
                                key={dStr}
                                onClick={() => handleDateClick(dStr)}
                                style={{
                                  minHeight: `${cellMinHeight}px`,
                                }}
                                className={`relative p-0.5 sm:p-1 flex flex-col justify-between transition-all cursor-pointer select-none hover:bg-blue-50/50 ${roundedClasses} ${borderClasses} ${zIndexClass} ${
                                  !isCurrentMonthDay ? 'opacity-35' : ''
                                }`}
                              >
                                {/* Gap connector bridge for selected date range (connects adjacent cells seamlessly) */}
                                {rangeConnectRight && (
                                  <div
                                    className="absolute -right-[2px] sm:-right-[4px] top-[-2px] bottom-[-2px] w-[2px] sm:w-[4px] pointer-events-none z-1 bg-blue-50/95 border-y-2 border-blue-600"
                                  />
                                )}

                                {/* Gap connector bridge with pure white background for existing schedule multi-day spans */}
                                {!inSelectedRange && connectRight && (
                                  <div
                                    className={`absolute -right-[2px] sm:-right-[4px] top-[-1px] bottom-[-1px] w-[2px] sm:w-[4px] pointer-events-none z-0 border-y ${
                                      isCurrentMonthDay
                                        ? 'bg-white border-blue-300'
                                        : 'bg-slate-100/40 border-slate-200/50'
                                    }`}
                                  />
                                )}

                                {/* Date Number & Tag - Sized carefully so mobile screens do not clip "당일" */}
                                <div className="relative z-1 flex items-center justify-between pointer-events-none gap-0.5">
                                  <span
                                    className={`text-[10px] sm:text-xs font-bold w-4 h-4 sm:w-5 sm:h-5 shrink-0 flex items-center justify-center rounded-full ${
                                      isStart || isEnd
                                        ? 'bg-blue-600 text-white shadow-2xs font-extrabold'
                                        : inSelectedRange
                                        ? 'text-blue-900 font-extrabold'
                                        : isToday
                                        ? 'bg-blue-100 text-blue-700 font-extrabold ring-1 ring-blue-400'
                                        : isSunday
                                        ? 'text-rose-500'
                                        : isSaturday
                                        ? 'text-blue-500'
                                        : 'text-slate-700'
                                    }`}
                                  >
                                    {cell.date.getDate()}
                                  </span>

                                  {isStart && isEnd ? (
                                    <span className="text-[8px] sm:text-[9px] font-black text-blue-700 bg-white/95 px-1 py-0.5 rounded leading-none whitespace-nowrap shrink-0 shadow-2xs border border-blue-200/60">
                                      당일
                                    </span>
                                  ) : isStart ? (
                                    <span className="text-[8px] sm:text-[9px] font-black text-blue-700 bg-white/95 px-1 py-0.5 rounded leading-none whitespace-nowrap shrink-0 shadow-2xs border border-blue-200/60">
                                      시작
                                    </span>
                                  ) : isEnd ? (
                                    <span className="text-[8px] sm:text-[9px] font-black text-blue-700 bg-white/95 px-1 py-0.5 rounded leading-none whitespace-nowrap shrink-0 shadow-2xs border border-blue-200/60">
                                      종료
                                    </span>
                                  ) : null}
                                </div>

                                {/* Reserved vertical room for event tracks overlay */}
                                <div className="flex-1 pointer-events-none" />
                              </div>
                            );
                          })}
                        </div>

                        {/* Layer 2: Continuous Event Bars Overlay identical to main calendar (pointer-events-none so tapping selects the date) */}
                        <div
                          className="absolute left-0 right-0 top-[24px] sm:top-[28px] grid grid-cols-7 gap-0.5 sm:gap-1 pointer-events-none px-0.5 sm:px-1 z-10"
                          style={{
                            gridTemplateRows: `repeat(${weekLayout.totalTracks}, minmax(18px, 20px))`,
                            rowGap: '2px',
                          }}
                        >
                          {weekLayout.visibleEvents.map((p) => {
                            const ev = p.event;
                            const style = getCategoryStyle(ev.category, ev.categoryColor);

                            const leftRounded = p.continuesFromPrevWeek
                              ? 'rounded-l-none border-l-0 pl-1'
                              : 'rounded-l-md pl-1 sm:pl-1.5';
                            const rightRounded = p.continuesToNextWeek
                              ? 'rounded-r-none border-r-0 pr-1'
                              : 'rounded-r-md pr-1 sm:pr-1.5';

                            return (
                              <div
                                key={`${ev.id}_${wIdx}_${p.track}`}
                                style={{
                                  gridColumn: `${p.startCol + 1} / span ${p.span}`,
                                  gridRow: `${p.track + 1}`,
                                }}
                                className={`pointer-events-none h-[18px] sm:h-[20px] flex items-center text-[9px] sm:text-[10px] font-medium transition-all shadow-2xs border select-none ${
                                  style.bg
                                } ${style.color} ${style.border} ${leftRounded} ${rightRounded}`}
                                title={`${ev.title} (${formatDateRange(ev.startDate, ev.endDate)})`}
                              >
                                {p.continuesFromPrevWeek && (
                                  <span className="text-[9px] font-bold text-slate-400 mr-0.5 flex-shrink-0">‹</span>
                                )}
                                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mr-1 ${style.dot}`} />
                                <span className="truncate flex-1 font-semibold">{ev.title}</span>
                                {p.continuesToNextWeek && (
                                  <span className="text-[9px] font-bold text-slate-400 ml-0.5 flex-shrink-0">›</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50 flex-shrink-0 gap-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-700 min-w-0">
                <Info className="w-4 h-4 text-blue-600 flex-shrink-0" />
                <span className="font-mono font-bold text-slate-900 text-[11px] sm:text-xs truncate">
                  {formatDateRange(tempStart, tempEnd)}
                </span>
                <span className="text-blue-600 font-bold bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 whitespace-nowrap text-[10px] sm:text-xs shrink-0">
                  {tempDuration === 1 ? '당일' : `${tempDuration}일간`}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleApply}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs active:scale-95 flex items-center gap-1"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>선택 완료</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
