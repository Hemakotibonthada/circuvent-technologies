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
import { StatusDot, formatRelative } from "./primitives";

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
    case "sentinel": {
      if (s.gasAlarm) return "Gas alarm";
      if (s.hasGas && s.gasWarmingUp) return "Warming up";
      const t = num(s.temp);
      const h = num(s.humidity);
      if (s.climateOk && t != null && h != null) return `${t.toFixed(0)}° · ${h.toFixed(0)}%`;
      // Relay count varies by board, so the denominator comes from what the
      // device reported — a two-relay panel must not read "1/4 on".
      const n = num(s.relays);
      if (n == null) return null;
      return onOf(...Array.from({ length: Math.max(0, Math.min(32, Math.round(n))) }, (_, i) => `r${i + 1}`));
    }
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
      className={`${dim} ${RING[status]} flex shrink-0 items-center justify-center rounded-full text-[10px] font-bold uppercase tracking-wide transition active:scale-90 disabled:opacity-40 disabled:active:scale-100`}
      style={
        mp.on
          ? { background: "var(--cv-gradient)", color: "#fff", boxShadow: "var(--cv-shadow-1)" }
          : { background: "var(--cv-input-bg)", border: "1px solid var(--cv-border)", color: "var(--cv-muted)" }
      }
    >
      {mp.on ? "ON" : "OFF"}
    </button>
  );
}

/**
 * Accessory tile.
 *
 * Modelled on the Home app's accessory grid: an active accessory inverts to a
 * bright fill with dark text so its state is readable at a glance across a wall
 * of tiles, while an inactive one recedes into the canvas. The circular icon
 * badge is the on/off target; the rest of the tile opens the device.
 *
 * Navigation is an absolutely-positioned overlay link rather than a wrapper
 * around the content, because the toggle is itself a button and a button nested
 * inside an anchor is invalid markup that screen readers announce incoherently.
 */
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
  const mp = masterPower(device);
  const on = Boolean(mp?.on) && device.online;
  const tint = meta.accent;

  // Secondary line. Offline devices report when they were last heard from
  // rather than a stale state, so a dark tile is never mistaken for "off".
  const statusLine = !device.online
    ? device.last_seen
      ? `No response · ${formatRelative(device.last_seen)}`
      : "Never seen"
    : mp
      ? mp.on
        ? "On"
        : "Off"
      : "Online";

  return (
    <div
      className={`cv-tile group relative flex min-h-[128px] flex-col justify-between p-4 ${
        on ? "cv-tile-on" : ""
      } ${status === "pending" ? "cv-pending" : ""} ${device.online ? "" : "opacity-65"}`}
    >
      <Link
        href={target}
        aria-label={`Open ${device.name}`}
        className="absolute inset-0 z-0 focus:outline-none focus-visible:ring-2"
        style={{ borderRadius: "inherit", "--tw-ring-color": "var(--cv-accent)" } as React.CSSProperties}
      />

      <div className="pointer-events-none relative z-10 flex items-start justify-between gap-2">
        {mp ? (
          <button
            type="button"
            onClick={() => {
              haptic();
              onSend(mp.cmd(!mp.on) as Record<string, unknown>);
            }}
            disabled={!device.online}
            aria-label={`${mp.on ? "Turn off" : "Turn on"} ${device.name}`}
            title={device.online ? mp.label : "Device offline"}
            className={`pointer-events-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition active:scale-90 disabled:active:scale-100 ${RING[status]}`}
            style={
              on
                ? { background: tint, color: "#fff", boxShadow: "var(--cv-shadow-1)" }
                : { background: "var(--cv-card-hi)", color: tint }
            }
          >
            <Icon className="h-[22px] w-[22px]" />
          </button>
        ) : (
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--cv-card-hi)", color: tint }}
          >
            <Icon className="h-[22px] w-[22px]" />
          </span>
        )}

        <div className="flex items-center gap-2">
          {readout && (
            <span className="cv-num text-[15px] font-semibold" style={{ color: "var(--cv-text)" }}>
              {readout}
            </span>
          )}
          {onFavorite && (
            <button
              type="button"
              onClick={onFavorite}
              aria-label={device.favorite ? "Remove from favourites" : "Add to favourites"}
              className="pointer-events-auto shrink-0 opacity-50 transition hover:opacity-100"
            >
              <Star
                className="h-4 w-4"
                fill={device.favorite ? "#f0a020" : "none"}
                style={{ color: device.favorite ? "#f0a020" : "var(--cv-muted)" }}
              />
            </button>
          )}
        </div>
      </div>

      <div className="pointer-events-none relative z-10 mt-3 min-w-0">
        <div className="truncate text-[15px] font-semibold leading-tight" style={{ color: "var(--cv-text)" }}>
          {device.name}
        </div>
        <div
          className="mt-1 flex min-w-0 items-center gap-1.5 text-[13px] leading-tight"
          style={{ color: "var(--cv-muted)" }}
        >
          <StatusDot online={device.online} pulse={false} />
          <span className="truncate">
            {statusLine}
            {device.room ? ` · ${device.room}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
