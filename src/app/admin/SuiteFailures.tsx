"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Failures across every application in the suite.
 *
 * The rest of App Insights describes this website. This blade describes the
 * whole estate — ATS, HRMS, Auth, Mail, Careers, the console — and answers the
 * question support is actually asked, which is never "what is the p95 of
 * /api/orders". It is "Priya says the ATS is broken for her": which API, for
 * which person, and why.
 *
 * That is why these rows carry a name and the rest of the panel does not.
 * Customer telemetry is anonymous by design and stays that way; this is staff
 * using internal tools, where an anonymous hash cannot answer the question.
 */

interface AppHealth {
  app: string;
  failures: number;
  people: number;
  lastSeen: string;
}

interface AffectedPerson {
  actor: string;
  count: number;
  apps: string[];
  lastSeen: string;
  topRoute: string;
  topError: string;
}

interface FailureGroup {
  signature: string;
  app: string;
  route: string;
  method: string;
  errorType: string;
  sampleMessage?: string;
  sampleStack?: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  statuses: number[];
  actors: string[];
  anonymousOnly: boolean;
}

interface ActorFailure {
  id: string;
  at: string;
  app: string;
  route: string;
  method: string;
  status: number;
  errorType?: string;
  errorMessage?: string;
  requestId?: string;
}

interface Payload {
  apps: AppHealth[];
  people: AffectedPerson[];
  groups: FailureGroup[];
  received: number;
  durable: boolean;
  hours: number;
}

const tok = () => (typeof window === "undefined" ? "" : sessionStorage.getItem("admin-token") || "");

const when = (iso: string) => {
  const diff = Date.now() - Date.parse(iso);
  if (!Number.isFinite(diff)) return "—";
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
};

