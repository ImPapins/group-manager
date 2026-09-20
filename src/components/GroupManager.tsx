import { useState, useEffect, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, 
  Plus, 
  Trash2, 
  UserPlus, 
  LogOut, 
  Edit3, 
  Check, 
  X, 
  Shield, 
  User as UserIcon, 
  AlertCircle, 
  Loader2,
  FolderPlus,
  Crown,
  Search,
  ArrowLeft,
  ChevronRight,
  Calendar,
  Layers,
  CheckSquare
} from 'lucide-react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc, 
  updateDoc, 
  doc, 
  getDoc,
  arrayUnion,
  arrayRemove
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Group, GroupMember } from '../types';
import GroupCalendar from './GroupCalendar';
import CalendarChecklistView from './CalendarChecklistView';

export default function GroupManager() {
  const { username, displayName, logout } = useAuth();

  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // When selectedGroupId is null -> show "그룹 목록"
  // When selectedGroupId has an id -> show that group's "그룹 페이지"
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Group Detail Tab State ('calendar' | 'checklist' | 'members' | 'all')
  const [activeGroupTab, setActiveGroupTab] = useState<'calendar' | 'checklist' | 'members' | 'all'>('calendar');

  // Create Group Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [newGroupDesc, setNewGroupDesc] = useState<string>('');
  const [initialInviteIds, setInitialInviteIds] = useState<string>('');
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [createModalError, setCreateModalError] = useState<string | null>(null);

  // Edit Group Name State (Inside Group Page)
  const [isEditingName, setIsEditingName] = useState<boolean>(false);
  const [editingGroupName, setEditingGroupName] = useState<string>('');
  const [isUpdatingName, setIsUpdatingName] = useState<boolean>(false);

  // Invite Member in Group Page State
  const [inviteInputId, setInviteInputId] = useState<string>('');
  const [isInviting, setIsInviting] = useState<boolean>(false);
  const [inviteStatusMsg, setInviteStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Group list search query
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Real-time Firestore subscription to groups
  useEffect(() => {
    if (!username) return;
    setLoading(true);
    setError(null);

    const groupsCol = collection(db, 'groups');
    const unsubscribe = onSnapshot(
      groupsCol,
      (snapshot) => {
        const list: Group[] = [];
        snapshot.forEach((d) => {
          const data = d.data();
          const members: string[] = Array.isArray(data.members) ? data.members : [];
          // Include if current user is in members array or is creator
          if (members.includes(username) || data.creatorUsername === username) {
            list.push({
              id: d.id,
              name: data.name || '이름 없는 그룹',
              description: data.description || '',
              creatorUsername: data.creatorUsername || '',
              creatorDisplayName: data.creatorDisplayName || data.creatorUsername || '관리자',
              members: members,
              memberDetails: data.memberDetails || {},
              createdAt: data.createdAt || '',
            });
          }
        });

        // Sort by creation date descending
        list.sort((a, b) => (b.createdAt > a.createdAt ? 1 : -1));
        setGroups(list);
        setLoading(false);

        // If currently viewed group was deleted, return to list view
        setSelectedGroupId((prev) => {
          if (prev && !list.some((g) => g.id === prev)) {
            return null;
          }
          return prev;
        });
      },
      (err) => {
        console.error('Firestore groups snapshot error:', err);
        setError('그룹 정보를 불러오는 중 오류가 발생했습니다.');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [username]);

  // Create a new group and immediately navigate into it
  const handleCreateGroup = async (e: FormEvent) => {
    e.preventDefault();
    const trimmedName = newGroupName.trim();
    if (!trimmedName) {
      setCreateModalError('그룹 이름을 입력해주세요.');
      return;
    }

    setCreateModalError(null);
    setIsCreating(true);

    try {
      const now = new Date().toISOString();
      const initialMembers: string[] = [username];
      const memberDetails: Record<string, GroupMember> = {
        [username]: {
          username: username,
          displayName: displayName || username,
          role: 'admin',
          joinedAt: now,
        },
      };

      // Process initial invited IDs if any
      const rawInvites = initialInviteIds
        .split(/[,;\s]+/)
        .map((s) => s.trim().toLowerCase())
        .filter((s) => s.length > 0 && s !== username);

      for (const inviteId of rawInvites) {
        if (!initialMembers.includes(inviteId)) {
          // Verify user exists in registered users collection
          const userSnap = await getDoc(doc(db, 'users', inviteId));
          if (!userSnap.exists()) {
            setCreateModalError(`초대하려는 사용자 '@${inviteId}'는 가입되어 있지 않습니다. 존재하는 회원 아이디만 초대할 수 있습니다.`);
            setIsCreating(false);
            return;
          }
          const inviteDisplayName = userSnap.data().displayName || inviteId;

          initialMembers.push(inviteId);
          memberDetails[inviteId] = {
            username: inviteId,
            displayName: inviteDisplayName,
            role: 'member',
            joinedAt: now,
          };
        }
      }

      const docRef = await addDoc(collection(db, 'groups'), {
        name: trimmedName,
        description: newGroupDesc.trim(),
        creatorUsername: username,
        creatorDisplayName: displayName || username,
        members: initialMembers,
        memberDetails: memberDetails,
        createdAt: now,
      });

      // Reset form & close modal
      setNewGroupName('');
      setNewGroupDesc('');
      setInitialInviteIds('');
      setIsCreateModalOpen(false);
      // Navigate directly into newly created group page
      setSelectedGroupId(docRef.id);
    } catch (err: any) {
      console.error('Group create error:', err);
      setCreateModalError('그룹 생성 중 오류가 발생했습니다: ' + (err.message || '다시 시도해주세요.'));
    } finally {
      setIsCreating(false);
    }
  };

  // Delete a group
  const handleDeleteGroup = async (group: Group) => {
    if (group.creatorUsername !== username) {
      alert('그룹 생성자만 그룹을 삭제할 수 있습니다.');
      return;
    }

    if (!window.confirm(`정말 '${group.name}' 그룹을 삭제하시겠습니까? 모든 그룹 데이터가 영구 삭제됩니다.`)) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'groups', group.id));
      setSelectedGroupId(null);
    } catch (err: any) {
      console.error('Group delete error:', err);
      alert('그룹 삭제 중 오류가 발생했습니다.');
    }
  };

  // Save updated group name
  const handleSaveGroupName = async (groupId: string) => {
    const trimmed = editingGroupName.trim();
    if (!trimmed) {
      alert('그룹 이름을 입력해주세요.');
      return;
    }

    setIsUpdatingName(true);
    try {
      const groupRef = doc(db, 'groups', groupId);
      await updateDoc(groupRef, {
        name: trimmed,
      });
      setIsEditingName(false);
      setEditingGroupName('');
    } catch (err: any) {
      console.error('Group name update error:', err);
      alert('그룹 이름 변경 중 오류가 발생했습니다.');
    } finally {
      setIsUpdatingName(false);
    }
  };

  // Invite member by ID inside group page
  const handleInviteMember = async (e: FormEvent) => {
    e.preventDefault();
    setInviteStatusMsg(null);

    const targetId = inviteInputId.trim().toLowerCase();
    if (!targetId) {
      setInviteStatusMsg({ type: 'error', text: '초대할 사용자의 아이디를 입력해주세요.' });
      return;
    }

    const currentGroup = groups.find((g) => g.id === selectedGroupId);
    if (!currentGroup) return;

    if (currentGroup.members.includes(targetId)) {
      setInviteStatusMsg({ type: 'error', text: `'${targetId}' 님은 이미 이 그룹의 멤버입니다.` });
      return;
    }

    setIsInviting(true);
    try {
      // Check if user exists in Firestore
      const userRef = doc(db, 'users', targetId);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        setInviteStatusMsg({
          type: 'error',
          text: `'${targetId}' 아이디를 가진 사용자가 존재하지 않습니다. 먼저 회원가입이 되어 있는 사용자만 그룹에 초대할 수 있습니다.`,
        });
        setIsInviting(false);
        return;
      }

      const targetDisplayName = userSnap.data().displayName || targetId;

      const now = new Date().toISOString();
      const newMemberData: GroupMember = {
        username: targetId,
        displayName: targetDisplayName,
        role: 'member',
        joinedAt: now,
      };

      const groupRef = doc(db, 'groups', currentGroup.id);
      await updateDoc(groupRef, {
        members: arrayUnion(targetId),
        [`memberDetails.${targetId}`]: newMemberData,
      });

      setInviteInputId('');
      setInviteStatusMsg({
        type: 'success',
        text: `'${targetDisplayName}' (@${targetId}) 님이 그룹에 초대되었습니다!`,
      });
    } catch (err: any) {
      console.error('Invite error:', err);
      setInviteStatusMsg({
        type: 'error',
        text: '멤버 초대 중 오류가 발생했습니다: ' + (err.message || '다시 시도해주세요.'),
      });
    } finally {
      setIsInviting(false);
    }
  };

  // Remove member or leave group
  const handleRemoveMember = async (groupId: string, memberUsername: string, memberDisplayName: string) => {
    const currentGroup = groups.find((g) => g.id === groupId);
    if (!currentGroup) return;

    if (memberUsername === currentGroup.creatorUsername) {
      alert('그룹 생성자(방장)는 제거할 수 없습니다.');
      return;
    }

    const isSelf = memberUsername === username;
    const confirmText = isSelf
      ? `'${currentGroup.name}' 그룹에서 나가시겠습니까?`
      : `'${memberDisplayName}' (@${memberUsername}) 님을 그룹에서 내보내시겠습니까?`;

    if (!window.confirm(confirmText)) {
      return;
    }

    try {
      const groupRef = doc(db, 'groups', groupId);
      const updatedDetails = { ...currentGroup.memberDetails };
      delete updatedDetails[memberUsername];

      await updateDoc(groupRef, {
        members: arrayRemove(memberUsername),
        memberDetails: updatedDetails,
      });

      if (isSelf) {
        setSelectedGroupId(null);
      }
    } catch (err: any) {
      console.error('Remove member error:', err);
      alert('멤버 처리 중 오류가 발생했습니다.');
    }
  };

  // Filtered groups for Group List view
  const filteredGroups = groups.filter((g) =>
    g.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const selectedGroup = groups.find((g) => g.id === selectedGroupId) || null;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 flex flex-col">
      {/* Global Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50 shadow-xs">
        <div className="max-w-5xl mx-auto px-3 sm:px-6 h-14 sm:h-16 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-xs shadow-blue-500/20 flex-shrink-0">
              <Users className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div className="min-w-0">
              <h1 id="app-nav-title" className="font-bold text-slate-900 leading-tight text-sm sm:text-lg truncate">
                공용 그룹 관리
              </h1>
              <p className="text-[11px] text-slate-500 hidden sm:block">ID 기반 멤버 초대 및 그룹 시스템</p>
            </div>
          </div>

          {/* User info & Logout */}
          <div className="flex items-center gap-1.5 sm:gap-3 flex-shrink-0">
            <div className="flex items-center gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
              <span className="w-2 h-2 rounded-full bg-emerald-500 flex-shrink-0"></span>
              <UserIcon className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />
              <span className="font-semibold text-slate-900 truncate max-w-[70px] sm:max-w-[130px]">{displayName}</span>
              <span className="text-slate-400 font-mono text-[11px] hidden md:inline">(@{username})</span>
            </div>

            <button
              type="button"
              id="logout-btn"
              onClick={logout}
              className="flex items-center gap-1 px-2.5 sm:px-3 py-1.5 bg-slate-100 hover:bg-red-50 hover:text-red-700 hover:border-red-200 text-slate-700 rounded-xl text-xs font-semibold border border-slate-200 transition-colors cursor-pointer active:scale-95"
              title="로그아웃"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Body: Either Group List View OR Group Detail Page */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-2 sm:px-6 py-2.5 sm:py-6">
        {selectedGroup ? (
          /* ==================================================================== */
          /* 2. 그룹 페이지 (Group Page View: inside the clicked group)           */
          /* ==================================================================== */
          <div className="space-y-3.5 sm:space-y-5 animate-in fade-in duration-150">
            {/* Back Button to return to Group List */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                id="back-to-group-list-btn"
                onClick={() => {
                  setSelectedGroupId(null);
                  setIsEditingName(false);
                  setInviteStatusMsg(null);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 transition-colors cursor-pointer shadow-xs active:scale-95"
              >
                <ArrowLeft className="w-4 h-4 text-slate-500" />
                <span className="sm:hidden">목록</span>
                <span className="hidden sm:inline">그룹 목록으로 돌아가기</span>
              </button>

              <span className="text-[11px] sm:text-xs text-slate-400">
                생성자: @{selectedGroup.creatorUsername}
              </span>
            </div>

            {/* Group Header Card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 pb-3 sm:pb-4 border-b border-slate-100">
                <div className="flex-1 min-w-0">
                  {isEditingName ? (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        id="edit-group-name-input"
                        value={editingGroupName}
                        onChange={(e) => setEditingGroupName(e.target.value)}
                        placeholder="새 그룹 이름 입력"
                        className="px-3.5 py-2 text-base sm:text-lg font-bold text-slate-900 border border-blue-400 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 bg-white w-full max-w-sm"
                        autoFocus
                      />
                      <button
                        type="button"
                        id="save-group-name-btn"
                        disabled={isUpdatingName}
                        onClick={() => handleSaveGroupName(selectedGroup.id)}
                        className="p-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl transition-colors cursor-pointer flex-shrink-0 active:scale-95"
                        title="저장"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        id="cancel-edit-group-name-btn"
                        onClick={() => setIsEditingName(false)}
                        className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl transition-colors cursor-pointer flex-shrink-0 active:scale-95"
                        title="취소"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-xl sm:text-2xl font-bold text-slate-900 truncate">
                        {selectedGroup.name}
                      </h2>
                      {/* Edit Group Name Button */}
                      <button
                        type="button"
                        id="edit-group-name-btn"
                        onClick={() => {
                          setIsEditingName(true);
                          setEditingGroupName(selectedGroup.name);
                        }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer active:scale-90"
                        title="그룹 이름 설정 / 수정"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>

                      {selectedGroup.creatorUsername === username && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] sm:text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                          <Crown className="w-3 h-3 text-amber-500" />
                          방장
                        </span>
                      )}
                    </div>
                  )}

                  {selectedGroup.description && (
                    <p className="text-xs sm:text-sm text-slate-500 mt-1">
                      {selectedGroup.description}
                    </p>
                  )}
                </div>

                {/* Group Delete / Leave Action */}
                <div className="flex items-center justify-end">
                  {selectedGroup.creatorUsername === username ? (
                    <button
                      type="button"
                      id="delete-group-btn"
                      onClick={() => handleDeleteGroup(selectedGroup)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition-colors cursor-pointer active:scale-95"
                      title="그룹 영구 삭제"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>그룹 삭제</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleRemoveMember(selectedGroup.id, username, displayName)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 sm:px-3.5 sm:py-2 text-xs font-semibold text-slate-600 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 rounded-xl transition-colors cursor-pointer active:scale-95"
                    >
                      <span>그룹 나가기</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Sticky Tab Navigation Bar for Mobile and Desktop */}
            <div className="sticky top-14 sm:top-16 z-40 bg-slate-100/95 backdrop-blur-md py-1 sm:py-1.5 -mx-1 px-1 border-b border-slate-200/80 shadow-2xs">
              <div className="grid grid-cols-4 gap-1 p-1 bg-slate-200/80 rounded-2xl">
                <button
                  type="button"
                  id="tab-calendar-btn"
                  onClick={() => setActiveGroupTab('calendar')}
                  className={`py-2.5 sm:py-2 px-1 sm:px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] ${
                    activeGroupTab === 'calendar'
                      ? 'bg-white text-blue-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                  title="달력"
                >
                  <Calendar className="w-4 h-4 sm:w-4 sm:h-4 text-blue-600 flex-shrink-0" />
                  <span className="hidden sm:inline truncate">달력</span>
                </button>

                <button
                  type="button"
                  id="tab-checklist-btn"
                  onClick={() => setActiveGroupTab('checklist')}
                  className={`py-2.5 sm:py-2 px-1 sm:px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] ${
                    activeGroupTab === 'checklist'
                      ? 'bg-white text-emerald-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                  title="체크리스트"
                >
                  <CheckSquare className="w-4 h-4 sm:w-4 sm:h-4 text-emerald-600 flex-shrink-0" />
                  <span className="hidden sm:inline truncate">체크리스트</span>
                </button>

                <button
                  type="button"
                  id="tab-members-btn"
                  onClick={() => setActiveGroupTab('members')}
                  className={`py-2.5 sm:py-2 px-1 sm:px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] ${
                    activeGroupTab === 'members'
                      ? 'bg-white text-indigo-700 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                  title="멤버"
                >
                  <Users className="w-4 h-4 sm:w-4 sm:h-4 text-indigo-600 flex-shrink-0" />
                  <span className="hidden sm:inline truncate">멤버 ({selectedGroup.members.length})</span>
                </button>

                <button
                  type="button"
                  id="tab-all-btn"
                  onClick={() => setActiveGroupTab('all')}
                  className={`py-2.5 sm:py-2 px-1 sm:px-3 rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-[0.98] ${
                    activeGroupTab === 'all'
                      ? 'bg-white text-slate-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
                  }`}
                  title="전체"
                >
                  <Layers className="w-4 h-4 sm:w-4 sm:h-4 text-slate-500 flex-shrink-0" />
                  <span className="hidden sm:inline truncate">전체</span>
                </button>
              </div>
            </div>

            {/* Tab 1: 그룹 공용 달력 (Group Shared Calendar) */}
            {(activeGroupTab === 'calendar' || activeGroupTab === 'all') && (
              <GroupCalendar group={selectedGroup} />
            )}

            {/* Tab 2: 달력 체크리스트 (Group Calendar Checklist with weekly/monthly % targets) */}
            {(activeGroupTab === 'checklist' || activeGroupTab === 'all') && (
              <CalendarChecklistView group={selectedGroup} />
            )}

            {/* Tab 3: 그룹 멤버 관리 및 초대 */}
            {(activeGroupTab === 'members' || activeGroupTab === 'all') && (
              <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6 space-y-6">
                {/* ID-based Member Invitation Box */}
                <div className="bg-blue-50/60 border border-blue-100 rounded-2xl p-4 sm:p-5">
                  <div className="flex items-center gap-2 text-sm font-bold text-blue-900 mb-1">
                    <UserPlus className="w-4 h-4 text-blue-600" />
                    <span>아이디로 새 멤버 초대</span>
                  </div>
                  <p className="text-xs text-blue-700/80 mb-3">
                    초대할 사용자의 아이디(ID)를 입력하면 해당 사용자가 이 그룹에 즉시 추가됩니다.
                  </p>

                  <form onSubmit={handleInviteMember} className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-sm">@</span>
                      <input
                        type="text"
                        id="invite-username-input"
                        value={inviteInputId}
                        onChange={(e) => setInviteInputId(e.target.value)}
                        placeholder="초대할 사용자 아이디 입력 (예: team_kim)"
                        className="w-full pl-8 pr-3.5 py-2.5 bg-white border border-blue-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 font-mono"
                      />
                    </div>
                    <button
                      type="submit"
                      id="invite-submit-btn"
                      disabled={isInviting}
                      className="py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs sm:text-sm rounded-xl transition-colors flex items-center gap-1.5 shadow-xs shadow-blue-500/20 disabled:opacity-60 cursor-pointer flex-shrink-0"
                    >
                      {isInviting ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>초대 중...</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          <span>초대하기</span>
                        </>
                      )}
                    </button>
                  </form>

                  {inviteStatusMsg && (
                    <div
                      className={`mt-3 p-3 rounded-xl text-xs flex items-center gap-2 ${
                        inviteStatusMsg.type === 'success'
                          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          : 'bg-red-50 text-red-700 border border-red-200'
                      }`}
                    >
                      {inviteStatusMsg.type === 'success' ? (
                        <Check className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      )}
                      <span>{inviteStatusMsg.text}</span>
                    </div>
                  )}
                </div>

                {/* Group Members List */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                      <Users className="w-4 h-4 text-slate-500" />
                      <span>그룹 멤버</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-700">
                        {selectedGroup.members.length}명
                      </span>
                    </h3>
                  </div>

                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-2xl overflow-hidden bg-white">
                    {selectedGroup.members.map((mUsername) => {
                      const detail = selectedGroup.memberDetails?.[mUsername];
                      const isCreator = mUsername === selectedGroup.creatorUsername;
                      const isMe = mUsername === username;
                      const displayNameText = detail?.displayName || mUsername;

                      return (
                        <div
                          key={mUsername}
                          className="p-3.5 sm:p-4 flex items-center justify-between gap-3 hover:bg-slate-50/80 transition-colors"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 flex items-center justify-center font-bold text-xs flex-shrink-0">
                              {mUsername.slice(0, 2).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-semibold text-slate-900 text-sm truncate">
                                  {displayNameText}
                                </span>
                                {isMe && (
                                  <span className="text-blue-600 font-semibold text-xs">
                                    (나)
                                  </span>
                                )}
                                {isCreator && (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    <Crown className="w-3 h-3 text-amber-500" />
                                    방장
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-400 font-mono">
                                @{mUsername}
                              </div>
                            </div>
                          </div>

                          {/* Member Remove / Leave Button */}
                          <div>
                            {!isCreator && (selectedGroup.creatorUsername === username || isMe) && (
                              <button
                                type="button"
                                onClick={() => handleRemoveMember(selectedGroup.id, mUsername, displayNameText)}
                                className="text-xs text-slate-400 hover:text-rose-600 hover:bg-rose-50 p-2 rounded-lg transition-colors cursor-pointer"
                                title={isMe ? '그룹 나가기' : '멤버 내보내기'}
                              >
                                {isMe ? '나가기' : <Trash2 className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* ==================================================================== */
          /* 1. 그룹 목록 화면 (Group List View: 그룹 이름만 표시)               */
          /* ==================================================================== */
          <div className="space-y-4 sm:space-y-6 animate-in fade-in duration-150">
            {/* Header / Action Bar */}
            <div className="bg-white rounded-2xl p-4 sm:p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div>
                <h2 className="text-lg sm:text-2xl font-bold text-slate-900">
                  그룹 목록
                </h2>
                <p className="text-slate-500 text-xs sm:text-sm mt-0.5 sm:mt-1">
                  그룹을 누르면 해당 그룹 페이지로 이동하여 멤버를 초대하고 관리할 수 있습니다.
                </p>
              </div>

              <button
                type="button"
                id="open-create-group-modal-btn"
                onClick={() => {
                  setCreateModalError(null);
                  setIsCreateModalOpen(true);
                }}
                className="w-full sm:w-auto py-2.5 px-4 bg-blue-600 hover:bg-blue-700 active:scale-95 text-white font-semibold rounded-xl text-xs sm:text-sm transition-all shadow-xs shadow-blue-500/20 flex items-center justify-center gap-2 cursor-pointer flex-shrink-0"
              >
                <FolderPlus className="w-4 h-4" />
                <span>새 그룹 추가하기</span>
              </button>
            </div>

            {/* Optional search when groups exist */}
            {groups.length > 3 && (
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="그룹 이름 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 text-base sm:text-sm bg-white border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-blue-500 shadow-xs"
                />
              </div>
            )}

            {/* Group List Display: Only Group Names */}
            {loading ? (
              <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 flex flex-col items-center justify-center shadow-xs">
                <Loader2 className="w-6 h-6 text-blue-600 animate-spin mb-2" />
                <p className="text-xs text-slate-500 font-medium">그룹 목록을 불러오는 중...</p>
              </div>
            ) : error ? (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            ) : filteredGroups.length === 0 ? (
              <div className="bg-white rounded-2xl p-10 text-center border border-slate-200 shadow-xs">
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl mx-auto flex items-center justify-center mb-3">
                  <Users className="w-6 h-6" />
                </div>
                <h3 className="font-bold text-slate-800 text-base">
                  {groups.length === 0 ? '등록된 그룹이 없습니다' : '검색된 그룹이 없습니다'}
                </h3>
                <p className="text-slate-500 text-xs sm:text-sm mt-1 mb-5">
                  {groups.length === 0 ? '새 그룹을 만들어 다른 사람들을 초대해보세요.' : '다른 그룹 이름으로 검색해보세요.'}
                </p>
                {groups.length === 0 && (
                  <button
                    type="button"
                    onClick={() => setIsCreateModalOpen(true)}
                    className="inline-flex items-center gap-1.5 py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl text-xs sm:text-sm transition-colors cursor-pointer shadow-xs active:scale-95"
                  >
                    <Plus className="w-4 h-4" />
                    <span>첫 그룹 추가하기</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-2 sm:space-y-2.5">
                {filteredGroups.map((group) => (
                  <button
                    type="button"
                    key={group.id}
                    id={`group-item-${group.id}`}
                    onClick={() => setSelectedGroupId(group.id)}
                    className="w-full text-left px-4 sm:px-5 py-3.5 sm:py-4 bg-white hover:bg-blue-50/40 active:bg-blue-50/60 active:scale-[0.99] border border-slate-200 hover:border-blue-300 rounded-2xl transition-all flex items-center justify-between group shadow-xs cursor-pointer min-h-[52px]"
                  >
                    {/* ONLY Group Name as requested: "그룹 목록에는 그룹 이름만 나오게 해주고" */}
                    <span className="font-bold text-slate-900 text-sm sm:text-base group-hover:text-blue-600 transition-colors truncate pr-2">
                      {group.name}
                    </span>

                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Create Group Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-blue-100 text-blue-600 rounded-lg flex items-center justify-center">
                  <FolderPlus className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-slate-900 text-base">새 그룹 만들기</h3>
              </div>
              <button
                type="button"
                id="close-create-group-modal-btn"
                onClick={() => setIsCreateModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGroup} className="p-5 space-y-4">
              {createModalError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span>{createModalError}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  그룹 이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  id="new-group-name-input"
                  required
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  placeholder="예: 개발 1팀, 주말 스터디 모임"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  그룹 설명 <span className="text-slate-400 font-normal">(선택)</span>
                </label>
                <input
                  type="text"
                  id="new-group-desc-input"
                  value={newGroupDesc}
                  onChange={(e) => setNewGroupDesc(e.target.value)}
                  placeholder="그룹 목적이나 간단한 소개"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  초대할 사용자 아이디 <span className="text-slate-400 font-normal">(선택, 쉼표나 공백으로 구분)</span>
                </label>
                <input
                  type="text"
                  id="new-group-invite-ids-input"
                  value={initialInviteIds}
                  onChange={(e) => setInitialInviteIds(e.target.value)}
                  placeholder="예: user1, user2, designer_kim"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-mono"
                />
                <p className="text-[11px] text-slate-500 mt-1">그룹 생성 후에도 그룹 페이지에서 언제든지 아이디로 멤버를 초대할 수 있습니다.</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  id="submit-create-group-btn"
                  disabled={isCreating}
                  className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-60 cursor-pointer"
                >
                  {isCreating ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>생성 중...</span>
                    </>
                  ) : (
                    '그룹 생성하기'
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
