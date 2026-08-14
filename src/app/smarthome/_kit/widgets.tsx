"use client";

/**
 * Dashboard widgets.
 *
 * Two families, from two different jobs:
 *
 *   ControlTile   a device you act on. Tinted by its own accent when it is
 *                 doing something, showing name and state as words, with the
 *                 whole tile as the target. Modelled on the phone home-screen
 *                 pattern rather than a list of switches.
 *
 *   MetricWidget  a number you read. Icon, the figure at the size it deserves,
 *                 what it measures, and optionally where it has been. Modelled
 *                 on a building-management dashboard, where the value is the
 *                 point and the chrome should get out of its way.
 *
 * They are deliberately different shapes. A control that looks like a readout
 * invites people to read it and move on; a readout that looks like a control
 * invites them to press it and wonder why nothing happened.
 */

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { haptic, type FieldStatus } from "@/lib/smarthome-realtime";
import { Sparkline } from "./charts";

/* ------------------------------------------------------------ ControlTile -- */

export interface ControlTileProps {
  name: string;
  /** The state in words: "On", "Locked", "72%", "Live". */
  state: string;
  icon: LucideIcon;
  /** True when the device is doing something — drives the tint. */
  active?: boolean;
  accent?: string;
  onPress?: () => void;
  /** Set to render a chevron that opens the full controls. */
  href?: string;
  disabled?: boolean;
  status?: FieldStatus;
  /** Spans two columns. For devices worth more room. */
  wide?: boolean;
  /** Below the state, e.g. "5 actions" or "Indoor 68°". */
  detail?: string;
}

/**
 * One device, as a pressable tile.
 *
 * The important departure from a switch is that the state is a **word in the
 * tile**, not the position of a control you have to interpret. "Locked" reads
 * at a glance and reads correctly in a screenshot, in a photo, and to someone
 * who cannot see which way a switch is thrown.
 *
 * The tint is the second signal, never the only one. Colour alone fails for
 * the eight percent of men with a colour vision deficiency, and fails again in
 * bright sunlight on a phone.
 */
