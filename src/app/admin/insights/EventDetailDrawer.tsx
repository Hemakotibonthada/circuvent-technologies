"use client";

/**
 * End-to-end transaction details for one telemetry event.
 *
 * Opened by clicking a row in the Logs table. Azure's equivalent puts the
 * event's full property bag beside the transaction it belongs to, so that
 * "what happened" and "what else was happening" are answerable without
 * navigating away — which is the whole reason a log row is worth clicking.
 *
 * WHAT IT SHOWS, AND WHAT IT REFUSES TO
 *
 * Every field the store actually holds is shown, grouped, and copyable. What
 * is *not* shown is anything reconstructed: there is no operation id in this
 * telemetry, so the transaction is assembled by session id and said to be a
 * session. Azure can say "Operation ID" because its SDK writes one; inventing
 * the label here would imply a causal chain nobody recorded. The same reason
 * the waterfall stays flat — see SessionWaterfall.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Check, Copy, X } from "lucide-react";
import type { TelemetryEvent } from "@/lib/app-insights";
import { Caveat, ms, num, shortTime } from "./kit";
import SessionWaterfall, { kindColour } from "./SessionWaterfall";

export interface EventDetailDrawerProps {
  /** The row that was clicked. Null closes the drawer. */
  event: TelemetryEvent | null;
  /** The buffer the table is showing, used to rebuild the surrounding session. */
  events: TelemetryEvent[];
  onClose: () => void;
}

