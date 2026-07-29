"use client";

/**
 * Circuvent Console — enterprise primitives.
 *
 * Everything here paints from the CSS custom properties defined by
 * `ConsoleThemeProvider` (`--cv-text`, `--cv-muted`, `--cv-border`, `--cv-card`,
 * `--cv-accent`, …) rather than hardcoded Tailwind neutrals. That is deliberate:
 * the console ships three surface modes (aurora / glass / neo) crossed with a
 * light and a dark scheme, and the previous generation of screens hardcoded
 * `text-white` + `bg-black/20`, which is why light mode needed a ~90-line
 * remap shim in theme.tsx to stay legible. Surfaces built on these primitives
 * are theme-correct by construction and need no shim.
 */

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Info,
  Loader2,
  Search,
  ShieldAlert,
  X,
  XCircle,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/* Severity                                                            */
/* ------------------------------------------------------------------ */

export type Severity = "critical" | "warning" | "info" | "ok";

/**
 * Severity palette. Each tone carries a `fg` chosen to stay legible on a
 * *light* surface and a translucent `dim` fill placed behind it, so one token
 * works in both schemes without a per-scheme branch.
 */
export const SEVERITY: Record<Severity, { fg: string; dim: string; label: string }> = {
  critical: { fg: "#dc2626", dim: "rgba(220,38,38,0.14)", label: "Critical" },
  warning: { fg: "#b45309", dim: "rgba(217,119,6,0.16)", label: "Warning" },
  info: { fg: "#0e7490", dim: "rgba(14,116,144,0.14)", label: "Info" },
  ok: { fg: "#047857", dim: "rgba(4,120,87,0.14)", label: "Healthy" },
};

export const SEVERITY_ICON: Record<Severity, typeof Info> = {
  critical: ShieldAlert,
  warning: AlertTriangle,
  info: Info,
  ok: Check,
};

/** Sort rank for mixed severity lists — most urgent first. */
export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, ok: 3 };

/* ------------------------------------------------------------------ */
/* Surfaces                                                            */
/* ------------------------------------------------------------------ */

export function Surface({
  children,
  className = "",
  padded = true,
  interactive = false,
  onClick,
  style: styleProp,
  title,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  interactive?: boolean;
  onClick?: () => void;
  style?: React.CSSProperties;
  title?: string;
}) {
  const clickable = interactive || Boolean(onClick);
  const cls = `cv-card ${clickable ? "cv-tile" : ""} text-left ${padded ? "p-5" : ""} ${
    clickable ? "focus:outline-none focus-visible:ring-2" : ""
  } ${className}`;
  // Inline rather than a `rounded-*` utility: the radius is a theme token, and
  // an inline value beats Tailwind deterministically regardless of the order
  // styled-jsx and the Tailwind sheet end up in. `styleProp` spreads last so a
  // caller can still opt out.
  const style: React.CSSProperties = {
    borderRadius: "var(--cv-r-card)",
    ...(clickable ? ({ "--tw-ring-color": "var(--cv-accent)" } as React.CSSProperties) : null),
    ...styleProp,
  };
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cls} style={style} title={title}>
        {children}
      </button>
    );
  }
  return (
    <div className={cls} style={style} title={title}>
      {children}
    </div>
  );
}

/**
 * Page title block, sized as an iOS "Large Title".
 *
 * `actions` sits right on desktop and wraps beneath on mobile.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
  eyebrow,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {eyebrow && (
          <div className="mb-1 text-[13px] font-semibold" style={{ color: "var(--cv-accent-hi)" }}>
            {eyebrow}
          </div>
        )}
        <h1 className="text-[27px] font-bold leading-[1.08] sm:text-[34px]" style={{ color: "var(--cv-text)" }}>
          {title}
        </h1>
        {subtitle && (
          <div className="mt-1.5 text-[15px] leading-snug" style={{ color: "var(--cv-muted)" }}>
            {subtitle}
          </div>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * Group heading.
 *
 * Apple labels a group of tiles with a real, sentence-case headline rather than
 * the tiny letter-spaced all-caps eyebrow common to dense admin consoles — it
 * is the strongest single signal that a screen is a *home*, not a control
 * panel, so the console uses the same treatment throughout.
 */
