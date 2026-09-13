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
  RotateCcw,
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
  getPeriodInfo 
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

  // Active week reference date (defaults to current date)
  const [activeWeekDate, setActiveWeekDate] = useState<Date>(new Date());

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newTargetPerWeek, setNewTargetPerWeek] = useState<number>(3);
  const [newCategory, setNewCategory] = useState<string>('');
  const [newColor, setNewColor] = useState<string>('emerald');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createModalError, setCreateModalError] = useState<string | null>(null);

  // Edit Modal State
  const [editingItem, setEditingItem] = useState<GroupCalendarChecklist | null>(null);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editTargetPerWeek, setEditTargetPerWeek] = useState<number>(3);
  const [editCategory, setEditCategory] = useState<string>('');
  const [editColor, setEditColor] = useState<string>('emerald');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);

  // Filter option: 'all' or specific date string
  const [viewModeFilter, setViewModeFilter] = useState<'all' | 'today' | 'selected'>('all');

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
          list.push({
            id: d.id,
            groupId: group.id,
            title: data.title || '',
            targetPerWeek: Number(data.targetPerWeek) || 3,
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

  const weekInfo = useMemo(() => {
    return getPeriodInfo('weekly', activeWeekDate);
  }, [activeWeekDate]);

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

  // Overall Weekly Completion stats calculation
  const { totalWeekTarget, totalWeekCompleted, overallPercent } = useMemo(() => {
    let targetSum = 0;
    let completedSum = 0;

    checklists.forEach((item) => {
      const itemCompletedInWeek = item.completedDates.filter((d) => weekDateStrings.includes(d)).length;
      targetSum += (item.targetPerWeek || 1);
      completedSum += itemCompletedInWeek;
    });

    const percent = targetSum > 0 ? Math.min(100, Math.round((completedSum / targetSum) * 100)) : 0;
    return {
      totalWeekTarget: targetSum,
      totalWeekCompleted: completedSum,
      overallPercent: percent,
    };
  }, [checklists, weekDateStrings]);

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

    try {
      await addDoc(collection(db, 'groups', group.id, 'checklists'), {
        groupId: group.id,
        title: trimmedTitle,
        targetPerWeek: Math.max(1, Math.min(7, Number(newTargetPerWeek) || 3)),
        category: newCategory.trim(),
        color: newColor || 'emerald',
        creatorUsername: username,
        creatorDisplayName: displayName || username,
        createdAt: new Date().toISOString(),
        completedDates: [],
      });

      setNewTitle('');
      setNewTargetPerWeek(3);
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
    try {
      const ref = doc(db, 'groups', group.id, 'checklists', editingItem.id);
      await updateDoc(ref, {
        title: trimmed,
        targetPerWeek: Math.max(1, Math.min(7, Number(editTargetPerWeek) || 3)),
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
      {/* 1. Weekly Overview & Progress Banner ("이번주에 몇회 중 몇회 했는지 %도 표시") */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/10 to-blue-500/10 border border-emerald-200/90 rounded-2xl p-4 sm:p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-emerald-200/60">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="w-7 h-7 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                <CheckSquare className="w-4 h-4" />
              </span>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                달력 체크리스트
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] sm:text-xs font-bold bg-emerald-100 text-emerald-800">
                {weekInfo.label} ({weekInfo.rangeText})
              </span>
              {isCurrentWeek && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">
                  이번 주
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 mt-1">
              일정과 별도로 요일별 실천 여부를 체크하고, 이번 주 목표 달성률을 확인합니다.
            </p>
          </div>

          {/* Week Navigator & Add Button */}
          <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap justify-between sm:justify-end">
            <div className="flex items-center bg-white rounded-xl p-0.5 border border-emerald-200/80 shadow-2xs">
              <button
                type="button"
                onClick={prevWeek}
                className="p-1.5 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 active:scale-95 rounded-lg transition-all cursor-pointer"
                title="이전 주"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2.5 text-xs font-bold text-slate-800 whitespace-nowrap">
                {weekInfo.label}
              </span>
              <button
                type="button"
                onClick={nextWeek}
                className="p-1.5 hover:bg-emerald-50 text-slate-600 hover:text-emerald-700 active:scale-95 rounded-lg transition-all cursor-pointer"
                title="다음 주"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {!isCurrentWeek && (
              <button
                type="button"
                onClick={goCurrentWeek}
                className="px-2.5 py-1.5 text-xs font-semibold text-emerald-700 bg-white hover:bg-emerald-50 border border-emerald-200 rounded-xl transition-colors cursor-pointer whitespace-nowrap active:scale-95"
              >
                이번 주로
              </button>
            )}

            <button
              type="button"
              id="open-create-checklist-btn"
              onClick={() => {
                setCreateModalError(null);
                setIsCreateModalOpen(true);
              }}
              className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-semibold rounded-xl text-xs transition-all shadow-xs shadow-emerald-500/25 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              <span>체크리스트 추가</span>
            </button>
          </div>
        </div>

        {/* Weekly Completion Progress Card (이번 주 몇회 중 몇회 했는지 % 표시) */}
        <div className="pt-3 sm:pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold text-emerald-800 uppercase tracking-wider">
              이번 주 전체 달성률
            </span>
            <div className="text-sm sm:text-base font-bold text-slate-900 mt-0.5">
              {checklists.length === 0 ? (
                '등록된 체크리스트가 없습니다.'
              ) : (
                <>
                  총 <span className="text-emerald-700 font-black">{totalWeekTarget}회</span> 중{' '}
                  <span className="text-emerald-600 font-black">{totalWeekCompleted}회</span> 달성 ({overallPercent}%)
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="bg-white/95 px-3 py-1.5 rounded-xl border border-emerald-200/80 shadow-2xs flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-black text-emerald-600 font-mono">
                {totalWeekCompleted} / {totalWeekTarget}회
              </span>
              <span className="text-xs sm:text-sm font-bold text-emerald-700 font-mono">
                ({overallPercent}%)
              </span>
            </div>
          </div>
        </div>

        {/* Big Progress Bar */}
        {totalWeekTarget > 0 && (
          <div className="mt-3 w-full bg-emerald-100/80 rounded-full h-2.5 overflow-hidden">
            <div
              className="bg-gradient-to-r from-emerald-500 to-teal-500 h-full rounded-full transition-all duration-500"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
        )}
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
            매주 실천하고 싶은 목표나 할 일 목록을 만들고 요일별로 체크해보세요.
          </p>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-1.5 py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs sm:text-sm transition-colors shadow-xs active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>첫 체크리스트 만들기</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {checklists.map((item) => {
            const thisWeekDates = item.completedDates.filter((d) => weekDateStrings.includes(d));
            const thisWeekCount = thisWeekDates.length;
            const targetCount = item.targetPerWeek || 1;
            const itemPercent = Math.min(100, Math.round((thisWeekCount / targetCount) * 100));
            const isTargetReached = thisWeekCount >= targetCount;
            const style = CATEGORY_COLORS[item.color || 'emerald'] || CATEGORY_COLORS.emerald;

            return (
              <div
                key={item.id}
                className={`bg-white rounded-2xl border p-4 sm:p-5 transition-all shadow-xs ${
                  isTargetReached ? 'border-emerald-300 ring-1 ring-emerald-200' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                {/* Header of item: Title, Category, Individual Week Progress */}
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

                      {/* Item Weekly Progress Tag ("이번주에 몇회 중 몇회 했는지 %도 표시") */}
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-bold font-mono ${
                          isTargetReached
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        이번주 {targetCount}회 중 {thisWeekCount}회 ({itemPercent}%)
                      </span>

                      {isTargetReached && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900">
                          <Award className="w-3 h-3 text-amber-600" />
                          <span>목표 달성!</span>
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[11px] text-slate-500">
                        목표: 주 {targetCount}회
                      </span>
                      <span className="text-slate-300">·</span>
                      <span className="text-[11px] text-slate-400">
                        작성자: {item.creatorDisplayName} (@{item.creatorUsername})
                      </span>
                    </div>
                  </div>

                  {/* Actions (Edit / Delete) */}
                  <div className="flex items-center gap-1 self-end sm:self-auto flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem(item);
                        setEditTitle(item.title);
                        setEditTargetPerWeek(item.targetPerWeek);
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

                {/* 7-Day Day-of-Week Buttons for the active week */}
                <div className="pt-3">
                  <div className="flex items-center justify-between text-[11px] font-semibold text-slate-500 mb-1.5">
                    <span>이번 주 요일별 체크 (클릭하여 완료 토글):</span>
                    <span className="font-mono text-emerald-700 font-bold">
                      달성률: {itemPercent}%
                    </span>
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
                  <p className="text-[11px] text-slate-500">주간 목표 횟수를 정하고 요일별로 실천하세요.</p>
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
                  placeholder="예: 주간 스터디 참여, 30분 운동, 블로그 포스팅"
                  className="w-full px-3.5 py-2.5 text-base sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              {/* Weekly Target Count */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  주간 목표 횟수 <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
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
                      {num === 7 ? '매일' : `주 ${num}회`}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  일주일 동안 몇 번 실천할지 목표를 지정합니다. (예: 주 3회 완료 시 100% 달성)
                </p>
              </div>

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
                    placeholder="카테고리명 (예: 운동, 공부, 업무)"
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
                  <p className="text-[11px] text-slate-500">목표 횟수와 이름을 수정할 수 있습니다.</p>
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

              {/* Weekly Target Count */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  주간 목표 횟수 <span className="text-red-500">*</span>
                </label>
                <div className="flex items-center gap-2">
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
                      {num === 7 ? '매일' : `주 ${num}회`}
                    </button>
                  ))}
                </div>
              </div>

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
