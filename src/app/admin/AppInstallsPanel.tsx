"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Apple, Loader2, MapPin, RefreshCw, Search, Smartphone, Wifi } from "lucide-react";
import { controlPlane, type AppInstall, type AppInstallStats } from "@/lib/control-plane";

/**
 * Which phones and tablets are signed in to the platform.
 *
 * Answers what support and security actually get asked: what build is this
 * person on, is anyone still on the version with the bug, has this account been
 * used from an address it should not have been.
 *
 * There are no coordinates in here, and that is a decision rather than an
 * omission. The app holds location permission to show the weather; reporting a
 * user's whereabouts to staff is a different purpose from the one they granted
 * it for. City and country are whatever the reverse proxy's IP geolocation
 * supplied — the same thing every "recent sign-ins" screen shows — and are
 * blank rather than guessed when it supplied nothing.
 */
const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };

function ago(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (!Number.isFinite(m)) return "—";
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl p-3" style={card}>
      <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
        {value}
      </div>
      {hint && (
        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {hint}
        </div>
      )}
    </div>
  );
}

export default function AppInstallsPanel() {
  const [rows, setRows] = useState<AppInstall[]>([]);
  const [stats, setStats] = useState<AppInstallStats | null>(null);
  const [platform, setPlatform] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const r = await controlPlane.adminAppInstalls({ platform: platform || undefined, q: q || undefined, limit: 300 });
    if (!r.ok) {
      /* The client returns a status rather than a message; 403 is the one worth
         naming, because it means the console token is not an admin one and no
         amount of refreshing will fix it. */
      setError(r.status === 403 ? "This console session is not an admin on the control plane." : "Could not load app installs.");
    } else {
      setRows(r.data.installs || []);
      setStats(r.data.stats || null);
    }
    setLoading(false);
  }, [platform, q]);

  useEffect(() => {
    void load();
  }, [load]);

  /* The version spread is the number people actually want from this screen:
     it answers "can we stop supporting the old build yet". */
  const versions = useMemo(() => stats?.versions ?? [], [stats]);

  return (
    <div className="mt-6 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            <Smartphone className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} aria-hidden />
            App installs
          </h3>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            Phones and tablets signed in to Circuvent accounts, and the address each last connected from.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex h-[44px] items-center gap-2 rounded-lg border px-3 text-sm"
          style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
          Refresh
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Installs" value={stats.total} hint="signed in at least once" />
          <Stat label="Android" value={stats.android} />
          <Stat label="iOS" value={stats.ios} />
          <Stat label="Active today" value={stats.activeDay} hint="seen in the last 24h" />
        </div>
      )}

      {versions.length > 0 && (
        <div className="rounded-xl p-3" style={card}>
          <div className="mb-2 text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            App versions in the field
          </div>
          <div className="flex flex-wrap gap-2">
            {versions.map((v) => (
              <span
                key={v.appVersion}
                className="rounded-lg px-2 py-1 text-[12px] font-semibold"
                style={{ background: "var(--bg-secondary)", color: "var(--text-secondary)" }}
              >
                {v.appVersion} · {v.n}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl p-3" style={card}>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="h-[44px] rounded-lg border px-3 text-sm"
          style={{ borderColor: "var(--border-primary)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
          aria-label="Filter by platform"
        >
          <option value="">All platforms</option>
          <option value="android">Android</option>
          <option value="ios">iOS</option>
        </select>
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
            style={{ color: "var(--text-muted)" }}
            aria-hidden
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Email, name, model or IP…"
            className="h-[44px] w-full rounded-lg border pl-9 pr-3 text-sm"
            style={{ borderColor: "var(--border-primary)", background: "var(--bg-secondary)", color: "var(--text-primary)" }}
            aria-label="Search installs"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: "#fca5a5", color: "#b91c1c" }}>
          {error}
        </div>
      )}

      <div className="overflow-x-auto rounded-xl" style={card}>
        <table className="w-full text-left text-sm">
          <thead className="text-[11px] uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            <tr>
              <th className="px-3 py-2">User</th>
              <th className="px-3 py-2">Device</th>
              <th className="px-3 py-2">App</th>
              <th className="px-3 py-2">Last address</th>
              <th className="px-3 py-2">First seen</th>
              <th className="px-3 py-2">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center" style={{ color: "var(--text-muted)" }}>
                  <Smartphone className="mx-auto mb-2 h-8 w-8 opacity-40" aria-hidden />
                  <div className="font-semibold">No installs recorded</div>
                  <div className="text-[13px]">
                    Installs appear once an app on this build signs in — older builds do not report themselves.
                  </div>
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-t" style={{ borderColor: "var(--border-primary)" }}>
                <td className="px-3 py-2">
                  <div className="font-semibold" style={{ color: "var(--text-primary)" }}>
                    {r.name || "—"}
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {r.email}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}>
                    {r.platform === "ios" ? (
                      <Apple className="h-3.5 w-3.5" aria-hidden />
                    ) : (
                      <Smartphone className="h-3.5 w-3.5" aria-hidden />
                    )}
                    {r.model || r.platform || "—"}
                  </div>
                  <div className="text-[12px]" style={{ color: "var(--text-muted)" }}>
                    {r.osVersion || "—"}
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-[12px]" style={{ color: "var(--text-secondary)" }}>
                  {r.appVersion || "—"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1.5 font-mono text-[12px]" style={{ color: "var(--text-secondary)" }}>
                    <Wifi className="h-3.5 w-3.5" aria-hidden />
                    {r.lastIp || "—"}
                  </div>
                  {/*
                    Only shown when the edge actually supplied it. An empty city
                    reads as "we do not know", which is the truth — better than
                    a plausible guess somebody might act on.
                  */}
                  {(r.lastCity || r.lastCountry) && (
                    <div className="flex items-center gap-1.5 text-[12px]" style={{ color: "var(--text-muted)" }}>
                      <MapPin className="h-3.5 w-3.5" aria-hidden />
                      {[r.lastCity, r.lastCountry].filter(Boolean).join(", ")}
                    </div>
                  )}
                </td>
                <td className="px-3 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {ago(r.firstSeen)}
                </td>
                <td className="px-3 py-2 text-[12px]" style={{ color: "var(--text-muted)" }}>
                  {ago(r.lastSeen)}
                  {r.revokedAt && (
                    <div className="text-[11px]" style={{ color: "#b45309" }}>
                      signed out by the user
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/*
        Stated in the console itself, not only in a commit message. Anyone
        reading this screen should know what it does and does not contain.
      */}
      <p className="text-[12px]" style={{ color: "var(--text-muted)" }}>
        Location is derived from the connecting IP address by the edge proxy and is shown only when it is available.
        The apps do not report GPS to the platform — location permission there is used for the weather, and using it
        for anything else would be a different purpose from the one it was granted for. Account holders can see this
        same list for their own account and sign a device out.
      </p>
    </div>
  );
}
