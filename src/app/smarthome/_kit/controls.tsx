"use client";

/**
 * Device controls that behave like the thing they control.
 *
 * A switch is the right control for exactly one kind of device: something with
 * two states and nothing in between. We were using it for almost everything —
 * a lamp that dims, a fan with four speeds, a curtain that stops anywhere, a
 * lock. In each of those a switch throws away most of what the device can do
 * and makes the user go hunting for the rest.
 *
 * What is here instead:
 *
 *   LevelSlider    a tall fill you drag directly, for anything continuous.
 *                  The whole body is the target, not a 16px thumb.
 *   PowerDial      a large round press for on/off, with the level drawn round
 *                  the rim so brightness is legible before you touch it.
 *   ModeSelector   named choices as one row, for things with a few settings.
 *   SlideToConfirm a deliberate gesture, for actions that unlock a door.
 *
 * Three rules run through all of them:
 *
 *   1. **Direct manipulation.** Dragging a light from 20% to 80% should feel
 *      like moving light, not like operating a form widget.
 *   2. **The keyboard gets the same power as the finger.** Every one of these
 *      is a real ARIA widget with arrow keys, not a div with an onClick.
 *   3. **Optimism, then truth.** The control follows your finger immediately
 *      and reconciles against what the device reports, because a control that
 *      waits for a round trip over MQTT feels broken even when it is working.
 */

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { Check, Lock, Power } from "lucide-react";
import { haptic, type FieldStatus } from "@/lib/smarthome-realtime";

/* ------------------------------------------------------------------ utils -- */

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Snap to a step without accumulating float error at the ends. */
function snap(v: number, min: number, max: number, step: number): number {
  const n = Math.round((v - min) / step) * step + min;
  return clamp(Number(n.toFixed(4)), min, max);
}

function statusRing(status: FieldStatus): string {
  return status === "pending"
    ? "ring-2 ring-[var(--cv-accent)]/40"
    : status === "failed"
      ? "ring-2 ring-red-500/60"
      : "";
}

/* ----------------------------------------------------------- LevelSlider -- */

export interface LevelSliderProps {
  value: number;
  onChange: (v: number) => void;
  /** Fired once when the drag ends, for callers that want to avoid a stream. */
  onCommit?: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label: string;
  /** Rendered at the foot of the track. */
  icon?: LucideIcon;
  /** Track fill. Falls back to the theme accent. */
  accent?: string;
  /** Drawn dark and inert; still focusable so its state is announced. */
  disabled?: boolean;
  status?: FieldStatus;
  /** "%" by default. */
  unit?: string;
  /** Overrides the spoken value, e.g. "Medium" instead of "66 percent". */
  valueText?: (v: number) => string;
  height?: number;
  /** Off is a real state, not zero: a lamp at 0% is still switched on. */
  off?: boolean;
}

/**
 * A vertical fill you drag.
 *
 * Vertical rather than horizontal because the metaphor matches almost
 * everything it controls — brightness, volume, how open a curtain is, how full
 * a tank is. Up is more. A horizontal track for "raise the blind" needs a
 * label to explain which end is which; this does not.
 *
 * Sizing is deliberate: a 16px thumb on a thin rail is a miss on a phone and
 * an unusable target on a wall tablet. The whole column is live, so hitting
 * it is trivial and fine adjustment is a slow drag rather than a precise
 * press.
 */
