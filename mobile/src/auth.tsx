import React, { createContext, useContext, useEffect, useState } from "react";
import { Platform } from "react-native";
import { api, getToken, setToken } from "./api";
import { registerForPush } from "./push";

interface Account {
  email: string;
  name: string;
}
interface AuthValue {
  account: Account | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ ok: boolean; message?: string }>;
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
        else if (r.status === 401) await setToken(null);
        else setAccount({ email: "", name: "" }); // network hiccup: stay signed in
      }
      setReady(true);
    })();
  }, []);

  const login: AuthValue["login"] = async (email, password) => {
    const r = await api.login(email, password);
    if (r.ok && r.data?.token) {
      await setToken(r.data.token);
      setAccount({ email: r.data.user.email, name: r.data.user.name });
      registerPushToken();
      return { ok: true };
    }
    return { ok: false, message: (r.data as any)?.error || "Sign in failed." };
  };

  const register: AuthValue["register"] = async (name, email, password) => {
    const r = await api.register(name, email, password);
    if (r.ok && r.data?.token) {
      await setToken(r.data.token);
      setAccount({ email: r.data.user.email, name: r.data.user.name });
      registerPushToken();
      return { ok: true };
    }
    return { ok: false, message: (r.data as any)?.error || "Sign up failed." };
  };

  const logout = () => {
    setToken(null);
    setAccount(null);
  };

  return <Ctx.Provider value={{ account, ready, login, register, logout }}>{children}</Ctx.Provider>;
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
