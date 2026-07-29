"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  KeyRound,
  Loader2,
  X,
  Eye,
  EyeOff,
  Check,
  AlertTriangle,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import {
  checkPassword,
  MAX_PASSWORD_AGE_DAYS,
  MIN_PASSWORD_LENGTH,
  PASSWORD_HISTORY_DEPTH,
} from "@/lib/admin-password-policy";

/**
 * Staff password rotation UI.
 *
 * The policy module is pure and imported by both this component and the API
 * route, so the checklist the user sees is literally the same code that will
 * accept or reject the submission — the two cannot drift apart.
 */

function tok() {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

export interface PasswordStatus {
  changedAt: string | null;
  expiresAt: string | null;
  daysLeft: number;
  expired: boolean;
  expiringSoon: boolean;
  suggestion?: string;
}

const METER = [
  { color: "#ef4444", width: "20%" },
  { color: "#ef4444", width: "35%" },
  { color: "#f59e0b", width: "60%" },
  { color: "#84cc16", width: "80%" },
  { color: "#10b981", width: "100%" },
];

/** Header pill: shows rotation state and opens the change dialog. */
export default function AdminPassword({ email, name }: { email: string; name: string }) {
  const [status, setStatus] = useState<PasswordStatus | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = useCallback(() => {
    fetch("/api/admin/password", { headers: { "x-admin-token": tok() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStatus(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!status) return null;

  const tone = status.expired
    ? { color: "#ef4444", bg: "rgba(239,68,68,0.1)", label: "Password expired" }
    : status.expiringSoon
      ? { color: "#f59e0b", bg: "rgba(245,158,11,0.1)", label: `Expires in ${status.daysLeft}d` }
      : { color: "var(--text-tertiary)", bg: "transparent", label: "Password" };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title={
          status.expiresAt
            ? `Password expires ${new Date(status.expiresAt).toLocaleDateString()}`
            : "Change your password"
        }
        aria-label={`Change password. ${tone.label}`}
        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
        style={{
          borderColor: status.expired || status.expiringSoon ? tone.color : "var(--border-primary)",
          color: tone.color,
          background: tone.bg,
        }}
      >
        {status.expired || status.expiringSoon ? (
          <AlertTriangle className="h-3.5 w-3.5" />
        ) : (
          <KeyRound className="h-3.5 w-3.5" />
        )}
        {tone.label}
      </button>
      {open && (
        <ChangePasswordDialog
          email={email}
          name={name}
          suggestion={status.suggestion}
          onClose={() => {
            setOpen(false);
            refresh();
          }}
        />
      )}
    </>
  );
}

/**
 * Full-screen blocker shown when the password has aged out. Has no dismiss
 * path — the console is unusable until the credential is rotated, which is the
 * entire point of an expiry policy.
 */
export function ForcePasswordChange({
  email,
  name,
  onDone,
  onSignOut,
}: {
  email: string;
  name: string;
  onDone: () => void;
  onSignOut: () => void;
}) {
  const [suggestion, setSuggestion] = useState<string | undefined>();

  useEffect(() => {
    fetch("/api/admin/password", { headers: { "x-admin-token": tok() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setSuggestion(d.suggestion))
      .catch(() => {});
  }, []);

  return (
    <ChangePasswordDialog
      email={email}
      name={name}
      forced
      suggestion={suggestion}
      onClose={onDone}
      onSignOut={onSignOut}
    />
  );
}

function ChangePasswordDialog({
  email,
  name,
  forced,
  suggestion,
  onClose,
  onSignOut,
}: {
  email: string;
  name: string;
  forced?: boolean;
  suggestion?: string;
  onClose: () => void;
  onSignOut?: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [serverErrors, setServerErrors] = useState<string[]>([]);
  const [done, setDone] = useState(false);

  // Same function the server will run. Re-derived on every keystroke so the
  // checklist is always live rather than validated on submit.
  const check = useMemo(() => checkPassword(next, { email, name }), [next, email, name]);
  const mismatch = confirm.length > 0 && confirm !== next;
  const canSubmit =
    !busy && current.length > 0 && check.ok && confirm === next && next !== current;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setErr("");
    setServerErrors([]);
    try {
      const r = await fetch("/api/admin/password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify({ currentPassword: current, newPassword: next }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok && d.ok) {
        // The change invalidated every token for this account, including the
        // one in this tab. Swap in the replacement before anything else fires.
        try {
          sessionStorage.setItem("admin-token", d.token);
        } catch {
          /* storage disabled — the caller will be asked to sign in again */
        }
        setDone(true);
        setTimeout(onClose, 1400);
      } else {
        setErr(d.error || "Could not change the password.");
        setServerErrors(Array.isArray(d.errors) ? d.errors : []);
      }
    } catch {
      setErr("Connection error.");
    }
    setBusy(false);
  };

  const card: React.CSSProperties = {
    background: "var(--bg-surface)",
    border: "1px solid var(--border-primary)",
  };
  const field: React.CSSProperties = {
    background: "var(--bg-glass)",
    borderColor: "var(--border-primary)",
    color: "var(--text-primary)",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4"
      onClick={forced ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="pw-title"
    >
      <div
        className="my-auto w-full max-w-lg rounded-2xl p-5"
        style={card}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h3 id="pw-title" className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
              {forced ? "Update your password to continue" : "Change password"}
            </h3>
            <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
              {forced
                ? `Staff passwords must be changed every ${MAX_PASSWORD_AGE_DAYS} days. Yours is due now.`
                : `Rotated every ${MAX_PASSWORD_AGE_DAYS} days. Your last ${PASSWORD_HISTORY_DEPTH} passwords cannot be reused.`}
            </p>
          </div>
          {!forced && (
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1"
              style={{ color: "var(--text-tertiary)" }}
            >
              <X className="h-5 w-5" />
            </button>
          )}
        </div>

        {done ? (
          <div className="py-6 text-center">
            <ShieldCheck className="mx-auto mb-3 h-10 w-10" style={{ color: "#10b981" }} />
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
              Password updated
            </p>
            <p className="mt-1 text-sm" style={{ color: "var(--text-tertiary)" }}>
              All other sessions have been signed out.
            </p>
          </div>
        ) : (
          <form onSubmit={submit}>
            <Field
              id="pw-current"
              label="Current password"
              value={current}
              onChange={setCurrent}
              reveal={reveal}
              style={field}
              autoComplete="current-password"
            />

            <div className="mt-3">
              <div className="mb-1.5 flex items-center justify-between">
                <label
                  htmlFor="pw-new"
                  className="text-xs font-semibold"
                  style={{ color: "var(--text-secondary)" }}
                >
                  New password
                </label>
                <div className="flex items-center gap-2">
                  {suggestion && (
                    <button
                      type="button"
                      onClick={() => {
                        setNext(suggestion);
                        setConfirm(suggestion);
                        setReveal(true);
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium"
                      style={{ color: "#06b6d4" }}
                    >
                      <RefreshCw className="h-3 w-3" /> Use a strong one
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setReveal((v) => !v)}
                    className="inline-flex items-center gap-1 text-xs"
                    style={{ color: "var(--text-tertiary)" }}
                    aria-label={reveal ? "Hide passwords" : "Show passwords"}
                  >
                    {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {reveal ? "Hide" : "Show"}
                  </button>
                </div>
              </div>
              <input
                id="pw-new"
                type={reveal ? "text" : "password"}
                value={next}
                onChange={(e) => setNext(e.target.value)}
                autoComplete="new-password"
                aria-describedby="pw-rules"
                className="min-h-[44px] w-full rounded-xl border px-3 py-2.5 text-sm"
                style={field}
              />

              {next.length > 0 && (
                <>
                  <div
                    className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
                    style={{ background: "var(--border-primary)" }}
                    role="progressbar"
                    aria-valuenow={check.score}
                    aria-valuemin={0}
                    aria-valuemax={4}
                    aria-label="Password strength"
                  >
                    <div
                      className="h-full rounded-full transition-all duration-200"
                      style={{
                        width: METER[check.score].width,
                        background: METER[check.score].color,
                      }}
                    />
                  </div>
                  <p
                    className="mt-1 text-xs font-medium"
                    style={{ color: METER[check.score].color }}
                  >
                    {check.label}
                  </p>
                </>
              )}

              <ul id="pw-rules" className="mt-2 space-y-1">
                {check.errors.length === 0 && next.length > 0 ? (
                  <Rule ok>Meets every requirement</Rule>
                ) : next.length === 0 ? (
                  <Rule>
                    At least {MIN_PASSWORD_LENGTH} characters with upper, lower, a number and a
                    symbol
                  </Rule>
                ) : (
                  check.errors.map((e) => <Rule key={e}>{e}</Rule>)
                )}
              </ul>
            </div>

            <div className="mt-3">
              <Field
                id="pw-confirm"
                label="Confirm new password"
                value={confirm}
                onChange={setConfirm}
                reveal={reveal}
                style={field}
                autoComplete="new-password"
              />
              {mismatch && (
                <p className="mt-1 text-xs" style={{ color: "#ef4444" }}>
                  Passwords do not match
                </p>
              )}
            </div>

            {next.length > 0 && next === current && (
              <p className="mt-2 text-xs" style={{ color: "#ef4444" }}>
                New password must be different from your current one
              </p>
            )}

            {err && (
              <div
                className="mt-3 rounded-lg border p-2.5"
                style={{ borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)" }}
              >
                <p className="text-sm font-medium" style={{ color: "#ef4444" }}>
                  {err}
                </p>
                {serverErrors.length > 0 && (
                  <ul className="mt-1 list-inside list-disc text-xs" style={{ color: "#ef4444" }}>
                    {serverErrors.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <p className="mt-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
              Changing your password signs out every other device.
            </p>

            <div className="mt-4 flex gap-2">
              {forced ? (
                <button
                  type="button"
                  onClick={onSignOut}
                  className="min-h-[44px] flex-1 rounded-xl border py-2.5 text-sm font-semibold"
                  style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
                >
                  Sign out
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="min-h-[44px] flex-1 rounded-xl border py-2.5 text-sm font-semibold"
                  style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                disabled={!canSubmit}
                className="min-h-[44px] flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
              >
                {busy ? (
                  <Loader2 className="mx-auto h-4 w-4 animate-spin" />
                ) : (
                  "Update password"
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  reveal,
  style,
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  reveal: boolean;
  style: React.CSSProperties;
  autoComplete: string;
}) {
  return (
    <>
      <label
        htmlFor={id}
        className="mb-1.5 block text-xs font-semibold"
        style={{ color: "var(--text-secondary)" }}
      >
        {label}
      </label>
      <input
        id={id}
        type={reveal ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        className="min-h-[44px] w-full rounded-xl border px-3 py-2.5 text-sm"
        style={style}
      />
    </>
  );
}

function Rule({ children, ok }: { children: React.ReactNode; ok?: boolean }) {
  return (
    <li className="flex items-start gap-1.5 text-xs" style={{ color: ok ? "#10b981" : "var(--text-tertiary)" }}>
      {ok ? (
        <Check className="mt-0.5 h-3 w-3 shrink-0" />
      ) : (
        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full" style={{ background: "currentColor" }} />
      )}
      <span>{children}</span>
    </li>
  );
}
