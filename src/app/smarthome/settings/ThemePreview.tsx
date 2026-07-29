"use client";

// ThemePreview renders a self-contained miniature of the real console UI so the
// operator can judge a theme combination before committing. All KPI data comes
// from the live fleet/energy/event hooks — the preview is not a mockup.

import { Activity } from "lucide-react";
import { useConsoleTheme } from "../theme";
import { useFleet, useEnergy, useEvents, useControlPlaneProbe } from "../_data/hooks";
import { Sparkline } from "../_kit/charts";
import { StatusDot } from "../_kit/primitives";

export default function ThemePreview() {
  const theme = useConsoleTheme();
  // Probe once on mount (intervalMs=0) so the sparkline shows real RTT as
  // soon as the operator opens the appearance tab.
  const { samples, busy } = useControlPlaneProbe(0);
  const { devices, loading: fleetLoading } = useFleet();
  const { summary, loading: energyLoading } = useEnergy();
  const { events, loading: eventsLoading } = useEvents(10);

  const cardCls = `rounded-xl ${theme.cardClass}`;
  const online = devices.filter((d) => d.online).length;
  const unread = events.filter((e) => !e.read).length;
  // Sparkline expects number[] — RTT samples in ms, null → 0 (network failure).
  // Drop failed probes (ms === null) — absent ≠ 0 ms.
  const rttPoints = samples.filter((s) => s.ok && s.ms !== null).map((s) => s.ms as number);

  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--cv-border)" }}
      aria-label="Theme preview"
    >
      {/* ── Mini chrome bar ─────────────────────── */}
      <div
        className="flex items-center gap-2 border-b px-4 py-2.5"
        style={{ background: "var(--cv-card)", borderColor: "var(--cv-border)" }}
      >
        <div
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: "var(--cv-accent)" }}
        />
        <span className="text-xs font-bold" style={{ color: "var(--cv-muted)" }}>
          Circuvent Console
        </span>
        <div className="ml-auto">
          <div
            className="h-6 w-6 rounded-full"
            style={{ background: "var(--cv-gradient)" }}
          />
        </div>
      </div>

      {/* ── Mini content ────────────────────────── */}
      <div className="space-y-3 p-4" style={{ background: "var(--cv-bg)" }}>
        {/* KPI row — real values from fleet / energy / events */}
        <div className="grid grid-cols-3 gap-2">
          {[
            {
              label: "Devices",
              value: fleetLoading ? "…" : String(devices.length),
              hint: fleetLoading ? "" : `${online} online`,
            },
            {
              label: "Live watts",
              value: energyLoading
                ? "…"
                : summary?.liveWatts != null
                  ? `${Math.round(summary.liveWatts)} W`
                  : "—",
              hint: "",
            },
            {
              label: "Unread",
              value: eventsLoading ? "…" : String(unread),
              hint: "events",
            },
          ].map((k) => (
            <div key={k.label} className={`${cardCls} p-2.5`}>
              <div
                className="text-[9px] font-bold uppercase tracking-[0.1em]"
                style={{ color: "var(--cv-muted)" }}
              >
                {k.label}
              </div>
              <div
                className="mt-1 text-sm font-extrabold tabular-nums"
                style={{ color: "var(--cv-accent-hi)" }}
              >
                {k.value}
              </div>
              {k.hint && (
                <div className="mt-0.5 text-[9px]" style={{ color: "var(--cv-muted)" }}>
                  {k.hint}
                </div>
              )}
            </div>
          ))}
        </div>

        {/* RTT chart — real probe samples */}
        <div className={`${cardCls} p-3`}>
          <div className="mb-2 flex items-center justify-between">
            <span
              className="text-[10px] font-bold uppercase tracking-[0.1em]"
              style={{ color: "var(--cv-muted)" }}
            >
              Control-plane RTT (ms)
            </span>
            <Activity className="h-3 w-3" style={{ color: "var(--cv-accent)" }} />
          </div>
          {rttPoints.length > 1 ? (
            <Sparkline
              points={rttPoints}
              color="var(--cv-accent)"
              height={32}
              width={260}
            />
          ) : (
            <div
              className="flex h-8 items-center text-[10px]"
              style={{ color: "var(--cv-muted)" }}
            >
              {busy ? "Probing…" : "Awaiting first sample…"}
            </div>
          )}
        </div>

        {/* Status rows — up to 3 real devices */}
        {devices.length > 0 ? (
          <div className={`${cardCls} overflow-hidden`}>
            {devices.slice(0, 3).map((d, i) => (
              <div
                key={d.id}
                className="flex items-center gap-2.5 px-3 py-2"
                style={{
                  borderTop: i > 0 ? `1px solid var(--cv-border)` : undefined,
                }}
              >
                <StatusDot online={d.online} pulse={false} />
                <span
                  className="min-w-0 flex-1 truncate text-xs font-medium"
                  style={{ color: "var(--cv-text)" }}
                >
                  {d.name}
                </span>
                <span
                  className="shrink-0 text-[10px] font-bold"
                  style={{ color: d.online ? "#16a34a" : "var(--cv-muted)" }}
                >
                  {d.online ? "Online" : "Offline"}
                </span>
              </div>
            ))}
          </div>
        ) : !fleetLoading ? (
          <div
            className={`${cardCls} px-3 py-2.5 text-xs`}
            style={{ color: "var(--cv-muted)" }}
          >
            No devices configured
          </div>
        ) : null}

        {/* Button palette — all three variants */}
        <div className="flex flex-wrap gap-2">
          <button
            className="rounded-lg px-3 py-1.5 text-[10px] font-bold"
            style={{ background: "var(--cv-gradient)", color: "#fff" }}
          >
            Primary
          </button>
          <button
            className="rounded-lg border px-3 py-1.5 text-[10px] font-bold"
            style={{
              background: "var(--cv-card-hi)",
              color: "var(--cv-text)",
              borderColor: "var(--cv-border)",
            }}
          >
            Secondary
          </button>
          <button
            className="rounded-lg px-3 py-1.5 text-[10px] font-bold"
            style={{
              background: "rgba(220,38,38,0.12)",
              color: "#dc2626",
              border: "1px solid rgba(220,38,38,0.3)",
            }}
          >
            Danger
          </button>
          <button
            className="rounded-lg px-3 py-1.5 text-[10px] font-bold opacity-40"
            style={{
              background: "var(--cv-card-hi)",
              color: "var(--cv-muted)",
              border: "1px solid var(--cv-border)",
            }}
            disabled
          >
            Disabled
          </button>
        </div>
      </div>
    </div>
  );
}
