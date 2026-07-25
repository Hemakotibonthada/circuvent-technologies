"use client";

import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff, Loader2, Smartphone, Mail, X, Copy, Check } from "lucide-react";

function tok() {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

type Method = "email" | "totp";
interface Status { enabled: boolean; method: Method | null }

/** Header control for 2-step verification: off, email codes, or authenticator app. */
export default function Admin2fa() {
  const [status, setStatus] = useState<Status | null>(null);
  const [open, setOpen] = useState(false);

  const refresh = () => {
    fetch("/api/admin/2fa", { headers: { "x-admin-token": tok() } })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStatus({ enabled: !!d.enabled, method: d.method ?? null }))
      .catch(() => {});
  };
  useEffect(refresh, []);

  if (!status) return null;
  const on = status.enabled;
  const label = !on ? "2FA Off" : status.method === "totp" ? "2FA App" : "2FA Email";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Two-step verification settings"
        className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium"
        style={{
          borderColor: on ? "#10b981" : "var(--border-primary)",
          color: on ? "#10b981" : "var(--text-tertiary)",
          background: on ? "rgba(16,185,129,0.1)" : "transparent",
        }}
      >
        {on ? <ShieldCheck className="h-3.5 w-3.5" /> : <ShieldOff className="h-3.5 w-3.5" />}
        {label}
      </button>
      {open && <TwoFactorModal status={status} onClose={() => { setOpen(false); refresh(); }} onChanged={refresh} />}
    </>
  );
}

function TwoFactorModal({ status, onClose, onChanged }: { status: Status; onClose: () => void; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [setup, setSetup] = useState<{ secret: string; otpauth: string; qr: string } | null>(null);
  const [code, setCode] = useState("");
  const [copied, setCopied] = useState(false);

  const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };

  const setEmail = async (enabled: boolean) => {
    setBusy(true); setErr("");
    try {
      if (status.method === "totp" && enabled) {
        await fetch("/api/admin/2fa/totp", { method: "DELETE", headers: { "x-admin-token": tok() } });
      } else {
        await fetch("/api/admin/2fa", { method: "PUT", headers: { "Content-Type": "application/json", "x-admin-token": tok() }, body: JSON.stringify({ enabled }) });
      }
      onChanged();
      if (!enabled) onClose();
    } catch { setErr("Could not update 2FA."); }
    setBusy(false);
  };

  const startTotp = async () => {
    setBusy(true); setErr(""); setSetup(null);
    try {
      const r = await fetch("/api/admin/2fa/totp", { method: "POST", headers: { "x-admin-token": tok() } });
      const d = await r.json();
      if (r.ok && d.secret) setSetup({ secret: d.secret, otpauth: d.otpauth, qr: d.qr });
      else setErr(d.error || "Could not start setup.");
    } catch { setErr("Could not start setup."); }
    setBusy(false);
  };

  const doVerifyTotp = async () => {
    if (!setup) return;
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/admin/2fa/totp", { method: "PUT", headers: { "Content-Type": "application/json", "x-admin-token": tok() }, body: JSON.stringify({ secret: setup.secret, code }) });
      const d = await r.json();
      if (r.ok && d.ok) { onChanged(); onClose(); }
      else setErr(d.error || "That code didn't match.");
    } catch { setErr("Could not verify the code."); }
    setBusy(false);
  };

  const copySecret = async () => {
    if (!setup) return;
    try { await navigator.clipboard.writeText(setup.secret); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* ignore */ }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-5" style={card} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>Two-step verification</h3>
          <button onClick={onClose} className="rounded-lg p-1" style={{ color: "var(--text-tertiary)" }}><X className="h-5 w-5" /></button>
        </div>

        {!setup ? (
          <>
            <p className="mb-4 text-sm" style={{ color: "var(--text-tertiary)" }}>Add a second step at sign-in. Choose email codes or an authenticator app (Google Authenticator, Authy, 1Password…).</p>

            <MethodRow icon={<Mail className="h-5 w-5" />} title="Email codes" desc="We email a 6-digit code each sign-in." active={status.enabled && status.method !== "totp"} onClick={() => setEmail(true)} busy={busy} />
            <MethodRow icon={<Smartphone className="h-5 w-5" />} title="Authenticator app" desc="Scan a QR once; codes are generated offline." active={status.enabled && status.method === "totp"} onClick={startTotp} busy={busy} accent />

            {status.enabled && (
              <button onClick={() => setEmail(false)} disabled={busy} className="mt-3 w-full rounded-xl border py-2.5 text-sm font-semibold" style={{ borderColor: "rgba(239,68,68,0.4)", color: "#ef4444" }}>
                Turn off two-step verification
              </button>
            )}
            {err && <p className="mt-3 text-sm" style={{ color: "#ef4444" }}>{err}</p>}
          </>
        ) : (
          <>
            <p className="mb-3 text-sm" style={{ color: "var(--text-tertiary)" }}>Scan this with your authenticator app, then enter the 6-digit code to confirm.</p>
            {setup.qr ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={setup.qr} alt="Authenticator QR" className="mx-auto mb-3 rounded-lg" width={200} height={200} />
            ) : null}
            <div className="mb-3 rounded-lg border p-3 text-center" style={{ borderColor: "var(--border-primary)" }}>
              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>Or enter this key manually</div>
              <div className="mt-1 flex items-center justify-center gap-2">
                <code className="font-mono text-sm tracking-wider" style={{ color: "var(--text-primary)" }}>{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
                <button onClick={copySecret} className="rounded p-1" style={{ color: "var(--text-tertiary)" }}>{copied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}</button>
              </div>
            </div>
            <input
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              inputMode="numeric"
              placeholder="123456"
              className="mb-3 w-full rounded-xl border px-3 py-2.5 text-center font-mono text-xl tracking-[0.4em]"
              style={{ background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" }}
            />
            {err && <p className="mb-3 text-sm" style={{ color: "#ef4444" }}>{err}</p>}
            <div className="flex gap-2">
              <button onClick={() => setSetup(null)} className="flex-1 rounded-xl border py-2.5 text-sm font-semibold" style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>Back</button>
              <button onClick={doVerifyTotp} disabled={busy || code.length !== 6} className="flex-1 rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
                {busy ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Verify & enable"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MethodRow({ icon, title, desc, active, onClick, busy, accent }: { icon: React.ReactNode; title: string; desc: string; active: boolean; onClick: () => void; busy: boolean; accent?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className="mb-2 flex w-full items-center gap-3 rounded-xl border p-3 text-left"
      style={{ borderColor: active ? "#10b981" : "var(--border-primary)", background: active ? "rgba(16,185,129,0.08)" : "transparent" }}
    >
      <span style={{ color: accent ? "#06b6d4" : "var(--text-secondary)" }}>{icon}</span>
      <span className="flex-1">
        <span className="block text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{title}</span>
        <span className="block text-xs" style={{ color: "var(--text-tertiary)" }}>{desc}</span>
      </span>
      {active ? <Check className="h-4 w-4 text-green-500" /> : <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>Choose</span>}
    </button>
  );
}
