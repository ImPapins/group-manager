export interface UserSession {
  uid: string;
  username: string;
  displayName: string;
  createdAt: string;
}

export interface GroupMember {
  username: string;
  displayName: string;
  role: 'admin' | 'member';
  joinedAt: string;
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  creatorUsername: string;
  creatorDisplayName: string;
  members: string[]; // Array of usernames for membership
  memberDetails: Record<string, GroupMember>;
  createdAt: string;
}

// Calendar Event Type
export interface GroupCalendarEvent {
  id: string;
  groupId: string;
  title: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  date?: string; // legacy support
  time?: string; // HH:mm
  description?: string;
  category?: string; // Custom category name created by user
  categoryColor?: string; // Optional custom color key for category
  authorUsername: string;
  authorDisplayName: string;
  createdAt: string;
}

// Calendar Checklist Type (Separated from calendar schedule events)
export interface GroupCalendarChecklist {
  id: string;
  groupId: string;
  title: string;
  targetType?: 'weekly' | 'monthly' | 'both'; // Type of goal tracking (default: 'both')
  targetPerWeek?: number; // e.g. 1 ~ 7 times per week (default 3)
  targetWeeksPerMonth?: number; // e.g. 1 ~ 5 successful weeks target in a month (default 4 or 3)
  targetPerMonth?: number; // legacy support
  category?: string;
  color?: string; // Color key for badge/styling
  creatorUsername: string;
  creatorDisplayName: string;
  createdAt: string;
  // History / logs of dates checked: list of YYYY-MM-DD
  completedDates: string[];
}

// Dashboard Types
export type DashboardCycle = 'weekly' | 'monthly';

export interface DashboardItem {
  id: string;
  title: string;
  isCompleted: boolean;
  targetCount?: number;
  currentCount?: number;
  unit?: string;
  lastUpdatedBy?: string;
  lastUpdatedAt?: string;
}

export interface GroupDashboard {
  id: string;
  groupId: string;
  title: string;
  description?: string;
  cycle: DashboardCycle; // 'weekly' | 'monthly'
  creatorUsername: string;
  creatorDisplayName: string;
  createdAt: string;
  // Template item titles that automatically populate on reset
  templateItems?: { id: string; title: string; targetCount?: number; unit?: string }[];
}

export interface DashboardPeriodRecord {
  id: string; // e.g. `${dashboardId}_${periodKey}`
  dashboardId: string;
  groupId: string;
  periodKey: string; // e.g. '2026-W37' or '2026-09'
  periodLabel: string; // e.g. '2026년 37주차 (09.07 ~ 09.13)' or '2026년 9월'
  items: DashboardItem[];
  note?: string;
  updatedAt: string;
  updatedBy: string;
}