export function LevelSlider({
  value,
  onChange,
  onCommit,
  min = 0,
  max = 100,
  step = 1,
  label,
  icon: Icon,
  accent,
  disabled,
  status = "idle",
  unit = "%",
  valueText,
  height = 200,
  off,
}: LevelSliderProps) {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [dragging, setDragging] = useState(false);
  /*
   * While dragging, the finger is the truth. Without this the control fights
   * the device: you drag to 70, the lamp reports 40 from before your last
   * change, and the fill jumps backwards under your thumb.
   */
  const [local, setLocal] = useState(value);
  const shown = dragging ? local : value;
  const pct = max > min ? ((shown - min) / (max - min)) * 100 : 0;

  useEffect(() => {
    if (!dragging) setLocal(value);
  }, [value, dragging]);

  const fromPointer = useCallback(
    (clientY: number): number => {
      const el = trackRef.current;
      if (!el) return shown;
      const r = el.getBoundingClientRect();
      // Inverted: the top of the track is the maximum.
      const ratio = 1 - (clientY - r.top) / r.height;
      return snap(min + ratio * (max - min), min, max, step);
    },
    [min, max, step, shown],
  );

  const begin = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const el = trackRef.current;
    if (!el) return;
    el.setPointerCapture(e.pointerId);
    const v = fromPointer(e.clientY);
    setDragging(true);
    setLocal(v);
    haptic();
    onChange(v);
  };

  const move = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging || disabled) return;
    const v = fromPointer(e.clientY);
    if (v !== local) {
      setLocal(v);
      onChange(v);
    }
  };

  const end = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    trackRef.current?.releasePointerCapture?.(e.pointerId);
    setDragging(false);
    onCommit?.(local);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (disabled) return;
    // Coarse by default, fine with shift — the same convention as a native
    // range, so nobody has to learn anything new.
    const big = Math.max(step, Math.round((max - min) / 20));
    const d = e.shiftKey ? step : big;
    let next: number | null = null;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") next = shown + d;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") next = shown - d;
    else if (e.key === "Home") next = min;
    else if (e.key === "End") next = max;
    else if (e.key === "PageUp") next = shown + big * 2;
    else if (e.key === "PageDown") next = shown - big * 2;
    if (next === null) return;
    e.preventDefault();
    const v = snap(next, min, max, step);
    setLocal(v);
    onChange(v);
    onCommit?.(v);
  };

  const tint = accent || "var(--cv-accent)";
  const dimmed = disabled || off;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={trackRef}
        role="slider"
        tabIndex={disabled ? -1 : 0}
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={Math.round(shown)}
        aria-valuetext={valueText ? valueText(shown) : `${Math.round(shown)}${unit}`}
        aria-disabled={disabled || undefined}
        aria-orientation="vertical"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
        onKeyDown={onKey}
        className={`relative w-[76px] shrink-0 overflow-hidden rounded-[28px] border border-white/10 bg-black/30 outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--cv-accent)] ${statusRing(status)} ${
          disabled ? "cursor-not-allowed opacity-45" : "cursor-grab active:cursor-grabbing"
        }`}
        style={{ height, touchAction: "none" }}
      >
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0"
          style={{
            height: `${pct}%`,
            background: dimmed
              ? "linear-gradient(180deg, rgba(148,163,184,0.35), rgba(148,163,184,0.18))"
              : `linear-gradient(180deg, ${tint}, ${tint}66)`,
            // No easing while dragging: a transition here lags the finger and
            // reads as the control being slow rather than smooth.
            transition: dragging ? "none" : "height 320ms cubic-bezier(0.22,1,0.36,1)",
          }}
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center pt-3">
          <span className="text-sm font-bold tabular-nums text-white drop-shadow">
            {off ? "Off" : `${Math.round(shown)}${unit}`}
          </span>
        </div>
        {Icon && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center pb-3">
            <Icon className={`h-5 w-5 ${dimmed ? "text-slate-400" : "text-white/90"}`} />
          </div>
        )}
      </div>
      <span className="text-[11px] font-medium text-slate-400">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------- PowerDial -- */

/**
 * A large round press for on/off, with the level around the rim.
 *
 * Replaces a switch where a switch was hiding information: on a dimmable lamp
 * the toggle said "on" whether it was at 5% or 100%. The ring carries the
 * level, the fill carries on/off, and the word is still there because a ring
 * is not a substitute for a word somebody may be relying on.
 */
