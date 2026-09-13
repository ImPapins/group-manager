import { useState, useEffect, type FormEvent } from 'react';
import { 
  LayoutDashboard, 
  Plus, 
  Trash2, 
  RotateCcw, 
  CheckCircle2, 
  Circle, 
  History, 
  Calendar, 
  AlertCircle, 
  Loader2, 
  X, 
  Check, 
  TrendingUp, 
  Sparkles,
  ChevronDown,
  Edit2
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  setDoc, 
  doc, 
  getDoc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import type { 
  Group, 
  GroupDashboard, 
  DashboardCycle, 
  DashboardItem, 
  DashboardPeriodRecord 
} from '../types';
import { getPeriodInfo, getCyclePeriodOptions } from '../utils/dateUtils';

interface GroupDashboardViewProps {
  group: Group;
}

export default function GroupDashboardView({ group }: GroupDashboardViewProps) {
  const { username, displayName } = useAuth();

  const [dashboards, setDashboards] = useState<GroupDashboard[]>([]);
  const [selectedDashboardId, setSelectedDashboardId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Selected period key for the currently viewed dashboard
  // Defaults to current period key
  const [selectedPeriodKey, setSelectedPeriodKey] = useState<string | null>(null);
  const [periodRecord, setPeriodRecord] = useState<DashboardPeriodRecord | null>(null);
  const [recordLoading, setRecordLoading] = useState<boolean>(false);

  // Create Dashboard Modal
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [newCycle, setNewCycle] = useState<DashboardCycle>('weekly');
  const [initialTaskInputs, setInitialTaskInputs] = useState<string>('주간 보고서 작성\n팀 스크럼 미팅\n코드 리뷰 완료');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Add Item to Current Period
  const [newItemTitle, setNewItemTitle] = useState<string>('');
  const [newItemTarget, setNewItemTarget] = useState<string>('');
  const [newItemUnit, setNewItemUnit] = useState<string>('');
  const [isAddingItem, setIsAddingItem] = useState<boolean>(false);
  const [isAddFormOpen, setIsAddFormOpen] = useState<boolean>(false);

  // Cycle Note
  const [cycleNote, setCycleNote] = useState<string>('');
  const [isSavingNote, setIsSavingNote] = useState<boolean>(false);

  // Real-time listener for Dashboards of this group
  useEffect(() => {
    setLoading(true);
    setError(null);

    const dashboardsCol = collection(db, 'groups', group.id, 'dashboards');
    const unsubscribe = onSnapshot(
      dashboardsCol,
      (snapshot) => {
        const list: GroupDashboard[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          list.push({
            id: d.id,
            groupId: group.id,
            title: data.title || '대시보드',
            description: data.description || '',
            cycle: (data.cycle as DashboardCycle) || 'weekly',
            creatorUsername: data.creatorUsername || '',
            creatorDisplayName: data.creatorDisplayName || data.creatorUsername || '멤버',
            createdAt: data.createdAt || '',
            templateItems: data.templateItems || [],
          });
        });

        // Sort descending
        list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
        setDashboards(list);
        setLoading(false);

        // Auto-select first dashboard if none selected
        setSelectedDashboardId((prev) => {
          if (prev && list.some((item) => item.id === prev)) {
            return prev;
          }
          return list.length > 0 ? list[0].id : null;
        });
      },
      (err) => {
        console.error('Dashboards snapshot error:', err);
        setError('대시보드를 불러오는 중 오류가 발생했습니다.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [group.id]);

  const activeDashboard = dashboards.find((d) => d.id === selectedDashboardId) || null;

  // Real-time listener for the active Dashboard's selected period record
  useEffect(() => {
    if (!activeDashboard) {
      setPeriodRecord(null);
      return;
    }

    // Determine target period key: if selectedPeriodKey belongs to another cycle or null, use current period
    const currentPeriodInfo = getPeriodInfo(activeDashboard.cycle, new Date());
    const targetKey = selectedPeriodKey || currentPeriodInfo.key;

    if (selectedPeriodKey !== targetKey) {
      setSelectedPeriodKey(targetKey);
    }

    setRecordLoading(true);
    const recordDocRef = doc(db, 'groups', group.id, 'dashboards', activeDashboard.id, 'periods', targetKey);

    const unsubscribe = onSnapshot(
      recordDocRef,
      async (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          const rec: DashboardPeriodRecord = {
            id: snap.id,
            dashboardId: activeDashboard.id,
            groupId: group.id,
            periodKey: targetKey,
            periodLabel: data.periodLabel || targetKey,
            items: data.items || [],
            note: data.note || '',
            updatedAt: data.updatedAt || '',
            updatedBy: data.updatedBy || '',
          };
          setPeriodRecord(rec);
          setCycleNote(data.note || '');
          setRecordLoading(false);
        } else {
          // If the record doesn't exist yet for this cycle, auto-initialize from templateItems
          // (This triggers the automatic reset for current period!)
          const periodInfo = getPeriodInfo(activeDashboard.cycle, new Date());
          const newItems: DashboardItem[] = (activeDashboard.templateItems || []).map((t) => ({
            id: t.id || 'item_' + Math.random().toString(36).substring(2, 9),
            title: t.title,
            isCompleted: false,
            targetCount: t.targetCount || 1,
            currentCount: 0,
            unit: t.unit || '',
          }));

          const initialRec: DashboardPeriodRecord = {
            id: targetKey,
            dashboardId: activeDashboard.id,
            groupId: group.id,
            periodKey: targetKey,
            periodLabel: targetKey === currentPeriodInfo.key ? `${currentPeriodInfo.label} (${currentPeriodInfo.rangeText})` : targetKey,
            items: newItems,
            note: '',
            updatedAt: new Date().toISOString(),
            updatedBy: username,
          };

          try {
            await setDoc(recordDocRef, initialRec);
            setPeriodRecord(initialRec);
            setCycleNote('');
          } catch (createErr) {
            console.error('Failed to init period record:', createErr);
          } finally {
            setRecordLoading(false);
          }
        }
      },
      (err) => {
        console.error('Period record snapshot error:', err);
        setRecordLoading(false);
      }
    );

    return () => unsubscribe();
  }, [group.id, activeDashboard?.id, activeDashboard?.cycle, selectedPeriodKey, username]);

  // Handle Create New Dashboard
  const handleCreateDashboard = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedTitle = newTitle.trim();
    if (!trimmedTitle) {
      setCreateError('대시보드 이름을 입력해주세요.');
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      // Parse initial template tasks
      const lines = initialTaskInputs
        .split('\n')
        .map((s) => s.trim())
        .filter((s) => s.length > 0);

      const templateItems = lines.map((line, idx) => ({
        id: `tpl_${Date.now()}_${idx}`,
        title: line,
        targetCount: 1,
        unit: '건',
      }));

      const now = new Date().toISOString();
      const currentPeriodInfo = getPeriodInfo(newCycle, new Date());

      const dashRef = await addDoc(collection(db, 'groups', group.id, 'dashboards'), {
        groupId: group.id,
        title: trimmedTitle,
        description: newDesc.trim(),
        cycle: newCycle,
        creatorUsername: username,
        creatorDisplayName: displayName || username,
        createdAt: now,
        templateItems: templateItems,
      });

      // Initialize the first period record immediately
      const initialItems: DashboardItem[] = templateItems.map((t) => ({
        id: t.id,
        title: t.title,
        isCompleted: false,
        targetCount: t.targetCount,
        currentCount: 0,
        unit: t.unit,
      }));

      await setDoc(doc(db, 'groups', group.id, 'dashboards', dashRef.id, 'periods', currentPeriodInfo.key), {
        dashboardId: dashRef.id,
        groupId: group.id,
        periodKey: currentPeriodInfo.key,
        periodLabel: `${currentPeriodInfo.label} (${currentPeriodInfo.rangeText})`,
        items: initialItems,
        note: '',
        updatedAt: now,
        updatedBy: username,
      });

      // Reset and close
      setNewTitle('');
      setNewDesc('');
      setInitialTaskInputs('주간 보고서 작성\n팀 스크럼 미팅\n코드 리뷰 완료');
      setIsCreateModalOpen(false);
      setSelectedDashboardId(dashRef.id);
      setSelectedPeriodKey(currentPeriodInfo.key);
    } catch (err: any) {
      console.error('Create dashboard error:', err);
      setCreateError('대시보드 생성 중 오류: ' + (err.message || '다시 시도해주세요.'));
    } finally {
      setIsCreating(false);
    }
  };

  // Delete Dashboard - Any member can manage
  const handleDeleteDashboard = async (dash: GroupDashboard) => {
    if (!window.confirm(`'${dash.title}' 대시보드를 삭제하시겠습니까? 관련 모든 주기 기록이 함께 삭제됩니다.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'groups', group.id, 'dashboards', dash.id));
      setSelectedDashboardId(null);
      setSelectedPeriodKey(null);
    } catch (err: any) {
      console.error('Delete dashboard error:', err);
      alert('대시보드 삭제 실패: ' + (err.message || '다시 시도해주세요.'));
    }
  };

  // Toggle item completion
  const handleToggleItem = async (itemId: string) => {
    if (!activeDashboard || !periodRecord || !selectedPeriodKey) return;

    const updatedItems = periodRecord.items.map((item) => {
      if (item.id === itemId) {
        const isTargetBased = (item.targetCount || 1) > 1;
        const target = item.targetCount || 1;

        let nextCompleted = !item.isCompleted;
        let nextCount = 0;

        if (isTargetBased) {
          if (item.isCompleted) {
            nextCompleted = false;
            nextCount = 0;
          } else {
            nextCompleted = true;
            nextCount = target;
          }
        } else {
          nextCount = nextCompleted ? 1 : 0;
        }

        return {
          ...item,
          isCompleted: nextCompleted,
          currentCount: nextCount,
          lastUpdatedBy: username,
          lastUpdatedAt: new Date().toISOString(),
        };
      }
      return item;
    });

    try {
      const recordDocRef = doc(db, 'groups', group.id, 'dashboards', activeDashboard.id, 'periods', selectedPeriodKey);
      await updateDoc(recordDocRef, {
        items: updatedItems,
        updatedAt: new Date().toISOString(),
        updatedBy: username,
      });
    } catch (err: any) {
      console.error('Toggle item error:', err);
    }
  };

  // Increase / Decrease numerical count
  const handleUpdateCount = async (itemId: string, delta: number) => {
    if (!activeDashboard || !periodRecord || !selectedPeriodKey) return;

    const updatedItems = periodRecord.items.map((item) => {
      if (item.id === itemId) {
        const current = item.currentCount || 0;
        const target = item.targetCount || 1;
        const nextCount = Math.max(0, current + delta);
        const nextCompleted = nextCount >= target;
        return {
          ...item,
          currentCount: nextCount,
          isCompleted: nextCompleted,
          lastUpdatedBy: username,
          lastUpdatedAt: new Date().toISOString(),
        };
      }
      return item;
    });

    try {
      const recordDocRef = doc(db, 'groups', group.id, 'dashboards', activeDashboard.id, 'periods', selectedPeriodKey);
      await updateDoc(recordDocRef, {
        items: updatedItems,
        updatedAt: new Date().toISOString(),
        updatedBy: username,
      });
    } catch (err: any) {
      console.error('Update count error:', err);
    }
  };

  // Add new item to this period (and optionally update template)
  const handleAddItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeDashboard || !periodRecord || !selectedPeriodKey) return;
    const trimmedTitle = newItemTitle.trim();
    if (!trimmedTitle) return;

    setIsAddingItem(true);
    const targetNum = parseInt(newItemTarget, 10);
    const newItem: DashboardItem = {
      id: 'item_' + Date.now(),
      title: trimmedTitle,
      isCompleted: false,
      targetCount: isNaN(targetNum) || targetNum <= 0 ? 1 : targetNum,
      currentCount: 0,
      unit: newItemUnit.trim() || '건',
      lastUpdatedBy: username,
      lastUpdatedAt: new Date().toISOString(),
    };

    const updatedItems = [...periodRecord.items, newItem];

    try {
      const recordDocRef = doc(db, 'groups', group.id, 'dashboards', activeDashboard.id, 'periods', selectedPeriodKey);
      await updateDoc(recordDocRef, {
        items: updatedItems,
        updatedAt: new Date().toISOString(),
        updatedBy: username,
      });

      // Also add to templateItems so future resets will inherit this item
      const updatedTemplate = [
        ...(activeDashboard.templateItems || []),
        { id: newItem.id, title: newItem.title, targetCount: newItem.targetCount, unit: newItem.unit },
      ];
      await updateDoc(doc(db, 'groups', group.id, 'dashboards', activeDashboard.id), {
        templateItems: updatedTemplate,
      });

      setNewItemTitle('');
      setNewItemTarget('');
      setNewItemUnit('');
    } catch (err: any) {
      console.error('Add item error:', err);
      alert('항목 추가 실패: ' + (err.message || '다시 시도해주세요.'));
    } finally {
      setIsAddingItem(false);
    }
  };

  // Remove item from period
  const handleRemoveItem = async (itemId: string) => {
    if (!activeDashboard || !periodRecord || !selectedPeriodKey) return;

    const updatedItems = periodRecord.items.filter((it) => it.id !== itemId);
    try {
      const recordDocRef = doc(db, 'groups', group.id, 'dashboards', activeDashboard.id, 'periods', selectedPeriodKey);
      await updateDoc(recordDocRef, {
        items: updatedItems,
        updatedAt: new Date().toISOString(),
        updatedBy: username,
      });
    } catch (err: any) {
      console.error('Remove item error:', err);
    }
  };

  // Manual Reset / Re-initialize this period items
  const handleResetPeriod = async () => {
    if (!activeDashboard || !selectedPeriodKey) return;
    if (!window.confirm('현재 주기의 항목들을 0% 초기 상태로 리셋하시겠습니까?')) return;

    try {
      const templateItems = activeDashboard.templateItems || [];
      const resetItems: DashboardItem[] = templateItems.map((t) => ({
        id: t.id || 'item_' + Math.random().toString(36).substring(2, 9),
        title: t.title,
        isCompleted: false,
        targetCount: t.targetCount || 1,
        currentCount: 0,
        unit: t.unit || '건',
      }));

      const recordDocRef = doc(db, 'groups', group.id, 'dashboards', activeDashboard.id, 'periods', selectedPeriodKey);
      await updateDoc(recordDocRef, {
        items: resetItems,
        updatedAt: new Date().toISOString(),
        updatedBy: username,
      });
    } catch (err: any) {
      console.error('Reset period error:', err);
    }
  };

  // Save Cycle Summary Note
  const handleSaveNote = async () => {
    if (!activeDashboard || !selectedPeriodKey) return;
    setIsSavingNote(true);
    try {
      const recordDocRef = doc(db, 'groups', group.id, 'dashboards', activeDashboard.id, 'periods', selectedPeriodKey);
      await updateDoc(recordDocRef, {
        note: cycleNote.trim(),
        updatedAt: new Date().toISOString(),
        updatedBy: username,
      });
    } catch (err: any) {
      console.error('Save note error:', err);
    } finally {
      setIsSavingNote(false);
    }
  };

  // Calculate Progress Stats: support fractional completion (e.g. 1/3) instead of all-or-nothing
  const items = periodRecord?.items || [];
  const totalItemsCount = items.length;

  let totalTargetUnits = 0;
  let totalAchievedUnits = 0;
  let completedItemsCount = 0;

  items.forEach((it) => {
    const target = it.targetCount && it.targetCount > 0 ? it.targetCount : 1;
    const current = Math.min(target, Math.max(0, it.currentCount !== undefined ? it.currentCount : it.isCompleted ? target : 0));
    totalTargetUnits += target;
    totalAchievedUnits += current;
    if (current >= target || it.isCompleted) {
      completedItemsCount++;
    }
  });

  const hasMultiTargetItems = items.some((it) => (it.targetCount || 1) > 1);

  // Overall percentage based on actual units/progress achieved
  const progressPercent = totalTargetUnits > 0 
    ? Math.round((totalAchievedUnits / totalTargetUnits) * 100) 
    : 0;

  // Primary fraction display string (e.g. "1/3")
  const progressFraction = hasMultiTargetItems
    ? `${totalAchievedUnits}/${totalTargetUnits}`
    : `${completedItemsCount}/${totalItemsCount}`;

  // Cycle options for past records
  const currentPeriodInfo = activeDashboard ? getPeriodInfo(activeDashboard.cycle, new Date()) : null;
  const periodOptions = activeDashboard ? getCyclePeriodOptions(activeDashboard.cycle, 10) : [];
  const isViewingCurrentPeriod = selectedPeriodKey === currentPeriodInfo?.key;

  const currentPeriodOption = periodOptions.find((o) => o.key === selectedPeriodKey);
  const displayPeriodLabel = currentPeriodOption?.label || (periodRecord?.periodLabel || selectedPeriodKey || '');
  const displayPeriodRange = currentPeriodOption?.rangeText || '';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-5">
      {/* Dashboard Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-bold text-slate-900 text-base sm:text-xl">
                그룹 공용 대시보드
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100">
                주/달 주기적 자동 초기화
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              모든 멤버가 목표와 체크리스트를 관리하며, 지난 주기 과거 기록도 함께 조회할 수 있습니다.
            </p>
          </div>
        </div>

        <button
          type="button"
          id="open-create-dashboard-btn"
          onClick={() => {
            setCreateError(null);
            setIsCreateModalOpen(true);
          }}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold transition-colors shadow-xs shadow-emerald-500/20 cursor-pointer w-full sm:w-auto flex-shrink-0"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>새 대시보드 만들기</span>
        </button>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center flex flex-col items-center justify-center">
          <Loader2 className="w-6 h-6 text-emerald-600 animate-spin mb-2" />
          <p className="text-xs text-slate-500">대시보드 불러오는 중...</p>
        </div>
      ) : dashboards.length === 0 ? (
        <div className="p-8 text-center bg-slate-50/70 border border-dashed border-slate-200 rounded-2xl flex flex-col items-center justify-center">
          <LayoutDashboard className="w-10 h-10 text-slate-300 mb-2" />
          <h4 className="font-bold text-slate-800 text-sm">아직 등록된 대시보드가 없습니다</h4>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            주간 또는 월간 단위로 자동 초기화되는 그룹 공용 목표/체크리스트 대시보드를 만들어보세요.
          </p>
          <button
            type="button"
            onClick={() => setIsCreateModalOpen(true)}
            className="mt-4 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs cursor-pointer inline-flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>첫 대시보드 만들기</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Dashboard Tabs / Selector if multiple (Horizontal swipeable on mobile) */}
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full scrollbar-none">
              <span className="text-xs font-bold text-slate-500 mr-1 flex-shrink-0">대시보드:</span>
              {dashboards.map((dash) => {
                const isActive = dash.id === activeDashboard?.id;
                return (
                  <button
                    key={dash.id}
                    type="button"
                    onClick={() => {
                      setSelectedDashboardId(dash.id);
                      setSelectedPeriodKey(null);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border whitespace-nowrap flex-shrink-0 ${
                      isActive
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 shadow-xs'
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>{dash.title}</span>
                    <span className="px-1.5 py-0.2 rounded-md text-[10px] bg-white border border-slate-200 text-slate-500">
                      {dash.cycle === 'weekly' ? '주간' : '월간'}
                    </span>
                  </button>
                );
              })}
            </div>

            {activeDashboard && (
              <button
                type="button"
                onClick={() => handleDeleteDashboard(activeDashboard)}
                className="text-xs text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition-colors cursor-pointer flex items-center gap-1 flex-shrink-0"
                title="대시보드 삭제"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">삭제</span>
              </button>
            )}
          </div>

          {activeDashboard && (
            <div className="space-y-4">
              {/* Cycle & Period Selector Bar (현재 주기 vs 과거 기록) */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 sm:p-4 flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-slate-600 flex-shrink-0">
                    <History className="w-4 h-4 text-emerald-600" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-bold text-slate-900">
                        {displayPeriodLabel}
                      </span>
                      {isViewingCurrentPeriod ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 animate-pulse">
                          현재 주기 (진행 중)
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                          과거 아카이브 기록
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {displayPeriodRange ? `${displayPeriodRange} · ` : ''}
                      초기화 주기: {activeDashboard.cycle === 'weekly' ? '매주 월요일 주간 리셋' : '매월 1일 월간 리셋'}
                    </p>
                  </div>
                </div>

                {/* Dropdown to pick Past Cycle or Current Cycle */}
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <span className="text-xs font-medium text-slate-500 whitespace-nowrap">조회 주기:</span>
                  <div className="relative flex-1 sm:flex-initial">
                    <select
                      value={selectedPeriodKey || ''}
                      onChange={(e) => setSelectedPeriodKey(e.target.value)}
                      className="w-full sm:w-auto pl-3 pr-8 py-2 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500 appearance-none shadow-xs cursor-pointer"
                    >
                      {periodOptions.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                          {opt.isCurrent ? `[현재] ${opt.label} (${opt.rangeText})` : `[과거] ${opt.label} (${opt.rangeText})`}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>

                  {!isViewingCurrentPeriod && currentPeriodInfo && (
                    <button
                      type="button"
                      onClick={() => setSelectedPeriodKey(currentPeriodInfo.key)}
                      className="px-3 py-2 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors cursor-pointer whitespace-nowrap flex-shrink-0"
                    >
                      현재 주기로 이동
                    </button>
                  )}
                </div>
              </div>

              {/* Progress Summary Card */}
              <div className="bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-blue-500/10 border border-emerald-200/80 rounded-2xl p-3.5 sm:p-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      <h4 className="font-bold text-slate-900 text-sm sm:text-base">
                        {displayPeriodLabel} 달성 현황
                      </h4>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {displayPeriodRange ? `${displayPeriodRange} · ` : ''}
                      {hasMultiTargetItems
                        ? `목표 총 ${totalTargetUnits}개 중 ${totalAchievedUnits}개 달성 (${progressFraction})`
                        : `전체 ${totalItemsCount}개 항목 중 ${completedItemsCount}개 완료 (${progressFraction})`}
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 w-full sm:w-auto">
                    <div className="flex items-baseline gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-emerald-200/80 shadow-2xs">
                      <span className="text-xl sm:text-2xl font-black text-emerald-600 font-mono">
                        {progressFraction}
                      </span>
                      <span className="text-xs sm:text-sm font-bold text-emerald-700 font-mono">
                        ({progressPercent}%)
                      </span>
                    </div>

                    {isViewingCurrentPeriod && (
                      <button
                        type="button"
                        onClick={handleResetPeriod}
                        className="px-2.5 py-1.5 text-xs text-slate-500 hover:text-slate-800 active:scale-95 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-all flex items-center gap-1 cursor-pointer"
                        title="이 주기의 진행 상태를 초기화합니다"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span className="text-[11px] sm:text-xs">주기 리셋</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="w-full bg-slate-200/80 h-2.5 rounded-full overflow-hidden mt-3">
                  <div
                    className="bg-emerald-600 h-full transition-all duration-300 rounded-full"
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
              </div>

              {/* Checklist / Goal Items */}
              <div className="bg-slate-50/50 rounded-2xl border border-slate-200 p-3.5 sm:p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      <span>목표 및 체크리스트 ({items.length})</span>
                    </h4>
                    <span className="text-[11px] text-slate-400">
                      모든 멤버가 클릭하여 완료/진행 관리 가능
                    </span>
                  </div>

                  {/* Primary Action Button: Prominently located at the top of checklist */}
                  <button
                    type="button"
                    onClick={() => setIsAddFormOpen((prev) => !prev)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isAddFormOpen ? '입력창 닫기' : '새 목표 추가'}</span>
                  </button>
                </div>

                {/* Pinned Add Item Form: Top of list so it is always immediately accessible on mobile */}
                {(isAddFormOpen || items.length === 0) && (
                  <form
                    onSubmit={handleAddItem}
                    className="p-3.5 bg-white border border-emerald-200 rounded-xl shadow-xs space-y-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                        <Plus className="w-3.5 h-3.5 text-emerald-600" />
                        새 목표 / 체크리스트 등록
                      </span>
                      {items.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setIsAddFormOpen(false)}
                          className="text-slate-400 hover:text-slate-600 text-xs p-1 cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    <input
                      type="text"
                      value={newItemTitle}
                      onChange={(e) => setNewItemTitle(e.target.value)}
                      placeholder="목표 또는 할 일 제목 입력 (예: 일일 회의 진행, 5명 가입 유치)"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                      autoFocus={isAddFormOpen}
                    />

                    <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                      <div className="flex items-center gap-1.5 flex-1 min-w-[120px]">
                        <span className="text-xs text-slate-500 whitespace-nowrap">목표:</span>
                        <input
                          type="number"
                          min="1"
                          value={newItemTarget}
                          onChange={(e) => setNewItemTarget(e.target.value)}
                          placeholder="수량 (기본 1)"
                          className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-center focus:bg-white"
                        />
                      </div>

                      <div className="flex items-center gap-1.5 flex-1 min-w-[100px]">
                        <span className="text-xs text-slate-500 whitespace-nowrap">단위:</span>
                        <input
                          type="text"
                          value={newItemUnit}
                          onChange={(e) => setNewItemUnit(e.target.value)}
                          placeholder="건/회/개"
                          className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-center focus:bg-white"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isAddingItem || !newItemTitle.trim()}
                        className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-1 shadow-xs disabled:opacity-50 cursor-pointer flex-shrink-0"
                      >
                        {isAddingItem ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span>추가 완료</span>
                      </button>
                    </div>
                  </form>
                )}

                {recordLoading ? (
                  <div className="p-6 text-center flex flex-col items-center justify-center">
                    <Loader2 className="w-5 h-5 text-emerald-600 animate-spin mb-1" />
                    <span className="text-xs text-slate-400">기록 로딩 중...</span>
                  </div>
                ) : items.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 bg-white rounded-xl border border-slate-200">
                    <p className="text-xs">등록된 목표 항목이 없습니다. 위의 입력창에서 새 항목을 추가해보세요.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {items.map((item) => {
                      const isTargetBased = (item.targetCount || 1) > 1;

                      return (
                        <div
                          key={item.id}
                          className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 bg-white ${
                            item.isCompleted
                              ? 'border-emerald-200 bg-emerald-50/30 text-slate-400'
                              : (item.currentCount || 0) > 0
                              ? 'border-amber-200 bg-amber-50/20 text-slate-800'
                              : 'border-slate-200 hover:border-slate-300 text-slate-800'
                          }`}
                        >
                          <div
                            onClick={() => handleToggleItem(item.id)}
                            className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer select-none py-0.5"
                          >
                            {item.isCompleted ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                            ) : (item.currentCount || 0) > 0 ? (
                              <div
                                className="w-5 h-5 rounded-full border-2 border-amber-500 bg-amber-50 flex items-center justify-center flex-shrink-0 text-[9px] font-bold text-amber-700 font-mono"
                                title="부분 진행 중"
                              >
                                {item.currentCount}
                              </div>
                            ) : (
                              <Circle className="w-5 h-5 text-slate-300 hover:text-emerald-500 flex-shrink-0 transition-colors" />
                            )}

                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className={`text-xs sm:text-sm font-semibold truncate ${
                                    item.isCompleted ? 'line-through text-slate-400' : 'text-slate-900'
                                  }`}
                                >
                                  {item.title}
                                </span>
                                {isTargetBased && (
                                  <span
                                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold font-mono border ${
                                      item.isCompleted
                                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                        : (item.currentCount || 0) > 0
                                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                                        : 'bg-slate-100 text-slate-600 border-slate-200'
                                    }`}
                                  >
                                    {item.currentCount || 0}/{item.targetCount}
                                    {item.unit ? ` ${item.unit}` : ''}
                                  </span>
                                )}
                              </div>

                              {isTargetBased && (
                                <div className="mt-1.5 w-full max-w-xs bg-slate-100 h-1.5 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-300 rounded-full ${
                                      item.isCompleted ? 'bg-emerald-500' : 'bg-amber-500'
                                    }`}
                                    style={{
                                      width: `${Math.min(
                                        100,
                                        Math.round(((item.currentCount || 0) / (item.targetCount || 1)) * 100)
                                      )}%`,
                                    }}
                                  />
                                </div>
                              )}

                              {item.lastUpdatedBy && (
                                <span className="text-[10px] text-slate-400 block mt-0.5">
                                  최근 변경: @{item.lastUpdatedBy}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Numerical Count Controls with large mobile touch targets */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            {isTargetBased && (
                              <div className="flex items-center gap-1 bg-slate-100 px-1.5 py-1 rounded-xl border border-slate-200 text-xs font-mono">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateCount(item.id, -1)}
                                  className="w-7 h-7 sm:w-8 sm:h-8 bg-white hover:bg-slate-200 rounded-lg text-slate-700 font-bold flex items-center justify-center cursor-pointer shadow-2xs text-sm"
                                  title="1 감소"
                                >
                                  -
                                </button>
                                <span className="font-bold text-slate-900 px-1 text-center min-w-[48px]">
                                  {item.currentCount || 0}/{item.targetCount}
                                  {item.unit ? ` ${item.unit}` : ''}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateCount(item.id, 1)}
                                  className="w-7 h-7 sm:w-8 sm:h-8 bg-white hover:bg-slate-200 rounded-lg text-slate-700 font-bold flex items-center justify-center cursor-pointer shadow-2xs text-sm"
                                  title="1 증가"
                                >
                                  +
                                </button>
                              </div>
                            )}

                            <button
                              type="button"
                              onClick={() => handleRemoveItem(item.id)}
                              className="text-slate-300 hover:text-rose-500 p-2 rounded-xl hover:bg-rose-50 transition-colors cursor-pointer flex-shrink-0"
                              title="항목 제거"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Cycle Summary Note / Retrospective */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                    <Edit2 className="w-3.5 h-3.5 text-emerald-600" />
                    <span>주기 총평 및 회고 메모</span>
                  </div>
                  <button
                    type="button"
                    disabled={isSavingNote}
                    onClick={handleSaveNote}
                    className="px-3 py-1 bg-slate-100 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    {isSavingNote ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    <span>메모 저장</span>
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={cycleNote}
                  onChange={(e) => setCycleNote(e.target.value)}
                  placeholder="이번 주기 달성 소감, 반성 및 다음 주/달 보완점 등을 자유롭게 공유하세요."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Create Dashboard Modal with Cycle Selector (주간 vs 월간) */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center">
                  <LayoutDashboard className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">새 대시보드 만들기</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateDashboard} className="p-5 space-y-4">
              {createError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{createError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  대시보드 이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="예: 팀 주간 핵심 실천과제, 월간 KPI 대시보드"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  autoFocus
                />
              </div>

              {/* Cycle Selection: 주간 vs 월간 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  초기화 주기 선택 <span className="text-red-500">*</span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setNewCycle('weekly')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      newCycle === 'weekly'
                        ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600'
                    }`}
                  >
                    <div className="font-bold text-xs sm:text-sm text-slate-900 mb-0.5">
                      주(Weekly) 단위 초기화
                    </div>
                    <p className="text-[11px] text-slate-500">
                      매주 월요일 0시에 새 주차로 리셋되며 지난주 기록은 아카이브됩니다.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewCycle('monthly')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      newCycle === 'monthly'
                        ? 'border-emerald-500 bg-emerald-50 ring-2 ring-emerald-500/20'
                        : 'border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600'
                    }`}
                  >
                    <div className="font-bold text-xs sm:text-sm text-slate-900 mb-0.5">
                      달(Monthly) 단위 초기화
                    </div>
                    <p className="text-[11px] text-slate-500">
                      매월 1일에 새 월로 리셋되며 지난달 기록은 과거 기록으로 보존됩니다.
                    </p>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  기본 초기 목표 목록 <span className="text-slate-400 font-normal">(줄바꿈으로 구분)</span>
                </label>
                <textarea
                  rows={3}
                  value={initialTaskInputs}
                  onChange={(e) => setInitialTaskInputs(e.target.value)}
                  placeholder="새 주기마다 자동으로 초기화되어 채워질 기본 목표 항목들"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white font-sans"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  여기에 작성한 항목들은 주 또는 달이 바뀔 때마다 0% 상태로 자동 생성됩니다.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  설명 / 목적 <span className="text-slate-400 font-normal">(선택)</span>
                </label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="대시보드 사용 목적 및 팀 가이드라인"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isCreating}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-60 cursor-pointer"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>생성 중...</span>
                    </>
                  ) : (
                    '대시보드 생성'
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
