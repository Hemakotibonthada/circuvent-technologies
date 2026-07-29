"use client";

// Developer tab — control-plane connection details, live RTT probe, API
// endpoint catalogue, and a read-only request inspector.
// CONTROL_PLANE_URL and CONTROL_PLANE_WS are the real resolved values from
// the lib; no URLs are hardcoded or guessed here.

import { RefreshCcw, Wifi, WifiOff } from "lucide-react";
import { CONTROL_PLANE_URL, CONTROL_PLANE_WS } from "@/lib/control-plane";
import { useConsole } from "../ConsoleProvider";
import { useControlPlaneProbe } from "../_data/hooks";
import {
  Button,
  Callout,
  CopyField,
  DetailRow,
  SectionTitle,
  StatusDot,
  Surface,
} from "../_kit/primitives";
import { Sparkline } from "../_kit/charts";
import RequestInspector from "./RequestInspector";

// Every endpoint the console uses, derived from control-plane.ts.
const ENDPOINTS: { path: string; method: string; desc: string }[] = [
  { path: "/auth/login", method: "POST", desc: "Authenticate and receive a JWT" },
  { path: "/auth/register", method: "POST", desc: "Create account, initiate OTP flow" },
  { path: "/auth/verify-otp", method: "POST", desc: "Complete OTP verification" },
  { path: "/devices", method: "GET", desc: "List all devices in the fleet" },
  { path: "/devices/:id", method: "GET", desc: "Device detail and current state" },
  { path: "/devices/:id/command", method: "POST", desc: "Send a relay command via MQTT" },
  { path: "/devices/:id/telemetry", method: "GET", desc: "Raw telemetry history" },
  { path: "/devices/:id/energy", method: "GET", desc: "Per-device energy history (rollups)" },
  { path: "/devices/claim", method: "POST", desc: "Claim a new device by ID + key" },
  { path: "/rooms", method: "GET", desc: "Room list with device counts" },
  { path: "/rooms/:id", method: "PATCH", desc: "Update room name, icon or sort" },
  { path: "/scenes", method: "GET", desc: "Saved scene definitions" },
  { path: "/scenes/:id/activate", method: "POST", desc: "Run a scene across its devices" },
  { path: "/automations", method: "GET", desc: "Automation rules" },
  { path: "/events", method: "GET", desc: "Event feed with severity and body" },
  { path: "/events/unread-count", method: "GET", desc: "Unread event count" },
  { path: "/events/read", method: "POST", desc: "Mark events as read" },
  { path: "/energy/summary", method: "GET", desc: "Live fleet-wide energy summary" },
  { path: "/gate/passes", method: "GET", desc: "Gate guest passes" },
  { path: "/gate/passes", method: "POST", desc: "Create a new guest pass" },
  { path: "/gate/passes/:id/revoke", method: "POST", desc: "Revoke a guest pass" },
  { path: "/gate/redeem", method: "POST", desc: "Redeem a gate pass code" },
  { path: "/admin/me", method: "GET", desc: "Resolve admin flag for current user" },
  { path: "/admin/stats", method: "GET", desc: "Fleet-wide admin statistics" },
  { path: "/admin/health", method: "GET", desc: "Control-plane health (MQTT, DB, uptime)" },
  { path: "/admin/users", method: "GET", desc: "All registered users (admin)" },
  { path: "/admin/devices", method: "GET", desc: "All devices across all users (admin)" },
  { path: "/admin/events", method: "GET", desc: "All events across all users (admin)" },
  { path: "/admin/devices/provision", method: "POST", desc: "Provision a new device (admin)" },
  { path: "/admin/broadcast", method: "POST", desc: "Broadcast command to device class (admin)" },
  { path: "/ws", method: "WSS", desc: "Realtime device state / status channel" },
];

const METHOD_COLOR: Record<string, { bg: string; fg: string }> = {
  GET: { bg: "rgba(14,116,144,0.14)", fg: "#0e7490" },
  POST: { bg: "rgba(4,120,87,0.14)", fg: "#047857" },
  PATCH: { bg: "rgba(217,119,6,0.16)", fg: "#b45309" },
  DELETE: { bg: "rgba(220,38,38,0.14)", fg: "#dc2626" },
  WSS: { bg: "rgba(139,92,246,0.14)", fg: "#7c3aed" },
};

