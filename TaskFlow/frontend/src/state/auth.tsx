import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";

export type User = { id: string; name: string; email: string };

type AuthState = {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
};

const AuthCtx = createContext<AuthState | null>(null);

const LS_KEY = "taskflow_auth";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { token: string; user: User };
        setToken(parsed.token);
        setUser(parsed.user);
      }
    } finally {
      setHydrated(true);
    }
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      token,
      user,
      setAuth: (t, u) => {
        setToken(t);
        setUser(u);
        localStorage.setItem(LS_KEY, JSON.stringify({ token: t, user: u }));
      },
      logout: () => {
        setToken(null);
        setUser(null);
        localStorage.removeItem(LS_KEY);
      }
    }),
    [token, user]
  );

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-surface-muted">
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-border bg-surface-elevated px-8 py-10 shadow-soft">
          <span
            className="h-8 w-8 animate-spin rounded-full border-2 border-fg-subtle border-t-accent"
            aria-hidden
          />
          <p className="text-sm text-fg-muted">Restoring your session…</p>
        </div>
      </div>
    );
  }

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const v = useContext(AuthCtx);
  if (!v) throw new Error("AuthProvider missing");
  return v;
}

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const loc = useLocation();
  if (!token) return <Navigate to="/login" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

