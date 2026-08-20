"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Search, X, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Check, Copy, AlertTriangle } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";

// ------------------------------------------------------------------- tones ---

export type Tone = "brand" | "green" | "amber" | "red" | "blue" | "violet" | "slate" | "cyan";

/**
 * Status colours, resolved through CSS variables rather than fixed hexes.
 *
 * These are applied as inline styles, which is what makes them a problem: the
 * console's light-scheme shim in theme.tsx remaps Tailwind's dark-first
 * neutrals by class name, and an inline style is invisible to it. So the whole
 * ramp — authored at the 300/400 level for dark cards — stayed pale when the
 * surfaces went light, and `slate` in particular measured 2.1:1 on a neo-light
 * card, which is a label you have to lean in to read.
 *
 * Each tone therefore reads a variable, and ShellStyles defines two sets: the
 * original ramp for dark schemes, and the 600/700 ramp under `.cv-light`. The
 * tinted backgrounds and borders stay as they are — a 12% wash of the same hue
 * works on either surface, and it is only the foreground that has to move.
 */
export const TONE: Record<Tone, { fg: string; bg: string; bd: string }> = {
  brand: { fg: "var(--ad-fg-cyan)", bg: "rgba(6,182,212,.12)", bd: "rgba(6,182,212,.30)" },
  cyan: { fg: "var(--ad-fg-cyan)", bg: "rgba(6,182,212,.12)", bd: "rgba(6,182,212,.30)" },
  green: { fg: "var(--ad-fg-green)", bg: "rgba(34,197,94,.12)", bd: "rgba(34,197,94,.30)" },
  amber: { fg: "var(--ad-fg-amber)", bg: "rgba(245,158,11,.12)", bd: "rgba(245,158,11,.30)" },
  red: { fg: "var(--ad-fg-red)", bg: "rgba(239,68,68,.12)", bd: "rgba(239,68,68,.30)" },
  blue: { fg: "var(--ad-fg-blue)", bg: "rgba(59,130,246,.12)", bd: "rgba(59,130,246,.30)" },
  violet: { fg: "var(--ad-fg-violet)", bg: "rgba(139,92,246,.14)", bd: "rgba(139,92,246,.30)" },
  slate: { fg: "var(--ad-fg-slate)", bg: "rgba(148,163,184,.10)", bd: "rgba(148,163,184,.22)" },
};

// -------------------------------------------------------------- containers ---

export function Panel({ children, className = "", pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <div className={`ad-card rounded-2xl ${pad ? "p-5" : ""} ${className}`}>{children}</div>;
}

export function PageHeader({ title, subtitle, actions, icon }: { title: string; subtitle?: string; actions?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div className="flex items-start gap-3">
        {icon && <div className="ad-iconbox mt-0.5">{icon}</div>}
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm ad-muted max-w-2xl">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[13px] font-semibold uppercase tracking-[0.14em] ad-muted">{children}</h2>
      {right}
    </div>
  );
}

// ------------------------------------------------------------------ stats ---

export function StatCard({
  label, value, sub, icon, tone = "brand", delta,
}: { label: string; value: ReactNode; sub?: string; icon?: ReactNode; tone?: Tone; delta?: number }) {
  const t = TONE[tone];
  return (
    <Panel className="relative overflow-hidden">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] ad-muted">{label}</span>
        {icon && (
          <span className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: t.bg, color: t.fg }}>
            {icon}
          </span>
        )}
      </div>
      <div className="mt-3 text-2xl font-extrabold text-white tabular-nums">{value}</div>
      <div className="mt-1 flex items-center gap-2">
        {typeof delta === "number" && (
          <span className="text-xs font-semibold" style={{ color: delta >= 0 ? TONE.green.fg : TONE.red.fg }}>
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
          </span>
        )}
        {sub && <span className="text-xs ad-muted">{sub}</span>}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------- controls ---

