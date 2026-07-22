"use client";

import { useState } from "react";
import { Loader2, LogIn, UserPlus, ShieldCheck } from "lucide-react";
import { useAccount } from "./AccountProvider";

/** Reusable sign-in / register form backed by the account context. */
export default function AuthForm({ heading, sub }: { heading?: string; sub?: string }) {
  const { login, register } = useAccount();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    setBusy(true);
    const res = mode === "login" ? await login(email, password) : await register(name, email, password);
    if (!res.ok) setErr(res.message || "Something went wrong.");
    setBusy(false);
  };

  const field = "w-full rounded-xl border px-4 py-3 text-sm outline-none transition-all focus:ring-2 focus:ring-[var(--accent-cyan)]/30";
  const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

  return (
    <div
      className="mx-auto max-w-md rounded-2xl border p-8"
      style={{ background: "var(--bg-surface)", borderColor: "var(--border-primary)", boxShadow: "var(--shadow-lg)" }}
    >
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
          {mode === "login" ? "Sign in & continue" : "Create account & continue"}
        </button>
      </form>
    </div>
  );
}
