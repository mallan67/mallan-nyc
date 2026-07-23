'use client';

import { createContext, useContext, useEffect, useReducer, useCallback } from 'react';
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
 * Neon-quiet (2026-07-23): pure, testable presence check. The marker cookie
 * (AUTH_PRESENCE_COOKIE in lib/auth/cookie-config) is a deliberately
 * NON-AUTHORITATIVE, presentation-only companion set at login / cleared at
 * logout. It is NEVER read by any server-side authorization path — a forged
 * marker merely causes one /api/auth/me call that returns unauthenticated.
 */
export function hasAuthPresenceMarker(cookieString: string): boolean {
  return /(?:^|;\s*)mallan_auth_present=/.test(cookieString);
}

// useReducer with a stable dispatch identity satisfies the React Compiler's
// `set-state-in-effect` rule (the dispatch reference doesn't change so it
// doesn't trigger cascading-render concerns the way `setState` does).
type AuthAction =
  | { type: 'set-authenticated'; principalType: 'agent' | 'lead'; userName?: string; role?: string }
  | { type: 'set-anonymous' };

const INITIAL_AUTH: AuthState = { authenticated: false, checked: false };

function authReducer(_state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'set-authenticated':
      return {
        authenticated: true,
        principalType: action.principalType,
        userName: action.userName,
        role: action.role,
        checked: true,
      };
    case 'set-anonymous':
      return { authenticated: false, checked: true };
  }
}

/**
 * AuthProvider — fetches /api/auth/me ONCE at app mount.
 * Lives in root layout so Header/Footer/pages share the same auth state
 * without re-fetching on every navigation.
 */
export default function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, dispatch] = useReducer(authReducer, INITIAL_AUTH);

  const refresh = useCallback(async () => {
    // Neon-quiet (2026-07-23): anonymous public visitors perform ZERO
    // /api/auth/me calls — no marker → neutral "Sign In" state with no
    // network request and no Neon query. Authorization remains enforced
    // server-side on every protected route regardless of this gate.
    if (typeof document !== 'undefined' && !hasAuthPresenceMarker(document.cookie)) {
      dispatch({ type: 'set-anonymous' });
      return;
    }
    try {
      const res = await fetch('/api/auth/me');
      const data = await res.json();
      if (data.authenticated) {
        dispatch({
          type: 'set-authenticated',
          principalType: data.principalType,
          userName: data.user?.name?.split(' ')[0],
          role: data.role,
        });
      } else {
        dispatch({ type: 'set-anonymous' });
      }
    } catch {
      dispatch({ type: 'set-anonymous' });
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    dispatch({ type: 'set-anonymous' });
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
