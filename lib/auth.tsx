"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { api, clearToken, setToken, ApiError } from "@/lib/api";

export type AuthUser = {
  id: string;
  email: string;
  name: string;
  phone?: string | null;
  role: { id: string; name: string } | null;
  advertiser_id: string | null;
  permissions: string[];
};

type AuthContextValue = {
  user: AuthUser | null;
  permissions: string[];
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  hasPermission: (code: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const res = await api<{ user: AuthUser }>("/auth/me");
      setUser(res.user);
    } catch (err) {
      if (err instanceof ApiError && err.code === "UNAUTHORIZED") {
        clearToken();
      }
      setUser(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api<{ accessToken: string; user: AuthUser }>(
      "/auth/login",
      { method: "POST", json: { email, password }, skipAuth: true }
    );
    setToken(res.accessToken);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch {
      /* abaikan */
    } finally {
      clearToken();
      setUser(null);
    }
  }, []);

  const permissions = user?.permissions ?? [];

  const hasPermission = useCallback(
    (code: string) => permissions.includes(code),
    [permissions]
  );

  const value = useMemo(
    () => ({
      user,
      permissions,
      loading,
      login,
      logout,
      refresh,
      hasPermission,
    }),
    [user, permissions, loading, login, logout, refresh, hasPermission]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth harus di dalam AuthProvider");
  return ctx;
}
