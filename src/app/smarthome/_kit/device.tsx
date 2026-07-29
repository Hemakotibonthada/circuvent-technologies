"use client";

/**
 * Circuvent Console — device presentation.
 *
 * The tile, the metric readout and the power control are shared by the Overview
 * dashboard, the Devices section and the Spaces section so a relay reads the
 * same everywhere. All values come from `device.state` as reported by firmware;
 * a field the device has not published renders as "—" rather than a zero.
 */

import Link from "next/link";
import { Star } from "lucide-react";
import type { Device } from "@/lib/control-plane";
import { masterPower } from "@/lib/smarthome-command-map";
import { haptic, type FieldStatus } from "@/lib/smarthome-realtime";
import { deviceMeta } from "../DeviceControls";
import { Badge, StatusDot, formatRelative } from "./primitives";

/**
 * Primary readout for a device type, derived from published state.
 * Returns `null` when the device has not reported the field yet — callers show
 * a placeholder instead of implying a measurement of zero.
 */
export function deviceMetric(d: Device): string | null {
  const s = d.state ?? {};
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const onOf = (...keys: string[]) => {
    const present = keys.filter((k) => k in s);
    if (present.length === 0) return null;
    return `${present.filter((k) => Boolean(s[k])).length}/${keys.length} on`;
  };

  switch (d.type) {
    case "aquaguard": {
      const v = num(s.level);
      return v == null ? null : `${v}%`;
    }
    case "watertank": {
      const v = num(s.ohPct);
      return v == null ? null : `${v}%`;
    }
    case "smart-plug":
    case "energy-monitor": {
      const v = num(s.watts);
      return v == null ? null : `${v.toFixed(0)} W`;
    }
    case "guardian":
      if (!("armed" in s) && !("sos" in s)) return null;
      return s.sos ? "SOS" : s.armed ? "Armed" : "Disarmed";
    case "motion-sensor":
      if (!("motion" in s) && !("armed" in s)) return null;
      return s.motion ? "Motion" : s.armed ? "Armed" : "Clear";
    case "smart-switch":
      return onOf("power", "power2");
    case "home-hub":
      return onOf("power", "power2", "power3", "power4");
    case "touchboard":
      return onOf("g1", "g2", "g3");
    case "facedoor":
    case "smart-lock":
      return "locked" in s ? (s.locked ? "Locked" : "Unlocked") : null;
    case "rfid-gate":
      return s.barrier == null ? null : String(s.barrier);
    case "agri-starter":
      return "pump" in s ? (s.pump ? "Pump on" : "Pump off") : null;
    default: {
      const w = num(s.watts);
      if (w != null) return `${w.toFixed(0)} W`;
      return null;
    }
  }
}

/** Instantaneous power draw, when the device actually reports it. */
export function deviceWatts(d: Device): number | null {
  const w = (d.state ?? {}).watts;
  return typeof w === "number" && Number.isFinite(w) ? w : null;
}

const RING: Record<FieldStatus, string> = {
  idle: "",
  pending: "ring-2 ring-cyan-400/60",
  confirmed: "ring-2 ring-emerald-400/70",
  failed: "ring-2 ring-red-400/70",
};

/** Compact on/off control that paints optimistically and rings on confirm. */
export function PowerButton({
  device,
  status,
  onSend,
  size = "md",
}: {
  device: Device;
  status: FieldStatus;
  onSend: (cmd: Record<string, unknown>) => void;
  size?: "sm" | "md";
}) {
  const mp = masterPower(device);
  if (!mp) return null;
  const dim = size === "sm" ? "h-9 w-9" : "h-11 w-11";
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        haptic();
        onSend(mp.cmd(!mp.on) as Record<string, unknown>);
      }}
      disabled={!device.online}
      aria-label={`${mp.on ? "Turn off" : "Turn on"} ${device.name}`}
      title={device.online ? mp.label : "Device offline"}
      className={`${dim} ${RING[status]} flex shrink-0 items-center justify-center rounded-xl text-[10px] font-black uppercase transition active:scale-90 disabled:opacity-40 disabled:active:scale-100`}
      style={
        mp.on
          ? { background: "var(--cv-gradient)", color: "#fff" }
          : { background: "var(--cv-input-bg)", border: "1px solid var(--cv-border)", color: "var(--cv-muted)" }
      }
    >
      {mp.on ? "ON" : "OFF"}
    </button>
  );
}

export function DeviceTile({
  device,
  status,
  onSend,
  onFavorite,
  href,
}: {
  device: Device;
  status: FieldStatus;
  onSend: (cmd: Record<string, unknown>) => void;
  onFavorite?: () => void;
  href?: string;
}) {
  const meta = deviceMeta(device.type);
  const Icon = meta.icon;
  const readout = deviceMetric(device);
  const target = href ?? `/smarthome/device/${encodeURIComponent(device.id)}`;

  return (
    <Link
      href={target}
      className={`cv-card group relative block rounded-2xl p-4 transition hover:brightness-110 ${status === "pending" ? "cv-pending" : ""}`}
    >
      <div className="flex items-start gap-3">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
          style={{ background: `color-mix(in srgb, ${meta.accent} 18%, transparent)` }}
        >
          <Icon className="h-5 w-5" style={{ color: meta.accent }} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="min-w-0 truncate text-sm font-bold" style={{ color: "var(--cv-text)" }}>
              {device.name}
            </span>
            {onFavorite && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onFavorite();
                }}
                aria-label={device.favorite ? "Remove from favourites" : "Add to favourites"}
                className="shrink-0 opacity-60 transition hover:opacity-100"
              >
                <Star className="h-3.5 w-3.5" fill={device.favorite ? "#fbbf24" : "none"} style={{ color: device.favorite ? "#fbbf24" : "var(--cv-muted)" }} />
              </button>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]" style={{ color: "var(--cv-muted)" }}>
            <span className="inline-flex items-center gap-1.5">
              <StatusDot online={device.online} pulse={false} />
              {device.online ? "Online" : device.last_seen ? formatRelative(device.last_seen) : "Never seen"}
            </span>
            {device.room && <span>· {device.room}</span>}
          </div>
        </div>
        <PowerButton device={device} status={status} onSend={onSend} />
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <Badge>{meta.label}</Badge>
        <span className="text-sm font-bold tabular-nums" style={{ color: readout ? "var(--cv-accent-hi)" : "var(--cv-muted)" }}>
          {readout ?? "—"}
        </span>
      </div>
    </Link>
  );
}
