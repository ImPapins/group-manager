import { useState, useEffect, type FormEvent, useMemo } from 'react';
import { 
  CheckSquare, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Trash2, 
  Edit3, 
  Check, 
  AlertCircle, 
  Loader2, 
  Sparkles, 
  Award, 
  CalendarDays,
  Target,
  BarChart3,
  CalendarRange,
  X
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
import type { Group, GroupCalendarChecklist } from '../types';
import { 
  toDateString, 
  getWeekDates, 
  getPeriodInfo,
  getMonthCalendarMatrix,
  padZero
} from '../utils/dateUtils';
import { CATEGORY_COLORS } from './GroupCalendar';

interface CalendarChecklistViewProps {
  group: Group;
  selectedDateString?: string;
  onSelectDate?: (dateStr: string) => void;
}

export default function CalendarChecklistView({ 
  group, 
  selectedDateString 
}: CalendarChecklistViewProps) {
  const { username, displayName } = useAuth();

  const [checklists, setChecklists] = useState<GroupCalendarChecklist[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Active dates for week and month tracking
  const [activeWeekDate, setActiveWeekDate] = useState<Date>(new Date());
  const [activeMonthDate, setActiveMonthDate] = useState<Date>(new Date());

  // View Mode: 'both' (주간+월간), 'weekly' (주간 중심), 'monthly' (월간 중심)
  const [activeViewMode, setActiveViewMode] = useState<'both' | 'weekly' | 'monthly'>('both');

  // Expanded monthly mini-calendar for specific item
  const [expandedMonthItemId, setExpandedMonthItemId] = useState<string | null>(null);

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newTargetType, setNewTargetType] = useState<'both' | 'weekly' | 'monthly'>('both');
  const [newTargetPerWeek, setNewTargetPerWeek] = useState<number>(3);
  const [newTargetWeeksPerMonth, setNewTargetWeeksPerMonth] = useState<number>(4);
  const [newCategory, setNewCategory] = useState<string>('');
  const [newColor, setNewColor] = useState<string>('emerald');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createModalError, setCreateModalError] = useState<string | null>(null);

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<GroupCalendarChecklist | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editTargetType, setEditTargetType] = useState<'both' | 'weekly' | 'monthly'>('both');
  const [editTargetPerWeek, setEditTargetPerWeek] = useState<number>(3);
  const [editTargetWeeksPerMonth, setEditTargetWeeksPerMonth] = useState<number>(4);
  const [editCategory, setEditCategory] = useState<string>('');
  const [editColor, setEditColor] = useState<string>('emerald');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // Real-time listener for this group's checklists
  useEffect(() => {
    setLoading(true);
    setError(null);

    const colRef = collection(db, 'groups', group.id, 'checklists');
    const unsubscribe = onSnapshot(
      colRef,
      (snapshot) => {
        const list: GroupCalendarChecklist[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          const targetW = Number(data.targetPerWeek) || 3;
          const targetWeeksM = data.targetWeeksPerMonth
            ? Number(data.targetWeeksPerMonth)
            : (data.targetPerMonth ? Math.max(1, Math.min(5, Math.round(Number(data.targetPerMonth) / targetW))) : 4);
          list.push({
            id: d.id,
            groupId: group.id,
            title: data.title || '',
            targetType: (data.targetType as 'weekly' | 'monthly' | 'both') || 'both',
            targetPerWeek: targetW,
            targetWeeksPerMonth: targetWeeksM,
            targetPerMonth: Number(data.targetPerMonth) || (targetWeeksM * targetW),
            category: data.category || '',
            color: data.color || 'emerald',
            creatorUsername: data.creatorUsername || '',
            creatorDisplayName: data.creatorDisplayName || data.creatorUsername || '멤버',
            createdAt: data.createdAt || '',
            completedDates: Array.isArray(data.completedDates) ? data.completedDates : [],
          });
        });

        // Sort by creation date descending
        list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setChecklists(list);
        setLoading(false);
      },
      (err) => {
        console.error('Checklists listener error:', err);
        setError('달력 체크리스트를 불러오는 중 오류가 발생했습니다.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [group.id]);

  // Generate 7 days of the active week
  const weekDays = useMemo(() => getWeekDates(activeWeekDate), [activeWeekDate]);
  const weekDateStrings = useMemo(() => weekDays.map((d) => d.dateString), [weekDays]);
  const weekInfo = useMemo(() => getPeriodInfo('weekly', activeWeekDate), [activeWeekDate]);

  // Generate month info
  const activeYear = activeMonthDate.getFullYear();
  const activeMonth = activeMonthDate.getMonth(); // 0-indexed
  const activeMonthPrefix = `${activeYear}-${padZero(activeMonth + 1)}`;
  const monthInfo = useMemo(() => getPeriodInfo('monthly', activeMonthDate), [activeMonthDate]);

  const todayString = toDateString(new Date());

  // Week navigation
  const prevWeek = () => {
    const prev = new Date(activeWeekDate);
    prev.setDate(prev.getDate() - 7);
    setActiveWeekDate(prev);
  };

  const nextWeek = () => {
    const next = new Date(activeWeekDate);
    next.setDate(next.getDate() + 7);
    setActiveWeekDate(next);
  };

  const goCurrentWeek = () => {
    setActiveWeekDate(new Date());
  };

  const isCurrentWeek = useMemo(() => {
    const curInfo = getPeriodInfo('weekly', new Date());
    return weekInfo.key === curInfo.key;
  }, [weekInfo.key]);

  // Month navigation
  const prevMonth = () => {
    const prev = new Date(activeMonthDate);
    prev.setMonth(prev.getMonth() - 1);
    setActiveMonthDate(prev);
  };

  const nextMonth = () => {
    const next = new Date(activeMonthDate);
    next.setMonth(next.getMonth() + 1);
    setActiveMonthDate(next);
  };

  const goCurrentMonth = () => {
    setActiveMonthDate(new Date());
  };

  const isCurrentMonth = useMemo(() => {
    const now = new Date();
    return now.getFullYear() === activeYear && now.getMonth() === activeMonth;
  }, [activeYear, activeMonth]);

  // Overall Weekly Completion stats calculation
  const { totalWeekTarget, totalWeekCompleted, overallWeekPercent } = useMemo(() => {
    let targetSum = 0;
    let completedSum = 0;

    checklists.forEach((item) => {
      if (item.targetType === 'monthly') return;
      const itemCompletedInWeek = item.completedDates.filter((d) => weekDateStrings.includes(d)).length;
      targetSum += (item.targetPerWeek || 1);
      completedSum += itemCompletedInWeek;
    });

    const percent = targetSum > 0 ? Math.min(100, Math.round((completedSum / targetSum) * 100)) : 0;
    return {
      totalWeekTarget: targetSum,
      totalWeekCompleted: completedSum,
      overallWeekPercent: percent,
    };
  }, [checklists, weekDateStrings]);

  // Generate month days matrix for mini-calendar inspection
  const monthMatrix = useMemo(() => {
    return getMonthCalendarMatrix(activeYear, activeMonth);
  }, [activeYear, activeMonth]);

  // Weeks of the active month (chunk monthMatrix into 7-day rows, filter only weeks with active month days)
  const monthWeeks = useMemo(() => {
    const weeks: {
      weekIndex: number;
      weekNumber: number;
      dateStrings: string[];
      days: typeof monthMatrix;
      rangeLabel: string;
      isCurrentWeek: boolean;
    }[] = [];

    const totalWeeks = Math.ceil(monthMatrix.length / 7);
    let weekCounter = 1;

    for (let i = 0; i < totalWeeks; i++) {
      const weekDays = monthMatrix.slice(i * 7, (i + 1) * 7);
      const activeDays = weekDays.filter((d) => d.isCurrentMonth);
      if (activeDays.length === 0) continue;

      const firstActive = activeDays[0];
      const lastActive = activeDays[activeDays.length - 1];
      const rangeLabel = `${firstActive.date.getMonth() + 1}/${firstActive.dayNumber} ~ ${lastActive.date.getMonth() + 1}/${lastActive.dayNumber}`;

      const isCurrent = weekDays.some((d) => d.dateString === todayString);

      weeks.push({
        weekIndex: i,
        weekNumber: weekCounter++,
        dateStrings: weekDays.map((d) => d.dateString),
        days: weekDays,
        rangeLabel,
        isCurrentWeek: isCurrent,
      });
    }

    return weeks;
  }, [monthMatrix, todayString]);

  // Overall Monthly Completion stats calculation based on successful weeks
  const { totalMonthTargetWeeks, totalMonthSuccessfulWeeks, overallMonthPercent } = useMemo(() => {
    let targetWeeksSum = 0;
    let successfulWeeksSum = 0;

    checklists.forEach((item) => {
      if (item.targetType === 'weekly') return;
      const targetWeeks = item.targetWeeksPerMonth || (
        item.targetPerMonth
          ? Math.max(1, Math.min(monthWeeks.length, Math.round(item.targetPerMonth / (item.targetPerWeek || 3))))
          : Math.min(4, monthWeeks.length)
      );

      const successfulCount = monthWeeks.filter((w) => {
        const count = item.completedDates.filter((d) => w.dateStrings.includes(d)).length;
        return count >= (item.targetPerWeek || 3);
      }).length;

      targetWeeksSum += targetWeeks;
      successfulWeeksSum += successfulCount;
    });

    const percent = targetWeeksSum > 0 ? Math.min(100, Math.round((successfulWeeksSum / targetWeeksSum) * 100)) : 0;
    return {
      totalMonthTargetWeeks: targetWeeksSum,
      totalMonthSuccessfulWeeks: successfulWeeksSum,
      overallMonthPercent: percent,
    };
  }, [checklists, monthWeeks]);

  // Toggle date completion for an item
  const handleToggleDate = async (itemId: string, dateStr: string) => {
    const item = checklists.find((c) => c.id === itemId);
    if (!item) return;

    const isDone = item.completedDates.includes(dateStr);
    const updated = isDone
      ? item.completedDates.filter((d) => d !== dateStr)
      : [...item.completedDates, dateStr];

    try {
      const ref = doc(db, 'groups', group.id, 'checklists', itemId);
      await updateDoc(ref, {
        completedDates: updated,
      });
    } catch (err: any) {
      console.error('Toggle date error:', err);
      alert('체크리스트 갱신 중 오류가 발생했습니다.');
    }
  };

  // Create new checklist item
  const handleCreateChecklist = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) {
      setCreateModalError('체크리스트 이름을 입력해주세요.');
      return;
    }

    setIsCreating(true);
    setCreateModalError(null);

    const safeTargetW = Math.max(1, Math.min(7, Number(newTargetPerWeek) || 3));
    const safeTargetWeeks = Math.max(1, Math.min(5, Number(newTargetWeeksPerMonth) || 4));

    try {
      await addDoc(collection(db, 'groups', group.id, 'checklists'), {
        groupId: group.id,
        title: trimmedTitle,
        targetType: newTargetType,
        targetPerWeek: safeTargetW,
        targetWeeksPerMonth: safeTargetWeeks,
        targetPerMonth: safeTargetWeeks * safeTargetW,
        category: newCategory.trim(),
        color: newColor || 'emerald',
        creatorUsername: username,
        creatorDisplayName: displayName || username,
        createdAt: new Date().toISOString(),
        completedDates: [],
      });

      setNewTitle('');
      setNewTargetType('both');
      setNewTargetPerWeek(3);
      setNewTargetWeeksPerMonth(4);
      setNewCategory('');
      setNewColor('emerald');
      setIsCreateModalOpen(false);
    } catch (err: any) {
      console.error('Create checklist error:', err);
      setCreateModalError('체크리스트 등록 중 오류가 발생했습니다: ' + err.message);
    } finally {
      setIsCreating(false);
    }
  };

  // Save edit checklist
  const handleSaveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    const trimmed = editTitle.trim();
    if (!trimmed) {
      alert('체크리스트 제목을 입력해주세요.');
      return;
    }

    setIsUpdating(true);
    const safeTargetW = Math.max(1, Math.min(7, Number(editTargetPerWeek) || 3));
    const safeTargetWeeks = Math.max(1, Math.min(5, Number(editTargetWeeksPerMonth) || 4));

    try {
      const ref = doc(db, 'groups', group.id, 'checklists', editingItem.id);
      await updateDoc(ref, {
        title: trimmed,
        targetType: editTargetType,
        targetPerWeek: safeTargetW,
        targetWeeksPerMonth: safeTargetWeeks,
        targetPerMonth: safeTargetWeeks * safeTargetW,
        category: editCategory.trim(),
        color: editColor,
      });

      setEditingItem(null);
    } catch (err: any) {
      console.error('Update checklist error:', err);
      alert('체크리스트 수정 중 오류가 발생했습니다.');
    } finally {
      setIsUpdating(false);
    }
  };

  // Delete checklist item
  const handleDeleteChecklist = async (item: GroupCalendarChecklist) => {
    if (!window.confirm(`'${item.title}' 체크리스트를 삭제하시겠습니까?`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'groups', group.id, 'checklists', item.id));
    } catch (err: any) {
      console.error('Delete checklist error:', err);
      alert('체크리스트 삭제 중 오류가 발생했습니다.');
    }
  };

  return (
    <div className="space-y-4 sm:space-y-5 animate-in fade-in duration-150">
      {/* 1. View Mode & Period Overview Banner */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 border border-emerald-200/90 rounded-2xl p-4 sm:p-5 shadow-xs">
        {/* Top bar: Title + View Mode Selector + Action Button */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-emerald-200/60">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <CheckSquare className="w-4 h-4" />
              </span>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                달력 체크리스트 & 목표 관리
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-emerald-100 text-emerald-800">
                주간/월간 목표
              </span>
            </div>
            <p className="text-xs text-slate-600 mt-1">
              일정과 깔끔하게 분리되어, 이번 주 요일별 실천 및 이번 달 누적 목표 달성률(%)을 한눈에 추적합니다.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between lg:justify-end">
            {/* View Mode Filter Tabs */}
            <div className="flex items-center bg-white rounded-xl p-1 border border-emerald-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setActiveViewMode('both')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeViewMode === 'both'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                주간+월간
              </button>
              <button
                type="button"
                onClick={() => setActiveViewMode('weekly')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeViewMode === 'weekly'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                주간 실천
              </button>
              <button
                type="button"
                onClick={() => setActiveViewMode('monthly')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeViewMode === 'monthly'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                월간 목표
              </button>
            </div>

            <button
              type="button"
              id="open-create-checklist-btn"
              onClick={() => {
                setCreateModalError(null);
                setIsCreateModalOpen(true);
              }}
              className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold rounded-xl text-xs transition-all shadow-xs shadow-emerald-500/25 flex items-center gap-1.5 cursor-pointer whitespace-nowrap flex-shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>새 체크리스트 등록</span>
            </button>
          </div>
        </div>

        {/* Dual Period Navigation & Progress Cards (Weekly & Monthly Targets) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-3.5">
          {/* Week Overview Card */}
          {(activeViewMode === 'both' || activeViewMode === 'weekly') && (
            <div className="bg-white/90 backdrop-blur-xs rounded-xl p-3.5 border border-emerald-200/80 shadow-2xs space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <CalendarDays className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-slate-900">주간 실천율</span>
                  <span className="text-[10px] text-slate-500">({weekInfo.label})</span>
                </div>

                {/* Week Navigator */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={prevWeek}
                    className="p-1 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-md cursor-pointer"
                    title="이전 주"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-bold text-slate-700 px-1 font-mono">
                    {weekInfo.rangeText}
                  </span>
                  <button
                    type="button"
                    onClick={nextWeek}
                    className="p-1 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-md cursor-pointer"
                    title="다음 주"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  {!isCurrentWeek && (
                    <button
                      type="button"
                      onClick={goCurrentWeek}
                      className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-md hover:bg-emerald-100 cursor-pointer"
                    >
                      오늘
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-600">
                  이번 주 목표: <strong className="text-emerald-800">{totalWeekTarget}회</strong> 중{' '}
                  <strong className="text-emerald-700">{totalWeekCompleted}회</strong> 달성
                </span>
                <span className="text-lg font-black text-emerald-700 font-mono">
                  {overallWeekPercent}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-emerald-100/70 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-emerald-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${overallWeekPercent}%` }}
                />
              </div>
            </div>
          )}

          {/* Month Overview Card (월간 목표 달성율 & 이번 달 진행) */}
          {(activeViewMode === 'both' || activeViewMode === 'monthly') && (
            <div className={`bg-white/90 backdrop-blur-xs rounded-xl p-3.5 border border-teal-200/80 shadow-2xs space-y-2 ${
              activeViewMode === 'monthly' ? 'md:col-span-2' : ''
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Target className="w-4 h-4 text-teal-600" />
                  <span className="text-xs font-bold text-slate-900">월간 목표 달성율</span>
                  <span className="text-[10px] text-teal-700 font-semibold px-1.5 py-0.2 bg-teal-50 rounded-md border border-teal-100">
                    {monthInfo.fullLabel}
                  </span>
                </div>

                {/* Month Navigator */}
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={prevMonth}
                    className="p-1 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-md cursor-pointer"
                    title="이전 달"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                  </button>
                  <span className="text-[11px] font-bold text-slate-700 px-1 font-mono">
                    {activeYear}년 {activeMonth + 1}월
                  </span>
                  <button
                    type="button"
                    onClick={nextMonth}
                    className="p-1 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded-md cursor-pointer"
                    title="다음 달"
                  >
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  {!isCurrentMonth && (
                    <button
                      type="button"
                      onClick={goCurrentMonth}
                      className="text-[10px] font-semibold text-teal-700 bg-teal-50 px-1.5 py-0.5 rounded-md hover:bg-teal-100 cursor-pointer"
                    >
                      이번 달
                    </button>
                  )}
                </div>
              </div>

              <div className="flex items-baseline justify-between">
                <span className="text-xs text-slate-600">
                  {activeMonth + 1}월 총 성공 주 목표: <strong className="text-teal-800">{totalMonthTargetWeeks}주</strong> 중{' '}
                  <strong className="text-teal-700">{totalMonthSuccessfulWeeks}주</strong> 성공 달성
                </span>
                <span className="text-lg font-black text-teal-700 font-mono">
                  {overallMonthPercent}%
                </span>
              </div>

              {/* Progress Bar */}
              <div className="w-full bg-teal-100/70 rounded-full h-2 overflow-hidden">
                <div 
                  className="bg-teal-600 h-full rounded-full transition-all duration-500"
                  style={{ width: `${overallMonthPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 2. Checklist Items List */}
      {loading ? (
        <div className="p-10 text-center flex flex-col items-center justify-center bg-white rounded-2xl border border-slate-200">
          <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mb-2" />
          <p className="text-xs text-slate-500 font-medium">체크리스트 불러오는 중...</p>
        </div>
      ) : checklists.length === 0 ? (
        <div className="p-10 text-center bg-white rounded-2xl border border-slate-200 shadow-xs">
          <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-xl mx-auto flex items-center justify-center mb-3">
            <CheckSquare className="w-6 h-6" />
          </div>
          <h4 className="font-bold text-slate-800 text-base">등록된 달력 체크리스트가 없습니다</h4>
          <p className="text-xs text-slate-500 mt-1 mb-4">
            주간 및 월간 단위로 달성하고 싶은 목표를 등록하고 요일별/날짜별로 체크해보세요.
          </p>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs sm:text-sm transition-colors shadow-xs active:scale-95 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>첫 체크리스트 만들기</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4">
          {checklists.map((item) => {
            // Weekly calculations
            const thisWeekDates = item.completedDates.filter((d) => weekDateStrings.includes(d));
            const thisWeekCount = thisWeekDates.length;
            const targetWeekCount = item.targetPerWeek || 1;
            const itemWeekPercent = Math.min(100, Math.round((thisWeekCount / targetWeekCount) * 100));
            const isWeekTargetReached = thisWeekCount >= targetWeekCount;

            // Monthly calculations for active month (based on successful weeks)
            const targetWeeks = item.targetWeeksPerMonth || (
              item.targetPerMonth
                ? Math.max(1, Math.min(monthWeeks.length, Math.round(item.targetPerMonth / (targetWeekCount || 3))))
                : Math.min(4, monthWeeks.length)
            );

            const itemWeekResults = monthWeeks.map((w) => {
              const count = item.completedDates.filter((d) => w.dateStrings.includes(d)).length;
              const target = targetWeekCount;
              const isSuccess = count >= target;
              return {
                ...w,
                count,
                target,
                isSuccess,
              };
            });

            const successfulWeeksCount = itemWeekResults.filter((w) => w.isSuccess).length;
            const isMonthTargetReached = successfulWeeksCount >= targetWeeks;
            const itemMonthPercent = targetWeeks > 0 ? Math.min(100, Math.round((successfulWeeksCount / targetWeeks) * 100)) : 0;

            const style = CATEGORY_COLORS[item.color || 'emerald'] || CATEGORY_COLORS.emerald;
            const isExpandedMonth = expandedMonthItemId === item.id;

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border p-4 sm:p-5 transition-all shadow-xs ${
                  isMonthTargetReached || isWeekTargetReached 
                    ? 'border-emerald-300 ring-1 ring-emerald-100' 
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Header: Title, Category, Week/Month Target Badges & Actions */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-3 border-b border-slate-100">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                        {item.title}
                      </h4>

                      {item.category && (
                        <span className={`px-2 py-0.5 rounded-md text-[11px] font-bold border flex items-center gap-1 ${style.bg} ${style.color} ${style.border}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                          {item.category}
                        </span>
                      )}

                      {/* Weekly Tag */}
                      {item.targetType !== 'monthly' && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold font-mono ${
                            isWeekTargetReached
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          이번주 {targetWeekCount}회 중 {thisWeekCount}회 ({itemWeekPercent}%)
                        </span>
                      )}

                      {/* Monthly Tag (Weeks-based) */}
                      {item.targetType !== 'weekly' && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold font-mono ${
                            isMonthTargetReached
                              ? 'bg-teal-100 text-teal-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {activeMonth + 1}월 목표 {targetWeeks}주 중 {successfulWeeksCount}주 성공 ({itemMonthPercent}%)
                        </span>
                      )}

                      {/* Celebratory Badge */}
                      {isMonthTargetReached && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                          <Award className="w-3 h-3 text-amber-600" />
                          <span>월간 목표 달성! ({successfulWeeksCount}주 성공) 🎉</span>
                        </span>
                      )}
                      {!isMonthTargetReached && isWeekTargetReached && item.targetType !== 'monthly' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-900">
                          <Sparkles className="w-3 h-3 text-emerald-600" />
                          <span>주간 달성!</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-[11px] text-slate-500 font-medium">
                        목표:{' '}
                        {item.targetType === 'monthly'
                          ? `월 ${targetWeeks}주 성공 (주 ${targetWeekCount}회 실천)`
                          : item.targetType === 'weekly'
                          ? `주 ${targetWeekCount}회`
                          : `주 ${targetWeekCount}회 · 월 ${targetWeeks}주 성공`}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-[11px] text-slate-400">
                        작성자: {item.creatorDisplayName} (@{item.creatorUsername})
                      </span>
                    </div>
                  </div>

                  {/* Actions (Mini month calendar toggle / Edit / Delete) */}
                  <div className="flex items-center gap-1 self-end sm:self-auto flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => setExpandedMonthItemId(isExpandedMonth ? null : item.id)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg flex items-center gap-1 transition-all cursor-pointer ${
                        isExpandedMonth
                          ? 'bg-teal-600 text-white shadow-2xs'
                          : 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                      }`}
                      title="월간 달력 날짜별 달성 현황"
                    >
                      <CalendarIcon className="w-3.5 h-3.5" />
                      <span>{activeMonth + 1}월 달력</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem(item);
                        setEditTitle(item.title);
                        setEditTargetType(item.targetType || 'both');
                        setEditTargetPerWeek(item.targetPerWeek || 3);
                        setEditTargetWeeksPerMonth(item.targetWeeksPerMonth || targetWeeks);
                        setEditCategory(item.category || '');
                        setEditColor(item.color || 'emerald');
                      }}
                      className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 active:scale-95 rounded-lg transition-colors cursor-pointer"
                      title="체크리스트 수정"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteChecklist(item)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 active:scale-95 rounded-lg transition-colors cursor-pointer"
                      title="체크리스트 삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Monthly Progress Bar Line & Week Status Cards */}
                {item.targetType !== 'weekly' && (
                  <div className="mt-3 pt-2.5 border-t border-slate-100">
                    <div className="flex items-center justify-between text-[11px] font-semibold text-slate-600 mb-1.5">
                      <span className="flex items-center gap-1.5">
                        <Target className="w-3.5 h-3.5 text-teal-600" />
                        <span>{activeMonth + 1}월 주차별 성공 현황:</span>
                        <strong className="text-teal-700">{successfulWeeksCount}</strong> / {targetWeeks}주 성공
                        <span className="text-slate-400 font-normal hidden sm:inline">(주 {targetWeekCount}회 실천 시 주간 성공)</span>
                      </span>
                      <span className="font-mono font-bold text-teal-700">
                        {itemMonthPercent}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mb-2.5">
                      <div 
                        className="bg-teal-500 h-full rounded-full transition-all duration-300"
                        style={{ width: `${itemMonthPercent}%` }}
                      />
                    </div>

                    {/* Week-by-Week Success Cards for the Month */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-1.5 sm:gap-2">
                      {itemWeekResults.map((w) => (
                        <div
                          key={w.weekIndex}
                          className={`p-2 sm:p-2.5 rounded-xl border text-xs transition-all ${
                            w.isSuccess
                              ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950 shadow-2xs'
                              : w.isCurrentWeek
                              ? 'bg-blue-50/80 border-blue-200 text-blue-950'
                              : 'bg-slate-50 border-slate-200 text-slate-600'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1 mb-1">
                            <span className="text-[11px] font-bold flex items-center gap-1">
                              {w.isSuccess ? (
                                <Award className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                              ) : (
                                <CalendarIcon className="w-3 h-3 text-slate-400 flex-shrink-0" />
                              )}
                              <span>{w.weekNumber}주차</span>
                            </span>
                            <span
                              className={`text-[10px] font-bold px-1.5 py-0.2 rounded-md ${
                                w.isSuccess
                                  ? 'bg-emerald-200 text-emerald-900'
                                  : w.isCurrentWeek
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-slate-200/80 text-slate-600'
                              }`}
                            >
                              {w.isSuccess ? '성공! 🏆' : w.isCurrentWeek ? '진행 중' : `${w.count}/${w.target}회`}
                            </span>
                          </div>

                          <div className="text-[10px] text-slate-500 font-mono mb-1.5">
                            {w.rangeLabel}
                          </div>

                          <div className="w-full bg-slate-200/70 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                w.isSuccess ? 'bg-emerald-500' : w.isCurrentWeek ? 'bg-blue-500' : 'bg-slate-400'
                              }`}
                              style={{ width: `${Math.min(100, Math.round((w.count / w.target) * 100))}%` }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* 7-Day Day-of-Week Buttons for the active week */}
                <div className="pt-3">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
                    <span>이번 주 요일별 실천 체크:</span>
                    {item.targetType !== 'monthly' && (
                      <span className="font-mono text-emerald-700 font-bold">
                        주간 달성률: {itemWeekPercent}%
                      </span>
                    )}
                  </div>

                  <div className="grid grid-cols-7 gap-1 sm:gap-2">
                    {weekDays.map((day, dIdx) => {
                      const isDone = item.completedDates.includes(day.dateString);
                      const isSunday = dIdx === 6;
                      const isSaturday = dIdx === 5;

                      return (
                        <button
                          key={day.dateString}
                          type="button"
                          onClick={() => handleToggleDate(item.id, day.dateString)}
                          className={`group relative p-2 sm:p-2.5 rounded-xl border flex flex-col items-center justify-center transition-all cursor-pointer active:scale-95 select-none ${
                            isDone
                              ? 'bg-emerald-500 border-emerald-600 text-white shadow-xs'
                              : day.isToday
                              ? 'bg-blue-50/70 border-blue-300 text-slate-800 hover:bg-emerald-50 hover:border-emerald-300'
                              : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-emerald-50 hover:border-emerald-200'
                          }`}
                          title={`${day.dateString} (${day.dayName}) 체크 토글`}
                        >
                          {/* Day Name */}
                          <span
                            className={`text-[11px] font-bold ${
                              isDone
                                ? 'text-emerald-100'
                                : isSunday
                                ? 'text-rose-500'
                                : isSaturday
                                ? 'text-blue-500'
                                : 'text-slate-500'
                            }`}
                          >
                            {day.dayName}
                          </span>

                          {/* Day Number */}
                          <span
                            className={`text-xs sm:text-sm font-extrabold ${
                              isDone ? 'text-white' : 'text-slate-800'
                            }`}
                          >
                            {day.dayNumber}
                          </span>

                          {/* Check Icon / Status */}
                          <div
                            className={`mt-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center transition-all ${
                              isDone
                                ? 'bg-white text-emerald-600 shadow-2xs'
                                : 'border border-slate-300 group-hover:border-emerald-500 bg-white/60'
                            }`}
                          >
                            {isDone ? (
                              <Check className="w-3 h-3 sm:w-3.5 sm:h-3.5 stroke-[3]" />
                            ) : (
                              <span className="text-[9px] text-slate-400 group-hover:text-emerald-600">
                                +
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Expanded Month Mini-Calendar Heatmap / Date Toggle */}
                {isExpandedMonth && (
                  <div className="mt-3.5 pt-3 border-t border-slate-100 bg-slate-50/80 rounded-xl p-3 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                        <CalendarIcon className="w-3.5 h-3.5 text-teal-600" />
                        <span>{activeYear}년 {activeMonth + 1}월 전체 달력 실천 현황</span>
                      </div>
                      <span className="text-[11px] text-teal-700 font-semibold">
                        날짜를 클릭하면 완료 여부가 토글됩니다
                      </span>
                    </div>

                    {/* Month Matrix Grid */}
                    <div className="grid grid-cols-7 gap-1 text-center">
                      {['일', '월', '화', '수', '목', '금', '토'].map((h, i) => (
                        <div 
                          key={h} 
                          className={`text-[10px] font-bold py-1 ${
                            i === 0 ? 'text-rose-500' : i === 6 ? 'text-blue-500' : 'text-slate-400'
                          }`}
                        >
                          {h}
                        </div>
                      ))}

                      {monthMatrix.map((cell, idx) => {
                        const isCurrentMonthDay = cell.date.getMonth() === activeMonth;
                        const isDone = item.completedDates.includes(cell.dateString);
                        const isToday = cell.dateString === todayString;

                        return (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleToggleDate(item.id, cell.dateString)}
                            className={`py-1.5 px-1 rounded-lg text-xs font-semibold flex flex-col items-center justify-center transition-all cursor-pointer ${
                              !isCurrentMonthDay
                                ? 'opacity-30 text-slate-400'
                                : isDone
                                ? 'bg-teal-500 text-white font-bold shadow-2xs'
                                : isToday
                                ? 'bg-blue-50 text-blue-700 border border-blue-200'
                                : 'bg-white hover:bg-teal-50 text-slate-700 border border-slate-200/60'
                            }`}
                          >
                            <span>{cell.date.getDate()}</span>
                            {isDone && <Check className="w-2.5 h-2.5 mt-0.5 stroke-[3]" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <CheckSquare className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">새 달력 체크리스트 등록</h3>
                  <p className="text-[11px] text-slate-500">주간 및 월간 목표 횟수를 정하고 실천하세요.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateChecklist} className="p-4 sm:p-5 space-y-3.5 sm:space-y-4 overflow-y-auto flex-1">
              {createModalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{createModalError}</span>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  체크리스트 이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="예: 30분 유산소 운동, 알고리즘 풀기, 독서"
                  className="w-full px-3.5 py-2.5 text-base sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Target Type Selector */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  목표 관리 유형
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setNewTargetType('both')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      newTargetType === 'both' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    주간 + 월간 모두
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTargetType('weekly')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      newTargetType === 'weekly' ? 'bg-white text-emerald-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    주간 목표만
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewTargetType('monthly')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      newTargetType === 'monthly' ? 'bg-white text-teal-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    월간 목표만
                  </button>
                </div>
              </div>

              {/* Weekly Target Count */}
              {newTargetType !== 'monthly' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    주간 목표 횟수
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setNewTargetPerWeek(num)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          newTargetPerWeek === num
                            ? 'bg-emerald-600 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {num === 7 ? '매일' : `${num}회`}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    한 주 동안 실천할 횟수입니다. (예: 주 3회)
                  </p>
                </div>
              )}

              {/* Monthly Target Weeks */}
              {newTargetType !== 'weekly' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      월간 목표 (성공한 주 단위)
                    </label>
                    <span className="text-[11px] text-teal-700 font-bold">
                      월 {newTargetWeeksPerMonth}주 성공 목표
                    </span>
                  </div>

                  {/* Preset Buttons */}
                  <div className="grid grid-cols-5 gap-1.5 mb-1.5">
                    {[1, 2, 3, 4, 5].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setNewTargetWeeksPerMonth(w)}
                        className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          newTargetWeeksPerMonth === w
                            ? 'bg-teal-600 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {w}주 성공
                      </button>
                    ))}
                  </div>

                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    한 달 중 주간 목표(주 {newTargetPerWeek}회 실천)를 달성한 주의 개수를 월간 목표로 측정합니다. (예: 월 4주 성공)
                  </p>
                </div>
              )}

              {/* Category & Color */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  카테고리 & 색상 태그
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={newCategory}
                    onChange={(e) => setNewCategory(e.target.value)}
                    placeholder="카테고리명 (예: 운동, 독서, 업무)"
                    className="flex-1 px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                  />
                  <div className="flex items-center gap-1">
                    {Object.entries(CATEGORY_COLORS).map(([colorKey, meta]) => (
                      <button
                        key={colorKey}
                        type="button"
                        onClick={() => setNewColor(colorKey)}
                        className={`w-5 h-5 rounded-full ${meta.dot} transition-transform cursor-pointer ${
                          newColor === colorKey ? 'ring-2 ring-offset-2 ring-slate-700 scale-110' : 'opacity-70 hover:opacity-100'
                        }`}
                        title={meta.label}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isCreating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  <span>체크리스트 생성</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">체크리스트 수정</h3>
                  <p className="text-[11px] text-slate-500">주간 및 월간 목표 횟수와 이름을 수정할 수 있습니다.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer active:scale-95"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-4 sm:p-5 space-y-3.5 sm:space-y-4 overflow-y-auto flex-1">
              {/* Title */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  체크리스트 이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-base sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Target Type */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  목표 관리 유형
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setEditTargetType('both')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      editTargetType === 'both' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    주간 + 월간 모두
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTargetType('weekly')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      editTargetType === 'weekly' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    주간 목표만
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditTargetType('monthly')}
                    className={`py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                      editTargetType === 'monthly' ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                    }`}
                  >
                    월간 목표만
                  </button>
                </div>
              </div>

              {/* Weekly Target Count */}
              {editTargetType !== 'monthly' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    주간 목표 횟수
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[1, 2, 3, 4, 5, 6, 7].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setEditTargetPerWeek(num)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          editTargetPerWeek === num
                            ? 'bg-blue-600 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {num === 7 ? '매일' : `${num}회`}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly Target Weeks */}
              {editTargetType !== 'weekly' && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-700">
                      월간 목표 (성공한 주 단위)
                    </label>
                    <span className="text-[11px] text-teal-700 font-bold">
                      월 {editTargetWeeksPerMonth}주 성공 목표
                    </span>
                  </div>

                  <div className="grid grid-cols-5 gap-1.5 mb-1.5">
                    {[1, 2, 3, 4, 5].map((w) => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setEditTargetWeeksPerMonth(w)}
                        className={`py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          editTargetWeeksPerMonth === w
                            ? 'bg-teal-600 text-white shadow-xs'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {w}주 성공
                      </button>
                    ))}
                  </div>

                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    한 달 중 주간 목표(주 {editTargetPerWeek}회 실천)를 달성한 주의 개수를 월간 목표로 측정합니다. (예: 월 4주 성공)
                  </p>
                </div>
              )}

              {/* Category & Color */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  카테고리 & 색상 태그
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={editCategory}
                    onChange={(e) => setEditCategory(e.target.value)}
                    placeholder="카테고리명"
                    className="flex-1 px-3 py-2 text-base sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex items-center gap-1">
                    {Object.entries(CATEGORY_COLORS).map(([colorKey, meta]) => (
                      <button
                        key={colorKey}
                        type="button"
                        onClick={() => setEditColor(colorKey)}
                        className={`w-5 h-5 rounded-full ${meta.dot} transition-transform cursor-pointer ${
                          editColor === colorKey ? 'ring-2 ring-offset-2 ring-slate-700 scale-110' : 'opacity-70 hover:opacity-100'
                        }`}
                        title={meta.label}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isUpdating}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {isUpdating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  <span>수정 완료</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
