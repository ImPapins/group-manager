import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { db, hashPassword } from '../firebase';
import type { UserSession } from '../types';

const STORAGE_KEY = 'sharedcal_auth_session_v1';

interface AuthContextType {
  user: UserSession | null;
  username: string;
  displayName: string;
  loading: boolean;
  authError: string | null;
  login: (id: string, pass: string) => Promise<void>;
  register: (id: string, pass: string, name?: string) => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserSession | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);

  // Automatic Login on initial page load from persisted local session
  useEffect(() => {
    const restoreSession = async () => {
      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const session = JSON.parse(saved) as UserSession;
          if (session && session.username) {
            // Validate against Firestore
            try {
              const userRef = doc(db, 'users', session.username);
              const snap = await getDoc(userRef);
              if (snap.exists()) {
                const data = snap.data();
                setUser({
                  uid: data.uid || ('user_' + session.username),
                  username: data.username || session.username,
                  displayName: data.displayName || session.displayName || session.username,
                  createdAt: data.createdAt || session.createdAt,
                });
                // Update last active
                updateDoc(userRef, { lastLoginAt: new Date().toISOString() }).catch(() => {});
              } else {
                // If user was deleted from DB, clear local session
                localStorage.removeItem(STORAGE_KEY);
                setUser(null);
              }
            } catch (networkErr) {
              // If offline or network issue, maintain local session
              console.warn('Network issue during session check, falling back to local session', networkErr);
              setUser(session);
            }
          }
        }
      } catch (e) {
        console.error('Session restore error:', e);
        localStorage.removeItem(STORAGE_KEY);
      } finally {
        setLoading(false);
      }
    };

    restoreSession();
  }, []);

  const login = async (id: string, pass: string) => {
    setAuthError(null);
    const cleanedId = id.trim().toLowerCase();

    if (!cleanedId) {
      const msg = '아이디를 입력해주세요.';
      setAuthError(msg);
      throw new Error(msg);
    }
    if (!pass) {
      const msg = '비밀번호를 입력해주세요.';
      setAuthError(msg);
      throw new Error(msg);
    }

    try {
      const userRef = doc(db, 'users', cleanedId);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        const msg = '존재하지 않는 아이디입니다. 아이디를 확인하거나 회원가입 해주세요.';
        setAuthError(msg);
        throw new Error(msg);
      }

      const userData = userSnap.data();
      const enteredHash = await hashPassword(pass);

      if (userData.passwordHash !== enteredHash) {
        const msg = '비밀번호가 일치하지 않습니다.';
        setAuthError(msg);
        throw new Error(msg);
      }

      const session: UserSession = {
        uid: userData.uid || ('user_' + cleanedId),
        username: userData.username || cleanedId,
        displayName: userData.displayName || cleanedId,
        createdAt: userData.createdAt || new Date().toISOString(),
      };

      // Save to localStorage for Auto-Login
      localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
      setUser(session);

      // Update last login
      updateDoc(userRef, { lastLoginAt: new Date().toISOString() }).catch(() => {});
    } catch (err: any) {
      const msg = err.message || '로그인 처리 중 오류가 발생했습니다.';
      setAuthError(msg);
      throw err;
    }
  };

  const register = async (id: string, pass: string, name?: string) => {
    setAuthError(null);
    const cleanedId = id.trim().toLowerCase();

    if (!cleanedId) {
      const msg = '아이디를 입력해주세요.';
      setAuthError(msg);
      throw new Error(msg);
    }

    if (cleanedId.length < 3) {
      const msg = '아이디는 최소 3자 이상이어야 합니다.';
      setAuthError(msg);
      throw new Error(msg);
    }

    if (!/^[a-z0-9_.-]+$/.test(cleanedId)) {
      const msg = '아이디는 영문, 숫자, 기호(_ . -)만 사용할 수 있습니다.';
      setAuthError(msg);
      throw new Error(msg);
    }

    if (!pass) {
      const msg = '비밀번호를 입력해주세요.';
      setAuthError(msg);
      throw new Error(msg);
    }

    if (pass.length < 4) {
      const msg = '비밀번호는 최소 4자 이상이어야 합니다.';
      setAuthError(msg);
      throw new Error(msg);
    }

    try {
      const userRef = doc(db, 'users', cleanedId);
      const existingUserSnap = await getDoc(userRef);

      if (existingUserSnap.exists()) {
        const msg = '이미 사용 중인 아이디입니다. 다른 아이디를 입력해주세요.';
        setAuthError(msg);
        throw new Error(msg);
      }

      const now = new Date().toISOString();
      const passwordHash = await hashPassword(pass);
      const resolvedDisplayName = name?.trim() ? name.trim() : cleanedId;

      const newUser: UserSession = {
        uid: 'user_' + cleanedId,
        username: cleanedId,
        displayName: resolvedDisplayName,
        createdAt: now,
      };

      await setDoc(userRef, {
        ...newUser,
        passwordHash,
        lastLoginAt: now,
      });

      // Save to localStorage for Auto-Login
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newUser));
      setUser(newUser);
    } catch (err: any) {
      const msg = err.message || '회원가입 처리 중 오류가 발생했습니다.';
      setAuthError(msg);
      throw err;
    }
  };

  const logout = () => {
    setAuthError(null);
    localStorage.removeItem(STORAGE_KEY);
    setUser(null);
  };

  const clearError = () => {
    setAuthError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        username: user?.username || '',
        displayName: user?.displayName || user?.username || '',
        loading,
        authError,
        login,
        register,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
