"use client";

/**
 * Shared furniture for the App Insights blades.
 *
 * The panel had grown to 1,900 lines with every blade inline, and the new ones
 * roughly double the surface. These are the pieces every blade needs — the
 * admin token, a fetch that knows how this API reports failure, and the four
 * shapes the blades are actually built from — so that a new blade is a file
 * rather than another thousand lines in the same one.
 */

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";

/** The admin session token. Same storage key every other admin panel reads. */
export function tok(): string {
  return typeof window === "undefined" ? "" : sessionStorage.getItem("admin-token") || "";
}

export const SERIES_COLOURS = ["#22d3ee", "#a78bfa", "#f59e0b", "#34d399", "#f472b6", "#60a5fa"];

/**
 * A GET against an admin JSON endpoint.
 *
 * `enabled` matters: these blades sit behind tabs, and fetching a full pass
 * over the buffer for a blade nobody has opened is how an observability
 * console becomes the thing that needs observing.
 *
 * `loading` is derived rather than stored. A separate loading flag has to be
 * raised synchronously inside the effect that starts the fetch, which is the
 * cascading-render pattern React warns about — and it is redundant here, since
 * "no data and no error yet" already means exactly that. Deriving it also
 * means a reload keeps showing the previous answer instead of flashing a
 * spinner over data that is still perfectly good.
 */
export function useAdminData<T>(url: string | null, enabled = true) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");

  const fetchOnce = useCallback(async (): Promise<{ data?: T; error?: string }> => {
    try {
      const r = await fetch(url as string, { headers: { "x-admin-token": tok() } });
      const b = await r.json();
      if (!r.ok || !b.success) return { error: b.message || "That could not be loaded." };
      return { data: b as T };
    } catch {
      return { error: "Could not reach the telemetry service." };
    }
  }, [url]);

  useEffect(() => {
    if (!url || !enabled) return;
    let cancelled = false;
    /* The first statement is an await, so nothing is set synchronously while
       the effect body is still running. */
    void (async () => {
      const result = await fetchOnce();
      if (cancelled) return;
      if (result.error) setError(result.error);
      else {
        setData(result.data as T);
        setError("");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, enabled, fetchOnce]);

  /** Re-fetch on demand. Called from event handlers, never from an effect. */
  const reload = useCallback(async () => {
    if (!url || !enabled) return;
    const result = await fetchOnce();
    if (result.error) setError(result.error);
    else {
      setData(result.data as T);
      setError("");
    }
  }, [url, enabled, fetchOnce]);

  const loading = Boolean(url) && enabled && data === null && error === "";
  return { data, error, loading, reload };
}

/* ------------------------------------------------------------------ *
 * Shapes                                                              *
 * ------------------------------------------------------------------ */

export function Card({
  title,
  subtitle,
  right,
  children,
  className = "",
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border cv-border cv-surface p-4 ${className}`}
      style={{ background: "var(--bg-surface)" }}
    >
      {(title || right) && (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <div className="text-sm font-bold cv-text-primary">{title}</div>}
            {subtitle && <div className="mt-0.5 text-[12px] cv-text-muted">{subtitle}</div>}
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border cv-border p-3" style={{ background: "var(--bg-surface)" }}>
      <div className="text-[11px] font-semibold uppercase tracking-wide cv-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums" style={{ color: tone ?? "var(--text-primary)" }}>
        {value}
      </div>
      {hint && <div className="mt-0.5 text-[11.5px] cv-text-muted">{hint}</div>}
    </div>
  );
}

/** A horizontal magnitude bar. Used wherever a list needs a shape beside it. */
export function Bar({ value, max, colour }: { value: number; max: number; colour?: string }) {
  const pct = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--border-primary)" }}>
      <div
        className="h-full rounded-full"
        style={{ width: `${pct}%`, background: colour ?? "linear-gradient(90deg,#06b6d4,#8b5cf6)" }}
      />
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <p className="py-8 text-center text-sm cv-text-muted">{children}</p>
  );
}

export function Spinner({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-8 text-sm cv-text-muted">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> {label}
    </div>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div
      className="flex items-start gap-2 rounded-lg border px-3 py-2 text-[13px]"
      style={{ borderColor: "rgba(239,68,68,0.4)", background: "rgba(239,68,68,0.08)", color: "#b91c1c" }}
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * A note about what a number does and does not mean.
 *
 * Used wherever a blade could be read as claiming more than the data supports —
 * a correlation as a cause, or a within-window return as multi-day retention.
 * A caveat that lives beside the number gets read; one in a document does not.
 */
export function Caveat({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-lg border px-3 py-2 text-[12px] leading-relaxed"
      style={{
        borderColor: "var(--border-primary)",
        background: "var(--bg-glass)",
        color: "var(--text-tertiary)",
      }}
    >
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Formatting                                                          *
 * ------------------------------------------------------------------ */

export const pct = (n: number, digits = 1): string => `${(n * 100).toFixed(digits)}%`;

export const num = (n: number): string => n.toLocaleString();

export function ms(value: number): string {
  if (!Number.isFinite(value)) return "—";
  if (value < 1000) return `${Math.round(value)} ms`;
  if (value < 60_000) return `${(value / 1000).toFixed(1)} s`;
  return `${Math.round(value / 60_000)} min`;
}

export function shortTime(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

/** Green through amber to red by failure rate. One scale across every blade. */
export function healthColour(failureRate: number): string {
  if (failureRate >= 0.1) return "#dc2626";
  if (failureRate >= 0.02) return "#d97706";
  return "#059669";
}
