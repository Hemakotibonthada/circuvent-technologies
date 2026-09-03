"use client";

/**
 * Auth gate + thin chrome for a single admin product on its own hostname.
 *
 * icm.circuvent.com and insights.circuvent.com mount onto /admin/icm and
 * /admin/insights. They share the shop admin's sessionStorage bearer and SSO
 * flow — extracting them into separate apps would duplicate that, then drift.
 *
 * The full /admin console keeps every Reliability tab; these pages are the
 * same panels with less chrome, so a 3am incident page does not open under
 * Orders & Inventory.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { motion } from "framer-motion";
import { KeyRound, LogIn, LogOut, ShieldCheck } from "lucide-react";
import { usePasskey, usePasskeySupport } from "@/lib/usePasskey";
import AdminPassword, { ForcePasswordChange } from "./AdminPassword";
import Admin2fa from "./Admin2fa";
import AdminPasskeys from "./AdminPasskeys";

const SSO_ERRORS: Record<string, string> = {
  access_denied: "Sign-in was cancelled.",
  missing_code: "Single sign-on did not return a code. Please try again.",
  state_mismatch: "That sign-in link was already used or expired. Please try again.",
  token_exchange: "Could not finish single sign-on. Please try again.",
  not_staff: "That Circuvent account is not on the staff roster for this console.",
};

/** Areas a role may open. Mirrors ROLE_AREAS in page.tsx for these two products. */
const PRODUCT_ROLES: Record<string, string[]> = {
  icm: ["superadmin", "manager", "support"],
  insights: ["superadmin", "manager"],
};

export interface AdminProductShellProps {
  product: "icm" | "insights";
  title: string;
  subtitle: string;
  children: ReactNode;
}