export function PowerDial({
  on,
  onToggle,
  level,
  label,
  accent,
  disabled,
  status = "idle",
  size = 132,
}: {
  on: boolean;
  onToggle: () => void;
  /** 0–100, or null when the device has no level. */
  level?: number | null;
  label: string;
  accent?: string;
  disabled?: boolean;
  status?: FieldStatus;
  size?: number;
}) {
  const tint = accent || "var(--cv-accent)";
  const stroke = 6;
  const r = size / 2 - stroke;
  const circ = 2 * Math.PI * r;
  const lit = on && !disabled;

  return (
    <button
      type="button"
      onClick={() => {
        if (disabled) return;
        haptic();
        onToggle();
      }}
      disabled={disabled}
      aria-pressed={on}
      aria-label={`${on ? "Turn off" : "Turn on"} ${label}`}
      className={`relative flex items-center justify-center rounded-full outline-none transition active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--cv-accent)] disabled:opacity-45 disabled:active:scale-100 ${statusRing(status)}`}
      style={{ width: size, height: size }}
    >
      <span
        className="absolute inset-0 rounded-full transition-[background,box-shadow] duration-300"
        style={{
          background: lit
            ? `radial-gradient(circle at 50% 35%, ${tint}55, ${tint}18 60%, transparent 72%)`
            : "rgba(255,255,255,0.04)",
          boxShadow: lit ? `0 0 34px -6px ${tint}` : "none",
        }}
      />
      {typeof level === "number" && (
        <svg className="absolute inset-0 -rotate-90" width={size} height={size} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.10)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={lit ? tint : "rgba(148,163,184,0.5)"}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(clamp(level, 0, 100) / 100) * circ} ${circ}`}
            style={{ transition: "stroke-dasharray 380ms cubic-bezier(0.22,1,0.36,1)" }}
          />
        </svg>
      )}
      <span className="relative flex flex-col items-center gap-1">
        <Power className={`h-7 w-7 ${lit ? "text-white" : "text-slate-400"}`} />
        <span className={`text-[11px] font-bold uppercase tracking-wider ${lit ? "text-white" : "text-slate-400"}`}>
          {on ? "On" : "Off"}
        </span>
      </span>
    </button>
  );
}

/* ---------------------------------------------------------- ModeSelector -- */

/**
 * A few named choices, all visible at once.
 *
 * Better than a dropdown for three or four options because the alternatives
 * are readable without opening anything, and better than a switch because the
 * options have names — "Medium" is a setting a person asked for, where 66% is
 * a number they have to translate.
 */
export function ModeSelector<T extends string | number>({
  value,
  options,
  onChange,
  label,
  accent,
  disabled,
  status = "idle",
}: {
  value: T | null;
  options: { value: T; label: string; icon?: LucideIcon }[];
  onChange: (v: T) => void;
  label: string;
  accent?: string;
  disabled?: boolean;
  status?: FieldStatus;
}) {
  const tint = accent || "var(--cv-accent)";
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={`inline-flex flex-wrap gap-1 rounded-2xl border border-white/10 bg-black/25 p-1 ${statusRing(status)} ${disabled ? "opacity-45" : ""}`}
    >
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => {
              haptic();
              onChange(o.value);
            }}
            className={`flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-sm font-semibold outline-none transition active:scale-95 focus-visible:ring-2 focus-visible:ring-[var(--cv-accent)] disabled:active:scale-100 ${
              active ? "text-white" : "text-slate-300 hover:bg-white/5"
            }`}
            style={active ? { background: tint, boxShadow: `0 0 18px -6px ${tint}` } : undefined}
          >
            {Icon && <Icon className="h-4 w-4" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------- SlideToConfirm -- */

/**
 * A deliberate gesture for something you should not do by accident.
 *
 * Unlocking a door is not the same class of action as turning on a lamp, and
 * giving them the same control is how a pocket unlocks a front door. A switch
 * is one tap; this needs a sustained drag across the whole control, which is
 * essentially impossible to do without meaning to.
 *
 * Keyboard users get Enter or Space, which is the equivalent commitment: it
 * cannot happen by brushing past.
 */
export function SlideToConfirm({
  onConfirm,
  label,
  hint,
  accent = "#ef4444",
  disabled,
  status = "idle",
  icon: Icon = Lock,
}: {
  onConfirm: () => void;
  label: string;
  hint?: string;
  accent?: string;
  disabled?: boolean;
  status?: FieldStatus;
  icon?: LucideIcon;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [done, setDone] = useState(false);
  const id = useId();
  const KNOB = 52;

  const width = () => (railRef.current?.getBoundingClientRect().width ?? 240) - KNOB - 8;

  const finish = () => {
    setDone(true);
    haptic();
    onConfirm();
    // Reset shortly after, so the control is ready for the reverse action
    // rather than sitting in a completed state nobody can undo.
    window.setTimeout(() => {
      setDone(false);
      setX(0);
    }, 1200);
  };

  const move = (clientX: number) => {
    const rail = railRef.current;
    if (!rail) return;
    const r = rail.getBoundingClientRect();
    setX(clamp(clientX - r.left - KNOB / 2, 0, width()));
  };

  const release = () => {
    setDragging(false);
    // Nine tenths, not the full width: asking someone to hit the exact end of
    // the rail turns a safety gesture into a dexterity test.
    if (x >= width() * 0.9) finish();
    else setX(0);
  };

  const pct = width() > 0 ? (x / width()) * 100 : 0;

  return (
    <div className="w-full">
      <div
        ref={railRef}
        className={`relative h-[60px] w-full select-none overflow-hidden rounded-full border border-white/10 bg-black/30 ${statusRing(status)} ${disabled ? "opacity-45" : ""}`}
      >
        <div
          className="pointer-events-none absolute inset-y-0 left-0"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, ${accent}44, ${accent}22)`,
            transition: dragging ? "none" : "width 260ms ease-out",
          }}
        />
        <span
          id={id}
          className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-300"
          style={{ opacity: done ? 0 : clamp(1 - pct / 60, 0, 1) }}
        >
          {label}
        </span>
        {done && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center gap-2 text-sm font-bold text-white">
            <Check className="h-4 w-4" /> Done
          </span>
        )}
        <button
          type="button"
          disabled={disabled}
          aria-describedby={id}
          aria-label={label}
          onPointerDown={(e) => {
            if (disabled) return;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            setDragging(true);
          }}
          onPointerMove={(e) => dragging && move(e.clientX)}
          onPointerUp={release}
          onPointerCancel={release}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              finish();
            }
          }}
          className="absolute top-1 flex h-[52px] w-[52px] items-center justify-center rounded-full outline-none transition-shadow focus-visible:ring-2 focus-visible:ring-[var(--cv-accent)]"
          style={{
            left: 4 + x,
            background: accent,
            transition: dragging ? "none" : "left 260ms cubic-bezier(0.22,1,0.36,1)",
            touchAction: "none",
            cursor: disabled ? "not-allowed" : "grab",
          }}
        >
          <Icon className="h-5 w-5 text-white" />
        </button>
      </div>
      {hint && <p className="mt-1.5 text-center text-[11px] text-slate-500">{hint}</p>}
    </div>
  );
}
