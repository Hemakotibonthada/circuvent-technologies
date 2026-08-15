"use client";

/**
 * One session, drawn on a shared timeline.
 *
 * Extracted from TransactionBlade so the transaction search and the log-row
 * detail drawer cannot disagree about how a session is drawn. Two copies of a
 * waterfall is two places for the offset maths to drift, and a bar in the
 * wrong place is worse than no bar — it is read as evidence.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * Azure nests an operation into a causal tree. Nothing in this telemetry
 * carries a parent span id, so the parentage is not recoverable. A nested
 * waterfall would have to invent it, and one that shows the wrong call as the
 * parent of a slow one sends somebody to the wrong service. Events are placed
 * by timestamp and sized by duration, which is exactly what the data supports.
 */

import type { TelemetryEvent } from "@/lib/app-insights";
import { ms } from "./kit";

export const KIND_COLOUR: Record<string, string> = {
  pageview: "#22d3ee",
  request: "#6366f1",
  dependency: "#a78bfa",
  exception: "#dc2626",
  event: "#34d399",
};

export function kindColour(kind: string): string {
  return KIND_COLOUR[kind] ?? "#94a3b8";
}

export interface SessionWaterfallProps {
  events: TelemetryEvent[];
  /** Start of the session window; bars are positioned relative to it. */
  startedAt: string;
  /** Ring the event the operator arrived from, so it is findable in a long list. */
  focusId?: string;
  /** Clicking a row selects it. Omitted where the timeline is read-only. */
  onSelect?: (event: TelemetryEvent) => void;
}

export default function SessionWaterfall({ events, startedAt, focusId, onSelect }: SessionWaterfallProps) {
  const start = Date.parse(startedAt);
  /* A session of one instant still needs a non-zero denominator, or every bar
     is either invisible or full width depending on rounding. */
  const total = Math.max(1, ...events.map((e) => Date.parse(e.at) + e.durationMs - start));

  return (
    <div className="space-y-1">
      {events.map((e) => {
        const offset = Date.parse(e.at) - start;
        const left = Math.min(99, (offset / total) * 100);
        const width = Math.max(0.6, (Math.max(e.durationMs, 1) / total) * 100);
        const focused = e.id === focusId;
        const Row = onSelect ? "button" : "div";

        return (
          <Row
            key={e.id}
            {...(onSelect
              ? {
                  type: "button" as const,
                  onClick: () => onSelect(e),
                  "aria-current": focused ? ("true" as const) : undefined,
                  "aria-label": `${e.kind} ${e.method ? `${e.method} ` : ""}${e.path}, ${ms(e.durationMs)}${e.ok ? "" : ", failed"}`,
                }
              : {})}
            className={`grid w-full grid-cols-[minmax(0,12rem)_1fr_auto] items-center gap-2 rounded px-1 py-0.5 text-left ${
              onSelect ? "cv-hover" : ""
            }`}
            style={focused ? { background: "var(--bg-glass)", outline: "1px solid var(--border-primary)" } : undefined}
          >
            <div className="min-w-0 truncate text-[12px]">
              <span
                className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
                style={{ background: kindColour(e.kind) }}
                aria-hidden
              />
              <span className="font-mono cv-text-primary">{e.path}</span>
            </div>
            <div className="relative h-4 rounded" style={{ background: "var(--bg-glass)" }}>
              <div
                className="absolute top-0.5 h-3 rounded"
                title={`${e.kind} · ${ms(e.durationMs)} · +${ms(offset)}`}
                style={{
                  left: `${left}%`,
                  width: `${Math.min(100 - left, width)}%`,
                  background: e.ok ? kindColour(e.kind) : "#dc2626",
                }}
              />
            </div>
            <div className="shrink-0 text-right text-[11.5px] tabular-nums cv-text-muted">
              {e.durationMs > 0 ? ms(e.durationMs) : "—"}
              {e.status > 0 && (
                <span className="ml-1.5 font-semibold" style={{ color: e.ok ? "var(--text-muted)" : "#b91c1c" }}>
                  {e.status}
                </span>
              )}
            </div>
          </Row>
        );
      })}
    </div>
  );
}
