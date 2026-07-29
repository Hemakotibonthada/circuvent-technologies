"use client";

import { Minus, Plus } from "lucide-react";
import { useCallback, useRef } from "react";
import { haptic, type FieldStatus } from "@/lib/smarthome-realtime";

export function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`rounded-2xl cv-card ${className}`}>{children}</div>;
}

export function SectionLabel({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-3 mt-8 mb-4">
      <div className="text-[19px] font-bold leading-tight" style={{ color: "var(--cv-text)" }}>
        {children}
      </div>
      {right}
    </div>
  );
}

/** Ring colour for each command lifecycle state. */
const STATUS_RING: Record<FieldStatus, string> = {
  idle: "transparent",
  pending: "rgba(56,189,248,0.55)",
  confirmed: "rgba(34,197,94,0.65)",
  failed: "rgba(239,68,68,0.7)",
};

/**
 * Accessible on/off switch.
 *
 * The knob position is driven purely by `checked`, which callers update
 * optimistically, so it travels on the same frame as the tap. `status` layers
 * command feedback on top without ever blocking input:
 *   pending   → cyan ring + sweeping shimmer while awaiting the device echo
 *   confirmed → brief green ring once the relay reported back
 *   failed    → red ring after an optimistic rollback
 *
 * `disabled` is reserved for genuinely unavailable controls — an in-flight
 * command must NOT disable the switch or rapid toggling feels broken.
 */
export function Toggle({
  checked,
  onChange,
  disabled,
  label,
  status = "idle",
  size = "md",
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  label?: string;
  status?: FieldStatus;
  size?: "sm" | "md" | "lg";
}) {
  const dims =
    size === "sm"
      ? { w: 40, h: 24, knob: 18, pad: 3 }
      : size === "lg"
        ? { w: 60, h: 34, knob: 27, pad: 3.5 }
        : { w: 52, h: 30, knob: 23, pad: 3.5 };
  const travel = dims.w - dims.knob - dims.pad * 2;

  const handle = useCallback(() => {
    haptic(checked ? 8 : 14);
    onChange(!checked);
  }, [checked, onChange]);

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-busy={status === "pending"}
      disabled={disabled}
      onClick={handle}
      /* -m-2 p-2 gives a >=44px touch target without changing visual size. */
      className="group relative -m-2 p-2 disabled:opacity-40 disabled:cursor-not-allowed touch-manipulation"
    >
      <span
        className={`relative block rounded-full overflow-hidden transition-[background,box-shadow] duration-200 motion-reduce:transition-none ${
          status === "confirmed" ? "cv-pop" : ""
        }`}
        style={{
          width: dims.w,
          height: dims.h,
          background: checked ? "var(--cv-gradient)" : "#334155",
          boxShadow: status === "idle" ? "none" : `0 0 0 3px ${STATUS_RING[status]}`,
        }}
      >
        {status === "pending" && <span aria-hidden className="absolute inset-0 cv-sweep" />}
        <span
          className="absolute top-1/2 block rounded-full bg-white shadow-md transition-transform duration-200 ease-out motion-reduce:transition-none"
          style={{
            width: dims.knob,
            height: dims.knob,
            left: dims.pad,
            marginTop: -dims.knob / 2,
            transform: `translateX(${checked ? travel : 0}px)`,
          }}
        />
      </span>
    </button>
  );
}

/** Inline round-trip readout, e.g. "182 ms". */
export function LatencyBadge({ ms, label = "round trip" }: { ms: number | null; label?: string }) {
  if (ms == null) return null;
  const tone = ms < 400 ? "#22c55e" : ms < 1200 ? "#f59e0b" : "#ef4444";
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums"
      style={{ background: `${tone}1a`, color: tone }}
      title={`Last command ${label}`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: tone }} />
      {Math.round(ms)} ms
    </span>
  );
}