export function ControlTile({
  name,
  state,
  icon: Icon,
  active,
  accent = "var(--cv-accent)",
  onPress,
  href,
  disabled,
  status = "idle",
  wide,
  detail,
}: ControlTileProps) {
  const ring =
    status === "pending"
      ? "ring-2 ring-[var(--cv-accent)]/40"
      : status === "failed"
        ? "ring-2 ring-red-500/60"
        : "";

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <span
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors"
          style={{
            background: active ? accent : "rgba(255,255,255,0.07)",
            boxShadow: active ? `0 0 22px -8px ${accent}` : "none",
          }}
        >
          <Icon className={`h-5 w-5 ${active ? "text-white" : "text-slate-300"}`} />
        </span>
        {href && (
          <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5" />
        )}
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-white">{name}</div>
        <div className="truncate text-xs text-slate-300">{state}</div>
        {detail && <div className="truncate text-[11px] text-slate-500">{detail}</div>}
      </div>
    </>
  );

  const shell = `group relative flex min-h-[104px] flex-col justify-between gap-3 rounded-[22px] border p-3 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-[var(--cv-accent)] ${ring} ${
    wide ? "col-span-2" : ""
  } ${disabled ? "opacity-45" : ""}`;

  const skin: React.CSSProperties = {
    // Tinted, not saturated: a wall of fully-coloured tiles is unreadable, and
    // the point of the tint is to let one active device stand out from ten.
    background: active
      ? `linear-gradient(150deg, ${accent}2e, ${accent}12)`
      : "rgba(255,255,255,0.045)",
    borderColor: active ? `${accent}55` : "rgba(255,255,255,0.09)",
  };

  if (href) {
    return (
      <div className={shell} style={skin}>
        <Link
          href={href}
          aria-label={`Open ${name}`}
          className="absolute inset-0 z-0 rounded-[22px] focus:outline-none"
        />
        {onPress ? (
          <button
            type="button"
            disabled={disabled}
            onClick={(e) => {
              e.preventDefault();
              haptic();
              onPress();
            }}
            aria-label={`Toggle ${name}`}
            className="relative z-10 flex flex-1 flex-col justify-between gap-3 text-left outline-none"
          >
            {body}
          </button>
        ) : (
          <div className="relative z-10 flex flex-1 flex-col justify-between gap-3">{body}</div>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => {
        haptic();
        onPress?.();
      }}
      aria-pressed={active}
      className={shell}
      style={skin}
    >
      {body}
    </button>
  );
}

/* ----------------------------------------------------------- MetricWidget -- */

export interface MetricWidgetProps {
  label: string;
  value: string | number;
  unit?: string;
  icon?: LucideIcon;
  accent?: string;
  /** Optional history. Renders a sparkline under the figure. */
  series?: number[];
  /** Percentage change against the previous period. */
  deltaPct?: number | null;
  /** "Today", "Last 7 days" — shown top right, like a report header. */
  period?: string;
  /** Smaller supporting line under the label. */
  caption?: string;
  href?: string;
}

/**
 * A number, at the size it deserves.
 *
 * The figure leads and everything else is subordinate to it, because the
 * question a dashboard answers is "what is it now" and every pixel spent on
 * chrome is a pixel not spent on the answer.
 *
 * A delta is only drawn when there is one to draw. A "0.0%" badge on every
 * card is noise that teaches the eye to skip the badge entirely, which is a
 * problem the day it says 40%.
 */
export function MetricWidget({
  label,
  value,
  unit,
  icon: Icon,
  accent = "var(--cv-accent)",
  series,
  deltaPct,
  period,
  caption,
  href,
}: MetricWidgetProps) {
  const hasDelta = typeof deltaPct === "number" && Number.isFinite(deltaPct) && Math.abs(deltaPct) >= 0.1;
  const up = (deltaPct ?? 0) > 0;

  const inner = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl"
              style={{ background: `${accent}1f` }}
            >
              <Icon className="h-5 w-5" style={{ color: accent }} />
            </span>
          )}
          <div className="min-w-0">
            <div className="truncate text-xs font-medium text-slate-400">{label}</div>
            {caption && <div className="truncate text-[11px] text-slate-500">{caption}</div>}
          </div>
        </div>
        {period && <span className="shrink-0 text-[11px] text-slate-500">{period}</span>}
      </div>

      <div className="mt-3 flex items-end gap-2">
        <span className="text-[30px] font-bold leading-none tracking-tight tabular-nums text-white">
          {typeof value === "number" ? value.toLocaleString("en-IN") : value}
        </span>
        {unit && <span className="pb-0.5 text-sm font-medium text-slate-400">{unit}</span>}
        {hasDelta && (
          <span
            className={`mb-0.5 ml-auto inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              up ? "bg-emerald-500/15 text-emerald-300" : "bg-red-500/15 text-red-300"
            }`}
          >
            {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(deltaPct as number).toFixed(1)}%
          </span>
        )}
      </div>

      {series && series.length > 1 && (
        <div className="mt-3">
          <Sparkline points={series} color={accent} height={36} />
        </div>
      )}
    </>
  );

  const shell =
    "group block rounded-[22px] border border-white/10 bg-white/[0.045] p-4 transition hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cv-accent)]";

  return href ? (
    <Link href={href} className={shell}>
      {inner}
    </Link>
  ) : (
    <div className={shell}>{inner}</div>
  );
}

/* ------------------------------------------------------------ WidgetFrame -- */

/**
 * The card around a chart.
 *
 * Exists so every chart on a dashboard gets the same header treatment. When
 * each panel invents its own, a screen of six panels has six title sizes and
 * reads as six unrelated things.
 */
export function WidgetFrame({
  title,
  period,
  action,
  children,
  className = "",
}: {
  title: string;
  period?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[22px] border border-white/10 bg-white/[0.045] p-4 ${className}`}>
      <header className="mb-3 flex items-center justify-between gap-2">
        <h3 className="truncate text-sm font-semibold text-white">{title}</h3>
        <div className="flex shrink-0 items-center gap-2">
          {period && <span className="text-[11px] text-slate-500">{period}</span>}
          {action}
        </div>
      </header>
      {children}
    </section>
  );
}