export default function EventDetailDrawer({ event, events, onClose }: EventDetailDrawerProps) {
  /*
   * Selection is local so the operator can walk the session inside the drawer
   * without the table behind it re-sorting or scrolling under them. It resets
   * whenever a different row is opened.
   */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => setSelectedId(event?.id ?? null), [event?.id]);

  const dialogRef = useRef<HTMLDivElement>(null);
  const restoreTo = useRef<HTMLElement | null>(null);

  const session = useMemo(() => {
    if (!event) return [];
    return events
      .filter((e) => e.session === event.session)
      .sort((a, b) => a.at.localeCompare(b.at));
  }, [event, events]);

  const shown = useMemo(
    () => session.find((e) => e.id === selectedId) ?? event ?? null,
    [session, selectedId, event],
  );

  const open = Boolean(event);

  /* Focus goes into the dialog on open and back to the row on close, so a
     keyboard user is not returned to the top of a 100-row table. */
  useEffect(() => {
    if (!open) return;
    restoreTo.current = document.activeElement as HTMLElement | null;
    const first = dialogRef.current?.querySelector<HTMLElement>("[data-autofocus]");
    first?.focus();
    return () => restoreTo.current?.focus?.();
  }, [open]);

  /* The page behind must not scroll while a full-height panel is over it. */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      // Contain Tab inside the dialog; otherwise focus walks into the table
      // underneath, which is still rendered and still focusable.
      const nodes = dialogRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])',
      );
      if (!nodes || nodes.length === 0) return;
      const list = Array.from(nodes).filter((n) => n.offsetParent !== null);
      const first = list[0];
      const last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose],
  );

  if (!open || !shown) return null;

  const operation = `${shown.method ? `${shown.method} ` : ""}${shown.path}`;
  const spanMs =
    session.length > 0
      ? Date.parse(session[session.length - 1].at) + session[session.length - 1].durationMs - Date.parse(session[0].at)
      : shown.durationMs;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(2,6,23,0.55)" }}
      onMouseDown={(e) => {
        // Only a click that both starts and ends on the backdrop closes it —
        // otherwise a text selection that drags out of the panel dismisses it.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cv-txn-title"
        onKeyDown={onKeyDown}
        className="flex h-full w-full max-w-5xl flex-col overflow-hidden border-l cv-border shadow-2xl"
        style={{ background: "var(--bg-primary, var(--bg-surface))" }}
      >
        {/* ------------------------------------------------------ header -- */}
        <div className="flex items-start justify-between gap-3 border-b cv-border px-5 py-4">
          <div className="min-w-0">
            <h2 id="cv-txn-title" className="text-base font-bold cv-text-primary">
              End-to-end transaction details
            </h2>
            <p className="mt-0.5 truncate font-mono text-[13px] cv-text-secondary" title={operation}>
              {operation}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CopyButton
              label="Copy JSON"
              value={JSON.stringify(shown, null, 2)}
              data-autofocus
            />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close transaction details"
              className="flex h-[44px] w-[44px] items-center justify-center rounded-lg border cv-border cv-hover"
            >
              <X className="h-4 w-4" aria-hidden />
            </button>
          </div>
        </div>

        {/* -------------------------------------------------------- body -- */}
        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[1fr_23rem]">
          {/* --- timeline ------------------------------------------------ */}
          <div className="min-w-0 space-y-4 p-5">
            <section>
              <h3 className="text-[11px] font-bold uppercase tracking-wide cv-text-muted">
                Session timeline
              </h3>
              <p className="mt-0.5 text-[12px] cv-text-muted">
                {num(session.length)} event{session.length === 1 ? "" : "s"} over {ms(spanMs)}, starting{" "}
                {shortTime(session[0]?.at ?? shown.at)}. Select one to inspect it.
              </p>
              <div className="mt-3">
                <SessionWaterfall
                  events={session}
                  startedAt={session[0]?.at ?? shown.at}
                  focusId={shown.id}
                  onSelect={(e) => setSelectedId(e.id)}
                />
              </div>
            </section>

            {shown.errorType && (
              <section>
                <h3 className="text-[11px] font-bold uppercase tracking-wide cv-text-muted">Exception</h3>
                <div
                  className="mt-2 rounded-lg border px-3 py-2 text-[12px]"
                  style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.06)" }}
                >
                  <div className="font-bold" style={{ color: "#b91c1c" }}>
                    {shown.errorType}
                  </div>
                  {shown.errorMessage && <div className="mt-0.5 cv-text-secondary">{shown.errorMessage}</div>}
                  {shown.stack ? (
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-[11px] cv-text-muted">
                      {shown.stack}
                    </pre>
                  ) : (
                    /* Silence here would read as "no stack was thrown" rather
                       than "none was captured", and those send an engineer to
                       different places. */
                    <div className="mt-2 text-[11px] cv-text-muted">
                      No stack was captured for this event.
                    </div>
                  )}
                </div>
              </section>
            )}

            <Caveat>
              Events are placed by timestamp and sized by duration. This telemetry carries no parent
              span id, so the timeline is not a causal tree — a nested waterfall would have to invent
              the parentage, and one that names the wrong call as the parent of a slow one sends
              somebody to the wrong service.
            </Caveat>
          </div>

          {/* --- properties ---------------------------------------------- */}
          <div className="min-w-0 space-y-5 border-t cv-border p-5 lg:border-l lg:border-t-0">
            <PropGroup title="Event properties">
              <PropRow label="Time" value={new Date(shown.at).toLocaleString()} />
              <PropRow
                label="Kind"
                value={shown.kind}
                swatch={kindColour(shown.kind)}
              />
              <PropRow label="Operation" value={operation} mono />
              {shown.method && <PropRow label="Method" value={shown.method} />}
              <PropRow label="Path" value={shown.path} mono />
              <PropRow
                label="Status"
                value={
                  shown.kind === "pageview"
                    ? "not applicable"
                    : shown.status === 0
                      ? "no response"
                      : String(shown.status)
                }
                tone={shown.ok ? undefined : "#b91c1c"}
              />
              <PropRow
                label="Outcome"
                value={shown.ok ? "Success" : "Failed"}
                tone={shown.ok ? undefined : "#b91c1c"}
              />
              <PropRow label="Duration" value={ms(shown.durationMs)} />
              <PropRow label="Source" value={shown.source} />
            </PropGroup>

            <PropGroup
              title="Custom properties"
              note="No operation id is recorded, so the transaction above is grouped by session."
            >
              <PropRow label="Event id" value={shown.id} mono />
              <PropRow label="Session" value={shown.session} mono />
              {shown.target && <PropRow label="Target" value={shown.target} mono />}
              {shown.userAgentClass && <PropRow label="Client" value={shown.userAgentClass} />}
            </PropGroup>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ bits -- */

function PropGroup({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="text-[11px] font-bold uppercase tracking-wide cv-text-muted">{title}</h3>
      {note && <p className="mt-0.5 text-[11px] cv-text-muted">{note}</p>}
      <dl className="mt-2 divide-y cv-border rounded-lg border cv-border">{children}</dl>
    </section>
  );
}

function PropRow({
  label,
  value,
  mono,
  tone,
  swatch,
}: {
  label: string;
  value: string;
  mono?: boolean;
  tone?: string;
  swatch?: string;
}) {
  return (
    <div className="group flex items-start gap-2 px-3 py-2">
      <dt className="w-28 shrink-0 text-[11.5px] cv-text-muted">{label}</dt>
      <dd
        className={`min-w-0 flex-1 break-words text-[12.5px] ${mono ? "font-mono" : ""}`}
        style={{ color: tone ?? "var(--text-primary)" }}
      >
        {swatch && (
          <span
            className="mr-1.5 inline-block h-2 w-2 rounded-full align-middle"
            style={{ background: swatch }}
            aria-hidden
          />
        )}
        {value}
      </dd>
      <CopyButton label={`Copy ${label}`} value={value} compact />
    </div>
  );
}

/**
 * Copy, with the outcome shown.
 *
 * A copy button that looks identical before and after leaves the operator
 * pasting into a ticket to find out whether it worked. Failure is reported
 * too — clipboard access is refused outright in some embedded browsers.
 */
function CopyButton({
  label,
  value,
  compact,
  ...rest
}: {
  label: string;
  value: string;
  compact?: boolean;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const [state, setState] = useState<"idle" | "done" | "failed">("idle");

  useEffect(() => {
    if (state === "idle") return;
    const t = window.setTimeout(() => setState("idle"), 1600);
    return () => window.clearTimeout(t);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setState("done");
    } catch {
      setState("failed");
    }
  };

  if (compact) {
    return (
      <button
        type="button"
        onClick={copy}
        aria-label={label}
        title={state === "failed" ? "Clipboard unavailable" : label}
        // The glyph is small; the hit area is not. Stated in pixels because
        // globals.css rescales type below 640px, which moves any rem-based
        // height off the 44px floor — tests/token-contrast.test.ts fails a
        // build that forgets this.
        className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded opacity-0 transition-opacity focus-visible:opacity-100 group-hover:opacity-100"
        {...rest}
      >
        {state === "done" ? (
          <Check className="h-3.5 w-3.5" style={{ color: "#059669" }} aria-hidden />
        ) : (
          <Copy className="h-3.5 w-3.5 cv-text-muted" aria-hidden />
        )}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={copy}
      className="flex h-[44px] items-center gap-1.5 rounded-lg border cv-border px-3 text-[13px] font-semibold cv-hover"
      {...rest}
    >
      {state === "done" ? (
        <Check className="h-4 w-4" style={{ color: "#059669" }} aria-hidden />
      ) : (
        <Copy className="h-4 w-4" aria-hidden />
      )}
      {state === "done" ? "Copied" : state === "failed" ? "Unavailable" : label}
    </button>
  );
}
