import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { api, getToken, setToken, setRefreshToken, storeSession } from "./api";
import { registerForPush } from "./push";

interface Account {
  email: string;
  name: string;
}
interface AuthValue {
  account: Account | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ ok: boolean; pending?: boolean; otpSent?: boolean; message?: string }>;
  verifyOtp: (email: string, otp: string) => Promise<{ ok: boolean; message?: string }>;
  resendOtp: (email: string) => Promise<{ ok: boolean; otpSent?: boolean; message?: string }>;
  logout: () => void;
}

const Ctx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const t = await getToken();
      if (t) {
        const r = await api.devices(); // token still valid if this succeeds (200)
        if (r.ok) setAccount({ email: "", name: "" });
        else if (r.status === 401) { await setToken(null); await setRefreshToken(null); }
        else setAccount({ email: "", name: "" }); // network hiccup: stay signed in
      }
      setReady(true);
    })();
  }, []);

  const login: AuthValue["login"] = async (email, password) => {
    const r = await api.login(email, password);
    if (r.ok && r.data?.token) {
      await storeSession(r.data);
      setAccount({ email: r.data.user.email, name: r.data.user.name });
      registerPushToken();
      return { ok: true };
    }
    return { ok: false, message: (r.data as any)?.error || "Sign in failed." };
  };

  const register: AuthValue["register"] = async (name, email, password) => {
    const r = await api.register(name, email, password);
    if (r.ok && r.data?.pending) {
      return { ok: true, pending: true, otpSent: r.data.otpSent };
    }
    return { ok: false, message: (r.data as any)?.error || "Sign up failed." };
  };

  const verifyOtp: AuthValue["verifyOtp"] = async (email, otp) => {
    const r = await api.verifyOtp(email, otp);
    if (r.ok && r.data?.token) {
      await storeSession(r.data);
      setAccount({ email: r.data.user.email, name: r.data.user.name });
      registerPushToken();
      return { ok: true };
    }
    return { ok: false, message: (r.data as any)?.error || "Verification failed." };
  };

  const resendOtp: AuthValue["resendOtp"] = async (email) => {
    const r = await api.resendOtp(email);
    if (r.ok) return { ok: true, otpSent: r.data?.otpSent };
    return { ok: false, message: (r.data as any)?.error || "Could not resend code." };
  };

  const logout = () => {
    setToken(null);
    setRefreshToken(null);
    setAccount(null);
  };

  return <Ctx.Provider value={{ account, ready, login, register, verifyOtp, resendOtp, logout }}>{children}</Ctx.Provider>;
}

function registerPushToken() {
  void (async () => {
    try {
      const token = await registerForPush();
      if (token) await api.registerPushToken(token, Platform.OS);
    } catch {
      // Push registration is best-effort; auth should not depend on it.
    }
  })();
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth outside provider");
  return c;
}
