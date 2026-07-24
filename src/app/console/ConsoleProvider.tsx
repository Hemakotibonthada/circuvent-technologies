"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  controlPlane,
  getStoredUser,
  getToken,
  setStoredUser,
  setToken,
  type ControlUser,
} from "@/lib/control-plane";
import { useControlLive, type DeviceUpdate, type LiveStatus } from "@/lib/control-plane-live";

interface ConsoleContextValue {
  user: ControlUser | null;
  ready: boolean;
  liveStatus: LiveStatus;
  notifyPermission: NotificationPermission | "unsupported";
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  subscribe: (fn: (u: DeviceUpdate) => void) => () => void;
  enableNotifications: () => Promise<void>;
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

interface Flags {
  dryRun?: boolean;
  overflow?: boolean;
  sos?: boolean;
  online?: boolean;
}

export function ConsoleProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<ControlUser | null>(null);
  const [ready, setReady] = useState(false);
  const [notifyPermission, setNotifyPermission] = useState<NotificationPermission | "unsupported">("default");

  const subscribers = useRef(new Set<(u: DeviceUpdate) => void>());
  const lastFlags = useRef(new Map<string, Flags>());

  // Hydrate auth from storage on mount.
  useEffect(() => {
    setUser(getStoredUser());
    setReady(true);
    if (typeof window !== "undefined" && "Notification" in window) {
      setNotifyPermission(Notification.permission);
    } else {
      setNotifyPermission("unsupported");
    }
  }, []);

  const notify = useCallback((title: string, body: string) => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    try {
      new Notification(title, { body, icon: "/logo-mark.png" });
    } catch {
      /* some browsers require a service worker for Notification(); ignore */
    }
  }, []);

  // Foreground alerts: edge-detect the same events the server pushes to mobile.
  const handleUpdate = useCallback(
    (u: DeviceUpdate) => {
      subscribers.current.forEach((fn) => {
        try {
          fn(u);
        } catch {
          /* subscriber errors must not break the stream */
        }
      });

      const prev = lastFlags.current.get(u.deviceId) ?? {};
      const next: Flags = { ...prev };
      if (u.kind === "state") {
        const p = u.payload as Flags;
        if (!prev.dryRun && p.dryRun) notify("AquaGuard alert", "Dry-run detected — pump stopped.");
        if (!prev.overflow && p.overflow) notify("AquaGuard alert", "Tank overflow — pump stopped.");
        if (!prev.sos && p.sos) notify("SOS alert", "SOS triggered!");
        next.dryRun = !!p.dryRun;
        next.overflow = !!p.overflow;
        next.sos = !!p.sos;
      } else if (u.kind === "status") {
        const online = !!(u.payload as { online?: boolean }).online;
        if (prev.online === true && !online) notify("Device offline", "A device went offline.");
        next.online = online;
      }
      lastFlags.current.set(u.deviceId, next);
    },
    [notify]
  );

  const liveStatus = useControlLive(handleUpdate);

  const login = useCallback(async (email: string, password: string) => {
    const r = await controlPlane.login(email, password);
    if (r.ok && r.data?.token) {
      setToken(r.data.token);
      setStoredUser(r.data.user);
      setUser(r.data.user);
      return { ok: true };
    }
    return { ok: false, error: (r.data as { error?: string })?.error || "Invalid email or password" };
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const r = await controlPlane.register(name, email, password);
    if (r.ok && r.data?.token) {
      setToken(r.data.token);
      setStoredUser(r.data.user);
      setUser(r.data.user);
      return { ok: true };
    }
    return { ok: false, error: (r.data as { error?: string })?.error || "Could not create account" };
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setStoredUser(null);
    setUser(null);
    lastFlags.current.clear();
  }, []);

  const subscribe = useCallback((fn: (u: DeviceUpdate) => void) => {
    subscribers.current.add(fn);
    return () => {
      subscribers.current.delete(fn);
    };
  }, []);

  const enableNotifications = useCallback(async () => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    try {
      const perm = await Notification.requestPermission();
      setNotifyPermission(perm);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<ConsoleContextValue>(
    () => ({ user, ready, liveStatus, notifyPermission, login, register, logout, subscribe, enableNotifications }),
    [user, ready, liveStatus, notifyPermission, login, register, logout, subscribe, enableNotifications]
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsole(): ConsoleContextValue {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error("useConsole must be used within ConsoleProvider");
  return ctx;
}

export { getToken };
