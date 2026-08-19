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
  /**
   * Set when the customer has a profile picture; also its cache key.
   *
   * Kept here rather than fetched by each consumer so the header can show the
   * picture without asking, and so a header that asked would not fire a 404 on
   * every page for the majority who have not set one.
   */
  avatarUpdatedAt?: string;
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
  ) => Promise<{ ok: boolean; pending?: boolean; email?: string; message?: string; errors?: Record<string, string> }>;
  verifyOtp: (email: string, otp: string) => Promise<{ ok: boolean; message?: string }>;
  logout: () => void;
  refreshWallet: () => Promise<void>;
  /** Re-reads the profile, so a new picture shows in the header immediately. */
  refreshAccount: () => Promise<void>;
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
      // Capture a referral code from the URL (?ref=CODE) for use at sign-up.
      const ref = new URLSearchParams(window.location.search).get("ref");
      if (ref) localStorage.setItem("circuvent-ref", ref.trim().toUpperCase().slice(0, 12));
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

  /**
   * Pulls the fields the header shows but the sign-in response does not carry.
   *
   * The stored session holds only the address and name, which is all it needed
   * when every avatar was generated initials. It is written back to
   * localStorage so the picture is there on the next page load rather than
   * appearing a moment after each navigation.
   */
  const refreshAccount = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch("/api/account/profile", { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const d = await res.json();
      const fresh = d.account as { name?: string; avatarUpdatedAt?: string } | undefined;
      if (!fresh) return;
      setAccount((prev) => {
        if (!prev) return prev;
        const next: Account = {
          ...prev,
          name: fresh.name || prev.name,
          avatarUpdatedAt: fresh.avatarUpdatedAt,
        };
        try {
          localStorage.setItem(KEY, JSON.stringify({ account: next, token }));
        } catch {
          /* ignore */
        }
        return next;
      });
    } catch {
      /* ignore */
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      refreshWallet();
      refreshAccount();
    }
  }, [token, refreshWallet, refreshAccount]);

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
        let ref: string | null = null;
        try {
          ref = localStorage.getItem("circuvent-ref");
        } catch {
          /* ignore */
        }
        const res = await fetch("/api/account/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password, ref: ref || undefined }),
        });
        const d = await res.json();
        if (d.success) {
          return { ok: true, pending: true, email: d.email };
        }
        return { ok: false, message: d.message, errors: d.errors };
      } catch {
        return { ok: false, message: "Network error. Please try again." };
      }
    },
    []
  );

  const verifyOtp = useCallback<AccountContextValue["verifyOtp"]>(
    async (email, otp) => {
      try {
        const res = await fetch("/api/account/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, otp }),
        });
        const d = await res.json();
        if (d.success) {
          persist(d.account, d.token);
          return { ok: true };
        }
        return { ok: false, message: d.message || "Verification failed." };
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
      value={{ account, token, wallet, ready, login, register, verifyOtp, logout, refreshWallet, refreshAccount, authHeaders }}
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