type BtnVariant = "primary" | "ghost" | "danger" | "subtle";
export function Btn({
  children, onClick, variant = "ghost", size = "md", type = "button", disabled, className = "", title,
}: {
  children: ReactNode; onClick?: () => void; variant?: BtnVariant; size?: "sm" | "md";
  type?: "button" | "submit"; disabled?: boolean; className?: string; title?: string;
}) {
  /*
   * min-h-[44px] in explicit pixels, not min-h-[44px].
   *
   * The 44px touch target is defined in CSS pixels by both WCAG 2.5.5 and
   * Apple's HIG. Tailwind's min-h-[44px] is 2.75rem, which is 44px only while the
   * root font size is 16 — and globals.css rescales type below 640px, which is
   * exactly the width where the target size matters. Measured at 43px on a
   * phone, which is a rule that looks satisfied and is not.
   *
   * Kept as a minimum rather than a fixed height so a wrapping label still
   * grows the control.
   */
  const base = "inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-1.5 rounded-lg font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer";
  const sz = size === "sm" ? "px-2.5 py-1.5 text-xs" : "px-3.5 py-2 text-sm";
  const cls =
    variant === "primary" ? "ad-btn-primary text-white"
    : variant === "danger" ? "text-red-300 border border-red-500/30 bg-red-500/10 hover:bg-red-500/20"
    : variant === "subtle" ? "text-slate-200 bg-white/[0.06] hover:bg-white/[0.1]"
    : "text-slate-200 border border-white/10 bg-white/[0.03] hover:bg-white/[0.07]";
  return (
    <button type={type} onClick={onClick} disabled={disabled} title={title} className={`${base} ${sz} ${cls} ${className}`}>
      {children}
    </button>
  );
}

export function IconBtn({ children, onClick, title, active }: { children: ReactNode; onClick?: () => void; title?: string; active?: boolean }) {
  return (
    <button
      type="button" onClick={onClick} title={title}
      className={`grid h-9 w-9 place-items-center rounded-lg border transition cursor-pointer ${
        active ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]"
      }`}
    >
      {children}
    </button>
  );
}

export function Badge({ children, tone = "slate" }: { children: ReactNode; tone?: Tone }) {
  const t = TONE[tone];
  return (
    <span className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-semibold" style={{ background: t.bg, color: t.fg, border: `1px solid ${t.bd}` }}>
      {children}
    </span>
  );
}

export function Dot({ tone = "green", pulse }: { tone?: Tone; pulse?: boolean }) {
  const t = TONE[tone];
  return (
    <span className="relative flex h-2 w-2">
      {pulse && <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-60" style={{ background: t.fg }} />}
      <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: t.fg }} />
    </span>
  );
}

export function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button" role="switch" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 cursor-pointer"
      style={{ background: checked ? "linear-gradient(135deg,#06b6d4,#8b5cf6)" : "#334155" }}
    >
      <span className="inline-block transform rounded-full bg-white shadow transition" style={{ height: 18, width: 18, transform: checked ? "translateX(22px)" : "translateX(3px)" }} />
    </button>
  );
}