export default function SuiteFailures() {
  const [hours, setHours] = useState(24);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [person, setPerson] = useState<{ actor: string; failures: ActorFailure[] } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`/api/admin/insights-failures?hours=${hours}`, {
        headers: { "x-admin-token": tok() },
      });
      if (!r.ok) throw new Error(r.status === 403 ? "Your role cannot see App Insights." : "Could not load failures.");
      setData(await r.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load failures.");
    } finally {
      setLoading(false);
    }
  }, [hours]);

  useEffect(() => {
    void load();
  }, [load]);

  const openPerson = async (actor: string) => {
    const r = await fetch(
      `/api/admin/insights-failures?hours=${hours}&actor=${encodeURIComponent(actor)}`,
      { headers: { "x-admin-token": tok() } }
    );
    if (!r.ok) return;
    const d = await r.json();
    setPerson({ actor, failures: d.failures ?? [] });
  };

  const card = {
    background: "var(--bg-glass)",
    border: "1px solid var(--border-primary)",
  } as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold" style={{ color: "var(--text-primary)" }}>
            Suite failures
          </h3>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            Failed API calls reported by every Circuvent application, with the
            person each one happened to.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {[1, 24, 168].map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition"
              style={{
                ...card,
                color: hours === h ? "#fff" : "var(--text-secondary)",
                background: hours === h ? "linear-gradient(135deg,#06b6d4,#8b5cf6)" : "var(--bg-glass)",
              }}
            >
              {h === 1 ? "Last hour" : h === 24 ? "24 hours" : "7 days"}
            </button>
          ))}
          <button
            onClick={() => void load()}
            className="rounded-lg px-3 py-1.5 text-xs font-medium"
            style={{ ...card, color: "var(--text-secondary)" }}
          >
            Refresh
          </button>
        </div>
      </div>

      {/*
        Not durable means the collector is keeping records in one instance's
        memory, so an empty table below means "nothing was kept", not "nothing
        went wrong". Saying which is the difference between a panel that can be
        trusted and one that merely looks calm.
      */}
      {data && !data.durable && (
        <p
          className="rounded-lg px-3 py-2 text-xs"
          style={{ background: "rgba(245,158,11,.12)", color: "#fbbf24" }}
        >
          Failure records are not being stored durably on this deployment, so
          this list may be incomplete. Set <code>DATABASE_URL</code> to keep them.
        </p>
      )}

      {error && (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(239,68,68,.12)", color: "#f87171" }}>
          {error}
        </p>
      )}

      {loading && !data && (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          Loading…
        </p>
      )}

      {data && data.groups.length === 0 && !error && (
        /*
         * Worded, not blank. An empty panel is read as "this is broken"; the
         * only honest way to show good news is to say it.
         */
        <div className="rounded-xl px-4 py-10 text-center" style={card}>
          <p className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            No API failures reported in this window.
          </p>
          <p className="mt-1 text-xs" style={{ color: "var(--text-tertiary)" }}>
            {data.received === 0
              ? "Nothing has ever been reported — check that the applications have INSIGHTS_INGEST_URL and INSIGHTS_INGEST_TOKEN set."
              : `${data.received.toLocaleString()} reported in total, none in the last ${data.hours} hours.`}
          </p>
        </div>
      )}

      {data && data.groups.length > 0 && (
        <>
          {/* ── by application ─────────────────────────────── */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {data.apps.map((a) => (
              <div key={a.app} className="rounded-xl p-4" style={card}>
                <p className="text-xs uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
                  {a.app}
                </p>
                <p className="mt-1 text-2xl font-semibold" style={{ color: "var(--text-primary)" }}>
                  {a.failures.toLocaleString()}
                </p>
                <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  {a.people === 0 ? "nobody signed in" : `${a.people} ${a.people === 1 ? "person" : "people"}`} ·{" "}
                  {when(a.lastSeen)}
                </p>
              </div>
            ))}
          </div>

          {/* ── who is stuck ───────────────────────────────── */}
          <div className="rounded-xl p-4" style={card}>
            <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              People affected
            </h4>
            {data.people.length === 0 ? (
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                Every failure in this window happened on an unauthenticated
                request, so no individual is blocked.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="text-xs uppercase tracking-wide" style={{ color: "var(--text-tertiary)" }}>
                      <th className="pb-2 pr-4 font-medium">Person</th>
                      <th className="pb-2 pr-4 font-medium">Failures</th>
                      <th className="pb-2 pr-4 font-medium">Applications</th>
                      <th className="pb-2 pr-4 font-medium">Mostly</th>
                      <th className="pb-2 font-medium">Last</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.people.map((p) => (
                      <tr key={p.actor} style={{ borderTop: "1px solid var(--border-primary)" }}>
                        <td className="py-2 pr-4">
                          <button
                            onClick={() => void openPerson(p.actor)}
                            className="font-medium hover:underline"
                            style={{ color: "#22d3ee" }}
                          >
                            {p.actor}
                          </button>
                        </td>
                        <td className="py-2 pr-4" style={{ color: "var(--text-primary)" }}>{p.count}</td>
                        <td className="py-2 pr-4" style={{ color: "var(--text-secondary)" }}>{p.apps.join(", ")}</td>
                        <td className="py-2 pr-4" style={{ color: "var(--text-secondary)" }}>
                          <code className="text-xs">{p.topRoute}</code>
                          <span className="ml-2 text-xs" style={{ color: "var(--text-tertiary)" }}>{p.topError}</span>
                        </td>
                        <td className="py-2 text-xs" style={{ color: "var(--text-tertiary)" }}>{when(p.lastSeen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── root causes ────────────────────────────────── */}
          <div className="rounded-xl p-4" style={card}>
            <h4 className="mb-3 text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Root causes
            </h4>
            <div className="space-y-2">
              {data.groups.map((g) => {
                const open = openGroup === g.signature;
                return (
                  <div key={g.signature} className="rounded-lg" style={{ border: "1px solid var(--border-primary)" }}>
                    <button
                      onClick={() => setOpenGroup(open ? null : g.signature)}
                      className="flex w-full flex-wrap items-center gap-3 px-3 py-2.5 text-left"
                    >
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
                        style={{ background: "rgba(139,92,246,.18)", color: "#c4b5fd" }}
                      >
                        {g.app}
                      </span>
                      <code className="text-xs" style={{ color: "var(--text-primary)" }}>
                        {g.method} {g.route}
                      </code>
                      <span className="text-xs" style={{ color: "#f87171" }}>
                        {g.errorType}
                      </span>
                      <span className="ml-auto text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {g.count}× · {g.actors.length} affected · {when(g.lastSeen)}
                      </span>
                    </button>

                    {open && (
                      <div className="px-3 pb-3 text-xs" style={{ color: "var(--text-secondary)" }}>
                        {g.sampleMessage && (
                          <p className="mb-2">
                            <span style={{ color: "var(--text-tertiary)" }}>Message: </span>
                            {g.sampleMessage}
                          </p>
                        )}
                        <p className="mb-2">
                          <span style={{ color: "var(--text-tertiary)" }}>Status: </span>
                          {g.statuses.join(", ")}
                          <span className="ml-3" style={{ color: "var(--text-tertiary)" }}>First seen: </span>
                          {when(g.firstSeen)}
                        </p>
                        <p className="mb-2">
                          <span style={{ color: "var(--text-tertiary)" }}>Affected: </span>
                          {g.anonymousOnly ? (
                            <em>no signed-in user — public or unauthenticated calls</em>
                          ) : (
                            g.actors.map((a) => (
                              <button
                                key={a}
                                onClick={() => void openPerson(a)}
                                className="mr-2 hover:underline"
                                style={{ color: "#22d3ee" }}
                              >
                                {a}
                              </button>
                            ))
                          )}
                        </p>
                        {g.sampleStack && (
                          <pre
                            className="overflow-x-auto rounded p-2 text-[11px] leading-relaxed"
                            style={{ background: "rgba(0,0,0,.35)", color: "var(--text-secondary)" }}
                          >
                            {g.sampleStack}
                          </pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* ── one person's history ─────────────────────────── */}
      {person && (
        <div className="rounded-xl p-4" style={card}>
          <div className="mb-3 flex items-center justify-between">
            <h4 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {person.actor}
            </h4>
            <button
              onClick={() => setPerson(null)}
              className="text-xs hover:underline"
              style={{ color: "var(--text-tertiary)" }}
            >
              Close
            </button>
          </div>
          {person.failures.length === 0 ? (
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              Nothing failed for this person in the selected window.
            </p>
          ) : (
            <div className="space-y-1.5">
              {person.failures.map((f) => (
                <div key={f.id} className="flex flex-wrap items-baseline gap-2 text-xs">
                  <span style={{ color: "var(--text-tertiary)" }}>{when(f.at)}</span>
                  <span style={{ color: "#c4b5fd" }}>{f.app}</span>
                  <code style={{ color: "var(--text-primary)" }}>
                    {f.method} {f.route}
                  </code>
                  <span style={{ color: "#f87171" }}>{f.status}</span>
                  <span style={{ color: "var(--text-secondary)" }}>
                    {f.errorType}
                    {f.errorMessage ? `: ${f.errorMessage}` : ""}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
