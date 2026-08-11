"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Loader2,
  MessageSquare,
  Plus,
  RefreshCw,
  ShieldCheck,
  Siren,
  Timer,
  UserPlus,
  X,
} from "lucide-react";
import {
  SLA,
  SEVERITIES,
  ackClock,
  formatMins,
  mitigateClock,
  type Incident,
  type Severity,
  type SlaState,
  type TimelineEntry,
} from "@/lib/icm";

/**
 * The incident portal.
 *
 * Modelled on Microsoft's IcM, which is worth copying rather than improving on:
 * the people who will use this at three in the morning already know that a
 * queue is sorted by severity, that acknowledging is a distinct act from
 * mitigating, and that a red TTM means somebody should be woken up. Inventing a
 * nicer vocabulary would cost them the one thing they have — muscle memory.
 *
 * The one deliberate departure is that the SLA clocks are always visible rather
 * than a column you can enable. A deadline you have to opt into seeing is a
 * deadline that gets missed.
 */

function tok() {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

interface Stats {
  open: number;
  active: number;
  acknowledged: number;
  mitigated: number;
  resolved: number;
  breached: number;
  atRisk: number;
  bySeverity: Record<number, number>;
  medianTta: number | null;
  medianTtm: number | null;
  slaAttainment: number;
}

/*
 * Severity colours follow IcM's: red for 0 and 1 because they page, amber for
 * 2, blue for 3, grey for 4. Deliberately not a smooth gradient — the eye needs
 * to sort "wake someone" from "not now" instantly, and a gradient makes Sev1
 * and Sev2 look like neighbours when they are on opposite sides of that line.
 */
/*
 * Severity colours follow IcM's: red for 0 and 1 because they page, amber for
 * 2, blue for 3, grey for 4. Deliberately not a smooth gradient — the eye needs
 * to sort "wake someone" from "not now" instantly, and a gradient makes Sev1
 * and Sev2 look like neighbours when they are on opposite sides of that line.
 *
 * These are the one set of colours in this file that stay literal. A Sev0 has
 * to be red in every theme, and the foreground is chosen against the chip's own
 * dark fill rather than against the page — so binding them to the console's
 * text tokens (which are dark, for a light page) makes the label invisible.
 * That is not hypothetical: a bulk conversion did exactly that to Sev4 and the
 * chip rendered as an unlabelled dark blob.
 */
const SEV_STYLE: Record<Severity, { bg: string; fg: string; ring: string }> = {
  0: { bg: "#7f1d1d", fg: "#fecaca", ring: "#ef4444" },
  1: { bg: "#991b1b", fg: "#fee2e2", ring: "#f87171" },
  2: { bg: "#78350f", fg: "#fde68a", ring: "#f59e0b" },
  3: { bg: "#1e3a5f", fg: "#bfdbfe", ring: "#3b82f6" },
  4: { bg: "#475569", fg: "#e2e8f0", ring: "#94a3b8" },
};

const SLA_STYLE: Record<SlaState, { label: string; color: string }> = {
  breached: { label: "Breached", color: "#ef4444" },
  "at-risk": { label: "At risk", color: "#f59e0b" },
  "on-track": { label: "On track", color: "#22c55e" },
  met: { label: "Met", color: "#22c55e" },
  "n/a": { label: "—", color: "var(--text-muted)" },
};

const STATUS_LABEL: Record<Incident["status"], string> = {
  active: "Active",
  acknowledged: "Acknowledged",
  mitigated: "Mitigated",
  resolved: "Resolved",
};

function fmtTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

/* ------------------------------------------------------------ small parts -- */

function SevChip({ sev, size = "sm" }: { sev: Severity; size?: "sm" | "lg" }) {
  const s = SEV_STYLE[sev];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-bold ${
        size === "lg" ? "h-8 px-3 text-sm" : "h-6 px-2 text-[11px]"
      }`}
      style={{ background: s.bg, color: s.fg, border: `1px solid ${s.ring}` }}
      title={SLA[sev].blurb}
    >
      {SLA[sev].label}
    </span>
  );
}

function SlaPill({ state, mins, label }: { state: SlaState; mins: number | null; label: string }) {
  const s = SLA_STYLE[state];
  const overdue = mins != null && mins < 0;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px]" title={`${label}: ${s.label}`}>
      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: s.color }} />
      <span className="font-semibold" style={{ color: s.color }}>
        {state === "n/a" ? "—" : overdue ? `${formatMins(mins)} over` : formatMins(mins)}
      </span>
    </span>
  );
}

function StatCard({ label, value, tone, hint }: { label: string; value: string | number; tone?: string; hint?: string }) {
  return (
    <div className="rounded-xl border cv-border cv-surface p-3">
      <div className="text-[11px] uppercase tracking-wide cv-text-muted">{label}</div>
      <div className="mt-1 text-2xl font-bold" style={{ color: tone || "var(--text-primary)" }}>
        {value}
      </div>
      {hint && <div className="text-[11px] cv-text-muted">{hint}</div>}
    </div>
  );
}

/* --------------------------------------------------------------- the page -- */

export default function IcmPanel() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [teams, setTeams] = useState<string[]>([]);
  const [now, setNow] = useState<string>(new Date().toISOString());
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const [status, setStatus] = useState<"open" | "all" | Incident["status"]>("open");
  const [sev, setSev] = useState<string>("");
  const [slaFilter, setSlaFilter] = useState<string>("");
  const [q, setQ] = useState("");

  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status, q });
      if (sev) params.set("severity", sev);
      if (slaFilter) params.set("sla", slaFilter);
      const r = await fetch(`/api/admin/icm?${params}`, { headers: { "x-admin-token": tok() } });
      const b = await r.json();
      if (!r.ok || !b.success) {
        setError(b.message || "Could not load the incident queue.");
      } else {
        setIncidents(b.incidents || []);
        setStats(b.stats || null);
        setTeams(b.teams || []);
        setNow(b.now || new Date().toISOString());
      }
    } catch {
      setError("Could not reach the incident service.");
    }
    setLoading(false);
  }, [status, sev, slaFilter, q]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * The clocks tick without refetching.
   *
   * An SLA countdown that only moves when you press refresh is a countdown you
   * stop believing. Recomputing locally against a moving `now` is enough: the
   * incidents themselves change rarely, and polling the server every second to
   * animate a number would be absurd.
   */
  useEffect(() => {
    const t = setInterval(() => setNow(new Date().toISOString()), 15_000);
    return () => clearInterval(t);
  }, []);

  const act = useCallback(
    async (body: Record<string, unknown>) => {
      setBusy(true);
      setError("");
      try {
        const r = await fetch("/api/admin/icm", {
          method: "PATCH",
          headers: { "content-type": "application/json", "x-admin-token": tok() },
          body: JSON.stringify(body),
        });
        const b = await r.json();
        if (!r.ok || !b.success) {
          /* 409 is a legitimate answer — "already acknowledged" — and reads as
             information, not as a failure. */
          setError(b.message || "That action did not go through.");
        } else {
          setIncidents((prev) => prev.map((i) => (i.id === b.incident.id ? b.incident : i)));
          void load();
        }
      } catch {
        setError("Could not reach the incident service.");
      }
      setBusy(false);
    },
    [load]
  );

  const open = useMemo(() => incidents.find((i) => i.id === openId) ?? null, [incidents, openId]);

  if (open) {
    return (
      <IncidentDetail
        incident={open}
        now={now}
        teams={teams}
        busy={busy}
        error={error}
        onAct={act}
        onBack={() => setOpenId(null)}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold cv-text-primary">
            <Siren className="h-5 w-5 text-red-400" aria-hidden />
            Incident Management
          </h2>
          <p className="text-[13px] cv-text-muted">
            Severity-ordered queue with acknowledge and mitigate clocks, the way IcM does it.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreating(true)}
            className="inline-flex h-[44px] items-center gap-2 rounded-lg bg-red-600 px-4 text-sm font-semibold text-white hover:bg-red-500"
          >
            <Plus className="h-4 w-4" aria-hidden />
            Declare incident
          </button>
          <button
            onClick={() => void load()}
            className="inline-flex h-[44px] items-center gap-2 rounded-lg border cv-border px-3 text-sm cv-text-secondary hover:cv-surface-alt"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <RefreshCw className="h-4 w-4" aria-hidden />}
            Refresh
          </button>
        </div>
      </div>

      {stats && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Open" value={stats.open} tone="var(--text-primary)" hint={`${stats.active} unacknowledged`} />
          <StatCard label="Breached" value={stats.breached} tone={stats.breached ? "#ef4444" : "#22c55e"} hint="SLA missed" />
          <StatCard label="At risk" value={stats.atRisk} tone={stats.atRisk ? "#f59e0b" : "var(--text-muted)"} hint="80% of budget" />
          <StatCard label="Attainment" value={`${stats.slaAttainment}%`} tone={stats.slaAttainment >= 95 ? "#22c55e" : "#f59e0b"} hint="closed incidents" />
          <StatCard label="Median TTA" value={formatMins(stats.medianTta)} hint="time to acknowledge" />
          <StatCard label="Median TTM" value={formatMins(stats.medianTtm)} hint="time to mitigate" />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 rounded-xl border cv-border cv-surface p-3">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="h-[44px] rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
          aria-label="Filter by status"
        >
          <option value="open">Open</option>
          <option value="active">Unacknowledged</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="mitigated">Mitigated</option>
          <option value="resolved">Resolved</option>
          <option value="all">All</option>
        </select>

        <select
          value={sev}
          onChange={(e) => setSev(e.target.value)}
          className="h-[44px] rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
          aria-label="Filter by severity"
        >
          <option value="">All severities</option>
          {SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {SLA[s].label}
            </option>
          ))}
        </select>

        <select
          value={slaFilter}
          onChange={(e) => setSlaFilter(e.target.value)}
          className="h-[44px] rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
          aria-label="Filter by SLA state"
        >
          <option value="">Any SLA state</option>
          <option value="breached">Breached</option>
          <option value="at-risk">At risk</option>
          <option value="on-track">On track</option>
        </select>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search id, title, team…"
          className="h-[44px] min-w-[200px] flex-1 rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary placeholder:cv-text-muted"
          aria-label="Search incidents"
        />
      </div>

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      <div className="overflow-hidden rounded-xl border cv-border">
        <table className="w-full text-left text-sm">
          <thead className="cv-surface-alt text-[11px] uppercase tracking-wide cv-text-muted">
            <tr>
              <th className="px-3 py-2">Sev</th>
              <th className="px-3 py-2">Incident</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Ack</th>
              <th className="px-3 py-2">Mitigate</th>
              <th className="px-3 py-2">Age</th>
            </tr>
          </thead>
          <tbody>
            {loading && incidents.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-8 text-center cv-text-muted">
                  Loading the queue…
                </td>
              </tr>
            )}
            {!loading && incidents.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center">
                  <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-emerald-500" aria-hidden />
                  <div className="font-semibold cv-text-secondary">Nothing open</div>
                  <div className="text-[13px] cv-text-muted">
                    {status === "open" ? "No active incidents. Quiet is good." : "No incidents match these filters."}
                  </div>
                </td>
              </tr>
            )}
            {incidents.map((inc) => (
              <IncidentRow key={inc.id} inc={inc} now={now} onOpen={() => setOpenId(inc.id)} />
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <DeclareDialog
          teams={teams}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            void load();
          }}
        />
      )}
    </div>
  );
}

/* --------------------------------------------------------------- the rows -- */

/*
 * The clocks come from the same module the server uses.
 *
 * An earlier version of this file recomputed them in the browser, which is how
 * a client and a server end up disagreeing about whether something has
 * breached — the arithmetic is four lines, so it looks harmless to duplicate,
 * and then one side's at-risk threshold changes. icm.ts is pure TypeScript with
 * no node imports precisely so it can be used on both sides.
 *
 * `now` is passed in and ticks locally, so the countdown animates without
 * asking the server for a fresh number every fifteen seconds for every row.
 */
function clocksFor(inc: Incident, now: string) {
  return { ack: ackClock(inc, now), mitigate: mitigateClock(inc, now) };
}

function IncidentRow({ inc, now, onOpen }: { inc: Incident; now: string; onOpen: () => void }) {
  const c = clocksFor(inc, now);
  const age = Math.round((new Date(now).getTime() - new Date(inc.createdAt).getTime()) / 60_000);
  const bad = c.ack.state === "breached" || c.mitigate.state === "breached";

  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-t cv-border hover:cv-hover"
      style={bad ? { boxShadow: "inset 3px 0 0 #ef4444" } : undefined}
    >
      <td className="px-3 py-2.5">
        <SevChip sev={inc.severity} />
      </td>
      <td className="px-3 py-2.5">
        <div className="font-semibold cv-text-primary">{inc.title}</div>
        <div className="text-[12px] cv-text-muted">
          {inc.id} · {inc.owningTeam}
          {inc.affectedServices.length > 0 && ` · ${inc.affectedServices.join(", ")}`}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <span className="text-[12px] cv-text-secondary">{STATUS_LABEL[inc.status]}</span>
      </td>
      <td className="px-3 py-2.5 text-[12px] cv-text-muted">{inc.assignedTo || "—"}</td>
      <td className="px-3 py-2.5">
        <SlaPill state={c.ack.state} mins={c.ack.minutesRemaining} label="Time to acknowledge" />
      </td>
      <td className="px-3 py-2.5">
        <SlaPill state={c.mitigate.state} mins={c.mitigate.minutesRemaining} label="Time to mitigate" />
      </td>
      <td className="px-3 py-2.5 text-[12px] cv-text-muted">{formatMins(age)}</td>
    </tr>
  );
}

/* -------------------------------------------------------------- the detail -- */

function IncidentDetail({
  incident: inc,
  now,
  teams,
  busy,
  error,
  onAct,
  onBack,
}: {
  incident: Incident;
  now: string;
  teams: string[];
  busy: boolean;
  error: string;
  onAct: (body: Record<string, unknown>) => void;
  onBack: () => void;
}) {
  const [note, setNote] = useState("");
  const [assignee, setAssignee] = useState("");
  const [team, setTeam] = useState(inc.owningTeam);
  const c = clocksFor(inc, now);

  const send = (body: Record<string, unknown>) => {
    onAct({ id: inc.id, ...body });
    setNote("");
  };

  return (
    <div className="space-y-4">
      <button
        onClick={onBack}
        className="inline-flex h-[44px] items-center gap-2 text-sm font-semibold cv-text-secondary hover:text-white"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to queue
      </button>

      <div className="rounded-xl border cv-border cv-surface p-4">
        <div className="flex flex-wrap items-start gap-3">
          <SevChip sev={inc.severity} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold cv-text-primary">{inc.title}</h2>
            <div className="text-[13px] cv-text-muted">
              {inc.id} · {STATUS_LABEL[inc.status]} · {inc.owningTeam}
              {inc.assignedTo && ` · ${inc.assignedTo}`} · filed by {inc.createdBy}
            </div>
          </div>
        </div>

        {inc.description && <p className="mt-3 whitespace-pre-wrap text-sm cv-text-secondary">{inc.description}</p>}

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border cv-border p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase cv-text-muted">
              <Clock className="h-3.5 w-3.5" aria-hidden /> Time to acknowledge
            </div>
            <SlaPill state={c.ack.state} mins={c.ack.minutesRemaining} label="TTA" />
            <div className="mt-1 text-[11px] cv-text-muted">
              target {formatMins(inc.slaAckMins)} · {inc.acknowledgedAt ? `at ${fmtTime(inc.acknowledgedAt)}` : "not yet"}
            </div>
          </div>
          <div className="rounded-lg border cv-border p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] uppercase cv-text-muted">
              <Timer className="h-3.5 w-3.5" aria-hidden /> Time to mitigate
            </div>
            <SlaPill state={c.mitigate.state} mins={c.mitigate.minutesRemaining} label="TTM" />
            <div className="mt-1 text-[11px] cv-text-muted">
              target {inc.slaMitigateMins == null ? "none" : formatMins(inc.slaMitigateMins)} ·{" "}
              {inc.mitigatedAt ? `at ${fmtTime(inc.mitigatedAt)}` : "not yet"}
            </div>
          </div>
          <div className="rounded-lg border cv-border p-3">
            <div className="mb-1 text-[11px] uppercase cv-text-muted">Impact started</div>
            <div className="text-sm font-semibold cv-text-primary">{fmtTime(inc.impactStartedAt)}</div>
            <div className="text-[11px] cv-text-muted">{inc.customersImpacted} customers</div>
          </div>
          <div className="rounded-lg border cv-border p-3">
            <div className="mb-1 text-[11px] uppercase cv-text-muted">Services</div>
            <div className="text-sm cv-text-primary">
              {inc.affectedServices.length ? inc.affectedServices.join(", ") : "—"}
            </div>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-amber-800 bg-amber-950/40 px-4 py-3 text-sm text-amber-200">{error}</div>
      )}

      {/* Actions. Ordered as the lifecycle runs, so the next thing to do is
          always the leftmost enabled button. */}
      <div className="flex flex-wrap gap-2 rounded-xl border cv-border cv-surface p-3">
        <button
          disabled={busy || !!inc.acknowledgedAt}
          onClick={() => send({ action: "acknowledge" })}
          className="inline-flex h-[44px] items-center gap-2 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-40 hover:bg-blue-500"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Acknowledge
        </button>
        <button
          disabled={busy || !!inc.mitigatedAt || inc.status === "resolved"}
          onClick={() => send({ action: "mitigate", note })}
          className="inline-flex h-[44px] items-center gap-2 rounded-lg bg-amber-600 px-4 text-sm font-semibold text-white disabled:opacity-40 hover:bg-amber-500"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden /> Mitigate
        </button>
        <button
          disabled={busy || inc.status === "resolved"}
          onClick={() => send({ action: "resolve", note })}
          className="inline-flex h-[44px] items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-40 hover:bg-emerald-500"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Resolve
        </button>
        {inc.status === "resolved" && (
          <button
            disabled={busy}
            onClick={() => send({ action: "reactivate", note })}
            className="inline-flex h-[44px] items-center gap-2 rounded-lg border border-red-700 px-4 text-sm font-semibold text-red-300 disabled:opacity-40 hover:bg-red-950/40"
          >
            <AlertOctagon className="h-4 w-4" aria-hidden /> Reactivate
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">
          <select
            value={inc.severity}
            onChange={(e) => send({ action: "severity", severity: Number(e.target.value), note })}
            disabled={busy}
            className="h-[44px] rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
            aria-label="Change severity"
          >
            {SEVERITIES.map((s) => (
              <option key={s} value={s}>
                {SLA[s].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide cv-text-muted">
            <MessageSquare className="h-4 w-4" aria-hidden /> Discussion &amp; timeline
          </h3>

          <div className="rounded-xl border cv-border cv-surface p-3">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Add a comment, or a note to attach to the next action…"
              className="w-full rounded-lg border cv-border cv-surface-alt px-3 py-2 text-sm cv-text-primary placeholder:cv-text-muted"
              aria-label="Comment"
            />
            <button
              disabled={busy || !note.trim()}
              onClick={() => send({ action: "comment", body: note })}
              className="mt-2 inline-flex h-[44px] items-center gap-2 rounded-lg border cv-border px-4 text-sm font-semibold cv-text-primary disabled:opacity-40 hover:cv-surface-alt"
            >
              Comment
            </button>
          </div>

          <ol className="space-y-2">
            {[...inc.timeline].reverse().map((t) => (
              <TimelineRow key={t.id} entry={t} />
            ))}
          </ol>
        </div>

        <div className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide cv-text-muted">
            <UserPlus className="h-4 w-4" aria-hidden /> Routing
          </h3>
          <div className="space-y-2 rounded-xl border cv-border cv-surface p-3">
            <label className="block text-[12px] cv-text-muted" htmlFor="icm-assignee">
              Assign to
            </label>
            <input
              id="icm-assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              placeholder={inc.assignedTo || "nobody yet"}
              className="h-[44px] w-full rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
            />
            <label className="block text-[12px] cv-text-muted" htmlFor="icm-team">
              Owning team
            </label>
            <select
              id="icm-team"
              value={team}
              onChange={(e) => setTeam(e.target.value)}
              className="h-[44px] w-full rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
            >
              {[...new Set([inc.owningTeam, ...teams])].filter(Boolean).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <button
              disabled={busy}
              onClick={() => {
                send({ action: "assign", assignedTo: assignee, owningTeam: team });
                setAssignee("");
              }}
              className="inline-flex h-[44px] w-full items-center justify-center rounded-lg border cv-border text-sm font-semibold cv-text-primary disabled:opacity-40 hover:cv-surface-alt"
            >
              Route
            </button>
          </div>

          {(inc.mitigation || inc.rootCause) && (
            <div className="space-y-2 rounded-xl border cv-border cv-surface p-3 text-sm">
              {inc.mitigation && (
                <div>
                  <div className="text-[11px] uppercase cv-text-muted">Mitigation</div>
                  <div className="cv-text-secondary">{inc.mitigation}</div>
                </div>
              )}
              {inc.rootCause && (
                <div>
                  <div className="text-[11px] uppercase cv-text-muted">Root cause</div>
                  <div className="cv-text-secondary">{inc.rootCause}</div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const KIND_ICON: Record<TimelineEntry["kind"], typeof Clock> = {
  created: AlertTriangle,
  acknowledged: CheckCircle2,
  mitigated: ShieldCheck,
  resolved: CheckCircle2,
  reactivated: AlertOctagon,
  severity: AlertTriangle,
  assigned: UserPlus,
  comment: MessageSquare,
  escalated: Siren,
  sla: Timer,
};

function TimelineRow({ entry }: { entry: TimelineEntry }) {
  const Icon = KIND_ICON[entry.kind] ?? MessageSquare;
  return (
    <li className="flex gap-3 rounded-lg border cv-border cv-surface p-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 cv-text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <div className="text-[13px] cv-text-secondary">
          <span className="font-semibold cv-text-primary">{entry.actor}</span> {entry.text}
        </div>
        {entry.body && <div className="mt-1 whitespace-pre-wrap text-[13px] cv-text-muted">{entry.body}</div>}
      </div>
      <time className="shrink-0 text-[11px] cv-text-muted">{fmtTime(entry.at)}</time>
    </li>
  );
}

/* ------------------------------------------------------------- declaration -- */

function DeclareDialog({
  teams,
  onClose,
  onCreated,
}: {
  teams: string[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  /*
   * Defaults to Sev3, never Sev0.
   *
   * A form that opens on the loudest option gets it chosen by accident, and an
   * accidental Sev0 wakes the on-call rota. Raising severity is one dropdown
   * away and is recorded in the timeline; starting there is not.
   */
  const [severity, setSeverity] = useState<Severity>(3);
  const [owningTeam, setOwningTeam] = useState(teams[0] || "Platform");
  const [services, setServices] = useState("");
  const [customers, setCustomers] = useState("0");
  const [impactAgo, setImpactAgo] = useState("0");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const submit = async () => {
    if (!title.trim()) {
      setErr("Give it a title somebody can recognise on a call.");
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const mins = Math.max(0, Number(impactAgo) || 0);
      const r = await fetch("/api/admin/icm", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify({
          title,
          description,
          severity,
          owningTeam,
          affectedServices: services.split(",").map((s) => s.trim()).filter(Boolean),
          customersImpacted: Number(customers) || 0,
          impactStartedAt: new Date(Date.now() - mins * 60_000).toISOString(),
        }),
      });
      const b = await r.json();
      if (!r.ok || !b.success) setErr(b.message || "Could not file the incident.");
      else onCreated();
    } catch {
      setErr("Could not reach the incident service.");
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Declare an incident">
      <button className="absolute inset-0 bg-black/60" onClick={onClose} aria-label="Close" />
      <div className="relative max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl border cv-border cv-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold cv-text-primary">Declare an incident</h3>
          <button onClick={onClose} className="grid h-[44px] w-[44px] place-items-center cv-text-muted" aria-label="Close">
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[12px] cv-text-muted" htmlFor="inc-title">Title</label>
            <input
              id="inc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Control plane returning 503 to all device commands"
              className="h-[44px] w-full rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
            />
          </div>

          <div>
            <label className="mb-1 block text-[12px] cv-text-muted" htmlFor="inc-sev">Severity</label>
            <select
              id="inc-sev"
              value={severity}
              onChange={(e) => setSeverity(Number(e.target.value) as Severity)}
              className="h-[44px] w-full rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
            >
              {SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {SLA[s].label} — {SLA[s].blurb}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[11px] cv-text-muted">
              Acknowledge within {formatMins(SLA[severity].ack)}
              {SLA[severity].mitigate != null && `, mitigate within ${formatMins(SLA[severity].mitigate)}`}.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-[12px] cv-text-muted" htmlFor="inc-desc">What is happening</label>
            <textarea
              id="inc-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-lg border cv-border cv-surface-alt px-3 py-2 text-sm cv-text-primary"
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[12px] cv-text-muted" htmlFor="inc-team">Owning team</label>
              <select
                id="inc-team"
                value={owningTeam}
                onChange={(e) => setOwningTeam(e.target.value)}
                className="h-[44px] w-full rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
              >
                {teams.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              {/*
                Impact usually started before anybody filed the ticket, and the
                mitigate clock runs from impact — so asking for it here is what
                keeps TTM honest rather than flattering it by however long it
                took to notice.
              */}
              <label className="mb-1 block text-[12px] cv-text-muted" htmlFor="inc-impact">
                Impact started (minutes ago)
              </label>
              <input
                id="inc-impact"
                type="number"
                min={0}
                value={impactAgo}
                onChange={(e) => setImpactAgo(e.target.value)}
                className="h-[44px] w-full rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] cv-text-muted" htmlFor="inc-svcs">Affected services</label>
              <input
                id="inc-svcs"
                value={services}
                onChange={(e) => setServices(e.target.value)}
                placeholder="control-plane, mqtt"
                className="h-[44px] w-full rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
              />
            </div>
            <div>
              <label className="mb-1 block text-[12px] cv-text-muted" htmlFor="inc-cust">Customers impacted</label>
              <input
                id="inc-cust"
                type="number"
                min={0}
                value={customers}
                onChange={(e) => setCustomers(e.target.value)}
                className="h-[44px] w-full rounded-lg border cv-border cv-surface-alt px-3 text-sm cv-text-primary"
              />
            </div>
          </div>

          {err && <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">{err}</div>}

          <button
            onClick={() => void submit()}
            disabled={busy}
            className="inline-flex h-[44px] w-full items-center justify-center gap-2 rounded-lg bg-red-600 text-sm font-bold text-white disabled:opacity-50 hover:bg-red-500"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Siren className="h-4 w-4" aria-hidden />}
            Declare {SLA[severity].label}
          </button>
        </div>
      </div>
    </div>
  );
}




