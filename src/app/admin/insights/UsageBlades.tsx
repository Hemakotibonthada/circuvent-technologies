"use client";

/**
 * The Usage blades: Users & Sessions, User Flows, Funnels, Cohorts and Impact.
 *
 * On the identity these are built from — telemetry-store.ts derives `session`
 * from IP + user agent + **the day**, salted, and its own comment is explicit
 * that it cannot join today's session to yesterday's. Azure's Retention and
 * Cohorts blades ask multi-day questions that this identifier cannot answer,
 * so the equivalents here are scoped to the window and say so on screen rather
 * than quietly reporting a number that would always read as total churn.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  Filter,
  GitBranch,
  Plus,
  Target,
  Trash2,
  TrendingDown,
  Users,
} from "lucide-react";
import {
  Bar,
  Card,
  Caveat,
  Empty,
  ErrorNote,
  SERIES_COLOURS,
  Spinner,
  StatTile,
  healthColour,
  ms,
  num,
  pct,
  shortTime,
  tok,
  useAdminData,
} from "./kit";
import type {
  CohortStats,
  FlowResult,
  FunnelResult,
  FunnelStepSpec,
  ImpactResult,
  ReturnBehaviour,
  SessionSummary,
  UsageDimension,
  UsagePoint,
  UsageSlice,
} from "@/lib/app-insights-usage";

interface UsageView {
  hours: number;
  now: string;
  overTime: UsagePoint[];
  breakdown: UsageSlice[];
  dimension: UsageDimension;
  sessions: SessionSummary[];
  totals: { sessions: number; events: number; pageViews: number; failures: number };
  returns: ReturnBehaviour;
  flowNodes: { path: string; visits: number }[];
  flow: FlowResult | null;
}

const DIMENSIONS: { id: UsageDimension; label: string }[] = [
  { id: "path", label: "Route" },
  { id: "entryPath", label: "Landing page" },
  { id: "source", label: "Surface" },
  { id: "userAgentClass", label: "Device" },
  { id: "kind", label: "Telemetry type" },
  { id: "method", label: "HTTP method" },
];

/* ------------------------------------------------------------------ *
 * Users, Sessions and Events                                          *
 * ------------------------------------------------------------------ */

