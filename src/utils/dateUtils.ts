import type { DashboardCycle } from '../types';

export function padZero(num: number): string {
  return num < 10 ? `0${num}` : `${num}`;
}

export function toDateString(d: Date): string {
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
}

/**
 * Returns ISO week number and start/end dates
 */
export function getISOWeekInfo(date: Date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Day 0 is Sunday, ISO day 1 is Monday, 7 is Sunday
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  const weekYear = d.getUTCFullYear();

  // Get Monday of this week
  const monday = new Date(date);
  const currentDay = monday.getDay() || 7;
  monday.setDate(monday.getDate() - currentDay + 1);
  monday.setHours(0, 0, 0, 0);

  // Get Sunday of this week
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return {
    year: weekYear,
    weekNo,
    startDate: monday,
    endDate: sunday,
  };
}

/**
 * Returns the 7 days (Monday through Sunday) for the given date's ISO week
 */
export function getWeekDates(date: Date = new Date()) {
  const { startDate } = getISOWeekInfo(date);
  const dayNames = ['월', '화', '수', '목', '금', '토', '일'];
  const todayStr = toDateString(new Date());

  const days: { date: Date; dateString: string; dayName: string; dayNumber: number; isToday: boolean }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(startDate);
    d.setDate(startDate.getDate() + i);
    const dateStr = toDateString(d);
    days.push({
      date: d,
      dateString: dateStr,
      dayName: dayNames[i],
      dayNumber: d.getDate(),
      isToday: dateStr === todayStr,
    });
  }
  return days;
}

/**
 * Calculates Korean KS A 5202 / ISO 8601 month-relative week:
 * The Thursday of this week determines which month this week belongs to,
 * and which week of that month it is.
 */
export function getMonthWeekInfo(startDate: Date) {
  // Thursday of this week (startDate is Monday)
  const thursday = new Date(startDate);
  thursday.setDate(startDate.getDate() + 3);
  const targetYear = thursday.getFullYear();
  const targetMonth = thursday.getMonth() + 1; // 1~12

  // First day of that month
  const firstDay = new Date(targetYear, targetMonth - 1, 1);
  const firstDayWeekday = firstDay.getDay() || 7; // Monday = 1, Sunday = 7
  // First Thursday date of that month
  const firstThursdayDate = 1 + ((4 - firstDayWeekday + 7) % 7);
  // Week of the month (1-based)
  const weekOfMonth = Math.floor((thursday.getDate() - firstThursdayDate) / 7) + 1;

  return {
    year: targetYear,
    month: targetMonth,
    weekOfMonth,
    label: `${targetMonth}월 ${weekOfMonth}주차`,
    fullLabel: `${targetYear}년 ${targetMonth}월 ${weekOfMonth}주차`,
  };
}

/**
 * Returns the key and label for weekly or monthly cycle
 */
export function getPeriodInfo(cycle: DashboardCycle, date: Date = new Date()) {
  if (cycle === 'weekly') {
    const { year, weekNo, startDate, endDate } = getISOWeekInfo(date);
    const monthWeek = getMonthWeekInfo(startDate);
    const key = `${year}-W${padZero(weekNo)}`;
    const startStr = `${padZero(startDate.getMonth() + 1)}.${padZero(startDate.getDate())}`;
    const endStr = `${padZero(endDate.getMonth() + 1)}.${padZero(endDate.getDate())}`;
    return {
      key,
      label: monthWeek.label, // e.g. "9월 2주차"
      fullLabel: monthWeek.fullLabel, // e.g. "2026년 9월 2주차"
      rangeText: `${startStr} ~ ${endStr}`,
    };
  } else {
    const year = date.getFullYear();
    const month = date.getMonth() + 1;
    const lastDay = new Date(year, month, 0).getDate();
    const key = `${year}-${padZero(month)}`;
    return {
      key,
      label: `${month}월`,
      fullLabel: `${year}년 ${month}월`,
      rangeText: `${year}.${padZero(month)}.01 ~ ${padZero(month)}.${padZero(lastDay)}`,
    };
  }
}

/**
 * Returns a list of past N periods and the current period for easy selection
 */
export function getCyclePeriodOptions(cycle: DashboardCycle, count: number = 8) {
  const options: { key: string; label: string; rangeText: string; isCurrent: boolean }[] = [];
  const now = new Date();
  const currentInfo = getPeriodInfo(cycle, now);

  for (let i = 0; i < count; i++) {
    const d = new Date();
    if (cycle === 'weekly') {
      d.setDate(d.getDate() - i * 7);
    } else {
      d.setMonth(d.getMonth() - i);
    }
    const info = getPeriodInfo(cycle, d);
    if (!options.some((o) => o.key === info.key)) {
      options.push({
        ...info,
        isCurrent: info.key === currentInfo.key,
      });
    }
  }

  return options;
}

/**
 * Generates month calendar matrix days (including leading and trailing days)
 */
export function getMonthCalendarMatrix(year: number, month: number) {
  // month is 0-indexed (0 = Jan, 11 = Dec)
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  // Day of week of 1st day (0 is Sunday, 1 is Monday ... 6 is Saturday)
  const startDayOfWeek = firstDayOfMonth.getDay(); 
  const totalDays = lastDayOfMonth.getDate();

  const days: { date: Date; dateString: string; isCurrentMonth: boolean; dayNumber: number }[] = [];

  // Previous month trailing days
  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDayOfWeek - 1; i >= 0; i--) {
    const d = new Date(year, month - 1, prevMonthLastDay - i);
    days.push({
      date: d,
      dateString: toDateString(d),
      isCurrentMonth: false,
      dayNumber: d.getDate(),
    });
  }

  // Current month days
  for (let day = 1; day <= totalDays; day++) {
    const d = new Date(year, month, day);
    days.push({
      date: d,
      dateString: toDateString(d),
      isCurrentMonth: true,
      dayNumber: day,
    });
  }

  // Next month leading days to complete full grid rows of 7
  const remainingDays = (7 - (days.length % 7)) % 7;
  for (let day = 1; day <= remainingDays; day++) {
    const d = new Date(year, month + 1, day);
    days.push({
      date: d,
      dateString: toDateString(d),
      isCurrentMonth: false,
      dayNumber: day,
    });
  }

  return days;
}

/**
 * Checks if a YYYY-MM-DD date falls within [startDate, endDate] inclusive
 */
export function isDateInRange(dateStr: string, startDateStr: string, endDateStr: string): boolean {
  if (!dateStr || !startDateStr) return false;
  const start = startDateStr <= (endDateStr || startDateStr) ? startDateStr : (endDateStr || startDateStr);
  const end = startDateStr <= (endDateStr || startDateStr) ? (endDateStr || startDateStr) : startDateStr;
  return dateStr >= start && dateStr <= end;
}

/**
 * Calculates number of days between two YYYY-MM-DD dates (inclusive)
 */
export function calculateDayCount(startDateStr: string, endDateStr: string): number {
  if (!startDateStr) return 1;
  const endStr = endDateStr || startDateStr;
  const start = new Date(startDateStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  const diffTime = Math.abs(end.getTime() - start.getTime());
  return Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;
}

/**
 * Formats a date range for display
 */
export function formatDateRange(startDateStr: string, endDateStr?: string): string {
  if (!startDateStr) return '';
  const end = endDateStr || startDateStr;
  if (startDateStr === end) {
    return startDateStr;
  }
  const days = calculateDayCount(startDateStr, end);
  return `${startDateStr} ~ ${end} (${days}일간)`;
}
