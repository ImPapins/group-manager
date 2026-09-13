import { useState, type FormEvent } from 'react';
import { useAuth } from '../context/AuthContext';
import { 
  Users, 
  Lock, 
  User as UserIcon, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  Loader2, 
  Sparkles,
  BadgeCheck
} from 'lucide-react';

export default function AuthForm() {
  const { login, register, authError, clearError } = useAuth();

  const [isSignUp, setIsSignUp] = useState<boolean>(false);
  const [usernameInput, setUsernameInput] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [confirmPassword, setConfirmPassword] = useState<string>('');
  const [nameInput, setNameInput] = useState<string>('');
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const toggleMode = () => {
    setIsSignUp((prev) => !prev);
    setLocalError(null);
    clearError();
  };

  const handleFillDemo = () => {
    setIsSignUp(false);
    setUsernameInput('shared_team');
    setPassword('demo1234');
    setConfirmPassword('demo1234');
    setNameInput('팀공용계정');
    setLocalError(null);
    clearError();
  };

  const handleInstantDemoLogin = async () => {
    setIsSubmitting(true);
    setLocalError(null);
    clearError();
    const demoId = 'shared_team';
    const demoPw = 'demo1234';
    try {
      try {
        await login(demoId, demoPw);
      } catch (loginErr: any) {
        if (loginErr.message && loginErr.message.includes('존재하지 않는 아이디')) {
          await register(demoId, demoPw, '팀공용계정');
        } else {
          throw loginErr;
        }
      }
    } catch (err: any) {
      setLocalError(err.message || '데모 계정 접속에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    const trimmedId = usernameInput.trim().toLowerCase();
    if (!trimmedId) {
      setLocalError('아이디를 입력해주세요.');
      return;
    }

    if (!password) {
      setLocalError('비밀번호를 입력해주세요.');
      return;
    }

    if (isSignUp) {
      if (trimmedId.length < 3) {
        setLocalError('아이디는 최소 3자 이상이어야 합니다.');
        return;
      }
      if (!/^[a-z0-9_.-]+$/.test(trimmedId)) {
        setLocalError('아이디는 영문, 숫자, 기호(_ . -)만 사용할 수 있습니다.');
        return;
      }
      if (password.length < 6) {
        setLocalError('비밀번호는 최소 6자 이상이어야 합니다.');
        return;
      }
      if (password !== confirmPassword) {
        setLocalError('비밀번호가 일치하지 않습니다.');
        return;
      }
    }

    setIsSubmitting(true);
    try {
      if (isSignUp) {
        await register(trimmedId, password, nameInput.trim());
      } else {
        await login(trimmedId, password);
      }
    } catch {
      // Error handled in AuthContext
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayedError = localError || authError;

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 sm:p-6 text-slate-800">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl shadow-slate-200/60 border border-slate-200/80 overflow-hidden">
        {/* Header decoration */}
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 p-6 text-white text-center relative">
          <div className="w-14 h-14 bg-white/10 rounded-2xl mx-auto flex items-center justify-center mb-3 backdrop-blur-xs border border-white/20">
            <Users className="w-7 h-7 text-white" />
          </div>
          <h1 id="auth-app-title" className="text-2xl font-bold tracking-tight">공용 그룹 관리</h1>
          <p className="text-blue-100 text-xs sm:text-sm mt-1">
            간단한 ID와 비밀번호로 그룹을 만들고 팀원을 초대하세요
          </p>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/15 rounded-full text-xs text-white/95 mt-3 border border-white/10">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-300" />
            <span>자동 로그인 기능 지원 (세션 유지)</span>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 p-1.5 bg-slate-100 border-b border-slate-200">
          <button
            type="button"
            id="tab-login-btn"
            onClick={() => { if (isSignUp) toggleMode(); }}
            className={`py-2.5 text-sm font-semibold rounded-xl transition-all ${
              !isSignUp
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            로그인
          </button>
          <button
            type="button"
            id="tab-signup-btn"
            onClick={() => { if (!isSignUp) toggleMode(); }}
            className={`py-2.5 text-sm font-semibold rounded-xl transition-all ${
              isSignUp
                ? 'bg-white text-blue-600 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            회원가입
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-8">
          {displayedError && (
            <div className="mb-5 p-3.5 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2.5 text-red-700 text-sm">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-red-500 mt-0.5" />
              <div className="flex-1 leading-snug">{displayedError}</div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                아이디 (ID) <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <UserIcon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="input-username"
                  type="text"
                  autoComplete="username"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="예: user1, team_lead"
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all font-mono"
                />
              </div>
              <p className="text-[11px] text-slate-500 mt-1">영문, 숫자 3자 이상 (이메일 없이 ID로 간편 사용)</p>
            </div>

            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  표시 이름 / 닉네임 <span className="text-slate-400 font-normal">(선택사항)</span>
                </label>
                <div className="relative">
                  <BadgeCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="input-display-name"
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    placeholder="미입력 시 아이디로 자동 설정"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                비밀번호 <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  id="input-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isSignUp ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호 (6자 이상)"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                />
                <button
                  type="button"
                  id="toggle-password-visibility-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 focus:outline-hidden"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {isSignUp && (
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  비밀번호 확인 <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    id="input-confirm-password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="비밀번호 재입력"
                    className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                  />
                </div>
              </div>
            )}

            {!isSignUp && (
              <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                <span className="flex items-center gap-1.5 text-slate-600">
                  <CheckCircle2 className="w-4 h-4 text-blue-600" />
                  자동 로그인 활성화
                </span>
                <span className="text-slate-400">브라우저 재방문 시 자동 유지</span>
              </div>
            )}

            <button
              type="submit"
              id="auth-submit-btn"
              disabled={isSubmitting}
              className="w-full mt-2 py-3 px-4 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-semibold rounded-xl text-sm transition-colors shadow-md shadow-blue-500/25 flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>처리 중...</span>
                </>
              ) : isSignUp ? (
                '회원가입 완료하기'
              ) : (
                '로그인'
              )}
            </button>
          </form>

          {/* Quick Demo Assist */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col items-center gap-2">
            <button
              type="button"
              id="instant-demo-login-btn"
              onClick={handleInstantDemoLogin}
              disabled={isSubmitting}
              className="w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-60"
            >
              <Sparkles className="w-3.5 h-3.5 text-blue-600" />
              <span>테스트용 데모 계정으로 1초 로그인</span>
            </button>
            <button
              type="button"
              id="demo-account-fill-btn"
              onClick={handleFillDemo}
              className="text-[11px] text-slate-500 hover:text-blue-600 transition-colors py-1 px-2 cursor-pointer"
            >
              예시 ID/PW 입력 필드에 채우기 (shared_team / demo1234)
            </button>
          </div>
        </div>

        {/* Footer info */}
        <div className="bg-slate-50/80 px-6 py-3.5 text-center text-xs text-slate-500 border-t border-slate-100">
          {isSignUp ? (
            <span>
              이미 ID가 있으신가요?{' '}
              <button
                type="button"
                onClick={toggleMode}
                className="text-blue-600 font-semibold hover:underline cursor-pointer"
              >
                로그인하기
              </button>
            </span>
          ) : (
            <span>
              처음 방문하셨나요?{' '}
              <button
                type="button"
                onClick={toggleMode}
                className="text-blue-600 font-semibold hover:underline cursor-pointer"
              >
                새 ID 회원가입
              </button>
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
