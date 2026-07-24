"use client";

import { useState } from "react";
import { Cpu, Loader2, Mail, Lock, User as UserIcon } from "lucide-react";
import { useConsole } from "./ConsoleProvider";

export default function Login() {
  const { login, register } = useConsole();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r =
      mode === "login"
        ? await login(email.trim(), password)
        : await register(name.trim(), email.trim(), password);
    if (!r.ok) setError(r.error || "Something went wrong");
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4" style={{ background: "#0b1020" }}>
      <div className="w-full max-w-md">
        <div className="flex items-center gap-3 justify-center mb-8">
          <div
            className="h-11 w-11 rounded-xl flex items-center justify-center"
            style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
          >
            <Cpu className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="text-white font-extrabold text-xl leading-none">Circuvent</div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-cyan-400">Device Console</div>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur">
          <h1 className="text-white text-lg font-bold mb-1">
            {mode === "login" ? "Sign in" : "Create your account"}
          </h1>
          <p className="text-slate-400 text-sm mb-5">
            {mode === "login"
              ? "Access and control your Circuvent devices."
              : "One account controls every Circuvent device you own."}
          </p>

          <form onSubmit={submit} className="space-y-3">
            {mode === "register" && (
              <Field icon={<UserIcon className="h-4 w-4" />}>
                <input
                  className="cv-input"
                  placeholder="Full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  required
                />
              </Field>
            )}
            <Field icon={<Mail className="h-4 w-4" />}>
              <input
                className="cv-input"
                placeholder="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </Field>
            <Field icon={<Lock className="h-4 w-4" />}>
              <input
                className="cv-input"
                placeholder="Password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={mode === "login" ? "current-password" : "new-password"}
                minLength={6}
                required
              />
            </Field>

            {error && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl py-3 font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60 transition"
              style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "login" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-5 text-center text-sm text-slate-400">
            {mode === "login" ? "New to Circuvent?" : "Already have an account?"}{" "}
            <button
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setError(null);
              }}
              className="text-cyan-400 font-semibold hover:text-cyan-300"
            >
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-slate-500 mt-6">
          Self-hosted control plane · end-to-end encrypted device link
        </p>
      </div>

      <style jsx global>{`
        .cv-input {
          width: 100%;
          background: transparent;
          color: #fff;
          font-size: 15px;
          outline: none;
          border: none;
        }
        .cv-input::placeholder {
          color: #64748b;
        }
      `}</style>
    </div>
  );
}

function Field({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-3 focus-within:border-cyan-500/50 transition">
      <span className="text-slate-500">{icon}</span>
      {children}
    </div>
  );
}