export function SearchInput({ value, onChange, placeholder = "Search…", className = "" }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-lg border border-white/10 bg-black/25 px-3 ${className}`}>
      <Search className="h-4 w-4 text-slate-500" />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="min-h-[44px] w-full bg-transparent py-2 text-sm text-white outline-none placeholder:text-slate-400" />
      {value && <button onClick={() => onChange("")} className="text-slate-500 hover:text-white"><X className="h-4 w-4" /></button>}
    </div>
  );
}

export function Select<T extends string>({ value, onChange, options, className = "" }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <div className={`relative ${className}`}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)} className="ad-input appearance-none pr-8 cursor-pointer">
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-medium text-slate-300">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] ad-muted">{hint}</span>}
    </label>
  );
}

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`ad-input ${props.className ?? ""}`} />;
}

export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: ReactNode }[] }) {
  return (
    <div className="inline-flex rounded-lg border border-white/10 bg-black/20 p-1">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button key={o.value} onClick={() => onChange(o.value)} className={`inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-md px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${active ? "text-white" : "text-slate-400 hover:text-slate-200"}`} style={active ? { background: "var(--cv-gradient)" } : undefined}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; icon?: ReactNode; count?: number }[] }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-white/10">
      {tabs.map((t) => {
        const active = t.value === value;
        return (
          <button key={t.value} onClick={() => onChange(t.value)} className={`relative flex min-h-[44px] items-center gap-2 whitespace-nowrap px-3.5 py-2.5 text-sm font-medium transition cursor-pointer ${active ? "text-white" : "text-slate-400 hover:text-slate-200"}`}>
            {t.icon}{t.label}
            {typeof t.count === "number" && <span className="rounded-full bg-white/10 px-1.5 py-0.5 text-[10px] tabular-nums">{t.count}</span>}
            {active && <motion.span layoutId="ad-tab" className="absolute inset-x-2 -bottom-px h-0.5 rounded-full" style={{ background: "linear-gradient(90deg,#06b6d4,#8b5cf6)" }} />}
          </button>
        );
      })}
    </div>
  );
}

export function Progress({ value, tone = "brand", height = 8 }: { value: number; tone?: Tone; height?: number }) {
  const t = TONE[tone];
  return (
    <div className="w-full overflow-hidden rounded-full bg-white/10" style={{ height }}>
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: tone === "brand" ? "linear-gradient(90deg,#06b6d4,#8b5cf6)" : t.fg }} />
    </div>
  );
}

export function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard?.writeText(text); setDone(true); setTimeout(() => setDone(false), 1200); }}
      className="text-slate-500 hover:text-cyan-300 cursor-pointer" title="Copy"
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export function EmptyState({ icon, title, hint, action }: { icon?: ReactNode; title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-14 text-center">
      {icon && <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-white/5 text-slate-400">{icon}</div>}
      <h3 className="font-semibold text-white">{title}</h3>
      {hint && <p className="mt-1 max-w-sm text-sm ad-muted">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

// ------------------------------------------------------- loading / failure ---

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`cv-pending rounded-lg bg-white/[0.05] ${className}`} />;
}

export function LoadingState({ rows = 3, label = "Loading live data…" }: { rows?: number; label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-16 w-full" />
      ))}
    </div>
  );
}

/**
 * Rendered whenever the control plane could not be reached or refused the
 * request. We surface the real reason instead of falling back to placeholder
 * numbers, so an operator can never mistake a failure for healthy data.
 */
export function ErrorState({
  message, unauthorized, onRetry,
}: { message: string; unauthorized?: boolean; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-red-500/25 bg-red-500/[0.06] px-6 py-10 text-center">
      <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-xl bg-red-500/10 text-red-300">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="font-semibold text-white">
        {unauthorized ? "Operator sign-in required" : "Live data unavailable"}
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-sm ad-muted">{message}</p>
      <div className="mt-4 flex justify-center gap-2">
        {unauthorized ? (
          <Link href="/smarthome" className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-white/10 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/15">
            Go to sign in
          </Link>
        ) : (
          onRetry && <Btn variant="primary" size="sm" onClick={onRetry}>Retry</Btn>
        )}
      </div>
    </div>
  );
}

/**
 * Standard gate: skeleton while first-loading, honest error on failure, the
 * caller's empty state when the control plane genuinely has no rows.
 */
export function ResourceGate({
  loading, error, unauthorized, onRetry, isEmpty, empty, children, skeletonRows,
}: {
  loading: boolean; error: string | null; unauthorized?: boolean; onRetry?: () => void;
  isEmpty?: boolean; empty?: ReactNode; children: ReactNode; skeletonRows?: number;
}) {
  if (loading) return <LoadingState rows={skeletonRows} />;
  if (error) return <ErrorState message={error} unauthorized={unauthorized} onRetry={onRetry} />;
  if (isEmpty && empty) return <>{empty}</>;
  return <>{children}</>;
}

// -------------------------------------------------------------- data table ---

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sort?: (a: T, b: T) => number;
  className?: string;
  align?: "left" | "right" | "center";
}

export function DataTable<T>({
  rows, columns, rowKey, onRowClick, dense, empty,
}: {
  rows: T[]; columns: Column<T>[]; rowKey: (row: T) => string;
  onRowClick?: (row: T) => void; dense?: boolean; empty?: ReactNode;
}) {
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [dir, setDir] = useState<1 | -1>(1);

  const sorted = useMemo(() => {
    if (!sortKey) return rows;
    const col = columns.find((c) => c.key === sortKey);
    if (!col?.sort) return rows;
    return [...rows].sort((a, b) => col.sort!(a, b) * dir);
  }, [rows, columns, sortKey, dir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setDir((d) => (d === 1 ? -1 : 1));
    else { setSortKey(key); setDir(1); }
  };

  if (rows.length === 0 && empty) return <>{empty}</>;

  return (
    <div className="ad-card overflow-hidden rounded-2xl">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left">
              {columns.map((c) => (
                <th key={c.key} className={`px-4 py-3 text-[11px] font-semibold uppercase tracking-wider ad-muted ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""}`}>
                  {c.sort ? (
                    <button onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1 hover:text-white cursor-pointer">
                      {c.header}
                      {sortKey === c.key ? (dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
                    </button>
                  ) : c.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              /*
               * A clickable row has to be reachable by keyboard.
               *
               * These rows are the only way into the device drawer — live
               * state, faults, commands, OTA, delete — and a bare onClick on a
               * <tr> gives a keyboard or screen-reader operator no route to any
               * of it. Enter and Space are handled so the row behaves like the
               * button it already is.
               */
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={
                  onRowClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onRowClick(row);
                        }
                      }
                    : undefined
                }
                role={onRowClick ? "button" : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                className={`border-b border-white/[0.06] last:border-0 transition ${onRowClick ? "cursor-pointer hover:bg-white/[0.03] focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/70" : ""}`}
              >
                {columns.map((c) => (
                  <td key={c.key} className={`px-4 ${dense ? "py-2" : "py-3"} ${c.align === "right" ? "text-right" : c.align === "center" ? "text-center" : ""} ${c.className ?? ""}`}>
                    {c.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------- modal / drawer ---

/**
 * The confirmation dialog used by every destructive action in this console.
 *
 * It had none of the semantics a dialog needs: no role, no focus trap, no
 * Escape. That is not a cosmetic gap here — these dialogs are the last step
 * before flashing firmware, reissuing a device key or broadcasting to a fleet
 * of locks. Background content stayed tabbable underneath, so it was possible
 * to tab out of a "Confirm firmware push" straight into the table behind it,
 * and a screen reader was never told a dialog had opened at all.
 *
 * Fixed once, here, rather than in each of the dozen call sites.
 */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    // Focus moves into the dialog so the next Tab stays inside it, and so a
    // screen reader starts reading the dialog rather than the page behind it.
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'
        ) ?? []
      );
    (focusables()[0] ?? panelRef.current)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      // Wrap at the ends, which is what makes it a trap rather than a hint.
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        initial={{ opacity: 0, scale: 0.96, y: 12 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        className={`relative ad-card rounded-2xl p-6 w-full ${wide ? "max-w-2xl" : "max-w-md"} max-h-[90vh] overflow-y-auto`}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 id={titleId} className="text-lg font-bold text-white">{title}</h2>
          <button onClick={onClose} aria-label="Close dialog" className="text-slate-400 hover:text-white cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        {children}
      </motion.div>
    </div>
  );
}

export function Drawer({ open, onClose, title, children, width = 480 }: { open: boolean; onClose: () => void; title: string; children: ReactNode; width?: number }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60]">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        initial={{ x: width }} animate={{ x: 0 }} exit={{ x: width }} transition={{ type: "spring", damping: 30, stiffness: 300 }}
        className="absolute right-0 top-0 h-full overflow-y-auto ad-card border-l" style={{ width }}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-white/10 bg-inherit px-5 py-4 backdrop-blur-xl">
          <h2 className="text-base font-bold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <div className="p-5">{children}</div>
      </motion.div>
    </div>
  );
}

// ------------------------------------------------------------ staggered grid ---

export function StaggerGrid({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      initial="hidden" animate="show"
      variants={{ hidden: {}, show: { transition: { staggerChildren: 0.05 } } }}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={className}
      variants={{ hidden: { opacity: 0, y: 16, scale: 0.98 }, show: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.4, ease: [0.34, 1.56, 0.64, 1] } } }}
    >
      {children}
    </motion.div>
  );
}