export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-4 mt-9 flex items-end justify-between gap-3 first:mt-0">
      <h2 className="text-[19px] font-bold leading-tight sm:text-[21px]" style={{ color: "var(--cv-text)" }}>
        {children}
      </h2>
      {right}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  children,
  onClick,
  variant = "secondary",
  icon: Icon,
  disabled,
  busy,
  type = "button",
  className = "",
  title,
  full,
}: {
  children?: ReactNode;
  onClick?: () => void;
  variant?: BtnVariant;
  icon?: typeof Info;
  disabled?: boolean;
  busy?: boolean;
  type?: "button" | "submit";
  className?: string;
  title?: string;
  full?: boolean;
}) {
  const base =
    "inline-flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-[14px] font-semibold tracking-[-0.01em] transition active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100 focus:outline-none focus-visible:ring-2";
  const style: React.CSSProperties = { "--tw-ring-color": "var(--cv-accent)" } as React.CSSProperties;
  let cls = "";
  if (variant === "primary") {
    style.background = "var(--cv-gradient)";
    style.color = "#fff";
    style.boxShadow = "var(--cv-shadow-1)";
  } else if (variant === "danger") {
    style.background = SEVERITY.critical.dim;
    style.color = SEVERITY.critical.fg;
    style.border = `1px solid ${SEVERITY.critical.fg}44`;
  } else if (variant === "ghost") {
    style.color = "var(--cv-muted)";
    cls = "hover:brightness-125";
  } else {
    style.background = "var(--cv-card-hi)";
    style.color = "var(--cv-text)";
    style.border = "1px solid var(--cv-border)";
  }
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled || busy}
      style={style}
      className={`${base} ${cls} ${full ? "w-full" : ""} ${className}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export function IconButton({
  icon: Icon,
  onClick,
  label,
  active,
  danger,
}: {
  icon: typeof Info;
  onClick?: () => void;
  label: string;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-95 hover:brightness-125 focus:outline-none focus-visible:ring-2"
      style={
        {
          background: active ? "var(--cv-accent)" : "var(--cv-card-hi)",
          border: active ? "1px solid transparent" : "1px solid var(--cv-border)",
          color: danger ? SEVERITY.critical.fg : active ? "#fff" : "var(--cv-muted)",
          "--tw-ring-color": "var(--cv-accent)",
        } as React.CSSProperties
      }
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Status & badges                                                     */
/* ------------------------------------------------------------------ */

export function StatusDot({ online, pulse = true }: { online: boolean; pulse?: boolean }) {
  const color = online ? "#22c55e" : "#94a3b8";
  return (
    <span className="relative inline-flex h-2 w-2 shrink-0">
      {online && pulse && (
        <span
          className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 motion-reduce:animate-none"
          style={{ background: color }}
        />
      )}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: color }} />
    </span>
  );
}

export function Badge({
  children,
  tone = "neutral",
  icon: Icon,
  className = "",
  title,
}: {
  children: ReactNode;
  tone?: Severity | "neutral" | "accent";
  icon?: typeof Info;
  className?: string;
  title?: string;
}) {
  let fg = "var(--cv-muted)";
  let bg = "var(--cv-card-hi)";
  if (tone === "accent") {
    fg = "var(--cv-accent-hi)";
    bg = "color-mix(in srgb, var(--cv-accent) 16%, transparent)";
  } else if (tone !== "neutral") {
    fg = SEVERITY[tone].fg;
    bg = SEVERITY[tone].dim;
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] text-[12px] font-semibold tracking-[-0.01em] ${className}`}
      style={{ color: fg, background: bg }}
      title={title}
    >
      {Icon && <Icon className="h-3 w-3" />}
      {children}
    </span>
  );
}

