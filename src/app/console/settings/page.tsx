"use client";

import { Bell, LogOut, Moon, Sun } from "lucide-react";
import { useConsole } from "../ConsoleProvider";
import { ACCENTS, type Scheme, type ThemeMode, useConsoleTheme } from "../theme";

const modes: { key: ThemeMode; label: string; blurb: string }[] = [
  { key: "aurora", label: "Aurora", blurb: "Classic dark smart-home panels." },
  { key: "glass", label: "Glass", blurb: "Frosted cards over an accent glow." },
  { key: "neo", label: "Neo", blurb: "Soft extruded surfaces and shadows." },
];

export default function SettingsPage() {
  const { user, logout, enableNotifications, notifyPermission } = useConsole();
  const theme = useConsoleTheme();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Settings</h1>
        <p className="text-sm text-slate-400 mt-1">Personalize the Circuvent console and manage your session.</p>
      </div>

      <section className="rounded-2xl cv-card p-5">
        <h2 className="font-bold text-white mb-4">Console theme</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {modes.map((m) => (
            <button
              key={m.key}
              onClick={() => theme.setMode(m.key)}
              className={`rounded-2xl border p-4 text-left transition ${theme.mode === m.key ? "border-cyan-400/70 bg-white/10" : "border-white/10 bg-black/10 hover:bg-white/5"}`}
            >
              <div className="font-bold text-white">{m.label}</div>
              <div className="text-xs text-slate-400 mt-1">{m.blurb}</div>
            </button>
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {(["dark", "light"] as Scheme[]).map((s) => (
            <button
              key={s}
              onClick={() => theme.setScheme(s)}
              className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold ${theme.scheme === s ? "border-transparent text-white" : "border-white/10 text-slate-300 bg-black/10"}`}
              style={theme.scheme === s ? { background: "var(--cv-gradient)" } : undefined}
            >
              {s === "dark" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />} {s}
            </button>
          ))}
        </div>

        <div className="mt-5">
          <div className="text-xs uppercase tracking-[0.18em] text-slate-500 mb-3">Accent</div>
          <div className="flex flex-wrap gap-3">
            {ACCENTS.map((a) => (
              <button
                key={a.key}
                onClick={() => theme.setAccentKey(a.key)}
                className={`h-11 w-11 rounded-full border-2 ${theme.accent.key === a.key ? "border-white" : "border-white/20"}`}
                style={{ background: `linear-gradient(135deg, ${a.grad[0]}, ${a.grad[1]})` }}
                aria-label={a.label}
                title={a.label}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="rounded-2xl cv-card p-5">
        <h2 className="font-bold text-white mb-4">Account</h2>
        <div className="rounded-xl border border-white/10 bg-black/20 p-4">
          <div className="text-sm text-slate-400">Signed in as</div>
          <div className="text-white font-semibold">{user?.name || user?.email}</div>
          <div className="text-xs text-slate-500">{user?.email}</div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          <button onClick={enableNotifications} className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-slate-200 hover:bg-white/10">
            <Bell className="h-4 w-4" /> {notifyPermission === "granted" ? "Notifications enabled" : "Enable notifications"}
          </button>
          <button onClick={logout} className="inline-flex items-center gap-2 rounded-xl bg-red-500/10 px-4 py-2.5 text-sm text-red-300 hover:bg-red-500/20">
            <LogOut className="h-4 w-4" /> Logout
          </button>
        </div>
      </section>
    </div>
  );
}
