import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { User } from '@containly/shared';
import { api, setCsrfToken, setUnauthorizedHandler } from '../lib/api';

interface MeResponse {
  setupComplete: boolean;
  user: User | null;
  csrfToken: string | null;
}

interface AuthContextValue {
  ready: boolean;
  setupComplete: boolean;
  user: User | null;
  isAdmin: boolean;
  refresh: () => Promise<void>;
  applyAuth: (user: User, csrfToken: string) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<MeResponse>('/api/auth/me');
      setSetupComplete(me.setupComplete);
      setUser(me.user);
      setCsrfToken(me.csrfToken);
    } catch {
      setUser(null);
      setCsrfToken(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Session abgelaufen (401) → lokal ausloggen, Login erscheint automatisch.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      setCsrfToken(null);
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  const applyAuth = useCallback((u: User, csrf: string) => {
    setUser(u);
    setSetupComplete(true);
    setCsrfToken(csrf);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/api/auth/logout');
    } catch {
      /* auch bei Fehler lokal ausloggen */
    }
    setUser(null);
    setCsrfToken(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      ready,
      setupComplete,
      user,
      isAdmin: user?.role === 'admin',
      refresh,
      applyAuth,
      logout,
    }),
    [ready, setupComplete, user, refresh, applyAuth, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth muss innerhalb von AuthProvider verwendet werden');
  return ctx;
}