export function UsageBlade({ hours }: { hours: number }) {
  const [dimension, setDimension] = useState<UsageDimension>("path");
  const [node, setNode] = useState("");
  const url = `/api/admin/insights-usage?view=overview&hours=${hours}&dimension=${dimension}${
    node ? `&node=${encodeURIComponent(node)}` : ""
  }`;
  const { data, error, loading } = useAdminData<UsageView>(url);

  if (loading && !data) return <Spinner label="Reading sessions…" />;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return null;

  const maxEvents = Math.max(1, ...data.overTime.map((p) => p.events));
  const maxSlice = Math.max(1, ...data.breakdown.map((b) => b.events));

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Sessions" value={num(data.totals.sessions)} hint={`in the last ${hours}h`} />
        <StatTile label="Events" value={num(data.totals.events)} />
        <StatTile label="Page views" value={num(data.totals.pageViews)} />
        <StatTile
          label="Failures"
          value={num(data.totals.failures)}
          tone={healthColour(data.totals.events ? data.totals.failures / data.totals.events : 0)}
          hint={data.totals.events ? pct(data.totals.failures / data.totals.events) + " of events" : undefined}
        />
      </div>

      <Card title="Sessions and events over time" subtitle="Sessions are counted once per bucket.">
        {data.overTime.every((p) => p.events === 0) ? (
          <Empty>Nothing arrived in this window.</Empty>
        ) : (
          <div className="flex h-40 items-end gap-[2px]">
            {data.overTime.map((p) => (
              <div
                key={p.at}
                className="group relative flex-1"
                title={`${shortTime(p.at)} — ${p.events} events, ${p.sessions} sessions, ${p.failures} failed`}
              >
                <div
                  className="w-full rounded-t"
                  style={{
                    height: `${Math.max(2, (p.events / maxEvents) * 150)}px`,
                    background:
                      p.failures > 0
                        ? "linear-gradient(180deg,#f87171,#dc2626)"
                        : "linear-gradient(180deg,#22d3ee,#6366f1)",
                  }}
                />
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card
        title="Breakdown"
        right={
          <div className="flex flex-wrap gap-1">
            {DIMENSIONS.map((d) => (
              <button
                key={d.id}
                onClick={() => setDimension(d.id)}
                aria-pressed={dimension === d.id}
                className="rounded-lg border px-2 py-1 text-[12px] font-semibold"
                style={
                  dimension === d.id
                    ? { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff", borderColor: "transparent" }
                    : { borderColor: "var(--border-primary)", color: "var(--text-secondary)" }
                }
              >
                {d.label}
              </button>
            ))}
          </div>
        }
      >
        {data.breakdown.length === 0 ? (
          <Empty>Nothing to break down yet.</Empty>
        ) : (
          <div className="space-y-2">
            {data.breakdown.slice(0, 15).map((b) => (
              <div key={b.key}>
                <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
                  <span className="truncate font-medium cv-text-primary">{b.key}</span>
                  <span className="shrink-0 tabular-nums cv-text-muted">
                    {num(b.events)} · {num(b.sessions)} sessions · {pct(b.share, 0)}
                  </span>
                </div>
                <div className="mt-1">
                  <Bar value={b.events} max={maxSlice} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Engagement" subtitle={`Return counted after ${data.returns.gapMinutes} minutes of quiet.`}>
          <div className="grid grid-cols-2 gap-3">
            <StatTile label="Returning" value={pct(data.returns.returnRate, 0)} hint={`${num(data.returns.returning)} sessions`} />
            <StatTile label="Bounced" value={pct(data.returns.bounceRate, 0)} hint={`${num(data.returns.bounced)} one-view sessions`} />
            <StatTile label="Median session" value={ms(data.returns.medianSessionMs)} />
            <StatTile label="Sessions" value={num(data.returns.sessions)} />
          </div>
          <div className="mt-3 space-y-2">
            {data.returns.buckets.map((b, i) => (
              <div key={b.visits}>
                <div className="flex justify-between text-[12px] cv-text-secondary">
                  <span>{b.visits}</span>
                  <span className="tabular-nums">{num(b.sessions)}</span>
                </div>
                <Bar
                  value={b.sessions}
                  max={Math.max(1, ...data.returns.buckets.map((x) => x.sessions))}
                  colour={SERIES_COLOURS[i % SERIES_COLOURS.length]}
                />
              </div>
            ))}
          </div>
          <div className="mt-3">
            <Caveat>
              <strong>Not multi-day retention.</strong> The session identifier is re-salted every
              midnight by design, so somebody returning tomorrow is a different session and cannot
              be followed. This measures whether a session went quiet and came back inside the
              window — the engagement question underneath, asked honestly.
            </Caveat>
          </div>
        </Card>

        <Card title="Busiest sessions" subtitle="Anonymous and rotating. Never an identity.">
          {data.sessions.length === 0 ? (
            <Empty>No sessions in this window.</Empty>
          ) : (
            <div className="max-h-[22rem] overflow-y-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead>
                  <tr className="border-b cv-border">
                    <th className="px-2 py-1.5 cv-text-secondary">Session</th>
                    <th className="px-2 py-1.5 text-right cv-text-secondary">Events</th>
                    <th className="px-2 py-1.5 text-right cv-text-secondary">Routes</th>
                    <th className="px-2 py-1.5 text-right cv-text-secondary">Span</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.slice(0, 40).map((s) => (
                    <tr key={s.session} className="border-b cv-border last:border-0">
                      <td className="px-2 py-1.5">
                        <span className="font-mono cv-text-primary">{s.session.slice(0, 8)}</span>
                        <span className="ml-1.5 cv-text-muted">{s.entryPath}</span>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums cv-text-primary">{s.events}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums cv-text-secondary">{s.routes}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums cv-text-muted">{ms(s.durationMs)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <FlowsPanel data={data} onNode={setNode} />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * User flows                                                          *
 * ------------------------------------------------------------------ */

function FlowsPanel({ data, onNode }: { data: UsageView; onNode: (p: string) => void }) {
  const flow = data.flow;
  return (
    <Card
      title={
        <span className="inline-flex items-center gap-1.5">
          <GitBranch className="h-4 w-4" /> User flows
        </span>
      }
      subtitle="Where page views came from and went next. API traffic is excluded — it is the page loading itself, not somebody navigating."
      right={
        <select
          value={flow?.node ?? ""}
          onChange={(e) => onNode(e.target.value)}
          className="h-9 rounded-lg border cv-border px-2 text-[13px]"
          style={{ background: "var(--bg-surface)", color: "var(--text-primary)" }}
          aria-label="Flow node"
        >
          {data.flowNodes.map((n) => (
            <option key={n.path} value={n.path}>
              {n.path} ({n.visits})
            </option>
          ))}
        </select>
      }
    >
      {!flow || flow.visits === 0 ? (
        <Empty>No page views for that route in this window.</Empty>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <StatTile label="Visits" value={num(flow.visits)} />
            <StatTile label="Sessions" value={num(flow.sessions)} />
            <StatTile label="Entries" value={num(flow.entries)} hint="started here" />
            <StatTile
              label="Exit rate"
              value={pct(flow.exitRate, 0)}
              tone={flow.exitRate > 0.6 ? "#d97706" : undefined}
              hint={`${num(flow.exits)} ended here`}
            />
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_auto_1fr] md:items-start">
            <FlowSide title="Came from" edges={flow.incoming} align="right" />
            <div className="hidden self-center md:block">
              <div
                className="rounded-lg px-3 py-2 text-center text-[12.5px] font-bold text-white"
                style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
              >
                {flow.node}
              </div>
            </div>
            <FlowSide title="Went to" edges={flow.outgoing} align="left" />
          </div>
        </>
      )}
    </Card>
  );
}

function FlowSide({
  title,
  edges,
  align,
}: {
  title: string;
  edges: FlowResult["incoming"];
  align: "left" | "right";
}) {
  const max = Math.max(1, ...edges.map((e) => e.events));
  return (
    <div>
      <div className={`mb-2 text-[11px] font-bold uppercase tracking-wide cv-text-muted ${align === "right" ? "md:text-right" : ""}`}>
        {title}
      </div>
      {edges.length === 0 ? (
        <p className="text-[12.5px] cv-text-muted">Nothing — this is where the session began or ended.</p>
      ) : (
        <div className="space-y-2">
          {edges.slice(0, 8).map((e) => (
            <div key={e.path}>
              <div className={`flex items-baseline gap-2 text-[12.5px] ${align === "right" ? "md:flex-row-reverse" : ""}`}>
                {align === "left" && <ArrowRight className="h-3 w-3 shrink-0 cv-text-muted" />}
                <span className="truncate cv-text-primary">{e.path}</span>
                <span className="ml-auto shrink-0 tabular-nums cv-text-muted">{pct(e.share, 0)}</span>
              </div>
              <div className="mt-1">
                <Bar value={e.events} max={max} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Funnels                                                             *
 * ------------------------------------------------------------------ */

const DEFAULT_STEPS: FunnelStepSpec[] = [
  { label: "Shop", path: "/shop", match: "exact" },
  { label: "Product", path: "/shop/[slug]", match: "exact" },
  { label: "Cart", path: "/cart", match: "exact" },
  { label: "Checkout", path: "/checkout", match: "exact" },
];

export function FunnelBlade({ hours }: { hours: number }) {
  const [steps, setSteps] = useState<FunnelStepSpec[]>(DEFAULT_STEPS);
  const [result, setResult] = useState<FunnelResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const run = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/admin/insights-usage?hours=${hours}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify({ view: "funnel", steps }),
      });
      const b = await r.json();
      if (!r.ok || !b.success) setError(b.message || "That funnel could not be evaluated.");
      else setResult(b as FunnelResult);
    } catch {
      setError("Could not reach the telemetry service.");
    }
    setBusy(false);
  }, [steps, hours]);

  useEffect(() => {
    void run();
    // Re-runs when the window changes; step edits are applied on demand so the
    // funnel is not recomputed on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hours]);

  const setStep = (i: number, patch: Partial<FunnelStepSpec>) =>
    setSteps((s) => s.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  const maxSessions = Math.max(1, ...(result?.steps ?? []).map((s) => s.sessions));

  return (
    <div className="space-y-4">
      <Card
        title={
          <span className="inline-flex items-center gap-1.5">
            <Filter className="h-4 w-4" /> Funnel
          </span>
        }
        subtitle="Steps must happen in order. A session that reached checkout before the cart has not converted through this funnel — it arrived from somewhere else."
        right={
          <button
            onClick={() => void run()}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
          >
            {busy ? "Evaluating…" : "Evaluate"}
          </button>
        }
      >
        <div className="space-y-2">
          {steps.map((s, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <span className="w-5 shrink-0 text-center text-[12px] font-bold cv-text-muted">{i + 1}</span>
              <input
                value={s.label}
                onChange={(e) => setStep(i, { label: e.target.value })}
                placeholder="Label"
                aria-label={`Step ${i + 1} label`}
                className="h-9 w-32 rounded-lg border cv-border px-2 text-[13px]"
                style={{ background: "var(--bg-glass)", color: "var(--text-primary)" }}
              />
              <input
                value={s.path}
                onChange={(e) => setStep(i, { path: e.target.value })}
                placeholder="/route"
                aria-label={`Step ${i + 1} route`}
                className="h-9 min-w-[10rem] flex-1 rounded-lg border cv-border px-2 font-mono text-[12.5px]"
                style={{ background: "var(--bg-glass)", color: "var(--text-primary)" }}
              />
              <select
                value={s.match}
                onChange={(e) => setStep(i, { match: e.target.value as "exact" | "prefix" | "contains" })}
                aria-label={`Step ${i + 1} match`}
                className="h-9 rounded-lg border cv-border px-2 text-[12.5px]"
                style={{ background: "var(--bg-surface)", color: "var(--text-primary)" }}
              >
                <option value="exact">exact</option>
                <option value="prefix">starts with</option>
                <option value="contains">contains</option>
              </select>
              <button
                onClick={() => setSteps((x) => x.filter((_, j) => j !== i))}
                disabled={steps.length <= 2}
                aria-label={`Remove step ${i + 1}`}
                className="grid h-9 w-9 place-items-center rounded-lg border cv-border disabled:opacity-40"
                style={{ color: "var(--text-tertiary)" }}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={() => setSteps((s) => [...s, { label: "", path: "", match: "exact" }])}
            disabled={steps.length >= 10}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border cv-border px-3 text-[13px] font-semibold cv-text-secondary disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" /> Add step
          </button>
        </div>
        {error && (
          <div className="mt-2">
            <ErrorNote>{error}</ErrorNote>
          </div>
        )}
      </Card>

      {result && result.steps.length > 0 && (
        <Card
          title="Conversion"
          subtitle={
            result.medianCompletionMs !== null
              ? `Median time from first step to last: ${ms(result.medianCompletionMs)}.`
              : undefined
          }
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <StatTile label="Entered" value={num(result.entered)} />
            <StatTile label="Completed" value={num(result.completed)} />
            <StatTile
              label="Overall conversion"
              value={pct(result.overallConversion, 1)}
              tone={result.overallConversion < 0.1 ? "#d97706" : "#059669"}
            />
          </div>

          <div className="mt-4 space-y-3">
            {result.steps.map((s, i) => (
              <div key={i}>
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-[12.5px]">
                  <span className="font-semibold cv-text-primary">
                    {i + 1}. {s.label}
                    <span className="ml-1.5 font-normal font-mono cv-text-muted">{s.path}</span>
                  </span>
                  <span className="tabular-nums cv-text-secondary">
                    {num(s.sessions)} sessions · {pct(s.conversionFromStart, 0)} of entrants
                    {s.medianMsFromPrevious !== null && ` · +${ms(s.medianMsFromPrevious)}`}
                  </span>
                </div>
                <div className="mt-1">
                  <Bar value={s.sessions} max={maxSessions} colour={SERIES_COLOURS[i % SERIES_COLOURS.length]} />
                </div>
                {i > 0 && s.droppedOff > 0 && (
                  <div className="mt-1 flex items-center gap-1 text-[11.5px]" style={{ color: "#b45309" }}>
                    <TrendingDown className="h-3 w-3" />
                    {num(s.droppedOff)} lost here ({pct(1 - s.conversionFromPrevious, 0)} of the previous step)
                  </div>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Cohorts                                                             *
 * ------------------------------------------------------------------ */

interface CohortView {
  totalSessions: number;
  cohorts: CohortStats[];
}

export function CohortsBlade({ hours }: { hours: number }) {
  const { data, error, loading } = useAdminData<CohortView>(
    `/api/admin/insights-usage?view=cohorts&hours=${hours}`,
  );

  if (loading && !data) return <Spinner label="Evaluating cohorts…" />;
  if (error) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return null;

  return (
    <div className="space-y-4">
      <Card
        title={
          <span className="inline-flex items-center gap-1.5">
            <Users className="h-4 w-4" /> Cohorts
          </span>
        }
        subtitle={`Groups of sessions, defined as filters. ${num(data.totalSessions)} sessions in the window.`}
      >
        {data.cohorts.length === 0 ? (
          <Empty>No cohorts defined.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-left text-[12.5px]">
              <thead>
                <tr className="border-b cv-border">
                  <th className="px-2 py-2 cv-text-secondary">Cohort</th>
                  <th className="px-2 py-2 text-right cv-text-secondary">Sessions</th>
                  <th className="px-2 py-2 text-right cv-text-secondary">Share</th>
                  <th className="px-2 py-2 text-right cv-text-secondary">Events</th>
                  <th className="px-2 py-2 text-right cv-text-secondary">Failure rate</th>
                  <th className="px-2 py-2 text-right cv-text-secondary">p95</th>
                </tr>
              </thead>
              <tbody>
                {data.cohorts.map((c) => (
                  <tr key={c.id} className="border-b cv-border last:border-0">
                    <td className="px-2 py-2">
                      <div className="font-semibold cv-text-primary">{c.name}</div>
                      <code className="text-[11.5px] cv-text-muted">{c.filter}</code>
                      {c.error && (
                        <div className="mt-0.5 text-[11.5px]" style={{ color: "#b91c1c" }}>
                          {c.error}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums cv-text-primary">{num(c.sessions)}</td>
                    <td className="px-2 py-2 text-right tabular-nums cv-text-secondary">{pct(c.share, 0)}</td>
                    <td className="px-2 py-2 text-right tabular-nums cv-text-secondary">{num(c.events)}</td>
                    <td
                      className="px-2 py-2 text-right tabular-nums font-semibold"
                      style={{ color: healthColour(c.failureRate) }}
                    >
                      {pct(c.failureRate, 1)}
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums cv-text-secondary">{ms(c.p95Ms)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="mt-3">
          <Caveat>
            A cohort is a filter in the same language the Logs blade uses, so a cohort and a
            hand-written query always select the same sessions. Membership is evaluated inside the
            selected window only — the session identifier cannot be followed across days.
          </Caveat>
        </div>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Impact                                                              *
 * ------------------------------------------------------------------ */

export function ImpactBlade({ hours }: { hours: number }) {
  const [goal, setGoal] = useState("/checkout");
  const [applied, setApplied] = useState("/checkout");
  const { data, error, loading } = useAdminData<ImpactResult>(
    `/api/admin/insights-usage?view=impact&hours=${hours}&goal=${encodeURIComponent(applied)}`,
    applied.trim().length > 0,
  );

  const maxSessions = useMemo(
    () => Math.max(1, ...(data?.buckets ?? []).map((b) => b.sessions)),
    [data],
  );

  return (
    <div className="space-y-4">
      <Card
        title={
          <span className="inline-flex items-center gap-1.5">
            <Target className="h-4 w-4" /> Impact
          </span>
        }
        subtitle="Do slow sessions reach the goal less often?"
        right={
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setApplied(goal.trim());
            }}
            className="flex items-center gap-2"
          >
            <input
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              aria-label="Goal route"
              placeholder="/checkout"
              className="h-9 w-44 rounded-lg border cv-border px-2 font-mono text-[12.5px]"
              style={{ background: "var(--bg-glass)", color: "var(--text-primary)" }}
            />
            <button
              type="submit"
              className="h-9 rounded-lg px-3 text-[13px] font-bold text-white"
              style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}
            >
              Apply
            </button>
          </form>
        }
      >
        {loading && !data ? (
          <Spinner label="Measuring…" />
        ) : error ? (
          <ErrorNote>{error}</ErrorNote>
        ) : !data ? null : (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <StatTile label="Sessions" value={num(data.sessions)} />
              <StatTile label="Reached the goal" value={num(data.converted)} hint={pct(data.baseline, 1) + " baseline"} />
              <StatTile
                label="Fast vs slow"
                value={`${data.spreadPoints > 0 ? "+" : ""}${data.spreadPoints} pts`}
                tone={data.spreadPoints > 5 ? "#b45309" : undefined}
                hint="fastest bucket minus slowest"
              />
            </div>

            <div className="mt-4 space-y-3">
              {data.buckets.map((b) => (
                <div key={b.label}>
                  <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
                    <span className="font-medium cv-text-primary">{b.label}</span>
                    <span className="tabular-nums cv-text-secondary">
                      {num(b.converted)}/{num(b.sessions)} · {pct(b.conversionRate, 0)}
                    </span>
                  </div>
                  <div className="mt-1">
                    <Bar
                      value={b.sessions}
                      max={maxSessions}
                      colour={b.conversionRate >= data.baseline ? "#059669" : "#dc2626"}
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-3">
              <Caveat>
                <strong>This is a correlation, not a cause.</strong> Sessions that convert do more
                work and therefore have more chances to be slow, which pushes this relationship in
                the opposite direction to the one being looked for. Read a large spread as somewhere
                to investigate, not as a measured cost.
              </Caveat>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