export default function AdminProductShell({
  product,
  title,
  subtitle,
  children,
}: AdminProductShellProps) {
  const [checking, setChecking] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [twoFA, setTwoFA] = useState(false);
  const [twoFAMethod, setTwoFAMethod] = useState<"email" | "totp">("email");
  const [otp, setOtp] = useState("");
  const [role, setRole] = useState("superadmin");
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [mustChangePw, setMustChangePw] = useState(false);

  const passkey = usePasskey("/api/admin/passkey");
  const passkeySupported = usePasskeySupport();

  const allowed = PRODUCT_ROLES[product]?.includes(role) ?? false;

  useEffect(() => {
    const url = new URL(window.location.href);
    const handoff = url.searchParams.get("sso");
    const ssoError = url.searchParams.get("sso_error");

    const scrub = () => {
      url.searchParams.delete("sso");
      url.searchParams.delete("sso_error");
      window.history.replaceState({}, "", url.pathname + url.search + url.hash);
    };

    if (ssoError) {
      setAuthError(SSO_ERRORS[ssoError] ?? "Single sign-on did not complete. Please try again.");
      scrub();
    }

    if (handoff) {
      fetch("/api/admin/auth/sso/exchange", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ code: handoff }),
      })
        .then(async (res) => {
          const d = await res.json().catch(() => ({}));
          if (res.ok && d.token) {
            sessionStorage.setItem("admin-token", d.token);
            setRole(d.role || "superadmin");
            setAdminName(d.name || "");
            setAdminEmail(d.email || "");
            setMustChangePw(!!d.mustChangePassword);
            setAuthenticated(true);
          } else {
            setAuthError(d.error || "Single sign-on did not complete. Please try again.");
          }
        })
        .catch(() => setAuthError("Single sign-on did not complete. Please try again."))
        .finally(() => {
          scrub();
          setChecking(false);
        });
      return;
    }

    const token = sessionStorage.getItem("admin-token");
    if (token) {
      fetch("/api/admin/auth", { headers: { "x-admin-token": token } })
        .then(async (res) => {
          if (res.ok) {
            const d = await res.json();
            setRole(d.role || "superadmin");
            setAdminName(d.name || "");
            setAdminEmail(d.email || "");
            setMustChangePw(!!d.mustChangePassword);
            setAuthenticated(true);
          }
          setChecking(false);
        })
        .catch(() => setChecking(false));
    } else {
      setChecking(false);
    }
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch("/api/admin/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const d = await res.json();
        if (d.twoFactor) {
          setTwoFA(true);
          setTwoFAMethod(d.method === "totp" ? "totp" : "email");
          setOtp("");
          return;
        }
        sessionStorage.setItem("admin-token", d.token);
        setRole(d.role || "superadmin");
        setAdminName(d.name || "");
        setAdminEmail(d.email || email.trim().toLowerCase());
        setMustChangePw(!!d.mustChangePassword);
        setAuthenticated(true);
      } else {
        const d = await res.json().catch(() => ({}));
        setAuthError(d.error || "Invalid email or password");
      }
    } catch {
      setAuthError("Connection error");
    }
  };

  const loginWithPasskey = async () => {
    const addr = email.trim();
    if (!addr) {
      setAuthError("Enter your email first, then use your passkey.");
      return;
    }
    setAuthError("");
    const r = await passkey.signIn(addr);
    if (!r.ok) {
      if (r.error) setAuthError(r.error);
      return;
    }
    const d = r.data as { token?: string; admin?: { email: string; name: string; role: string } };
    if (!d?.token || !d.admin) {
      setAuthError("Could not complete that sign-in.");
      return;
    }
    sessionStorage.setItem("admin-token", d.token);
    setRole(d.admin.role || "superadmin");
    setAdminName(d.admin.name || "");
    setAdminEmail(d.admin.email);
    setAuthenticated(true);
  };

  const verify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError("");
    try {
      const res = await fetch("/api/admin/auth/verify-2fa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp: otp.trim() }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d.ok) {
        sessionStorage.setItem("admin-token", d.token);
        setRole(d.role || "superadmin");
        setAdminName(d.name || "");
        setAdminEmail(d.email || email.trim().toLowerCase());
        setMustChangePw(!!d.mustChangePassword);
        setAuthenticated(true);
        setTwoFA(false);
      } else {
        setAuthError(d.error || "Invalid code");
      }
    } catch {
      setAuthError("Connection error");
    }
  };

  const handleLogout = useCallback(() => {
    sessionStorage.removeItem("admin-token");
    setAuthenticated(false);
    setAdminEmail("");
    setAdminName("");
    setRole("superadmin");
    setMustChangePw(false);
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div
          className="animate-spin w-8 h-8 border-2 border-t-transparent rounded-full"
          style={{ borderColor: "var(--accent-cyan)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm rounded-2xl p-8"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-primary)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div className="flex items-center justify-center mb-6">
            <img src="/logo-mark-160.png" alt="Circuvent" width={52} height={52} />
          </div>
          <h1 className="text-xl font-bold text-center mb-1" style={{ color: "var(--text-primary)" }}>
            {title}
          </h1>
          <p className="text-sm text-center mb-6" style={{ color: "var(--text-tertiary)" }}>
            {twoFA
              ? twoFAMethod === "totp"
                ? "Enter the 6-digit code from your authenticator app"
                : "Enter the 6-digit code we emailed you"
              : "Sign in with your staff email and password"}
          </p>
          {twoFA ? (
            <form onSubmit={verify2fa} className="space-y-4">
              <input
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                autoFocus
                className="w-full px-4 py-3 rounded-xl text-center text-2xl font-bold tracking-[0.5em] outline-none transition-all"
                style={{
                  background: "var(--bg-glass)",
                  border: "1px solid var(--border-primary)",
                  color: "var(--text-primary)",
                }}
              />
              {authError && <p className="text-sm text-red-400 text-center">{authError}</p>}
              <button
                type="submit"
                disabled={otp.length < 6}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02] disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
              >
                <LogIn className="w-4 h-4" /> Verify &amp; sign in
              </button>
              <button
                type="button"
                onClick={() => {
                  setTwoFA(false);
                  setOtp("");
                  setAuthError("");
                }}
                className="w-full text-center text-xs"
                style={{ color: "var(--text-tertiary)" }}
              >
                Back to sign in
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Email"
                autoFocus
                autoComplete="username"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: "var(--bg-glass)",
                  border: "1px solid var(--border-primary)",
                  color: "var(--text-primary)",
                }}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                autoComplete="current-password"
                className="w-full px-4 py-3 rounded-xl text-sm outline-none transition-all"
                style={{
                  background: "var(--bg-glass)",
                  border: "1px solid var(--border-primary)",
                  color: "var(--text-primary)",
                }}
              />
              {authError && <p className="text-sm text-red-400 text-center">{authError}</p>}
              <button
                type="submit"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium text-white transition-all hover:scale-[1.02]"
                style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
              >
                <LogIn className="w-4 h-4" /> Sign In
              </button>
              {passkeySupported && (
                <>
                  <div className="flex items-center gap-3 pt-1">
                    <span className="h-px flex-1" style={{ background: "var(--border-primary)" }} />
                    <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                      or
                    </span>
                    <span className="h-px flex-1" style={{ background: "var(--border-primary)" }} />
                  </div>
                  <button
                    type="button"
                    onClick={loginWithPasskey}
                    disabled={passkey.busy}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all disabled:opacity-60"
                    style={{
                      background: "var(--bg-glass)",
                      border: "1px solid var(--border-primary)",
                      color: "var(--text-primary)",
                    }}
                  >
                    <KeyRound className="w-4 h-4" />
                    {passkey.busy ? "Waiting for your device…" : "Use a passkey"}
                  </button>
                </>
              )}
              {!passkeySupported && (
                <div className="flex items-center gap-3 pt-1">
                  <span className="h-px flex-1" style={{ background: "var(--border-primary)" }} />
                  <span className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                    or
                  </span>
                  <span className="h-px flex-1" style={{ background: "var(--border-primary)" }} />
                </div>
              )}
              <a
                href="/api/admin/auth/sso/start"
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-medium transition-all"
                style={{
                  background: "var(--bg-glass)",
                  border: "1px solid var(--border-primary)",
                  color: "var(--text-primary)",
                }}
              >
                <ShieldCheck className="w-4 h-4" />
                Sign in with Circuvent
              </a>
            </form>
          )}
        </motion.div>
      </div>
    );
  }

  if (mustChangePw) {
    return (
      <ForcePasswordChange
        email={adminEmail}
        name={adminName}
        onDone={() => setMustChangePw(false)}
        onSignOut={handleLogout}
      />
    );
  }

  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div
          className="max-w-md rounded-2xl p-8 text-center"
          style={{
            background: "var(--bg-surface)",
            border: "1px solid var(--border-primary)",
          }}
        >
          <h1 className="text-lg font-bold mb-2" style={{ color: "var(--text-primary)" }}>
            No access to {title}
          </h1>
          <p className="text-sm mb-6" style={{ color: "var(--text-tertiary)" }}>
            Signed in as {adminEmail || adminName || "staff"}, but this product is not on your role.
          </p>
          <div className="flex flex-col gap-2">
            <a
              href="https://circuvent.com/admin"
              className="rounded-xl px-4 py-2.5 text-sm font-medium text-white"
              style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
            >
              Open full Admin Dashboard
            </a>
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl px-4 py-2.5 text-sm"
              style={{ color: "var(--text-tertiary)" }}
            >
              Sign out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <div
        className="sticky top-0 z-30 backdrop-blur-xl"
        style={{
          background: "var(--bg-overlay)",
          borderBottom: "1px solid var(--border-primary)",
        }}
      >
        <div className="cv-app-width px-3 sm:px-5 lg:px-6">
          <div className="flex items-center gap-2.5 py-2">
            <img
              src="/logo-mark-160.png"
              alt="Circuvent"
              width={30}
              height={30}
              className="shrink-0 rounded-lg"
            />
            <div className="min-w-0">
              <h1
                className="truncate text-[15px] font-bold leading-tight sm:text-[17px]"
                style={{ color: "var(--text-primary)" }}
              >
                {title}
              </h1>
              <p
                className="hidden truncate text-[11px] leading-tight lg:block"
                style={{ color: "var(--text-tertiary)" }}
              >
                {subtitle}
              </p>
            </div>

            <div className="ml-auto flex min-w-0 items-center gap-1.5">
              <div className="hidden items-center gap-1 md:flex">
                <Admin2fa />
                <AdminPasskeys />
                <AdminPassword email={adminEmail} name={adminName} />
              </div>
              {/*
                Absolute product hosts, not path links. On icm.circuvent.com a
                relative /admin/insights would hit pages:[] and bounce to the
                main site; the sibling hostname is the address people bookmark.
              */}
              <a
                href={product === "icm" ? "https://insights.circuvent.com/" : "https://icm.circuvent.com/"}
                className="hidden sm:inline-flex rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: "var(--bg-glass)",
                  border: "1px solid var(--border-primary)",
                  color: "var(--text-secondary)",
                }}
              >
                {product === "icm" ? "App Insights" : "Incidents"}
              </a>
              <a
                href="https://circuvent.com/admin"
                className="hidden sm:inline-flex rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors"
                style={{
                  background: "var(--bg-glass)",
                  border: "1px solid var(--border-primary)",
                  color: "var(--text-secondary)",
                }}
              >
                Full admin
              </a>
              <span
                className="hidden truncate text-xs lg:inline max-w-[160px]"
                style={{ color: "var(--text-tertiary)" }}
                title={adminEmail}
              >
                {adminName || adminEmail}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium"
                style={{
                  background: "var(--bg-glass)",
                  border: "1px solid var(--border-primary)",
                  color: "var(--text-secondary)",
                }}
              >
                <LogOut className="w-3.5 h-3.5" />
                Logout
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="cv-app-width px-3 sm:px-5 lg:px-6 py-4">{children}</div>
    </div>
  );
}
