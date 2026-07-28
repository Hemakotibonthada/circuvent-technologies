"use client";

/**
 * Live floorplan.
 *
 * Zones are the account's REAL rooms (`/rooms`), devices are the account's REAL
 * devices (`/devices`), and every dot's colour and label is derived from the
 * state the firmware actually published — refreshed over the live websocket.
 *
 * The previous version shipped a `demoFleet()` plus a `tickFleet()` simulator
 * that randomly flipped motion sensors, gates and locks and jittered watts.
 * That is gone: with no devices we show an honest empty state instead.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, LayoutGrid, RefreshCw, TriangleAlert } from "lucide-react";
import { controlPlane, type Device, type Room } from "@/lib/control-plane";
import { useConsole } from "../ConsoleProvider";
import { deviceMeta } from "../DeviceControls";

interface Zone { id: string; label: string; x: number; y: number; w: number; h: number }

const CANVAS_W = 800;
const GAP = 16;
const PAD = 16;

/**
 * Lay the real rooms out on a grid that always fills the canvas. Room order
 * follows the server's `sort`, so the plan is stable between loads.
 */
function buildZones(names: string[]): { zones: Zone[]; height: number } {
  if (names.length === 0) return { zones: [], height: 200 };
  const cols = names.length <= 2 ? names.length : names.length <= 6 ? 3 : 4;
  const rows = Math.ceil(names.length / cols);
  const w = (CANVAS_W - PAD * 2 - GAP * (cols - 1)) / cols;
  const h = 150;
  const zones = names.map((name, i) => ({
    id: name,
    label: `${i + 1} · ${name}`,
    x: PAD + (i % cols) * (w + GAP),
    y: PAD + Math.floor(i / cols) * (h + GAP),
    w,
    h,
  }));
  return { zones, height: PAD * 2 + rows * h + (rows - 1) * GAP };
}

interface Status { color: string; label: string; active: boolean; alert: boolean }

/** Colour + label derived purely from the device's published state. */
function statusOf(d: Device): Status {
  const s = d.state || {};
  if (d.online === false) return { color: "#64748b", label: "offline", active: false, alert: false };
  if (s.dryRun || s.overflow || s.sos || s.leak || s.tamper) return { color: "#ef4444", label: "alert", active: true, alert: true };
  if (s.motion) return { color: "#f59e0b", label: "motion", active: true, alert: false };
  switch (d.type) {
    case "rfid-gate":
      return String(s.barrier) === "open"
        ? { color: "#22c55e", label: "open", active: true, alert: false }
        : { color: "#38bdf8", label: "closed", active: false, alert: false };
    case "facedoor":
    case "smart-lock":
      return s.locked
        ? { color: "#38bdf8", label: "locked", active: false, alert: false }
        : { color: "#22c55e", label: "unlocked", active: true, alert: false };
    case "watertank":
      return s.pump
        ? { color: "#06b6d4", label: `${Number(s.ohPct ?? 0)}% ▲`, active: true, alert: false }
        : { color: "#38bdf8", label: `${Number(s.ohPct ?? 0)}%`, active: false, alert: false };
    case "aquaguard":
      return { color: "#38bdf8", label: `${Number(s.level ?? 0)}%`, active: !!s.pump, alert: false };
    case "touchboard": {
      const on = [s.g1, s.g2, s.g3].filter(Boolean).length;
      return on
        ? { color: "#22c55e", label: `${on}/3 on`, active: true, alert: false }
        : { color: "#475569", label: "off", active: false, alert: false };
    }
    case "home-hub": {
      const on = [s.r1, s.r2, s.r3, s.r4].filter(Boolean).length;
      return on
        ? { color: "#22c55e", label: `${on}/4 on`, active: true, alert: false }
        : { color: "#475569", label: "off", active: false, alert: false };
    }
    default: {
      const on = !!(s.power ?? s.pump ?? s.on);
      return on
        ? { color: "#22c55e", label: "on", active: true, alert: false }
        : { color: "#475569", label: "off", active: false, alert: false };
    }
  }
}

const UNASSIGNED = "Unassigned";

