"use client";

/**
 * End-to-end transaction details.
 *
 * Azure's version reconstructs one operation across every component that took
 * part in it, as a waterfall. What is reconstructable here is a **session**:
 * the events share a session id and a clock, but nothing carries a parent
 * span id, so true causal nesting is not recoverable. Drawing a nested tree
 * would mean inventing the parentage — and a waterfall that shows the wrong
 * call as the parent of a slow one sends somebody to the wrong service.
 *
 * So this draws what the timestamps honestly support: every event in the
 * session on a shared timeline, positioned by when it started and sized by how
 * long it took. That answers the question the blade exists for — what else was
 * happening when this failed, and what was slow around it — without claiming a
 * hierarchy nobody recorded.
 */

import { useMemo, useState } from "react";
import { ChevronRight, Search, Waypoints } from "lucide-react";
import { Card, Caveat, Empty, StatTile, healthColour, ms, num, pct, shortTime } from "./kit";
import SessionWaterfall from "./SessionWaterfall";
import type { TelemetryEvent } from "@/lib/app-insights";


export default function TransactionBlade({ events }: { events: TelemetryEvent[] }) {
  const [filter, setFilter] = useState("");
  const [openSession, setOpenSession] = useState<string | null>(null);

  /** Sessions in the buffer the panel already holds, newest activity first. */
  const sessions = useMemo(() => {
    const by = new Map<string, TelemetryEvent[]>();
    for (const e of events) {
      const list = by.get(e.session);
      if (list) list.push(e);
      else by.set(e.session, [e]);
    }
    return [...by.entries()]
      .map(([session, list]) => {
        const ordered = [...list].sort((a, b) => a.at.localeCompare(b.at));
        const failures = ordered.filter((e) => !e.ok).length;
        return {
          session,
          events: ordered,
          failures,
          failureRate: failures / ordered.length,
          startedAt: ordered[0].at,
          lastAt: ordered[ordered.length - 1].at,
          spanMs: Date.parse(ordered[ordered.length - 1].at) - Date.parse(ordered[0].at),
          entry: ordered[0].path,
        };
      })
      .sort((a, b) => b.lastAt.localeCompare(a.lastAt));
  }, [events]);

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return sessions;
    return sessions.filter(
      (s) =>
        s.session.toLowerCase().includes(q) ||
        s.events.some(
          (e) =>
            e.path.toLowerCase().includes(q) ||
            (e.errorType ?? "").toLowerCase().includes(q) ||
            (e.errorMessage ?? "").toLowerCase().includes(q) ||
            String(e.status).includes(q),
        ),
    );
  }, [sessions, filter]);

  const open = openSession ? sessions.find((s) => s.session === openSession) ?? null : null;

  return (
    <div className="space-y-4">
      <Card
        title={
          <span className="inline-flex items-center gap-1.5">
            <Search className="h-4 w-4" /> Transaction search
          </span>
        }
        subtitle="Find a session by route, status, error or id, then open it to see everything that happened."
        right={
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="500, /api/orders, TypeError…"
            aria-label="Search transactions"
            className="h-9 w-56 rounded-lg border cv-border px-2 text-[13px]"
            style={{ background: "var(--bg-glass)", color: "var(--text-primary)" }}
          />
        }
      >
        {visible.length === 0 ? (
          <Empty>
            {sessions.length === 0
              ? "No transactions in the buffer yet."
              : "Nothing matched that search."}
          </Empty>
        ) : (
          <div className="max-h-96 overflow-y-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr className="border-b cv-border">
                  <th className="px-2 py-2 cv-text-secondary">Session</th>
                  <th className="px-2 py-2 cv-text-secondary">Entry</th>
                  <th className="px-2 py-2 text-right cv-text-secondary">Events</th>
                  <th className="px-2 py-2 text-right cv-text-secondary">Failed</th>
                  <th className="px-2 py-2 text-right cv-text-secondary">Span</th>
                  <th className="px-2 py-2 text-right cv-text-secondary">Last seen</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {visible.slice(0, 60).map((s) => (
                  <tr
                    key={s.session}
                    className="cursor-pointer border-b cv-border cv-hover last:border-0"
                    onClick={() => setOpenSession(s.session === openSession ? null : s.session)}
                  >
                    <td className="px-2 py-1.5 font-mono cv-text-primary">{s.session.slice(0, 10)}</td>
                    <td className="px-2 py-1.5 truncate cv-text-secondary">{s.entry}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums cv-text-primary">{s.events.length}</td>
                    <td
                      className="px-2 py-1.5 text-right tabular-nums font-semibold"
                      style={{ color: s.failures ? healthColour(s.failureRate) : "var(--text-muted)" }}
                    >
                      {s.failures || "—"}
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums cv-text-muted">{ms(s.spanMs)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums cv-text-muted">{shortTime(s.lastAt)}</td>
                    <td className="px-2 py-1.5 text-right">
                      <ChevronRight
                        className="inline h-4 w-4 transition-transform"
                        style={{
                          transform: s.session === openSession ? "rotate(90deg)" : "none",
                          color: "var(--text-tertiary)",
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {open && <Waterfall session={open} />}
    </div>
  );
}

function Waterfall({
  session,
}: {
  session: {
    session: string;
    events: TelemetryEvent[];
    failures: number;
    failureRate: number;
    startedAt: string;
    spanMs: number;
  };
}) {
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-1.5">
          <Waypoints className="h-4 w-4" /> Transaction {session.session.slice(0, 10)}
        </span>
      }
      subtitle={`${session.events.length} events over ${ms(session.spanMs)}, starting ${shortTime(session.startedAt)}.`}
    >
      <div className="grid gap-3 sm:grid-cols-3">
        <StatTile label="Events" value={num(session.events.length)} />
        <StatTile
          label="Failures"
          value={num(session.failures)}
          tone={session.failures ? healthColour(session.failureRate) : undefined}
          hint={session.failures ? pct(session.failureRate, 0) + " of the session" : undefined}
        />
        <StatTile label="Span" value={ms(session.spanMs)} />
      </div>

      <div className="mt-4">
        <SessionWaterfall events={session.events} startedAt={session.startedAt} />
      </div>

      {session.events.some((e) => e.errorType) && (
        <div className="mt-4 space-y-2">
          <div className="text-[11px] font-bold uppercase tracking-wide cv-text-muted">Exceptions</div>
          {session.events
            .filter((e) => e.errorType)
            .map((e) => (
              <div
                key={e.id}
                className="rounded-lg border px-3 py-2 text-[12px]"
                style={{ borderColor: "rgba(239,68,68,0.35)", background: "rgba(239,68,68,0.06)" }}
              >
                <div className="font-bold" style={{ color: "#b91c1c" }}>
                  {e.errorType} <span className="font-normal cv-text-muted">on {e.path}</span>
                </div>
                {e.errorMessage && <div className="mt-0.5 cv-text-secondary">{e.errorMessage}</div>}
                {e.stack && (
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] cv-text-muted">{e.stack}</pre>
                )}
              </div>
            ))}
        </div>
      )}

      <div className="mt-4">
        <Caveat>
          Positioned by timestamp, not nested by causation. Nothing in this telemetry carries a
          parent span id, so a nested waterfall would have to invent the parentage — and one that
          shows the wrong call as the parent of a slow one sends somebody to the wrong service.
        </Caveat>
      </div>
    </Card>
  );
}
