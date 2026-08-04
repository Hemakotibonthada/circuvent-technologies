"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw, Users, Eye, Radio, Bot, Globe } from "lucide-react";
import { LineChart, HBar, DonutChart, Legend, KpiCard, PALETTE } from "./charts";

/**
 * Traffic — visitors and page views.
 *
 * Reads /api/admin/traffic, which is backed by the page_views table, so the
 * numbers survive a deploy. The "active now" figure comes from the live layer
 * and is labelled approximate: it is per-instance, so behind more than one
 * lambda it undercounts. Saying so in the UI is better than showing a number
 * that quietly disagrees with itself.
 */

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface Breakdown {
  key: string;
  views: number;
  visitors: number;
}
interface Live {
  active: number;
  activeByPath: { path: string; visitors: number }[];
  durable: boolean;
}
interface Traffic {
  days: number;
  views: number;
  visitors: number;
  series: { bucket: string; views: number; visitors: number }[];
  topPages: Breakdown[];
  referrers: Breakdown[];
  devices: Breakdown[];
  browsers: Breakdown[];
  live: Live;
}

const RANGES = [1, 7, 30, 90, 365];
const card: React.CSSProperties = {
  background: "var(--bg-surface)",
  border: "1px solid var(--border-primary)",
};

function label(iso: string, days: number): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return days <= 2
    ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function TrafficPanel() {
  const [days, setDays] = useState(30);
  const [bots, setBots] = useState(false);
  const [d, setD] = useState<Traffic | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [liveNow, setLiveNow] = useState<number | null>(null);
  const esRef = useRef<EventSource | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/traffic?days=${days}&bots=${bots ? 1 : 0}`, {
        headers: { "x-admin-token": tok() },
      });
      if (!r.ok) throw new Error(String(r.status));
      setD(await r.json());
    } catch {
      setError("Could not load traffic.");
    }
    setLoading(false);
  }, [days, bots]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live presence over SSE. The stream is authenticated, and EventSource
  // cannot set headers, so the token rides the query string — acceptable here
  // because it is a short-lived admin session token over TLS to our own origin.
  useEffect(() => {
    const t = tok();
    if (!t) return;
    const es = new EventSource(`/api/visitors/stream?token=${encodeURIComponent(t)}`);
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        setLiveNow(JSON.parse(e.data).active ?? 0);
      } catch {
        /* a malformed frame should not break the panel */
      }
    };
    es.onerror = () => es.close();
    return () => es.close();
  }, []);

  if (loading && !d) {
    return (
      <div className="py-16 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
        Loading traffic…
      </div>
    );
  }
  if (error && !d) {
    return (
      <div className="rounded-2xl p-6 text-center" style={card}>
        <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{error}</p>
        <button onClick={load} className="mt-3 rounded-lg border px-3 py-1.5 text-xs"
          style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>
          Retry
        </button>
      </div>
    );
  }
  if (!d) return null;

  const labels = d.series.map((p) => label(p.bucket, d.days));
  const active = liveNow ?? d.live.active;
  const botViews = d.devices.find((x) => x.key === "bot")?.views ?? 0;
  const viewsPerVisitor = d.visitors > 0 ? (d.views / d.visitors).toFixed(1) : "0";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold" style={{ color: "var(--text-primary)" }}>
            <Globe className="h-5 w-5" style={{ color: "var(--accent-cyan)" }} /> Traffic
          </h3>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
            {d.live.durable
              ? "Visitors and page views, stored durably."
              : "No database configured — showing this server's memory only, which resets on restart."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex cursor-pointer items-center gap-1.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
            <input type="checkbox" checked={bots} onChange={(e) => setBots(e.target.checked)} className="accent-cyan-500" />
            <Bot className="h-3.5 w-3.5" /> include bots
          </label>
          <div className="flex rounded-lg p-0.5" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
            {RANGES.map((r) => (
              <button key={r} onClick={() => setDays(r)} className="rounded-md px-2.5 py-1 text-xs font-medium"
                style={days === r
                  ? { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff" }
                  : { color: "var(--text-tertiary)" }}>
                {r === 1 ? "24h" : r === 365 ? "1y" : `${r}d`}
              </button>
            ))}
          </div>
          <button onClick={load} className="rounded-lg border p-2" aria-label="Refresh"
            style={{ borderColor: "var(--border-primary)", color: "var(--text-secondary)" }}>
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-2xl p-4" style={card}>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
            Active now
          </p>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{active}</span>
            <span className="flex items-center gap-1 text-[11px]" style={{ color: "#10b981" }}>
              <Radio className="h-3 w-3" /> live
            </span>
          </div>
          <p className="mt-1 text-[10px]" style={{ color: "var(--text-tertiary)" }}>
            approximate — counted per server instance
          </p>
        </div>
        <KpiCard label="Page views" value={d.views.toLocaleString()} color={PALETTE[0]} />
        <KpiCard label="Unique visitors" value={d.visitors.toLocaleString()} color={PALETTE[1]} />
        <KpiCard label="Views per visitor" value={viewsPerVisitor} color={PALETTE[2]} />
      </div>

      {!bots && botViews > 0 && (
        <p className="text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          {botViews.toLocaleString()} crawler views excluded from these figures.
        </p>
      )}

      {/* Trend */}
      <div className="rounded-2xl p-4" style={card}>
        <div className="mb-3 flex items-center gap-2">
          <Eye className="h-4 w-4" style={{ color: "var(--accent-cyan)" }} />
          <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Views and visitors
          </h4>
        </div>
        {d.series.length > 1 ? (
          <LineChart
            labels={labels}
            area
            series={[
              { name: "Views", data: d.series.map((p) => p.views), color: PALETTE[0] },
              { name: "Visitors", data: d.series.map((p) => p.visitors), color: PALETTE[1] },
            ]}
          />
        ) : (
          <p className="py-10 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>
            Not enough data yet — the chart appears once there are at least two buckets.
          </p>
        )}
        <p className="mt-2 text-[11px]" style={{ color: "var(--text-tertiary)" }}>
          Unique visitors are counted per day: the identifier is re-salted at midnight, so somebody
          returning tomorrow is counted again. That is deliberate — it means the table cannot be
          used to follow one person over time.
        </p>
      </div>

      {/* Pages + live */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl p-4" style={card}>
          <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Top pages</h4>
          {d.topPages.length ? (
            <HBar items={d.topPages.slice(0, 10).map((p, i) => ({
              name: p.key, value: p.views, color: PALETTE[i % PALETTE.length],
            }))} />
          ) : (
            <p className="py-8 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>No views yet.</p>
          )}
        </div>

        <div className="rounded-2xl p-4" style={card}>
          <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            <Users className="h-4 w-4" style={{ color: "#10b981" }} /> On the site right now
          </h4>
          {d.live.activeByPath.length ? (
            <div className="space-y-1.5">
              {d.live.activeByPath.slice(0, 10).map((p) => (
                <div key={p.path} className="flex items-center justify-between text-xs">
                  <span className="truncate font-mono" style={{ color: "var(--text-secondary)" }}>{p.path}</span>
                  <span className="ml-2 shrink-0 font-semibold" style={{ color: "var(--text-primary)" }}>
                    {p.visitors}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-8 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>Nobody on the site.</p>
          )}
        </div>
      </div>

      {/* Sources + audience */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl p-4" style={card}>
          <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Where visitors came from</h4>
          {d.referrers.length ? (
            <HBar items={d.referrers.slice(0, 8).map((r, i) => ({
              name: r.key, value: r.visitors, color: PALETTE[(i + 3) % PALETTE.length],
            }))} />
          ) : (
            <p className="py-8 text-center text-sm" style={{ color: "var(--text-tertiary)" }}>No referrers recorded.</p>
          )}
        </div>

        <div className="rounded-2xl p-4" style={card}>
          <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>Audience</h4>
          <div className="flex flex-wrap items-center justify-around gap-4">
            <div className="text-center">
              <DonutChart
                size={150}
                centerLabel={String(d.visitors)}
                centerSub="visitors"
                data={d.devices
                  .filter((x) => bots || x.key !== "bot")
                  .map((x, i) => ({ name: x.key, value: x.visitors, color: PALETTE[i % PALETTE.length] }))}
              />
              <p className="mt-1 text-[10px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>device</p>
            </div>
            <div className="min-w-[130px]">
              <Legend items={d.browsers.slice(0, 6).map((b, i) => ({
                name: b.key, value: b.visitors, color: PALETTE[(i + 2) % PALETTE.length],
              }))} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