export default function FloorplanPage() {
  const { subscribe } = useConsole();
  const [devices, setDevices] = useState<Device[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [d, r] = await Promise.all([controlPlane.devices(), controlPlane.rooms()]);
    if (d.ok) {
      setDevices(d.data.devices ?? []);
      setError(null);
    } else {
      setError(d.status === 0 ? "Cannot reach the control plane." : d.status === 401 ? "Please sign in again." : `Control plane returned ${d.status}.`);
    }
    if (r.ok) setRooms(r.data.rooms ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // Live state pushed by the control plane over the websocket.
  useEffect(
    () =>
      subscribe((u) => {
        if (u.kind !== "state") return;
        setDevices((prev) =>
          prev.map((d) => (d.id === u.deviceId ? { ...d, state: u.payload as Record<string, unknown>, online: true } : d))
        );
      }),
    [subscribe]
  );

  // Zone names come from the real room list, plus any room a device reports
  // that has no room record yet, plus a bucket for unassigned devices.
  const zoneNames = useMemo(() => {
    const ordered = [...rooms].sort((a, b) => a.sort - b.sort).map((r) => r.name);
    const seen = new Set(ordered);
    for (const d of devices) {
      const name = (d.room || "").trim();
      if (name && !seen.has(name)) { ordered.push(name); seen.add(name); }
    }
    if (devices.some((d) => !(d.room || "").trim())) ordered.push(UNASSIGNED);
    return ordered.filter((name) => devices.some((d) => ((d.room || "").trim() || UNASSIGNED) === name));
  }, [rooms, devices]);

  const { zones, height } = useMemo(() => buildZones(zoneNames), [zoneNames]);

  const byZone = useMemo(() => {
    const m: Record<string, Device[]> = {};
    for (const z of zones) m[z.id] = [];
    for (const d of devices) {
      const key = (d.room || "").trim() || UNASSIGNED;
      (m[key] ||= []).push(d);
    }
    return m;
  }, [devices, zones]);

  const active = devices.find((d) => d.id === selected) || null;
  const activeStatus = active ? statusOf(active) : null;
  const onlineCount = devices.filter((d) => d.online).length;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Home floorplan</h1>
          <p className="mt-0.5 text-sm text-slate-400">
            {loading
              ? "Loading your devices…"
              : devices.length
              ? `${onlineCount}/${devices.length} devices online across ${zones.length} room${zones.length === 1 ? "" : "s"}`
              : "No devices yet"}
          </p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/10"
        >
          <RefreshCw className="h-4 w-4" /> Refresh
        </button>
      </div>

      {error && (
        <div role="alert" className="mb-4 flex items-center gap-2 rounded-xl border border-red-500/25 bg-red-500/[0.07] px-4 py-3 text-sm text-red-200">
          <TriangleAlert className="h-4 w-4 shrink-0" /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-slate-500" /></div>
      ) : devices.length === 0 ? (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-16 text-center">
          <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-slate-400">
            <LayoutGrid className="h-6 w-6" />
          </div>
          <h3 className="font-semibold text-white">No devices to place</h3>
          <p className="mt-1 max-w-sm text-sm text-slate-400">
            Claim a Circuvent device and assign it to a room — it will appear here with its live status.
          </p>
          <Link href="/smarthome" className="mt-4 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-white transition hover:bg-white/15">
            Go to devices
          </Link>
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <svg viewBox={`0 0 ${CANVAS_W} ${height}`} className="w-full" style={{ maxHeight: 520 }}>
            <defs>
              <linearGradient id="fpwall" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#0b1220" />
                <stop offset="1" stopColor="#0a0f1c" />
              </linearGradient>
            </defs>
            <rect x="0" y="0" width={CANVAS_W} height={height} rx="16" fill="url(#fpwall)" />
            {zones.map((z) => (
              <g key={z.id}>
                <rect x={z.x} y={z.y} width={z.w} height={z.h} rx="12" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.12)" />
                <text x={z.x + 12} y={z.y + 22} fill="#64748b" fontSize="12" fontWeight={700}>{z.label}</text>
                {(byZone[z.id] || []).map((d, i) => {
                  const cols = Math.max(1, Math.floor((z.w - 24) / 92));
                  const cx = z.x + 46 + (i % cols) * 92;
                  const cy = z.y + 58 + Math.floor(i / cols) * 66;
                  const st = statusOf(d);
                  const meta = deviceMeta(d.type);
                  const isSel = selected === d.id;
                  return (
                    <g key={d.id} onClick={() => setSelected(d.id)} style={{ cursor: "pointer" }} role="button" aria-label={`${d.name || d.id}: ${st.label}`}>
                      {st.active && <circle cx={cx} cy={cy} r="22" fill={st.color} opacity="0.18" className="animate-pulse" />}
                      <circle cx={cx} cy={cy} r="16" fill={st.color} opacity={st.active ? 0.9 : 0.5} stroke={isSel ? "#fff" : "rgba(255,255,255,0.25)"} strokeWidth={isSel ? 2.5 : 1} />
                      <text x={cx} y={cy + 4} textAnchor="middle" fontSize="13">{glyph(meta.label, d.type)}</text>
                      <text x={cx} y={cy + 30} textAnchor="middle" fill="#cbd5e1" fontSize="9">{(d.name || d.id).slice(0, 12)}</text>
                      <text x={cx} y={cy + 41} textAnchor="middle" fill={st.color} fontSize="8" fontWeight={700}>{st.label}</text>
                    </g>
                  );
                })}
              </g>
            ))}
          </svg>
        </div>
      )}

      {active && activeStatus && (
        <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-lg font-bold text-white">{active.name || active.id}</div>
              <div className="text-sm text-slate-400">
                {deviceMeta(active.type).label} · <span style={{ color: activeStatus.color }}>{activeStatus.label}</span>
              </div>
            </div>
            <Link href={`/smarthome/device/${encodeURIComponent(active.id)}`} className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-white hover:bg-white/10">
              Open controls
            </Link>
          </div>
          <pre className="mt-3 max-h-40 overflow-auto rounded-xl border border-white/10 bg-black/30 p-3 text-xs text-slate-300">
            {JSON.stringify(active.state, null, 2)}
          </pre>
        </div>
      )}

      {devices.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-4 text-xs text-slate-400">
          <Legend color="#22c55e" label="Active / on" />
          <Legend color="#38bdf8" label="Idle / secured" />
          <Legend color="#f59e0b" label="Motion" />
          <Legend color="#ef4444" label="Alert" />
          <Legend color="#64748b" label="Offline" />
        </div>
      )}
    </div>
  );
}

function glyph(_label: string, type: string): string {
  const g: Record<string, string> = {
    "rfid-gate": "🚗", facedoor: "🚪", "smart-lock": "🔒", watertank: "🌊", aquaguard: "💧",
    touchboard: "🎛️", "motion-sensor": "🚶", "energy-monitor": "⚡", "smart-fan": "🌀",
    thermostat: "❄️", ac: "❄️", "smart-plug": "🔌", "smart-switch": "🎚️", "smart-light": "💡", "home-hub": "🏠", curtain: "🪟",
  };
  return g[type] || "📟";
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="inline-block h-3 w-3 rounded-full" style={{ background: color }} /> {label}
    </span>
  );
}
