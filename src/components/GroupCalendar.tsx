import { useState, useEffect, type FormEvent, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Trash2, 
  Clock, 
  FileText, 
  Tag, 
  X, 
  Check, 
  AlertCircle,
  Loader2,
  CalendarDays,
  CalendarRange,
  Palette,
  CheckSquare
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  doc 
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import type { Group, GroupCalendarEvent } from '../types';
import CalendarChecklistView from './CalendarChecklistView';
import ScheduleAwareDatePicker from './ScheduleAwareDatePicker';
import { 
  getMonthCalendarMatrix, 
  toDateString, 
  isDateInRange, 
  calculateDayCount, 
  formatDateRange 
} from '../utils/dateUtils';

interface GroupCalendarProps {
  group: Group;
}

// Available color presets for custom categories
export const CATEGORY_COLORS: Record<string, { label: string; color: string; bg: string; border: string; dot: string }> = {
  blue: { label: '파랑', color: 'text-blue-700', bg: 'bg-blue-50', border: 'border-blue-200', dot: 'bg-blue-500' },
  emerald: { label: '초록', color: 'text-emerald-700', bg: 'bg-emerald-50', border: 'border-emerald-200', dot: 'bg-emerald-500' },
  purple: { label: '보라', color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200', dot: 'bg-purple-500' },
  amber: { label: '주황/노랑', color: 'text-amber-800', bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-500' },
  rose: { label: '빨강/로즈', color: 'text-rose-700', bg: 'bg-rose-50', border: 'border-rose-200', dot: 'bg-rose-500' },
  indigo: { label: '인디고', color: 'text-indigo-700', bg: 'bg-indigo-50', border: 'border-indigo-200', dot: 'bg-indigo-500' },
  teal: { label: '청록', color: 'text-teal-700', bg: 'bg-teal-50', border: 'border-teal-200', dot: 'bg-teal-500' },
  slate: { label: '그레이', color: 'text-slate-700', bg: 'bg-slate-100', border: 'border-slate-200', dot: 'bg-slate-500' },
};

export function getCategoryStyle(categoryName?: string, colorKey?: string) {
  if (colorKey && CATEGORY_COLORS[colorKey]) {
    return CATEGORY_COLORS[colorKey];
  }
  if (!categoryName || !categoryName.trim()) {
    return CATEGORY_COLORS.slate;
  }
  // Deterministic color assignment based on category string
  const keys = Object.keys(CATEGORY_COLORS);
  let hash = 0;
  for (let i = 0; i < categoryName.length; i++) {
    hash = categoryName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % (keys.length - 1); // exclude slate as default
  return CATEGORY_COLORS[keys[index]];
}

export default function GroupCalendar({ group }: GroupCalendarProps) {
  const { username, displayName } = useAuth();

  const [currentYear, setCurrentYear] = useState<number>(new Date().getFullYear());
  const [currentMonth, setCurrentMonth] = useState<number>(new Date().getMonth()); // 0-indexed
  const [selectedDateString, setSelectedDateString] = useState<string>(toDateString(new Date()));
  const [calendarSubView, setCalendarSubView] = useState<'schedule' | 'checklist'>('schedule');

  const [events, setEvents] = useState<GroupCalendarEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Add Event Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [addDateMode, setAddDateMode] = useState<'calendar' | 'input'>('calendar');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newStartDate, setNewStartDate] = useState<string>(selectedDateString);
  const [newEndDate, setNewEndDate] = useState<string>(selectedDateString);
  const [newTime, setNewTime] = useState<string>('');
  const [newCategory, setNewCategory] = useState<string>('');
  const [newCategoryColor, setNewCategoryColor] = useState<string>('blue');
  const [newDesc, setNewDesc] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Edit Event State
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [editDateMode, setEditDateMode] = useState<'calendar' | 'input'>('calendar');
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editStartDate, setEditStartDate] = useState<string>('');
  const [editEndDate, setEditEndDate] = useState<string>('');
  const [editTime, setEditTime] = useState<string>('');
  const [editCategory, setEditCategory] = useState<string>('');
  const [editCategoryColor, setEditCategoryColor] = useState<string>('blue');
  const [editDesc, setEditDesc] = useState<string>('');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // Real-time listener for this group's events
  useEffect(() => {
    setLoading(true);
    setError(null);

    const eventsCol = collection(db, 'groups', group.id, 'events');
    const unsubscribe = onSnapshot(
      eventsCol,
      (snapshot) => {
        const list: GroupCalendarEvent[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          const startDate = data.startDate || data.date || '';
          const endDate = data.endDate || startDate;
          list.push({
            id: d.id,
            groupId: group.id,
            title: data.title || '제목 없음',
            startDate,
            endDate,
            date: startDate,
            time: data.time || '',
            description: data.description || '',
            category: data.category || '',
            categoryColor: data.categoryColor || '',
            authorUsername: data.authorUsername || '',
            authorDisplayName: data.authorDisplayName || data.authorUsername || '멤버',
            createdAt: data.createdAt || '',
          });
        });

        // Sort by startDate ascending, then endDate, then time
        list.sort((a, b) => {
          if (a.startDate !== b.startDate) return a.startDate.localeCompare(b.startDate);
          if (a.endDate !== b.endDate) return a.endDate.localeCompare(b.endDate);
          return (a.time || '').localeCompare(b.time || '');
        });

        setEvents(list);
        setLoading(false);
      },
      (err) => {
        console.error('Firestore events listener error:', err);
        setError('일정을 불러오는 중 오류가 발생했습니다.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [group.id]);

  // Extract unique custom categories previously used in this group
  const existingCategories = useMemo(() => {
    const map = new Map<string, string>();
    events.forEach((ev) => {
      const cat = ev.category?.trim();
      if (cat) {
        if (!map.has(cat)) {
          map.set(cat, ev.categoryColor || '');
        }
      }
    });
    return Array.from(map.entries()).map(([name, color]) => ({ name, color }));
  }, [events]);

  const monthMatrix = getMonthCalendarMatrix(currentYear, currentMonth);

  const prevMonth = () => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((y) => y - 1);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((y) => y + 1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    const today = new Date();
    setCurrentYear(today.getFullYear());
    setCurrentMonth(today.getMonth());
    setSelectedDateString(toDateString(today));
  };

  // Open modal prefilled with target date
  const handleOpenAddModal = (dateStr?: string) => {
    const targetDate = dateStr || selectedDateString || toDateString(new Date());
    setNewStartDate(targetDate);
    setNewEndDate(targetDate);
    setAddDateMode('calendar');
    setNewTitle('');
    setNewTime('');
    setNewCategory('');
    setNewCategoryColor('blue');
    setNewDesc('');
    setModalError(null);
    setIsAddModalOpen(true);
  };

  // Add Event - Any member can manage
  const handleAddEvent = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) {
      setModalError('일정 제목을 입력해주세요.');
      return;
    }
    if (!newStartDate) {
      setModalError('시작 날짜를 선택해주세요.');
      return;
    }
    const finalEndDate = newEndDate || newStartDate;
    if (finalEndDate < newStartDate) {
      setModalError('종료 날짜는 시작 날짜보다 빠를 수 없습니다.');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      const eventsCol = collection(db, 'groups', group.id, 'events');
      await addDoc(eventsCol, {
        groupId: group.id,
        title: trimmedTitle,
        startDate: newStartDate,
        endDate: finalEndDate,
        date: newStartDate, // backward compatibility
        time: newTime.trim(),
        category: newCategory.trim(),
        categoryColor: newCategory.trim() ? newCategoryColor : '',
        description: newDesc.trim(),
        authorUsername: username,
        authorDisplayName: displayName || username,
        createdAt: new Date().toISOString(),
      });

      setSelectedDateString(newStartDate);
      setIsAddModalOpen(false);
    } catch (err: any) {
      console.error('Add event error:', err);
      setModalError('일정 등록 실패: ' + (err.message || '다시 시도해주세요.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  // Delete Event - Any member can manage
  const handleDeleteEvent = async (eventId: string, eventTitle: string) => {
    if (!window.confirm(`'${eventTitle}' 일정을 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'groups', group.id, 'events', eventId));
    } catch (err: any) {
      console.error('Delete event error:', err);
      alert('일정 삭제 실패: ' + (err.message || '다시 시도해주세요.'));
    }
  };

  // Start Editing Event
  const handleStartEdit = (event: GroupCalendarEvent) => {
    setEditingEventId(event.id);
    setEditDateMode('calendar');
    setEditTitle(event.title);
    setEditStartDate(event.startDate || event.date || selectedDateString);
    setEditEndDate(event.endDate || event.startDate || event.date || selectedDateString);
    setEditTime(event.time || '');
    setEditCategory(event.category || '');
    setEditCategoryColor(event.categoryColor || 'blue');
    setEditDesc(event.description || '');
  };

  // Save Edit Event
  const handleSaveEdit = async (eventId: string) => {
    if (!editTitle.trim()) {
      alert('일정 제목을 입력해주세요.');
      return;
    }
    if (!editStartDate) {
      alert('시작 날짜를 선택해주세요.');
      return;
    }
    const finalEndDate = editEndDate || editStartDate;
    if (finalEndDate < editStartDate) {
      alert('종료 날짜는 시작 날짜보다 빠를 수 없습니다.');
      return;
    }

    setIsUpdating(true);
    try {
      const eventRef = doc(db, 'groups', group.id, 'events', eventId);
      await updateDoc(eventRef, {
        title: editTitle.trim(),
        startDate: editStartDate,
        endDate: finalEndDate,
        date: editStartDate,
        time: editTime.trim(),
        category: editCategory.trim(),
        categoryColor: editCategory.trim() ? editCategoryColor : '',
        description: editDesc.trim(),
        lastEditedBy: username,
        lastEditedAt: new Date().toISOString(),
      });
      setEditingEventId(null);
    } catch (err: any) {
      console.error('Update event error:', err);
      alert('일정 수정 실패: ' + (err.message || '다시 시도해주세요.'));
    } finally {
      setIsUpdating(false);
    }
  };

  // Events that cover the selected date
  const selectedDateEvents = useMemo(() => {
    return events.filter((ev) => {
      const s = ev.startDate || ev.date || '';
      let e = ev.endDate || s;
      if (!s) return false;
      if (e < s) e = s;
      return isDateInRange(selectedDateString, s, e);
    });
  }, [events, selectedDateString]);

  // Group month matrix into weeks of 7 days
  const weeks = useMemo(() => {
    const result: (typeof monthMatrix)[] = [];
    for (let i = 0; i < monthMatrix.length; i += 7) {
      result.push(monthMatrix.slice(i, i + 7));
    }
    return result;
  }, [monthMatrix]);

  // Pre-calculate which events appear on each cell of the current month matrix
  const eventsForMonthCells = useMemo(() => {
    const map = new Map<string, GroupCalendarEvent[]>();
    monthMatrix.forEach((cell) => {
      const matching = events.filter((ev) => {
        const s = ev.startDate || ev.date || '';
        let e = ev.endDate || s;
        if (!s) return false;
        if (e < s) e = s;
        return isDateInRange(cell.dateString, s, e);
      });
      map.set(cell.dateString, matching);
    });
    return map;
  }, [events, monthMatrix]);

  // Pre-calculate continuous event bars and track allocation per week
  const weeksLayout = useMemo(() => {
    return weeks.map((week) => {
      const weekStartStr = week[0].dateString;
      const weekEndStr = week[6].dateString;

      // Overlapping events in this week
      const overlapping = events.filter((ev) => {
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

      // Dynamic total tracks needed in this week (at least 3 tracks to keep baseline cell height)
      const totalTracks = positioned.length > 0
        ? Math.max(3, ...positioned.map((p) => p.track + 1))
        : 3;

      return {
        visibleEvents: positioned,
        totalTracks,
      };
    });
  }, [weeks, events]);

  const todayString = toDateString(new Date());

  // Helper to adjust newStartDate and auto-bump newEndDate
  const handleStartDateChange = (val: string) => {
    setNewStartDate(val);
    if (!newEndDate || newEndDate < val) {
      setNewEndDate(val);
    }
  };

  const dayDuration = calculateDayCount(newStartDate, newEndDate);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-2.5 sm:p-6 space-y-4 sm:space-y-5">
      {/* Calendar Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-blue-100 text-blue-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <CalendarIcon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-slate-900 text-base sm:text-xl">
                그룹 공용 달력
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                멤버 공용
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                일정 바(Bar) 표시
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              당일 일정 및 연속 기간 일정이 달력에 바(Bar) 형태로 직관적으로 표시됩니다.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              id="today-btn"
              onClick={goToday}
              className="px-2.5 sm:px-3 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-xl transition-all cursor-pointer"
            >
              오늘
            </button>
            <div className="flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-200">
              <button
                type="button"
                id="prev-month-btn"
                onClick={prevMonth}
                className="p-2 sm:p-1.5 hover:bg-white text-slate-600 hover:text-slate-900 active:scale-95 rounded-lg transition-all cursor-pointer"
                title="이전 달"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 sm:px-2.5 text-xs font-bold text-slate-800 whitespace-nowrap">
                {currentYear}년 {currentMonth + 1}월
              </span>
              <button
                type="button"
                id="next-month-btn"
                onClick={nextMonth}
                className="p-2 sm:p-1.5 hover:bg-white text-slate-600 hover:text-slate-900 active:scale-95 rounded-lg transition-all cursor-pointer"
                title="다음 달"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <button
            type="button"
            id="open-add-event-btn"
            onClick={() => handleOpenAddModal()}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white rounded-xl text-xs font-semibold transition-all shadow-xs shadow-blue-500/20 cursor-pointer flex-shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>일정 추가</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Sub-view switcher: [ 📅 일정 달력 (Bar) ] vs [ ✓ 달력 체크리스트 ] */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 bg-slate-50/80 p-2 rounded-2xl border border-slate-200">
        <div className="flex items-center gap-1.5 p-1 bg-slate-200/70 rounded-xl">
          <button
            type="button"
            id="calendar-subview-schedule-btn"
            onClick={() => setCalendarSubView('schedule')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              calendarSubView === 'schedule'
                ? 'bg-white text-blue-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarIcon className="w-3.5 h-3.5 text-blue-600" />
            <span>일정 달력</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-blue-100 text-blue-700">
              {events.length}
            </span>
          </button>
          <button
            type="button"
            id="calendar-subview-checklist-btn"
            onClick={() => setCalendarSubView('checklist')}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              calendarSubView === 'checklist'
                ? 'bg-white text-emerald-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <CheckSquare className="w-3.5 h-3.5 text-emerald-600" />
            <span>달력 체크리스트</span>
            <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-100 text-emerald-700 font-semibold">
              주간/월간 목표 %
            </span>
          </button>
        </div>
        <p className="text-[11px] text-slate-500 px-1">
          {calendarSubView === 'schedule'
            ? '당일 및 연속 기간 일정이 달력에 직관적인 Bar 형태로 표시됩니다.'
            : '일정과 분리된 주간 요일별 실천 및 이번 달 누적 목표 달성률(%)을 관리합니다.'}
        </p>
      </div>

      {calendarSubView === 'checklist' ? (
        <CalendarChecklistView 
          group={group} 
          selectedDateString={selectedDateString} 
          onSelectDate={(d) => setSelectedDateString(d)} 
        />
      ) : (
        /* Grid: Calendar Matrix on Left / Selected Day Schedules on Right */
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Monthly Calendar Matrix (7 columns) */}
        <div className="lg:col-span-7 bg-slate-50/70 rounded-xl sm:rounded-2xl p-1 sm:p-3.5 border border-slate-200 relative isolate">
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

          {/* Calendar Week Rows with Continuous Event Bars */}
          <div className="space-y-0.5 sm:space-y-1">
            {weeks.map((week, wIdx) => {
              const weekLayout = weeksLayout[wIdx] || {
                visibleEvents: [],
                totalTracks: 3,
              };

              return (
                <div key={`week_row_${wIdx}`} className="relative">
                  {/* Layer 1: Background Day Cells (7 columns) */}
                  <div className="grid grid-cols-7 gap-0.5 sm:gap-1 relative z-0">
                    {week.map((cell, cIdx) => {
                      const isSelected = cell.dateString === selectedDateString;
                      const isToday = cell.dateString === todayString;
                      const isSunday = cIdx === 0;
                      const isSaturday = cIdx === 6;
                      const dayCount = (eventsForMonthCells.get(cell.dateString) || []).length;

                      // Check if this cell is part of a consecutive multi-day event spanning to neighbor cells
                      const hasMultiDayLeft = cIdx > 0 && events.some((ev) => {
                        const s = ev.startDate || ev.date || '';
                        let e = ev.endDate || s;
                        if (e < s) e = s;
                        if (s === e) return false;
                        return isDateInRange(week[cIdx - 1].dateString, s, e) && isDateInRange(cell.dateString, s, e);
                      });

                      const hasMultiDayRight = cIdx < 6 && events.some((ev) => {
                        const s = ev.startDate || ev.date || '';
                        let e = ev.endDate || s;
                        if (e < s) e = s;
                        if (s === e) return false;
                        return isDateInRange(cell.dateString, s, e) && isDateInRange(week[cIdx + 1].dateString, s, e);
                      });

                      const continuesFromPrevWeek = isSunday && events.some((ev) => {
                        const s = ev.startDate || ev.date || '';
                        let e = ev.endDate || s;
                        if (e < s) e = s;
                        if (s === e) return false;
                        return s < cell.dateString && e >= cell.dateString;
                      });

                      const continuesToNextWeek = isSaturday && events.some((ev) => {
                        const s = ev.startDate || ev.date || '';
                        let e = ev.endDate || s;
                        if (e < s) e = s;
                        if (s === e) return false;
                        return s <= cell.dateString && e > cell.dateString;
                      });

                      const isMultiDaySpan = hasMultiDayLeft || hasMultiDayRight || continuesFromPrevWeek || continuesToNextWeek;

                      // Check if neighbors are selected
                      const leftNeighborIsSelected = cIdx > 0 && week[cIdx - 1].dateString === selectedDateString;
                      const rightNeighborIsSelected = cIdx < 6 && week[cIdx + 1].dateString === selectedDateString;

                      // When a cell is selected, it maintains its own complete 4-sided border.
                      // Connected cells merge unless touching an actively selected cell.
                      const connectLeft = !isSelected && !leftNeighborIsSelected && (hasMultiDayLeft || continuesFromPrevWeek);
                      const connectRight = !isSelected && !rightNeighborIsSelected && (hasMultiDayRight || continuesToNextWeek);

                      // Rounded corner styling & border classes (maintaining border merge without blue backgrounds)
                      let roundedClasses = 'rounded-lg sm:rounded-xl';
                      let borderClasses = 'border border-slate-200/90';

                      if (isSelected) {
                        roundedClasses = 'rounded-lg sm:rounded-xl';
                        borderClasses = 'border-2 border-blue-600 ring-2 ring-blue-400/25';
                      } else if (connectLeft && connectRight) {
                        roundedClasses = 'rounded-none';
                        borderClasses = 'border-y border-x-0 border-blue-300';
                      } else if (connectLeft) {
                        roundedClasses = 'rounded-r-lg sm:rounded-r-xl rounded-l-none';
                        borderClasses = 'border-y border-r border-l-0 border-blue-300';
                      } else if (connectRight) {
                        roundedClasses = 'rounded-l-lg sm:rounded-l-xl rounded-r-none';
                        borderClasses = 'border-y border-l border-r-0 border-blue-300';
                      } else if (isMultiDaySpan) {
                        roundedClasses = 'rounded-lg sm:rounded-xl';
                        borderClasses = 'border border-blue-300';
                      }

                      return (
                        <div
                          key={cell.dateString}
                          onClick={() => {
                            setSelectedDateString(cell.dateString);
                            setHighlightedEventId(null);
                          }}
                          style={{
                            minHeight: `${Math.max(76, 26 + weekLayout.totalTracks * 22 + 4)}px`,
                          }}
                          className={`relative p-1 sm:p-1.5 transition-all cursor-pointer flex flex-col justify-between select-none ${roundedClasses} ${borderClasses} ${
                            isSelected
                              ? 'bg-blue-50/40 shadow-xs z-10'
                              : cell.isCurrentMonth
                              ? 'bg-white hover:border-slate-300 hover:bg-slate-50/70 z-0'
                              : 'bg-slate-100/40 opacity-40 z-0'
                          }`}
                        >
                          {/* Gap connector bridge with pure white background to seamlessly connect adjacent cells */}
                          {connectRight && (
                            <div
                              className={`absolute -right-[2px] sm:-right-[4px] top-[-1px] bottom-[-1px] w-[2px] sm:w-[4px] pointer-events-none z-0 border-y ${
                                cell.isCurrentMonth
                                  ? 'bg-white border-blue-300'
                                  : 'bg-slate-100/40 border-slate-200/50'
                              }`}
                            />
                          )}

                          <div className="relative z-1 flex items-center justify-between pointer-events-none">
                            <span
                              className={`text-[11px] sm:text-xs font-bold rounded-md w-4 h-4 sm:w-5 sm:h-5 flex items-center justify-center ${
                                isToday
                                  ? 'bg-blue-600 text-white shadow-2xs'
                                  : isSunday
                                  ? 'text-rose-500'
                                  : isSaturday
                                  ? 'text-blue-600'
                                  : 'text-slate-700'
                              }`}
                            >
                              {cell.dayNumber}
                            </span>

                            {dayCount > 0 && (
                              <span className="text-[9px] font-bold text-slate-400 font-mono hidden sm:inline">
                                {dayCount}
                              </span>
                            )}
                          </div>

                          {/* Reserved vertical room for event tracks overlay */}
                          <div className="flex-1 pointer-events-none" />
                        </div>
                      );
                    })}
                  </div>

                  {/* Layer 2: Event Bars Overlay (All events displayed dynamically) */}
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

                      const isHighlighted = highlightedEventId === ev.id;

                      return (
                        <div
                          key={`${ev.id}_${wIdx}_${p.track}`}
                          style={{
                            gridColumn: `${p.startCol + 1} / span ${p.span}`,
                            gridRow: `${p.track + 1}`,
                          }}
                          className={`pointer-events-none h-[18px] sm:h-[20px] flex items-center text-[10px] sm:text-[11px] font-medium shadow-2xs border select-none ${
                            style.bg
                          } ${style.color} ${style.border} ${leftRounded} ${rightRounded} ${
                            isHighlighted ? 'ring-2 ring-blue-500 font-bold z-20' : ''
                          }`}
                        >
                          {p.continuesFromPrevWeek && (
                            <span className="text-[9px] font-bold text-slate-400 mr-0.5 flex-shrink-0">‹</span>
                          )}

                          <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 mr-1 ${style.dot}`} />

                          <span className="truncate flex-1 font-semibold">
                            {ev.category && p.span >= 2 ? `[${ev.category}] ` : ''}
                            {ev.title}
                          </span>

                          {p.isMultiDay && p.span >= 2 && !p.continuesToNextWeek && (
                            <span className="text-[9px] opacity-75 font-mono ml-1 flex-shrink-0 hidden md:inline">
                              {calculateDayCount(ev.startDate, ev.endDate)}일간
                            </span>
                          )}

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

        {/* Right side: Detailed event list for selected date */}
        <div className="lg:col-span-5 flex flex-col bg-slate-50/50 rounded-2xl p-4 border border-slate-200">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200 mb-3">
            <div>
              <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <CalendarDays className="w-4 h-4 text-blue-600" />
                <span>선택 날짜: {selectedDateString}</span>
                {selectedDateString === todayString && (
                  <span className="px-1.5 py-0.2 bg-blue-100 text-blue-700 text-[10px] rounded-md font-bold">
                    오늘
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                해당 날짜 포함 일정: {selectedDateEvents.length}건
              </p>
            </div>

            <button
              type="button"
              onClick={() => handleOpenAddModal(selectedDateString)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-blue-50 active:scale-95 text-blue-600 border border-blue-200 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-2xs"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>일정 등록</span>
            </button>
          </div>

          {loading ? (
            <div className="py-8 text-center flex flex-col items-center justify-center">
              <Loader2 className="w-5 h-5 text-blue-600 animate-spin mb-1" />
              <span className="text-xs text-slate-400">일정 불러오는 중...</span>
            </div>
          ) : selectedDateEvents.length === 0 ? (
            <div className="flex-1 py-8 text-center flex flex-col items-center justify-center text-slate-400">
              <CalendarIcon className="w-8 h-8 stroke-1 mb-2 text-slate-300" />
              <p className="text-xs font-medium">이 날짜에 등록된 일정이 없습니다.</p>
              <button
                type="button"
                onClick={() => handleOpenAddModal(selectedDateString)}
                className="mt-3 text-xs text-blue-600 hover:underline font-semibold cursor-pointer"
              >
                + 새 일정 추가하기
              </button>
            </div>
          ) : (
            <div className="space-y-2.5 overflow-y-auto max-h-[380px] pr-1">
              {selectedDateEvents.map((ev) => {
                const style = getCategoryStyle(ev.category, ev.categoryColor);
                const isEditing = editingEventId === ev.id;
                const isMultiDay = ev.startDate !== ev.endDate;

                if (isEditing) {
                  return (
                    <div key={ev.id} className="p-3.5 bg-white border border-blue-300 rounded-xl shadow-xs space-y-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">일정 제목</label>
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          placeholder="일정 제목"
                          className="w-full px-2.5 py-1.5 text-xs font-bold border border-slate-200 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        />
                      </div>

                      {/* Date Range in Edit */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="block text-[11px] font-semibold text-slate-700 flex items-center gap-1">
                            <CalendarRange className="w-3.5 h-3.5 text-blue-600" />
                            <span>일정 기간 설정</span>
                          </label>
                          <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[10px]">
                            <button
                              type="button"
                              onClick={() => setEditDateMode('calendar')}
                              className={`px-1.5 py-0.5 rounded font-medium transition-all cursor-pointer ${
                                editDateMode === 'calendar'
                                  ? 'bg-white text-blue-700 shadow-2xs font-bold'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              📅 달력 선택
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditDateMode('input')}
                              className={`px-1.5 py-0.5 rounded font-medium transition-all cursor-pointer ${
                                editDateMode === 'input'
                                  ? 'bg-white text-blue-700 shadow-2xs font-bold'
                                  : 'text-slate-600 hover:text-slate-900'
                              }`}
                            >
                              ⌨️ 직접 입력
                            </button>
                          </div>
                        </div>

                        {editDateMode === 'calendar' ? (
                          <ScheduleAwareDatePicker
                            startDate={editStartDate}
                            endDate={editEndDate}
                            onChangeRange={(s, e) => {
                              setEditStartDate(s);
                              setEditEndDate(e);
                            }}
                            events={events}
                            excludeEventId={ev.id}
                          />
                        ) : (
                          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">시작 날짜</label>
                              <input
                                type="date"
                                value={editStartDate}
                                onChange={(e) => {
                                  setEditStartDate(e.target.value);
                                  if (!editEndDate || editEndDate < e.target.value) {
                                    setEditEndDate(e.target.value);
                                  }
                                }}
                                className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg font-mono bg-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">종료 날짜</label>
                              <input
                                type="date"
                                value={editEndDate}
                                min={editStartDate}
                                onChange={(e) => setEditEndDate(e.target.value)}
                                className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg font-mono bg-white"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Custom Category & Color in Edit */}
                      <div className="space-y-1.5">
                        <label className="block text-[11px] font-semibold text-slate-600">
                          직접 만든 카테고리
                        </label>
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            placeholder="카테고리 직접 입력 (예: 회의, 출장, 과제 등)"
                            className="flex-1 px-2.5 py-1 text-xs border border-slate-200 rounded-lg"
                          />
                          <div className="flex items-center gap-1">
                            {Object.entries(CATEGORY_COLORS).map(([colorKey, meta]) => (
                              <button
                                key={colorKey}
                                type="button"
                                onClick={() => setEditCategoryColor(colorKey)}
                                className={`w-4 h-4 rounded-full ${meta.dot} transition-transform ${
                                  editCategoryColor === colorKey ? 'ring-2 ring-offset-1 ring-slate-700 scale-110' : 'opacity-70 hover:opacity-100'
                                }`}
                                title={meta.label}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">시간 (선택)</label>
                          <input
                            type="time"
                            value={editTime}
                            onChange={(e) => setEditTime(e.target.value)}
                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">메모 / 설명</label>
                          <input
                            type="text"
                            value={editDesc}
                            onChange={(e) => setEditDesc(e.target.value)}
                            placeholder="메모"
                            className="w-full px-2.5 py-1 text-xs border border-slate-200 rounded-lg"
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-end gap-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingEventId(null)}
                          className="px-2.5 py-1 text-xs text-slate-500 hover:bg-slate-100 rounded-md cursor-pointer"
                        >
                          취소
                        </button>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => handleSaveEdit(ev.id)}
                          className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-md flex items-center gap-1 cursor-pointer"
                        >
                          {isUpdating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          <span>저장</span>
                        </button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div
                    key={ev.id}
                    className={`p-3.5 bg-white border rounded-xl shadow-xs transition-all text-left ${
                      highlightedEventId === ev.id
                        ? 'border-blue-400 ring-2 ring-blue-400/30 bg-blue-50/20'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {ev.category ? (
                            <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border flex items-center gap-1 ${style.bg} ${style.color} ${style.border}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                              {ev.category}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                              일반
                            </span>
                          )}

                          {isMultiDay && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              연속 {calculateDayCount(ev.startDate, ev.endDate)}일간
                            </span>
                          )}

                          {/* Date Range Badge */}
                          <span className="inline-flex items-center gap-1 text-[11px] text-slate-600 font-mono bg-slate-50 px-2 py-0.5 rounded-md border border-slate-100">
                            <CalendarRange className="w-3 h-3 text-slate-400" />
                            {formatDateRange(ev.startDate, ev.endDate)}
                          </span>

                          {ev.time && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-slate-500 font-mono">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {ev.time}
                            </span>
                          )}
                        </div>

                        <h4 className="font-bold text-slate-900 text-sm mt-1.5">
                          {ev.title}
                        </h4>

                        {ev.description && (
                          <p className="text-xs text-slate-600 mt-1 whitespace-pre-line bg-slate-50 p-2 rounded-lg border border-slate-100">
                            {ev.description}
                          </p>
                        )}

                        <div className="mt-2 text-[10px] text-slate-400 flex items-center gap-2">
                          <span>작성자: {ev.authorDisplayName} (@{ev.authorUsername})</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 sm:gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(ev)}
                          className="w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center text-slate-500 hover:text-blue-600 bg-slate-100/80 hover:bg-blue-50 active:scale-90 rounded-lg transition-all cursor-pointer"
                          title="일정 수정"
                        >
                          <FileText className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteEvent(ev.id, ev.title)}
                          className="w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center text-slate-500 hover:text-rose-600 bg-slate-100/80 hover:bg-rose-50 active:scale-90 rounded-lg transition-all cursor-pointer"
                          title="일정 삭제"
                        >
                          <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}

      {/* Add Event Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-xl sm:max-w-2xl shadow-xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CalendarRange className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">새 일정 등록</h3>
                  <p className="text-[11px] text-slate-500">달력에서 시작일과 종료일을 손쉽게 선택할 수 있습니다.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddEvent} className="p-4 sm:p-5 space-y-3.5 sm:space-y-4 overflow-y-auto flex-1">
              {modalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  일정 제목 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="예: 프로젝트 스프린트, 중간 점검, 출장"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  autoFocus
                />
              </div>

              {/* Date Range: Schedule-Aware Visual Date Picker */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-700 flex items-center gap-1.5">
                    <CalendarRange className="w-3.5 h-3.5 text-blue-600" />
                    <span>일정 기간 설정</span>
                    <span className="text-red-500">*</span>
                  </span>
                  <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg text-[11px]">
                    <button
                      type="button"
                      onClick={() => setAddDateMode('calendar')}
                      className={`px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
                        addDateMode === 'calendar'
                          ? 'bg-white text-blue-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      📅 달력 선택
                    </button>
                    <button
                      type="button"
                      onClick={() => setAddDateMode('input')}
                      className={`px-2 py-0.5 rounded font-medium transition-all cursor-pointer ${
                        addDateMode === 'input'
                          ? 'bg-white text-blue-700 shadow-2xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      ⌨️ 직접 입력
                    </button>
                  </div>
                </div>

                {addDateMode === 'calendar' ? (
                  <ScheduleAwareDatePicker
                    startDate={newStartDate}
                    endDate={newEndDate}
                    onChangeRange={(s, e) => {
                      setNewStartDate(s);
                      setNewEndDate(e);
                    }}
                    events={events}
                  />
                ) : (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          시작 날짜
                        </label>
                        <input
                          type="date"
                          required
                          value={newStartDate}
                          onChange={(e) => handleStartDateChange(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-slate-500 mb-1">
                          종료 날짜
                        </label>
                        <input
                          type="date"
                          required
                          value={newEndDate}
                          min={newStartDate}
                          onChange={(e) => setNewEndDate(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs sm:text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    </div>

                    {/* Quick range helpers */}
                    <div className="flex items-center gap-1.5 pt-1 text-[11px]">
                      <span className="text-slate-400">빠른 기간:</span>
                      <button
                        type="button"
                        onClick={() => setNewEndDate(newStartDate)}
                        className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                      >
                        당일
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date(newStartDate + 'T00:00:00');
                          d.setDate(d.getDate() + 1);
                          setNewEndDate(toDateString(d));
                        }}
                        className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                      >
                        2일
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date(newStartDate + 'T00:00:00');
                          d.setDate(d.getDate() + 2);
                          setNewEndDate(toDateString(d));
                        }}
                        className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                      >
                        3일
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const d = new Date(newStartDate + 'T00:00:00');
                          d.setDate(d.getDate() + 6);
                          setNewEndDate(toDateString(d));
                        }}
                        className="px-2 py-0.5 bg-white border border-slate-200 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                      >
                        1주일
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Time */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  시간 <span className="text-slate-400 font-normal">(선택)</span>
                </label>
                <input
                  type="time"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white font-mono"
                />
              </div>

              {/* Custom Category Creation */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-slate-700">
                    카테고리 직접 만들기 <span className="text-slate-400 font-normal">(직접 입력)</span>
                  </label>
                  {newCategory && (
                    <button
                      type="button"
                      onClick={() => setNewCategory('')}
                      className="text-[11px] text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      비우기
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="예: 회의, 프로젝트, 야근, 출장, 휴가, 스터디 등"
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white"
                  />
                  <div className="flex items-center gap-1 bg-slate-50 p-1.5 rounded-xl border border-slate-200">
                    {Object.entries(CATEGORY_COLORS).map(([colorKey, meta]) => (
                      <button
                        key={colorKey}
                        type="button"
                        onClick={() => setNewCategoryColor(colorKey)}
                        className={`w-4 h-4 rounded-full ${meta.dot} transition-transform cursor-pointer ${
                          newCategoryColor === colorKey
                            ? 'ring-2 ring-offset-1 ring-slate-700 scale-125'
                            : 'opacity-60 hover:opacity-100'
                        }`}
                        title={meta.label}
                      />
                    ))}
                  </div>
                </div>

                {/* Reuse existing categories in group */}
                {existingCategories.length > 0 && (
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    <span className="text-[11px] text-slate-400">그룹 내 카테고리:</span>
                    {existingCategories.map((cat) => {
                      const style = getCategoryStyle(cat.name, cat.color);
                      return (
                        <button
                          key={cat.name}
                          type="button"
                          onClick={() => {
                            setNewCategory(cat.name);
                            if (cat.color) setNewCategoryColor(cat.color);
                          }}
                          className={`px-2 py-0.5 text-[11px] font-semibold rounded-md border transition-all cursor-pointer ${
                            newCategory === cat.name
                              ? `${style.bg} ${style.color} ${style.border} ring-1 ring-blue-400 font-bold`
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          #{cat.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  설명 / 메모 <span className="text-slate-400 font-normal">(선택)</span>
                </label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="장소, 준비물, 관련 링크 등 상세 메모"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>등록 중...</span>
                    </>
                  ) : (
                    '일정 저장'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
