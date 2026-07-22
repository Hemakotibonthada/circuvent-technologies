"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";

export interface Account {
  email: string;
  name: string;
}

interface AccountContextValue {
  account: Account | null;
  token: string | null;
  wallet: number;
  ready: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  register: (
    name: string,
    email: string,
    password: string
  ) => Promise<{ ok: boolean; message?: string; errors?: Record<string, string> }>;
  logout: () => void;
  refreshWallet: () => Promise<void>;
  authHeaders: () => Record<string, string>;
}

const AccountContext = createContext<AccountContextValue | null>(null);
const KEY = "circuvent-account";

export function AccountProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [wallet, setWallet] = useState(0);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p?.account && p?.token) {
          setAccount(p.account);
          setToken(p.token);
        }
      }
    } catch {
      /* ignore */
    }
    setReady(true);
  }, []);

  const persist = useCallback((acc: Account, tok: string) => {
    setAccount(acc);
    setToken(tok);
    try {
      localStorage.setItem(KEY, JSON.stringify({ account: acc, token: tok }));
    } catch {
      /* ignore */
    }
  }, []);

  const refreshWallet = useCallback(async () => {
    if (!token) {
      setWallet(0);
      return;
    }
    try {
      const res = await fetch("/api/wallet", { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) {
        const d = await res.json();
        setWallet(d.balance || 0);
      }
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    if (token) refreshWallet();
  }, [token, refreshWallet]);

  const login = useCallback<AccountContextValue["login"]>(
    async (email, password) => {
      try {
        const res = await fetch("/api/account/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        const d = await res.json();
        if (d.success) {
          persist(d.account, d.token);
          return { ok: true };
        }
        return { ok: false, message: d.message || "Sign in failed." };
      } catch {
        return { ok: false, message: "Network error. Please try again." };
      }
    },
    [persist]
  );

  const register = useCallback<AccountContextValue["register"]>(
    async (name, email, password) => {
      try {
        const res = await fetch("/api/account/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const d = await res.json();
        if (d.success) {
          persist(d.account, d.token);
          return { ok: true };
        }
        return { ok: false, message: d.message, errors: d.errors };
      } catch {
        return { ok: false, message: "Network error. Please try again." };
      }
    },
    [persist]
  );

  const logout = useCallback(() => {
    setAccount(null);
    setToken(null);
    setWallet(0);
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const authHeaders = useCallback(
    (): Record<string, string> => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );

  return (
    <AccountContext.Provider
      value={{ account, token, wallet, ready, login, register, logout, refreshWallet, authHeaders }}
    >
      {children}
    </AccountContext.Provider>
  );
}

export function useAccount() {
  const ctx = useContext(AccountContext);
  if (!ctx) throw new Error("useAccount must be used within AccountProvider");
  return ctx;
}