export function ControlRow({
  label,
  hint,
  status = "idle",
  children,
}: {
  label: string;
  hint?: string;
  status?: FieldStatus;
  children: React.ReactNode;
}) {
  const accent =
    status === "pending"
      ? "rgba(56,189,248,0.35)"
      : status === "confirmed"
        ? "rgba(34,197,94,0.4)"
        : status === "failed"
          ? "rgba(239,68,68,0.45)"
          : "rgba(255,255,255,0.05)";
  return (
    <div
      className="flex items-center justify-between gap-3 rounded-xl bg-black/20 px-3.5 py-3 sm:px-4 sm:py-3.5 mb-2.5 transition-colors duration-200 motion-reduce:transition-none hover:bg-black/30"
      style={{ border: `1px solid ${accent}` }}
    >
      <div className="min-w-0">
        <div className="text-slate-100 text-[14px] sm:text-[15px] font-medium truncate">{label}</div>
        {hint && <div className="text-slate-500 text-[11px] sm:text-xs mt-0.5">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 5,
  suffix = "",
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  disabled?: boolean;
}) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const latest = useRef(value);
  latest.current = value;

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  // Press-and-hold ramps the value instead of forcing dozens of taps.
  const start = useCallback(
    (dir: 1 | -1) => {
      const clamp = (n: number) => Math.max(min, Math.min(max, n));
      haptic(8);
      const first = clamp(latest.current + dir * step);
      latest.current = first;
      onChange(first);
      stop();
      timer.current = setInterval(() => {
        const next = clamp(latest.current + dir * step);
        if (next === latest.current) {
          stop();
          return;
        }
        latest.current = next;
        onChange(next);
      }, 220);
    },
    [onChange, step, min, max, stop]
  );

  const btn =
    "h-10 w-10 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white hover:bg-white/10 active:scale-90 transition motion-reduce:transition-none disabled:opacity-40 touch-manipulation";

  return (
    <div className="flex items-center gap-2 sm:gap-3">
      <button
        type="button"
        disabled={disabled || value <= min}
        onPointerDown={() => start(-1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        className={btn}
        aria-label="decrease"
      >
        <Minus className="h-4 w-4" />
      </button>
      <span className="text-white font-semibold tabular-nums w-14 text-center">
        {value}
        {suffix}
      </span>
      <button
        type="button"
        disabled={disabled || value >= max}
        onPointerDown={() => start(1)}
        onPointerUp={stop}
        onPointerLeave={stop}
        onPointerCancel={stop}
        className={btn}
        aria-label="increase"
      >
        <Plus className="h-4 w-4" />
      </button>
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => {
              haptic(8);
              onChange(o.value);
            }}
            className={`px-3 sm:px-3.5 py-1.5 rounded-lg text-sm font-medium transition motion-reduce:transition-none ${
              active ? "text-white" : "text-slate-400 hover:text-slate-200"
            }`}
            style={active ? { background: "var(--cv-gradient)" } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function StatTile({ label, value, accent, hint }: { label: string; value: string; accent?: string; hint?: string }) {
  return (
    <div className="flex-1 min-w-0 rounded-xl border border-white/10 bg-black/20 px-3 py-3.5 sm:px-4 sm:py-4 text-center">
      <div className="cv-num text-[24px] sm:text-[28px] font-bold truncate" style={{ color: accent ?? "var(--cv-text)" }}>
        {value}
      </div>
      <div className="text-[13px] font-medium mt-1" style={{ color: "var(--cv-muted)" }}>{label}</div>
      {hint && <div className="text-[12px] text-slate-600 mt-0.5">{hint}</div>}
    </div>
  );
}

export function ScenePill({
  label,
  active,
  onClick,
  status = "idle",
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  status?: FieldStatus;
}) {
  return (
    <button
      type="button"
      onClick={() => {
        haptic(12);
        onClick();
      }}
      aria-pressed={active}
      className={`relative px-4 py-2.5 rounded-full text-sm capitalize border transition active:scale-95 motion-reduce:transition-none touch-manipulation ${
        active ? "text-white border-transparent" : "text-slate-300 border-white/10 bg-black/20 hover:bg-white/5"
      }`}
      style={{
        ...(active ? { background: "var(--cv-gradient)" } : {}),
        ...(status !== "idle" ? { boxShadow: `0 0 0 2px ${STATUS_RING[status]}` } : {}),
      }}
    >
      {label}
    </button>
  );
}
