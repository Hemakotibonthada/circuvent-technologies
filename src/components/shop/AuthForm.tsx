"use client";

import { useState } from "react";
import { Loader2, LogIn, UserPlus, ShieldCheck, MailCheck, ArrowLeft } from "lucide-react";
import { useAccount } from "./AccountProvider";

/** Reusable sign-in / register form with email OTP verification on sign-up. */
export default function AuthForm({ heading, sub }: { heading?: string; sub?: string }) {
  const { login, register, verifyOtp } = useAccount();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [step, setStep] = useState<"form" | "otp">("form");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");
  const [err, setErr] = useState("");
  const [info, setInfo] = useState("");
  const [busy, setBusy] = useState(false);

  const field = "w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[var(--accent-cyan)]/30";
  const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setInfo("");
    setBusy(true);
    if (mode === "login") {
      const res = await login(email, password);
      if (!res.ok) setErr(res.message || "Sign in failed.");
    } else {
      const res = await register(name, email, password);
      if (res.ok && res.pending) {
        setStep("otp");
        setInfo(`We've emailed a 6-digit code to ${res.email || email}.`);
      } else {
        setErr(res.message || (res.errors ? Object.values(res.errors)[0] : "") || "Could not sign up.");
      }
    }
    setBusy(false);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const res = await verifyOtp(email, otp.trim());
    if (!res.ok) setErr(res.message || "Invalid code.");
    setBusy(false);
  };

  const resend = async () => {
    setErr("");
    setInfo("");
    setBusy(true);
    const res = await register(name, email, password);
    if (res.ok) setInfo("A new code has been sent.");
    else setErr(res.message || "Could not resend the code.");
    setBusy(false);
  };

  const shell = "mx-auto max-w-md rounded-2xl border p-8";
  const shellStyle = { background: "var(--bg-surface)", borderColor: "var(--border-primary)", boxShadow: "var(--shadow-lg)" };

  // ---- OTP step ----
  if (step === "otp") {
    return (
      <div className={shell} style={shellStyle}>
        <div className="mb-4 flex items-center justify-center">
          <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "var(--accent-cyan-muted)" }}>
            <MailCheck className="h-6 w-6" style={{ color: "var(--accent-cyan)" }} />
          </span>
        </div>
        <h2 className="text-center text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          Enter verification code
        </h2>
        <p className="mt-1 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
          {info || `We've emailed a 6-digit code to ${email}.`}
        </p>
        <form onSubmit={verify} className="mt-5 space-y-3">
          <input
            inputMode="numeric"
            maxLength={6}
            className={field + " text-center text-2xl font-bold tracking-[0.5em]"}
            style={inputStyle}
            placeholder="000000"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
            autoFocus
            required
          />
          {err && <p className="text-sm text-rose-500">{err}</p>}
          <button
            type="submit"
            disabled={busy || otp.length < 6}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Verify & continue
          </button>
        </form>
        <div className="mt-4 flex items-center justify-between text-xs">
          <button
            onClick={() => {
              setStep("form");
              setOtp("");
              setErr("");
              setInfo("");
            }}
            className="flex items-center gap-1"
            style={{ color: "var(--text-tertiary)" }}
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Change email
          </button>
          <button onClick={resend} disabled={busy} style={{ color: "var(--accent-cyan)" }}>
            Resend code
          </button>
        </div>
      </div>
    );
  }

  // ---- Login / Register form ----
  return (
    <div className={shell} style={shellStyle}>
      <div className="mb-4 flex items-center justify-center">
        <span className="grid h-11 w-11 place-items-center rounded-xl" style={{ background: "var(--accent-cyan-muted)" }}>
          <ShieldCheck className="h-6 w-6" style={{ color: "var(--accent-cyan)" }} />
        </span>
      </div>
      <h2 className="text-center text-lg font-bold" style={{ color: "var(--text-primary)" }}>
        {heading || "Sign in to continue"}
      </h2>
      <p className="mt-1 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
        {sub || "Create an account or sign in to place your order, use your wallet and track deliveries."}
      </p>

      <div className="my-5 flex rounded-xl p-1" style={{ background: "var(--bg-glass)" }}>
        {(["login", "register"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              setMode(m);
              setErr("");
              setInfo("");
            }}
            className="flex-1 rounded-lg py-2 text-sm font-semibold transition-colors"
            style={mode === m ? { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff" } : { color: "var(--text-tertiary)" }}
          >
            {m === "login" ? "Sign in" : "Create account"}
          </button>
        ))}
      </div>

      <form onSubmit={submit} className="space-y-3">
        {mode === "register" && (
          <input className={field} style={inputStyle} placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
        )}
        <input type="email" className={field} style={inputStyle} placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          className={field}
          style={inputStyle}
          placeholder="Password (min 6 characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {err && <p className="text-sm text-rose-500">{err}</p>}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 px-4 py-3 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === "login" ? <LogIn className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
          {mode === "login" ? "Sign in & continue" : "Send code & continue"}
        </button>
      </form>
      {mode === "register" && (
        <p className="mt-3 text-center text-xs" style={{ color: "var(--text-muted)" }}>
          We&apos;ll email you a 6-digit code to verify your address.
        </p>
      )}
    </div>
  );
}
