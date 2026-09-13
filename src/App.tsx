/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthProvider, useAuth } from './context/AuthContext';
import AuthForm from './components/AuthForm';
import GroupManager from './components/GroupManager';
import { Users, Loader2 } from 'lucide-react';

function MainApp() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 text-slate-700">
        <div className="w-14 h-14 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-md shadow-blue-500/20 mb-4 animate-bounce">
          <Users className="w-7 h-7" />
        </div>
        <div className="flex items-center gap-2.5 text-slate-800 font-semibold text-base mb-1">
          <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
          <span>자동 로그인 확인 중...</span>
        </div>
        <p className="text-xs text-slate-500">이전 로그인 세션을 안전하게 복구하고 있습니다</p>
      </div>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  return <GroupManager />;
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
