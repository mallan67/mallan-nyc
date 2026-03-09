'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';

export type AuthState = {
  authenticated: boolean;
  principalType?: 'agent' | 'lead';
  userName?: string;
  role?: string;
  checked: boolean;
};

type AuthContextValue = AuthState & {
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue>({
  authenticated: false,
  checked: false,
  refresh: async () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * AuthProvider — fetches /api/auth/me ONCE at app mount.
 * Lives in root layout so Header/Footer/pages share the same auth state
 * without re-fetching on every navigation.
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ authenticated: false, checked: false });

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated) {
        setAuth({
          authenticated: true,
          principalType: data.principalType,
          userName: data.user?.name?.split(' ')[0],
          role: data.role,
          checked: true,
        });
      } else {
        setAuth({ authenticated: false, checked: true });
      }
    } catch {
      setAuth({ authenticated: false, checked: true });
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setAuth({ authenticated: false, checked: true });
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ ...auth, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
