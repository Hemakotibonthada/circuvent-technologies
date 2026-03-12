"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api-client";

// ══════════════════════════════════════════════════════════════
// Auth Context — manages JWT tokens and user state
// ══════════════════════════════════════════════════════════════

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "ADMIN" | "SUPER_ADMIN" | "HR_MANAGER" | "MANAGER" | "PRODUCT_MANAGER" | "ENGINEER" | "DEVELOPER" | "TESTER" | "INTERN" | "MARKETING" | "CEO" | "CLIENT" | "CANDIDATE";
  avatarUrl?: string | null;
}

interface AuthCtx {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
  isAdmin: boolean;
  isHR: boolean;
  isEngineer: boolean;
  isClient: boolean;
  isCandidate: boolean;
}

const AuthContext = createContext<AuthCtx>({
  user: null,
  token: null,
  loading: true,
  login: async () => ({ success: false }),
  logout: () => {},
  isAdmin: false,
  isHR: false,
  isEngineer: false,
  isClient: false,
  isCandidate: false,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("circuvent_token");
    const storedUser = localStorage.getItem("circuvent_user");
    if (stored && storedUser) {
      setToken(stored);
      setUser(JSON.parse(storedUser));
    }
    setLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post<{ user: User; accessToken: string; refreshToken: string }>(
      "/auth/login",
      { email, password }
    );
    if (res.success && res.data) {
      setToken(res.data.accessToken);
      setUser(res.data.user);
      localStorage.setItem("circuvent_token", res.data.accessToken);
      localStorage.setItem("circuvent_refresh", res.data.refreshToken);
      localStorage.setItem("circuvent_user", JSON.stringify(res.data.user));
      return { success: true };
    }
    return { success: false, error: res.error || "Login failed" };
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setUser(null);
    localStorage.removeItem("circuvent_token");
    localStorage.removeItem("circuvent_refresh");
    localStorage.removeItem("circuvent_user");
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        logout,
        isAdmin: user?.role === "ADMIN" || user?.role === "SUPER_ADMIN",
        isHR: user?.role === "HR_MANAGER",
        isEngineer: user?.role === "ENGINEER" || user?.role === "DEVELOPER",
        isClient: user?.role === "CLIENT",
        isCandidate: user?.role === "CANDIDATE",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

// ══════════════════════════════════════════════════════════════
// useApi — data fetching hook with auth
// ══════════════════════════════════════════════════════════════

export function useApi<T>(endpoint: string | null) {
  const { token } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!endpoint) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<T>(endpoint, token || undefined);
      if (res.success) {
        setData(res.data || null);
      } else {
        setError(res.error || "Failed to fetch");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint, token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}