export default function DeveloperPanel() {
  const { liveStatus } = useConsole();
  const { samples, stats, probe, busy } = useControlPlaneProbe(30_000);

  // Only include successful probe samples — a network failure (ms === null) is
  // not the same as a 0 ms RTT, so absent readings are dropped from the chart.
  const rttPoints = samples.filter((s) => s.ok && s.ms !== null).map((s) => s.ms as number);

  const wsIcon = liveStatus === "live" ? Wifi : WifiOff;
  const wsColor =
    liveStatus === "live" ? "#16a34a" : liveStatus === "connecting" ? "var(--cv-accent)" : "#dc2626";

  return (
    <div className="space-y-6 pt-1">
      {/* ── Connection ────────────────────────────────── */}
      <SectionTitle>Control-plane connection</SectionTitle>
      <Surface padded={false}>
        <div className="px-5 py-1">
          <DetailRow label="Base URL">
            <code className="font-mono text-xs">{CONTROL_PLANE_URL}</code>
          </DetailRow>
          <DetailRow label="WebSocket URL">
            <code className="font-mono text-xs">{CONTROL_PLANE_WS}</code>
          </DetailRow>
          <DetailRow label="Realtime link">
            <span className="inline-flex items-center gap-2" style={{ color: wsColor }}>
              <StatusDot online={liveStatus === "live"} pulse={liveStatus === "live"} />
              {liveStatus === "live"
                ? "Connected"
                : liveStatus === "connecting"
                  ? "Connecting…"
                  : "Offline"}
            </span>
          </DetailRow>
        </div>
      </Surface>
      <div className="grid gap-3 sm:grid-cols-2">
        <CopyField label="Base URL" value={CONTROL_PLANE_URL} />
        <CopyField label="WebSocket URL" value={CONTROL_PLANE_WS} />
      </div>

      {/* ── RTT probe ─────────────────────────────────── */}
      <SectionTitle>Reachability probe</SectionTitle>
      <Callout tone="info">
        RTT is measured via GET /devices — the same request a relay command pays before the server
        routes it to MQTT. Sampled every 30 s while this tab is visible.
      </Callout>
      <Surface>
        <div className="mb-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {[
            {
              label: "Last RTT",
              value:
                stats.last?.ms != null
                  ? `${stats.last.ms} ms`
                  : stats.last
                    ? "Fail"
                    : "—",
            },
            { label: "P50", value: stats.p50 != null ? `${stats.p50} ms` : "—" },
            { label: "P95", value: stats.p95 != null ? `${stats.p95} ms` : "—" },
            {
              label: "Failures",
              value: stats.count > 0 ? `${stats.failures} / ${stats.count}` : "—",
            },
          ].map((k) => (
            <div key={k.label}>
              <div
                className="text-[10px] font-bold uppercase tracking-[0.12em]"
                style={{ color: "var(--cv-muted)" }}
              >
                {k.label}
              </div>
              <div
                className="mt-1 text-xl font-extrabold tabular-nums"
                style={{ color: "var(--cv-accent-hi)" }}
              >
                {k.value}
              </div>
            </div>
          ))}
        </div>

        {rttPoints.length > 1 ? (
          <Sparkline
            points={rttPoints}
            color="var(--cv-accent)"
            height={56}
            width={560}
          />
        ) : (
          <div
            className="flex h-14 items-center justify-center rounded-xl border border-dashed text-xs"
            style={{ borderColor: "var(--cv-border)", color: "var(--cv-muted)" }}
          >
            {busy ? "Probing…" : "Awaiting first sample…"}
          </div>
        )}

        <div className="mt-3 flex justify-end">
          <Button variant="secondary" icon={RefreshCcw} onClick={probe} busy={busy}>
            Probe now
          </Button>
        </div>
      </Surface>

      {/* ── API endpoints ─────────────────────────────── */}
      <SectionTitle>API endpoints</SectionTitle>
      <div
        className="overflow-hidden rounded-2xl border"
        style={{ borderColor: "var(--cv-border)" }}
      >
        {ENDPOINTS.map((ep, i) => {
          const mc = METHOD_COLOR[ep.method] ?? METHOD_COLOR.GET;
          return (
            <div
              key={`${ep.method}:${ep.path}`}
              className="flex items-center gap-3 px-4 py-2.5"
              style={{
                borderTop: i > 0 ? `1px solid var(--cv-border)` : undefined,
                background: "var(--cv-card)",
              }}
            >
              <span
                className="w-11 shrink-0 rounded px-1 py-0.5 text-center text-[9px] font-bold"
                style={{ background: mc.bg, color: mc.fg }}
              >
                {ep.method}
              </span>
              <code
                className="text-xs font-mono"
                style={{ color: "var(--cv-text)" }}
              >
                {ep.path}
              </code>
              <span
                className="ml-auto hidden shrink-0 text-[11px] sm:block"
                style={{ color: "var(--cv-muted)" }}
              >
                {ep.desc}
              </span>
            </div>
          );
        })}
      </div>

      {/* ── Request inspector ─────────────────────────── */}
      <SectionTitle>Request inspector</SectionTitle>
      <RequestInspector />

      {/* ── Build info ────────────────────────────────── */}
      <SectionTitle>Build information</SectionTitle>
      <Surface padded={false}>
        <div className="px-5 py-1">
          <DetailRow label="Node environment">{process.env.NODE_ENV ?? "—"}</DetailRow>
          <DetailRow label="Build version">
            {process.env.NEXT_PUBLIC_BUILD_VERSION ?? "Not set"}
          </DetailRow>
          <DetailRow label="Control-plane URL">{CONTROL_PLANE_URL}</DetailRow>
          <DetailRow label="Console agent">
            {typeof navigator !== "undefined" ? navigator.userAgent.split(" ").pop() ?? "—" : "—"}
          </DetailRow>
        </div>
      </Surface>
    </div>
  );
}