export function SeverityBadge({ severity, children }: { severity: Severity; children?: ReactNode }) {
  const Icon = SEVERITY_ICON[severity];
  return (
    <Badge tone={severity} icon={Icon}>
      {children ?? SEVERITY[severity].label}
    </Badge>
  );
}

/* ------------------------------------------------------------------ */
/* KPIs                                                                */
/* ------------------------------------------------------------------ */

export function Kpi({
  label,
  value,
  unit,
  hint,
  tone,
  icon: Icon,
  trend,
  onClick,
}: {
  label: string;
  value: string | number;
  unit?: string;
  hint?: string;
  tone?: Severity;
  icon?: typeof Info;
  /** Percent change vs the previous comparable window; omit when unknown. */
  trend?: number | null;
  onClick?: () => void;
}) {
  const accent = tone ? SEVERITY[tone].fg : "var(--cv-accent-hi)";
  return (
    <Surface onClick={onClick} className="min-w-0">
      <div className="flex items-start justify-between gap-2">
        <div className="text-[13px] font-semibold leading-tight" style={{ color: "var(--cv-muted)" }}>
          {label}
        </div>
        {Icon && <Icon className="h-[18px] w-[18px] shrink-0" style={{ color: accent }} />}
      </div>
      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span className="cv-num text-[30px] font-bold leading-none" style={{ color: accent }}>
          {value}
        </span>
        {unit && (
          <span className="text-[15px] font-semibold" style={{ color: "var(--cv-muted)" }}>
            {unit}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {hint && (
          <span className="text-[13px]" style={{ color: "var(--cv-muted)" }}>
            {hint}
          </span>
        )}
        {typeof trend === "number" && Number.isFinite(trend) && (
          <span
            className="cv-num text-[13px] font-semibold"
            style={{ color: trend > 0 ? SEVERITY.warning.fg : SEVERITY.ok.fg }}
          >
            {trend > 0 ? "▲" : "▼"} {Math.abs(trend).toFixed(0)}%
          </span>
        )}
      </div>
    </Surface>
  );
}

export function KpiGrid({ children, cols = 4 }: { children: ReactNode; cols?: 2 | 3 | 4 }) {
  const c =
    cols === 2
      ? "sm:grid-cols-2"
      : cols === 3
        ? "sm:grid-cols-2 lg:grid-cols-3"
        : "sm:grid-cols-2 lg:grid-cols-4";
  return <div className={`grid grid-cols-2 gap-3.5 ${c}`}>{children}</div>;
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export function SearchField({
  value,
  onChange,
  placeholder = "Search",
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <div
      className="flex min-h-11 flex-1 items-center gap-2.5 px-3.5"
      style={{
        background: "var(--cv-input-bg)",
        border: "1px solid var(--cv-border)",
        borderRadius: "var(--cv-r-control)",
      }}
    >
      <Search className="h-4 w-4 shrink-0" style={{ color: "var(--cv-muted)" }} />
      <input
        value={value}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent text-[15px] outline-none"
        style={{ color: "var(--cv-text)" }}
      />
      {value && (
        <button onClick={() => onChange("")} aria-label="Clear search">
          <X className="h-4 w-4" style={{ color: "var(--cv-muted)" }} />
        </button>
      )}
    </div>
  );
}

export function Field({
  label,
  hint,
  children,
  error,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  error?: string | null;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[13px] font-semibold" style={{ color: "var(--cv-muted)" }}>
        {label}
      </span>
      {children}
      {error ? (
        <span className="mt-1 block text-[13px]" style={{ color: SEVERITY.critical.fg }}>
          {error}
        </span>
      ) : hint ? (
        <span className="mt-1 block text-[12px]" style={{ color: "var(--cv-muted)" }}>
          {hint}
        </span>
      ) : null}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = "text",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="cv-input text-sm disabled:opacity-50"
    />
  );
}

export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      value={Number.isFinite(value) ? value : ""}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      onChange={(e) => {
        const n = Number(e.target.value);
        if (Number.isFinite(n)) onChange(n);
      }}
      className="cv-input text-sm tabular-nums disabled:opacity-50"
    />
  );
}

export function SelectInput<T extends string>({
  value,
  onChange,
  options,
  disabled,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  disabled?: boolean;
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
      className="cv-input text-sm disabled:opacity-50"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between gap-3 border-b py-3.5 last:border-0"
      style={{ borderColor: "var(--cv-separator)" }}
    >
      <div className="min-w-0">
        <div className="text-[15px] font-medium" style={{ color: "var(--cv-text)" }}>
          {label}
        </div>
        {hint && (
          <div className="mt-0.5 text-[13px]" style={{ color: "var(--cv-muted)" }}>
            {hint}
          </div>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="relative h-[31px] w-[51px] shrink-0 rounded-full transition disabled:opacity-40"
        style={{
          background: checked ? "var(--cv-gradient)" : "var(--cv-input-bg)",
          border: checked ? "1px solid transparent" : "1px solid var(--cv-border)",
        }}
      >
        <span
          className="absolute top-1/2 block h-[27px] w-[27px] rounded-full bg-white transition-transform duration-200 motion-reduce:transition-none"
          style={{
            left: 1,
            marginTop: -13.5,
            transform: `translateX(${checked ? 20 : 0}px)`,
            boxShadow: "0 3px 8px rgba(0,0,0,.15), 0 1px 1px rgba(0,0,0,.16)",
          }}
        />
      </button>
    </div>
  );
}

/** Horizontal filter chips, styled as the segmented control's smaller sibling. */
export function FilterChips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; count?: number }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="cv-seg flex gap-1 overflow-x-auto">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            onClick={() => onChange(o.value)}
            className={`min-h-9 whitespace-nowrap rounded-full px-3.5 text-[13px] font-semibold tracking-[-0.01em] transition ${
              active ? "cv-seg-thumb" : ""
            }`}
            style={{ color: active ? "var(--cv-text)" : "var(--cv-muted)" }}
          >
            {o.label}
            {typeof o.count === "number" && ` ${o.count}`}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

export interface TabDef {
  id: string;
  label: string;
  icon?: typeof Info;
  count?: number;
}

/**
 * Section tabs, rendered as an iOS segmented control.
 *
 * Folding the console's former 36 top-level routes into a handful of sections
 * means each section carries several sub-views; this is how they are exposed
 * without reintroducing nav sprawl. The recessed track with a single elevated
 * thumb reads as "pick one of these" far faster than an underline strip, and it
 * degrades to a horizontally scrollable row when a section has five tabs on a
 * narrow screen.
 */
export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: TabDef[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="mb-6 -mx-1 overflow-x-auto px-1 pb-1">
      <div className="cv-seg inline-flex min-w-full gap-1 sm:min-w-0" role="tablist">
        {tabs.map((t) => {
          const isActive = t.id === active;
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(t.id)}
              className={`relative flex min-h-9 flex-1 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap px-3.5 text-[13px] font-semibold tracking-[-0.01em] transition sm:flex-none ${
                isActive ? "cv-seg-thumb" : ""
              }`}
              style={{ color: isActive ? "var(--cv-text)" : "var(--cv-muted)" }}
            >
              {Icon && <Icon className="h-4 w-4" />}
              {t.label}
              {typeof t.count === "number" && t.count > 0 && (
                <span
                  className="cv-num rounded-full px-1.5 text-[11px] font-semibold"
                  style={{
                    background: isActive ? "color-mix(in srgb, var(--cv-accent) 18%, transparent)" : "var(--cv-card-hi)",
                    color: isActive ? "var(--cv-accent-hi)" : "var(--cv-muted)",
                  }}
                >
                  {t.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* States                                                              */
/* ------------------------------------------------------------------ */

export function LoadingState({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20" style={{ color: "var(--cv-muted)" }}>
      <Loader2 className="h-6 w-6 animate-spin" style={{ color: "var(--cv-accent-hi)" }} />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

/** Shimmering placeholder shown while a panel's first payload is in flight. */
export function Skeleton({ className = "", rounded = "rounded-xl" }: { className?: string; rounded?: string }) {
  return <div className={`cv-skeleton ${rounded} ${className}`} aria-hidden />;
}

export function SkeletonGrid({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-36" rounded="rounded-2xl" />
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  body,
  icon: Icon = Info,
  action,
}: {
  title: string;
  body?: string;
  icon?: typeof Info;
  action?: ReactNode;
}) {
  return (
    <div
      className="flex flex-col items-center border border-dashed px-6 py-16 text-center"
      style={{ borderColor: "var(--cv-border)", borderRadius: "var(--cv-r-card)" }}
    >
      <div
        className="mb-4 flex h-16 w-16 items-center justify-center rounded-full"
        style={{ background: "var(--cv-card-hi)" }}
      >
        <Icon className="h-7 w-7" style={{ color: "var(--cv-muted)" }} />
      </div>
      <h3 className="text-[19px] font-bold" style={{ color: "var(--cv-text)" }}>
        {title}
      </h3>
      {body && (
        <p className="mt-1.5 max-w-sm text-[15px] leading-snug" style={{ color: "var(--cv-muted)" }}>
          {body}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      className="flex flex-col items-start gap-3 px-4 py-3.5 sm:flex-row sm:items-center"
      style={{
        background: SEVERITY.critical.dim,
        border: `1px solid ${SEVERITY.critical.fg}44`,
        borderRadius: "var(--cv-r-card)",
      }}
    >
      <XCircle className="h-5 w-5 shrink-0" style={{ color: SEVERITY.critical.fg }} />
      <span className="flex-1 text-[15px]" style={{ color: SEVERITY.critical.fg }}>
        {message}
      </span>
      {onRetry && <Button onClick={onRetry}>Retry</Button>}
    </div>
  );
}

/** Inline explanatory banner. Used to label locally-stored (non-server) data. */
export function Callout({ tone = "info", title, children }: { tone?: Severity; title?: string; children: ReactNode }) {
  const Icon = SEVERITY_ICON[tone];
  return (
    <div
      className="flex gap-3 px-4 py-3"
      style={{
        background: SEVERITY[tone].dim,
        border: `1px solid ${SEVERITY[tone].fg}33`,
        borderRadius: "var(--cv-r-control)",
      }}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" style={{ color: SEVERITY[tone].fg }} />
      <div className="min-w-0 text-[14px] leading-snug">
        {title && (
          <div className="font-semibold" style={{ color: SEVERITY[tone].fg }}>
            {title}
          </div>
        )}
        <div style={{ color: "var(--cv-text)", opacity: 0.85 }}>{children}</div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Progress                                                            */
/* ------------------------------------------------------------------ */

export function Meter({
  value,
  max = 100,
  tone,
  label,
  showValue = true,
  unit = "%",
}: {
  value: number;
  max?: number;
  tone?: Severity;
  label?: string;
  showValue?: boolean;
  unit?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (value / max) * 100)) : 0;
  const color = tone ? SEVERITY[tone].fg : "var(--cv-accent)";
  return (
    <div>
      {(label || showValue) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[13px]">
          {label && <span style={{ color: "var(--cv-muted)" }}>{label}</span>}
          {showValue && (
            <span className="cv-num font-semibold" style={{ color }}>
              {Math.round(value)}
              {unit}
            </span>
          )}
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full" style={{ background: "var(--cv-input-bg)" }}>
        <div
          className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${pct}%`, background: tone ? color : "var(--cv-gradient)" }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Copy-to-clipboard                                                   */
/* ------------------------------------------------------------------ */

export function CopyField({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* clipboard blocked (insecure origin / permission) — leave state alone */
    }
  }, [value]);
  return (
    <div>
      {label && (
        <div className="mb-1.5 text-[13px] font-semibold" style={{ color: "var(--cv-muted)" }}>
          {label}
        </div>
      )}
      <button
        onClick={copy}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-left transition hover:brightness-110"
        style={{
          background: "var(--cv-input-bg)",
          border: "1px solid var(--cv-border)",
          borderRadius: "var(--cv-r-control)",
        }}
      >
        <code className="min-w-0 flex-1 truncate font-mono text-[13px]" style={{ color: "var(--cv-text)" }}>
          {value}
        </code>
        {copied ? (
          <Check className="h-4 w-4 shrink-0" style={{ color: SEVERITY.ok.fg }} />
        ) : (
          <Copy className="h-4 w-4 shrink-0" style={{ color: "var(--cv-muted)" }} />
        )}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Key/value rows                                                      */
/* ------------------------------------------------------------------ */

export function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-3 last:border-0" style={{ borderColor: "var(--cv-separator)" }}>
      <span className="text-[15px]" style={{ color: "var(--cv-muted)" }}>
        {label}
      </span>
      <span className="min-w-0 truncate text-[15px] font-semibold" style={{ color: "var(--cv-text)" }}>
        {children}
      </span>
    </div>
  );
}

/** Collapsible block — keeps advanced controls out of the default view. */
export function Disclosure({
  title,
  children,
  defaultOpen = false,
  count,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
  count?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className="cv-card overflow-hidden" style={{ borderRadius: "var(--cv-r-card)" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={id}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <span className="flex items-center gap-2 text-[16px] font-semibold" style={{ color: "var(--cv-text)" }}>
          {title}
          {typeof count === "number" && (
            <span
              className="cv-num rounded-full px-1.5 py-0.5 text-[11px] font-semibold"
              style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)" }}
            >
              {count}
            </span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} style={{ color: "var(--cv-muted)" }} />
      </button>
      {open && (
        <div id={id} className="border-t px-5 py-4" style={{ borderColor: "var(--cv-separator)" }}>
          {children}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pagination                                                          */
/* ------------------------------------------------------------------ */

export function Pager({ page, pageCount, onPage, total }: { page: number; pageCount: number; onPage: (p: number) => void; total?: number }) {
  if (pageCount <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3">
      <span className="text-[13px]" style={{ color: "var(--cv-muted)" }}>
        Page {page + 1} of {pageCount}
        {typeof total === "number" ? ` · ${total} rows` : ""}
      </span>
      <div className="flex gap-2">
        <IconButton icon={ChevronLeft} label="Previous page" onClick={() => onPage(Math.max(0, page - 1))} />
        <IconButton icon={ChevronRight} label="Next page" onClick={() => onPage(Math.min(pageCount - 1, page + 1))} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Relative time                                                       */
/* ------------------------------------------------------------------ */

/**
 * Live-updating relative timestamp.
 *
 * Rendering `Date.now()` during SSR and again on hydration produces different
 * strings and trips React's hydration check, so the first paint is a neutral
 * placeholder and the real value lands in an effect.
 */
export function RelativeTime({ iso, prefix = "" }: { iso: string | null | undefined; prefix?: string }) {
  const [text, setText] = useState("—");
  useEffect(() => {
    if (!iso) {
      setText("—");
      return;
    }
    const tick = () => setText(prefix + formatRelative(iso));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, [iso, prefix]);
  return (
    <span suppressHydrationWarning title={iso ?? undefined}>
      {text}
    </span>
  );
}

export function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 0) {
    const ahead = Math.abs(secs);
    if (ahead < 60) return `in ${ahead}s`;
    if (ahead < 3600) return `in ${Math.round(ahead / 60)}m`;
    if (ahead < 86400) return `in ${Math.round(ahead / 3600)}h`;
    return `in ${Math.round(ahead / 86400)}d`;
  }
  if (secs < 10) return "just now";
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.round(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.round(secs / 3600)}h ago`;
  if (secs < 2_592_000) return `${Math.round(secs / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

/* ------------------------------------------------------------------ */
/* Formatters                                                          */
/* ------------------------------------------------------------------ */

export function formatNumber(n: number, digits = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatWatts(w: number): string {
  if (!Number.isFinite(w)) return "—";
  return w >= 1000 ? `${(w / 1000).toFixed(2)} kW` : `${Math.round(w)} W`;
}

export function formatEnergy(kwh: number): string {
  if (!Number.isFinite(kwh)) return "—";
  if (kwh >= 1000) return `${(kwh / 1000).toFixed(2)} MWh`;
  if (kwh >= 1) return `${kwh.toFixed(2)} kWh`;
  return `${(kwh * 1000).toFixed(0)} Wh`;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "—";
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m`;
  return `${Math.round(seconds)}s`;
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

/* ------------------------------------------------------------------ */
/* CSV export                                                          */
/* ------------------------------------------------------------------ */

/** RFC-4180 quoting: wrap in quotes and double any embedded quote. */
export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  // BOM keeps Excel from mangling non-ASCII device names.
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Local persistence                                                   */
/* ------------------------------------------------------------------ */

/**
 * Operator preferences the control plane has no endpoint for (column choices,
 * saved filters, tariffs…) live in localStorage. Anything stored here is
 * device-local and MUST be labelled as such in the UI — it is never presented
 * as a measured or server-authoritative value.
 */
export function usePersistentState<T>(key: string, initial: T): [T, (v: T | ((p: T) => T)) => void, boolean] {
  const [value, setValue] = useState<T>(initial);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      if (raw !== null) setValue(JSON.parse(raw) as T);
    } catch {
      /* corrupt or unavailable storage — keep the default */
    }
    setLoaded(true);
  }, [key]);
  const set = useCallback(
    (v: T | ((p: T) => T)) => {
      setValue((prev) => {
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          /* quota or private mode — in-memory value still updates */
        }
        return next;
      });
    },
    [key]
  );
  return [value, set, loaded];
}

/* ------------------------------------------------------------------ */
/* Hooks                                                               */
/* ------------------------------------------------------------------ */

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatches(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, [query]);
  return matches;
}

/** Debounce a rapidly-changing value (search boxes, sliders). */
export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/**
 * Interval that pauses while the tab is hidden.
 *
 * The console polls several endpoints every 15–20s. Without this, a console
 * left open in a background tab keeps hammering the control plane for hours.
 */
export function useVisiblePolling(fn: () => void, ms: number, enabled = true) {
  const saved = useRef(fn);
  saved.current = fn;
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer) return;
      timer = setInterval(() => saved.current(), ms);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const onVis = () => {
      if (document.visibilityState === "visible") {
        saved.current();
        start();
      } else {
        stop();
      }
    };
    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [ms, enabled]);
}

/* ------------------------------------------------------------------ */
/* Sorting                                                             */
/* ------------------------------------------------------------------ */

export type SortDir = "asc" | "desc";

export function useSort<T>(rows: T[], initialKey: keyof T | null = null) {
  const [key, setKey] = useState<keyof T | null>(initialKey);
  const [dir, setDir] = useState<SortDir>("asc");
  const toggle = useCallback((k: keyof T) => {
    setKey((prev) => {
      if (prev === k) {
        setDir((d) => (d === "asc" ? "desc" : "asc"));
        return prev;
      }
      setDir("asc");
      return k;
    });
  }, []);
  const sorted = useMemo(() => {
    if (!key) return rows;
    const mult = dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      if (typeof av === "number" && typeof bv === "number") return (av - bv) * mult;
      return String(av).localeCompare(String(bv)) * mult;
    });
  }, [rows, key, dir]);
  return { sorted, key, dir, toggle };
}
