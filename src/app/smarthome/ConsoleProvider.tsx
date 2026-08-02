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
  setRefreshToken,
  type ControlUser,
} from "@/lib/control-plane";
import { useControlLive, type DeviceUpdate, type LiveStatus } from "@/lib/control-plane-live";

interface ConsoleContextValue {
  user: ControlUser | null;
  ready: boolean;
  liveStatus: LiveStatus;
  notifyPermission: NotificationPermission | "unsupported";
  login: (email: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  register: (name: string, email: string, password: string) => Promise<{ ok: boolean; pending?: boolean; otpSent?: boolean; error?: string }>;
  verifyOtp: (email: string, otp: string) => Promise<{ ok: boolean; error?: string }>;
  resendOtp: (email: string) => Promise<{ ok: boolean; otpSent?: boolean; error?: string }>;
  /** Sends a reset code. Always reports success — the answer is not an account oracle. */
  forgotPassword: (email: string) => Promise<{ ok: boolean; message?: string }>;
  /** Redeems a reset code, sets the new password and signs in. */
  resetPassword: (email: string, otp: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  subscribe: (fn: (u: DeviceUpdate) => void) => () => void;
  enableNotifications: () => Promise<void>;
}

const ConsoleContext = createContext<ConsoleContextValue | null>(null);

/**
 * Where the storefront keeps its session (see components/shop/AccountProvider).
 * It stores an object, not a bare token, so the shape is read defensively —
 * this is a best-effort convenience and must never throw on the console's
 * critical path.
 */
const SHOP_ACCOUNT_KEY = "circuvent-account";

function readShopToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(SHOP_ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { token?: unknown };
    return typeof parsed?.token === "string" && parsed.token ? parsed.token : null;
  } catch {
    return null;
  }
}

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

  // Hydrate auth on mount.
  //
  // A customer who signed in on the shop has a storefront session but no
  // console token, because the two halves keep separate accounts. Before
  // showing a login form, offer that session to the backend and take a console
  // session in return. Failure is silent by design: the login form is the
  // fallback, and a control plane that is down must not block the page.
  //
  // All of this runs inside the async callback rather than the effect body so
  // the stored-user path and the exchange path share one place that flips
  // `ready`, and neither can skip the notification-permission read.
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const stored = getStoredUser();

      if (!stored) {
        const shopToken = readShopToken();
        if (shopToken) {
          try {
            const res = await fetch("/api/account/sso/console", {
              method: "POST",
              headers: { authorization: `Bearer ${shopToken}` },
            });
            const data = await res.json();
            if (res.ok && data?.token && data?.user) {
              setToken(data.token);
              setRefreshToken(data.refreshToken ?? null);
              setStoredUser(data.user);
              if (!cancelled) setUser(data.user);
            }
          } catch {
            /* fall through to the login form */
          }
        }
      } else if (!cancelled) {
        setUser(stored);
      }

      if (cancelled) return;
      if (typeof window !== "undefined" && "Notification" in window) {
        setNotifyPermission(Notification.permission);
      } else {
        setNotifyPermission("unsupported");
      }
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
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
      setRefreshToken(r.data.refreshToken ?? null);
      setStoredUser(r.data.user);
      setUser(r.data.user);
      return { ok: true };
    }
    return { ok: false, error: (r.data as { error?: string })?.error || "Invalid email or password" };
  }, []);

  const forgotPassword = useCallback(async (email: string) => {
    const r = await controlPlane.forgotPassword(email.trim().toLowerCase());
    // The endpoint answers the same way whether or not the account exists, so
    // there is nothing here worth branching on — surfacing a failure would
    // reintroduce exactly the signal the endpoint avoids giving.
    return { ok: true, message: r.data?.message };
  }, []);

  const resetPassword = useCallback(async (email: string, otp: string, newPassword: string) => {
    const r = await controlPlane.resetPassword(email.trim().toLowerCase(), otp.trim(), newPassword);
    if (r.ok && r.data?.token) {
      // The reset revoked every session and issued this token; storing it is
      // what signs the user in on this device.
      setToken(r.data.token);
      setRefreshToken(r.data.refreshToken ?? null);
      setStoredUser(r.data.user);
      setUser(r.data.user);
      return { ok: true };
    }
    return { ok: false, error: (r.data as { error?: string })?.error || "Could not reset your password." };
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const r = await controlPlane.register(name, email, password);
    if (r.ok && r.data?.pending) {
      return { ok: true, pending: true, otpSent: r.data.otpSent };
    }
    return { ok: false, error: (r.data as { error?: string })?.error || "Could not create account" };
  }, []);

  const verifyOtp = useCallback(async (email: string, otp: string) => {
    const r = await controlPlane.verifyOtp(email, otp);
    if (r.ok && r.data?.token) {
      setToken(r.data.token);
      setRefreshToken(r.data.refreshToken ?? null);
      setStoredUser(r.data.user);
      setUser(r.data.user);
      return { ok: true };
    }
    return { ok: false, error: (r.data as { error?: string })?.error || "Verification failed" };
  }, []);

  const resendOtp = useCallback(async (email: string) => {
    const r = await controlPlane.resendOtp(email);
    if (r.ok) return { ok: true, otpSent: r.data?.otpSent };
    return { ok: false, error: (r.data as { error?: string })?.error || "Could not resend code" };
  }, []);

  const logout = useCallback(() => {
    setToken(null);
    setRefreshToken(null);
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
    () => ({ user, ready, liveStatus, notifyPermission, login, register, verifyOtp, resendOtp, forgotPassword, resetPassword, logout, subscribe, enableNotifications }),
    [user, ready, liveStatus, notifyPermission, login, register, verifyOtp, resendOtp, forgotPassword, resetPassword, logout, subscribe, enableNotifications]
  );

  return <ConsoleContext.Provider value={value}>{children}</ConsoleContext.Provider>;
}

export function useConsole(): ConsoleContextValue {
  const ctx = useContext(ConsoleContext);
  if (!ctx) throw new Error("useConsole must be used within ConsoleProvider");
  return ctx;
}

export { getToken };
