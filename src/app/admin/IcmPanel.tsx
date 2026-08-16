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
  FileText,
  Link2,
  Rocket,
  X,
  BarChart3,
} from "lucide-react";
import { IcmAnalytics } from "./IcmAnalytics";
import IncidentSummaryCard from "./IncidentSummaryCard";
import {
  SLA,
  SEVERITIES,
  ackClock,
  formatMins,
  formatWhen,
  mitigateClock,
  type Incident,
  type Severity,
  type SlaState,
  type TimelineEntry,
  type SavedView,
  type OpenAction,
  type LinkKind,
  LINK_LABEL,
  LINK_KINDS,
  DEFAULT_VIEWS,
} from "@/lib/icm";

/** Built-ins cannot be deleted; the button is hidden rather than left to fail. */
const DEFAULT_VIEW_IDS = new Set(DEFAULT_VIEWS.map((v) => v.id));

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

/** One owner for this format; the summary card states times too. */
const fmtTime = formatWhen;

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
  const [showTrends, setShowTrends] = useState(false);
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
  const [hideDuplicates, setHideDuplicates] = useState(true);
  const [views, setViews] = useState<SavedView[]>([]);
  const [onCall, setOnCall] = useState<Record<string, string>>({});
  const [teamContacts, setTeamContacts] = useState<Record<string, string[]>>({});
  const [showTeamMail, setShowTeamMail] = useState(false);
  const [mailHealth, setMailHealth] = useState<{
    verdict: "ok" | "degraded" | "broken";
    summary: string;
    smtp: { advice: string };
  } | null>(null);
  const [activeView, setActiveView] = useState("");
  const [postmortemsDue, setPostmortemsDue] = useState<{ id: string; title: string }[]>([]);
  const [actions, setActions] = useState<OpenAction[]>([]);
  /*
   * Selection for bulk work. A queue fills up in bursts — one rollout files
   * eleven incidents against the same service — and acknowledging eleven
   * incidents one page at a time is how an ack SLA gets breached by the
   * console rather than by the outage.
   */
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ status, q });
      if (sev) params.set("severity", sev);
      if (slaFilter) params.set("sla", slaFilter);
      if (hideDuplicates) params.set("hideDuplicates", "1");
      const r = await fetch(`/api/admin/icm?${params}`, { headers: { "x-admin-token": tok() } });
      const b = await r.json();
      if (!r.ok || !b.success) {
        setError(b.message || "Could not load the incident queue.");
      } else {
        setIncidents(b.incidents || []);
        setStats(b.stats || null);
        setTeams(b.teams || []);
        setViews(b.views || []);
        setOnCall(b.onCall || {});
        setTeamContacts(b.teamContacts || {});
        setPostmortemsDue(b.postmortemsDue || []);
        setActions(b.actionsOutstanding || []);
        setNow(b.now || new Date().toISOString());
      }
    } catch {
      setError("Could not reach the incident service.");
    }
    setLoading(false);
  }, [status, sev, slaFilter, q, hideDuplicates]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
   * Whether any of this can actually reach anybody.
   *
   * An incident queue whose notifications are silently going nowhere is worse
   * than no queue: it looks like the team was told. Checked once when the panel
   * opens, from a timer so the state is set from an external callback rather
   * than synchronously inside the effect.
   */
  useEffect(() => {
    const t = setTimeout(() => {
      void (async () => {
        try {
          const r = await fetch("/api/admin/emails?health=1", { headers: { "x-admin-token": tok() } });
          const b = await r.json();
          if (b?.ok && b.health) setMailHealth(b.health);
        } catch {
          /* The banner is an extra; failing to fetch it must not colour the queue. */
        }
      })();
    }, 0);
    return () => clearTimeout(t);
  }, []);

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

  /**
   * The same action across every selected incident.
   *
   * Sequential, not `Promise.all`. Each of these writes a timeline entry and
   * re-reads the record, and firing eleven concurrent read-modify-writes at one
   * JSON store is how two of them end up with the other's timeline. Eleven
   * round trips is slower and correct.
   *
   * Failures are counted rather than thrown, because a partial result is the
   * normal case: "already acknowledged" comes back for anything somebody else
   * picked up while this was open, and that is information, not an error.
   */
  const bulkAct = useCallback(
    async (action: "acknowledge" | "mitigate" | "resolve", ids: string[]) => {
      const verb = action === "acknowledge" ? "Acknowledge" : action === "mitigate" ? "Mitigate" : "Resolve";
      const many = `${ids.length} incident${ids.length === 1 ? "" : "s"}`;

      /*
       * Mitigate and resolve write their note into the incident's mitigation
       * and root cause. Sending a canned "bulk action" string would stamp that
       * placeholder onto every record at once and it would still be there
       * during the postmortem, so the note is asked for rather than invented.
       * Acknowledging records no text, so it only needs confirming.
       */
      let note = "";
      if (action === "acknowledge") {
        if (!confirm(`Acknowledge ${many}?`)) return;
      } else {
        const answer = prompt(
          `${verb} ${many}.\n\nThis note is written to every one of them — say what was actually done.`
        );
        if (!answer?.trim()) return;
        note = answer.trim();
      }

      setBusy(true);
      setError("");
      let failed = 0;

      for (const id of ids) {
        try {
          const r = await fetch("/api/admin/icm", {
            method: "PATCH",
            headers: { "content-type": "application/json", "x-admin-token": tok() },
            body: JSON.stringify({ id, action, note }),
          });
          const b = await r.json();
          if (!r.ok || !b.success) failed += 1;
        } catch {
          failed += 1;
        }
      }

      if (failed) {
        setError(
          `${ids.length - failed} of ${ids.length} went through. ${failed} did not — most likely already ${action}d by somebody else.`
        );
      }
      setSelected(new Set());
      setBusy(false);
      void load();
    },
    [load]
  );

  /*
   * Selection is dropped whenever the list changes underneath it. Keeping ids
   * that are no longer on screen means a bulk action that hits incidents the
   * person cannot see and did not mean to pick.
   */
  useEffect(() => {
    setSelected(new Set());
  }, [status, sev, slaFilter, q, hideDuplicates]);

  /*
   * Applying a view writes its filters into the controls rather than bypassing
   * them, so what is on screen always explains what is in the list. A view that
   * filters invisibly is a queue that looks wrong for no stated reason.
   */
  const applyView = useCallback((v: SavedView) => {
    setActiveView(v.id);
    setStatus((v.filters.status as typeof status) ?? "open");
    setSev(v.filters.severity == null ? "" : String(v.filters.severity));
    setSlaFilter(v.filters.slaState ?? "");
    setQ(v.filters.search ?? "");
    setHideDuplicates(v.filters.hideDuplicates ?? false);
  }, []);

  const saveCurrentView = useCallback(async () => {
    const name = prompt("Name this view");
    if (!name?.trim()) return;
    const shared = confirm("Share it with the team?\n\nOK to share, Cancel to keep it to yourself.");

    setBusy(true);
    try {
      const r = await fetch("/api/admin/icm", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify({
          kind: "view",
          name: name.trim(),
          shared,
          filters: {
            status,
            severity: sev === "" ? null : Number(sev),
            slaState: slaFilter || null,
            search: q,
            hideDuplicates,
          },
        }),
      });
      const b = await r.json();
      if (!r.ok || !b.success) setError(b.message || "Could not save that view.");
      else {
        setActiveView(b.view.id);
        void load();
      }
    } catch {
      setError("Could not reach the incident service.");
    }
    setBusy(false);
  }, [status, sev, slaFilter, q, hideDuplicates, load]);

  const removeView = useCallback(
    async (id: string) => {
      if (!confirm("Delete this view?")) return;
      setBusy(true);
      try {
        const r = await fetch(`/api/admin/icm?viewId=${encodeURIComponent(id)}`, {
          method: "DELETE",
          headers: { "x-admin-token": tok() },
        });
        const b = await r.json();
        if (!r.ok || !b.success) setError(b.message || "Could not delete that view.");
        else {
          setActiveView("");
          void load();
        }
      } catch {
        setError("Could not reach the incident service.");
      }
      setBusy(false);
    },
    [load]
  );

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

      {/*
        Trends are opt-in, and the queue stays the landing view.

        Somebody opening this page during an incident wants the queue, not a
        chart of last month. The analytics answer a different question — asked
        in a review rather than at 3am — so they are one click away instead of
        pushing the incident list below the fold.
      */}
      <div>
        <button
          onClick={() => setShowTrends((v) => !v)}
          aria-expanded={showTrends}
          className="inline-flex h-[44px] items-center gap-2 rounded-lg border cv-border px-3 text-sm cv-text-secondary hover:cv-surface-alt"
        >
          <BarChart3 className="h-4 w-4" aria-hidden />
          {showTrends ? "Hide trends" : "Show trends"}
        </button>
      </div>

      {showTrends && <IcmAnalytics incidents={incidents} />}

      {(postmortemsDue.length > 0 || actions.length > 0) && (
        <div className="grid gap-3 lg:grid-cols-2">
          {postmortemsDue.length > 0 && (
            <div className="rounded-xl border border-amber-800/50 bg-amber-950/20 p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-amber-200">
                <FileText className="h-4 w-4" aria-hidden />
                {postmortemsDue.length} postmortem{postmortemsDue.length === 1 ? "" : "s"} owed
              </div>
              <ul className="space-y-1">
                {postmortemsDue.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setOpenId(p.id)}
                      className="text-left text-[13px] text-amber-100/90 hover:underline"
                    >
                      {p.id} — {p.title}
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-amber-200/60">
                Required for Sev0–2. The incident is closed, so nothing else would show these.
              </p>
            </div>
          )}

          {actions.length > 0 && (
            <div className="rounded-xl border cv-border cv-surface p-3">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold cv-text-primary">
                <CheckCircle2 className="h-4 w-4 text-cyan-400" aria-hidden />
                {actions.length} outstanding action{actions.length === 1 ? "" : "s"}
              </div>
              <ul className="space-y-1">
                {actions.slice(0, 8).map((a) => (
                  <li key={`${a.incidentId}-${a.id}`} className="flex items-baseline gap-2 text-[13px]">
                    <button
                      onClick={() => setOpenId(a.incidentId)}
                      className="shrink-0 font-mono text-[11px] cv-text-muted hover:underline"
                    >
                      {a.incidentId}
                    </button>
                    <span className="min-w-0 flex-1 truncate cv-text-secondary">{a.what}</span>
                    <span className="shrink-0 text-[11px] cv-text-muted">
                      {a.owner}
                      {a.due ? ` · ${a.due}` : ""}
                    </span>
                  </li>
                ))}
              </ul>
              {actions.length > 8 && (
                <div className="mt-1 text-[11px] cv-text-muted">and {actions.length - 8} more.</div>
              )}
              <p className="mt-2 text-[11px] cv-text-muted">
                The only part of an incident that changes anything, and the easiest to lose —
                they live inside a postmortem inside a closed incident.
              </p>
            </div>
          )}
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

        <label className="inline-flex items-center gap-2 text-[12px] cv-text-muted" title="Fold incidents marked as duplicates into the one they duplicate">
          <input
            type="checkbox"
            checked={hideDuplicates}
            onChange={(e) => setHideDuplicates(e.target.checked)}
            className="h-4 w-4"
          />
          Fold duplicates
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide cv-text-muted">Views</span>
        {views.map((v) => (
          <button
            key={v.id}
            onClick={() => applyView(v)}
            className={`h-[32px] rounded-full border px-3 text-xs font-semibold ${
              activeView === v.id ? "border-cyan-500 text-cyan-300" : "cv-border cv-text-muted hover:cv-text-primary"
            }`}
            title={v.shared ? "Shared with the team" : "Only you can see this"}
          >
            {v.name}
            {!v.shared && " ·"}
          </button>
        ))}
        <button
          onClick={() => void saveCurrentView()}
          className="h-[32px] rounded-full border cv-border px-3 text-xs cv-text-muted hover:cv-text-primary"
          title="Save the current filters as a view"
        >
          + Save view
        </button>
        {activeView && !DEFAULT_VIEW_IDS.has(activeView) && (
          <button
            onClick={() => void removeView(activeView)}
            className="h-[32px] rounded-full border cv-border px-3 text-xs text-red-300 hover:cv-surface-alt"
          >
            Delete view
          </button>
        )}
        {Object.entries(onCall).filter(([, w]) => w).length > 0 && (
          <span className="ml-auto text-[11px] cv-text-muted">
            On call:{" "}
            {Object.entries(onCall)
              .filter(([, w]) => w)
              .map(([team, w]) => `${team} — ${w}`)
              .join(" · ")}
          </span>
        )}
        <button
          onClick={() => setShowTeamMail((v) => !v)}
          aria-expanded={showTeamMail}
          title="Where each team's incident mail goes"
          className="h-[32px] rounded-full border cv-border px-3 text-xs cv-text-secondary hover:cv-surface-alt"
        >
          Team mail
          {/* Silent routing is the failure this whole path exists to remove, so
              a team that reaches nobody is called out rather than left to be
              discovered during an outage. */}
          {teams.some((t) => !(teamContacts[t] ?? []).length) && (
            <span className="ml-1.5 text-amber-400">
              {teams.filter((t) => !(teamContacts[t] ?? []).length).length} unrouted
            </span>
          )}
        </button>
      </div>

      {showTeamMail && (
        <TeamMailEditor
          teams={teams}
          contacts={teamContacts}
          onSaved={(next) => setTeamContacts(next)}
          onError={setError}
        />
      )}

      {error && (
        <div className="rounded-lg border border-red-800 bg-red-950/50 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {mailHealth && mailHealth.verdict !== "ok" && (
        <div
          className="rounded-lg border px-4 py-3 text-sm"
          style={{
            borderColor: mailHealth.verdict === "broken" ? "rgba(220,38,38,0.5)" : "rgba(245,158,11,0.45)",
            background: mailHealth.verdict === "broken" ? "rgba(220,38,38,0.08)" : "rgba(245,158,11,0.07)",
          }}
        >
          <div
            className="font-bold"
            style={{ color: mailHealth.verdict === "broken" ? "#b91c1c" : "#b45309" }}
          >
            {mailHealth.verdict === "broken"
              ? "Incident mail is not being delivered."
              : "Incident mail is going out on the fallback transport."}
          </div>
          <div className="mt-0.5 cv-text-secondary">{mailHealth.summary}</div>
          {mailHealth.smtp.advice && (
            <div className="mt-1 text-[12.5px] cv-text-muted">{mailHealth.smtp.advice}</div>
          )}
        </div>
      )}

      {/*
        Only present when something is selected. A toolbar of permanently
        greyed-out bulk buttons is a row of controls that look available and do
        nothing, which is the mistake this console keeps making.
      */}
      {selected.size > 0 && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl border p-3"
          style={{ borderColor: "var(--border-accent)", background: "var(--bg-surface)" }}
        >
          <span className="text-sm font-semibold cv-text-primary">
            {selected.size} selected
          </span>
          <button
            disabled={busy}
            onClick={() => void bulkAct("acknowledge", [...selected])}
            className="inline-flex h-[38px] items-center gap-1.5 rounded-lg border cv-border px-3 text-sm font-semibold cv-text-primary disabled:opacity-40 hover:cv-surface-alt"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Acknowledge
          </button>
          <button
            disabled={busy}
            onClick={() => void bulkAct("mitigate", [...selected])}
            className="inline-flex h-[38px] items-center gap-1.5 rounded-lg border cv-border px-3 text-sm font-semibold cv-text-primary disabled:opacity-40 hover:cv-surface-alt"
          >
            <ShieldCheck className="h-4 w-4" aria-hidden /> Mitigate
          </button>
          <button
            disabled={busy}
            onClick={() => void bulkAct("resolve", [...selected])}
            className="inline-flex h-[38px] items-center gap-1.5 rounded-lg border cv-border px-3 text-sm font-semibold cv-text-primary disabled:opacity-40 hover:cv-surface-alt"
          >
            <CheckCircle2 className="h-4 w-4" aria-hidden /> Resolve
          </button>
          <button
            onClick={() => setSelected(new Set())}
            className="ml-auto h-[38px] rounded-lg px-3 text-sm cv-text-muted hover:cv-surface-alt"
          >
            Clear selection
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border cv-border">
        <table className="w-full text-left text-sm">
          <thead className="cv-surface-alt text-[11px] uppercase tracking-wide cv-text-muted">
            <tr>
              <th className="w-9 px-2 py-2">
                <input
                  type="checkbox"
                  aria-label="Select every incident in this view"
                  checked={incidents.length > 0 && selected.size === incidents.length}
                  ref={(el) => {
                    /* Partly-selected is its own state and has to look like one. */
                    if (el) el.indeterminate = selected.size > 0 && selected.size < incidents.length;
                  }}
                  onChange={(e) =>
                    setSelected(e.target.checked ? new Set(incidents.map((i) => i.id)) : new Set())
                  }
                />
              </th>
              <th className="px-3 py-2">Sev</th>
              <th className="px-3 py-2">Incident</th>
              <th className="px-3 py-2">Owning service</th>
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
                <td colSpan={9} className="px-3 py-8 text-center cv-text-muted">
                  Loading the queue…
                </td>
              </tr>
            )}
            {!loading && incidents.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-10 text-center">
                  <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-emerald-500" aria-hidden />
                  <div className="font-semibold cv-text-secondary">Nothing open</div>
                  <div className="text-[13px] cv-text-muted">
                    {status === "open" ? "No active incidents. Quiet is good." : "No incidents match these filters."}
                  </div>
                </td>
              </tr>
            )}
            {incidents.map((inc) => (
              <IncidentRow
                key={inc.id}
                inc={inc}
                now={now}
                onOpen={() => setOpenId(inc.id)}
                selected={selected.has(inc.id)}
                onToggle={() =>
                  setSelected((prev) => {
                    const next = new Set(prev);
                    if (next.has(inc.id)) next.delete(inc.id);
                    else next.add(inc.id);
                    return next;
                  })
                }
              />
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

function IncidentRow({
  inc,
  now,
  onOpen,
  selected,
  onToggle,
}: {
  inc: Incident;
  now: string;
  onOpen: () => void;
  selected: boolean;
  onToggle: () => void;
}) {
  const c = clocksFor(inc, now);
  const age = Math.round((new Date(now).getTime() - new Date(inc.createdAt).getTime()) / 60_000);
  const bad = c.ack.state === "breached" || c.mitigate.state === "breached";

  /*
   * The left edge carries severity, always — that is what makes a queue
   * readable at a glance, before any of the text is read.
   *
   * Breach used to own this bar, which meant severity was only ever visible in
   * the chip, and a Sev0 sitting inside its SLA looked exactly like a Sev4.
   * Breach now tints the row instead, so the two signals stack rather than one
   * hiding the other.
   */
  return (
    <tr
      onClick={onOpen}
      className="cursor-pointer border-t cv-border hover:cv-hover"
      style={{
        boxShadow: `inset 4px 0 0 ${SEV_STYLE[inc.severity].ring}`,
        background: bad ? "rgba(239,68,68,0.07)" : undefined,
      }}
    >
      <td className="w-9 px-2 py-2.5">
        <input
          type="checkbox"
          checked={selected}
          aria-label={`Select ${inc.id}`}
          /* The row opens the incident; the checkbox must not. */
          onClick={(e) => e.stopPropagation()}
          onChange={onToggle}
        />
      </td>
      <td className="px-3 py-2.5">
        <SevChip sev={inc.severity} />
      </td>
      <td className="px-3 py-2.5">
        <div className="font-semibold cv-text-primary">{inc.title}</div>
        <div className="text-[12px] cv-text-muted">{inc.id}</div>
      </td>
      <td className="px-3 py-2.5 text-[12px] cv-text-secondary">
        {inc.affectedServices.length > 0 ? inc.affectedServices.join(", ") : <span className="cv-text-muted">—</span>}
      </td>
      <td className="px-3 py-2.5">
        <span className="text-[12px] cv-text-secondary">{STATUS_LABEL[inc.status]}</span>
      </td>
      <td className="px-3 py-2.5 text-[12px]">
        <div className="cv-text-secondary">{inc.owningTeam}</div>
        <div className="cv-text-muted">{inc.assignedTo || "unassigned"}</div>
      </td>
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

/* ------------------------------------------------------------ team mail -- */

/**
 * Where each team's incident mail goes.
 *
 * A team was only ever a name until this existed: incidents routed to it
 * notified whoever happened to be assigned, whoever the rota named, and one
 * global address shared by every team. A team with an empty rota and nobody
 * assigned notified nobody at all, and there was no screen anywhere that would
 * have shown you that.
 */
function TeamMailEditor({
  teams,
  contacts,
  onSaved,
  onError,
}: {
  teams: string[];
  contacts: Record<string, string[]>;
  onSaved: (next: Record<string, string[]>) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");

  const valueFor = (team: string) => draft[team] ?? (contacts[team] ?? []).join(", ");

  const save = async (team: string) => {
    setSaving(team);
    onError("");
    try {
      const r = await fetch("/api/admin/icm", {
        method: "POST",
        headers: { "content-type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify({ kind: "team-contacts", team, emails: valueFor(team) }),
      });
      const b = await r.json();
      if (!r.ok || !b.success) onError(b.message || "Could not save that address.");
      else {
        onSaved(b.teamContacts || {});
        setDraft((d) => {
          const next = { ...d };
          delete next[team];
          return next;
        });
      }
    } catch {
      onError("Could not reach the incident service.");
    }
    setSaving("");
  };

  return (
    <div className="rounded-xl border cv-border p-3">
      <div className="mb-2 text-[12px] cv-text-secondary">
        Every incident filed against a team, and every update to it, is mailed to these addresses —
        alongside whoever is assigned and whoever the rota names. Leave one blank to fall back to the
        address configured for the deployment.
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {teams.map((team) => {
          const routed = (contacts[team] ?? []).length > 0;
          const dirty = draft[team] !== undefined;
          return (
            <div key={team} className="flex items-center gap-2">
              <span
                className="w-32 shrink-0 truncate text-[12.5px] font-semibold"
                style={{ color: routed ? "var(--text-primary)" : "#b45309" }}
                title={routed ? undefined : "No address — incidents for this team reach nobody"}
              >
                {team}
              </span>
              <input
                value={valueFor(team)}
                onChange={(e) => setDraft((d) => ({ ...d, [team]: e.target.value }))}
                placeholder="team@circuvent.com"
                aria-label={`Mail for ${team}`}
                className="h-8 min-w-0 flex-1 rounded-lg border cv-border px-2 text-[12.5px]"
                style={{ background: "var(--bg-glass)", color: "var(--text-primary)" }}
              />
              <button
                onClick={() => void save(team)}
                disabled={!dirty || saving === team}
                className="h-8 shrink-0 rounded-lg border cv-border px-2.5 text-[12px] font-semibold cv-text-secondary disabled:opacity-40"
              >
                {saving === team ? "Saving…" : "Save"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------- the detail -- */

/** The sections of an incident, in the order somebody works through one. */
type DetailTab = "summary" | "routing" | "links" | "retro";

/** Exported for tests: the detail is the half of this panel worth rendering. */
export function IncidentDetail({
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
  const [tab, setTab] = useState<DetailTab>("summary");
  const c = clocksFor(inc, now);

  /*
   * Counts sit on the tabs that have something waiting in them, so the shape
   * of the incident is readable without opening anything. A "Related" tab with
   * a 3 on it is the difference between somebody checking for a duplicate and
   * somebody not thinking to.
   */
  const DETAIL_TABS: Array<{ id: DetailTab; label: string; count?: number }> = [
    { id: "summary", label: "Summary & discussion", count: inc.timeline?.length },
    { id: "routing", label: "Routing & resolution" },
    { id: "links", label: "Related", count: inc.links?.length },
    { id: "retro", label: "Retrospective", count: inc.postmortem ? 1 : 0 },
  ];

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

      {/*
       * Tabs, the way IcM lays an incident out.
       *
       * This was one long scroll: SLA cards, actions, discussion, routing,
       * links and the postmortem editor all stacked. That is fine for an
       * incident with three timeline entries and unusable for the ones that
       * matter, where the thing somebody needs is forty entries down and the
       * postmortem is below that.
       *
       * The header and the action bar stay outside the tabs on purpose —
       * severity, the clocks and "acknowledge" have to be reachable from
       * wherever you are, because they are what the page is for.
       */}
      <div
        role="tablist"
        aria-label="Incident sections"
        className="flex flex-wrap gap-1 border-b"
        style={{ borderColor: "var(--border-primary)" }}
      >
        {DETAIL_TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className="relative min-h-[44px] px-3 text-sm font-medium transition-colors"
            style={{
              color: tab === t.id ? "var(--accent-cyan-text)" : "var(--text-secondary)",
              borderBottom: tab === t.id ? "2px solid var(--accent-cyan)" : "2px solid transparent",
            }}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className="ml-1.5 text-[11px] cv-text-muted">{t.count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "summary" && (
        <div className="space-y-4">
          <IncidentSummaryCard incident={inc} now={now} />
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide cv-text-muted">
              <MessageSquare className="h-4 w-4" aria-hidden /> Discussion
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

            {/* Newest first: an incident is read from what just happened. */}
            <ol className="space-y-2">
              {[...inc.timeline].reverse().map((t) => (
                <TimelineRow key={t.id} entry={t} />
              ))}
            </ol>
          </div>
        </div>
      )}

      {tab === "routing" && (
        <div className="grid gap-4 lg:grid-cols-2">
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
        </div>

          {/*
           * Always rendered, empty or not. Hiding these when unset left a tab
           * called "Routing & resolution" showing nothing about resolution, and
           * an absent mitigation is a fact worth stating — it is the difference
           * between "nobody has stopped this yet" and "the panel didn't load".
           */}
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide cv-text-muted">
              <ShieldCheck className="h-4 w-4" aria-hidden /> Resolution
            </h3>
            <div className="space-y-3 rounded-xl border cv-border cv-surface p-3 text-sm">
              <div>
                <div className="text-[11px] uppercase cv-text-muted">Mitigation</div>
                {inc.mitigation ? (
                  <div className="cv-text-secondary">{inc.mitigation}</div>
                ) : (
                  <div className="cv-text-muted">
                    Not recorded. It is written when the incident is mitigated.
                  </div>
                )}
              </div>
              <div>
                <div className="text-[11px] uppercase cv-text-muted">Root cause</div>
                {inc.rootCause ? (
                  <div className="cv-text-secondary">{inc.rootCause}</div>
                ) : (
                  <div className="cv-text-muted">
                    Not recorded. It is written when the incident is resolved.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/*
       * Related incidents get their own tab, which is IcM's "Troubleshooting".
       * It is where somebody goes first on a page they have been paged to:
       * "has this happened before, and what fixed it" is answered by the links,
       * and burying them under the routing form made that the last thing found
       * rather than the first.
       */}
      {tab === "links" && <LinkEditor incident={inc} busy={busy} onSend={send} />}

      {tab === "retro" && <PostmortemEditor incident={inc} busy={busy} onSend={send} />}
    </div>
  );
}

/**
 * Related incidents.
 *
 * Both directions are shown, because the relationship is stored on both ends —
 * "caused by INC-1041" on this incident is "causes INC-1042" on that one, and
 * a person reading either needs the same picture.
 */
function LinkEditor({
  incident: inc,
  busy,
  onSend,
}: {
  incident: Incident;
  busy: boolean;
  onSend: (body: Record<string, unknown>) => void;
}) {
  const [otherId, setOtherId] = useState("");
  const [kind, setKind] = useState<LinkKind>("related-to");
  const links = inc.links ?? [];

  return (
    <div className="rounded-xl border cv-border cv-surface p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-bold cv-text-primary">
        <Link2 className="h-4 w-4 text-cyan-400" aria-hidden />
        Related incidents
      </div>

      {links.length === 0 ? (
        <div className="text-[12px] cv-text-muted">Nothing linked yet.</div>
      ) : (
        <ul className="mb-3 space-y-1">
          {links.map((l) => (
            <li key={l.id} className="flex items-center gap-2 text-[13px]">
              <span className="cv-text-muted">{LINK_LABEL[l.kind]}</span>
              <span className="font-semibold cv-text-primary">{l.id}</span>
              <button
                onClick={() => onSend({ action: "unlink", otherId: l.id })}
                disabled={busy}
                className="ml-auto text-[11px] cv-text-muted hover:text-red-300 disabled:opacity-40"
                aria-label={`Unlink ${l.id}`}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as LinkKind)}
          className="h-[38px] rounded-lg border cv-border cv-surface-alt px-2 text-[13px] cv-text-primary"
          aria-label="Relationship"
        >
          {LINK_KINDS.map((k) => (
            <option key={k} value={k}>
              {LINK_LABEL[k]}
            </option>
          ))}
        </select>
        <input
          value={otherId}
          onChange={(e) => setOtherId(e.target.value.toUpperCase())}
          placeholder="INC-0042"
          aria-label="Incident to link"
          className="h-[38px] w-[140px] rounded-lg border cv-border cv-surface-alt px-3 text-[13px] cv-text-primary placeholder:cv-text-muted"
        />
        <button
          onClick={() => {
            onSend({ action: "link", otherId: otherId.trim(), kind });
            setOtherId("");
          }}
          disabled={busy || !otherId.trim()}
          className="h-[38px] rounded-lg bg-cyan-600 px-3 text-[13px] font-semibold text-white disabled:opacity-40"
        >
          Link
        </button>
      </div>
      <p className="mt-2 text-[11px] cv-text-muted">
        Marking one incident a duplicate of another folds it out of the queue and out of the
        counts, so five reports of one outage are not five incidents with five SLA clocks.
      </p>
    </div>
  );
}

/**
 * The write-up.
 *
 * Only offered once the incident is mitigated, matching the rule in icm.ts —
 * an editor that appears and then refuses to save is a worse explanation of
 * the rule than not appearing at all.
 *
 * The publish button stays disabled until there is at least one action, with
 * the reason written next to it rather than surfaced as an error after the
 * click. A postmortem with no actions is either an incident that cannot recur
 * or a document written to close a ticket.
 */
function PostmortemEditor({
  incident: inc,
  busy,
  onSend,
}: {
  incident: Incident;
  busy: boolean;
  onSend: (body: Record<string, unknown>) => void;
}) {
  const pm = inc.postmortem;
  const [summary, setSummary] = useState(pm?.summary ?? "");
  const [cause, setCause] = useState(pm?.cause ?? "");
  const [detection, setDetection] = useState(pm?.detection ?? "");
  const [what, setWhat] = useState("");
  const [owner, setOwner] = useState("");
  const [due, setDue] = useState("");

  const writable = inc.status === "mitigated" || inc.status === "resolved";
  const required = inc.severity <= 2;
  const published = Boolean(pm?.publishedAt);

  if (!writable) {
    return required ? (
      <div className="rounded-xl border cv-border p-3 text-[13px] cv-text-muted">
        A postmortem is required for Sev {inc.severity}. It can be written once the incident is
        mitigated — before then the time is better spent on the incident.
      </div>
    ) : null;
  }

  const field = "w-full rounded-lg border cv-border bg-transparent px-3 py-2 text-sm cv-text-primary";

  return (
    <div className="space-y-3 rounded-xl border cv-border cv-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold cv-text-secondary">
          <FileText className="h-4 w-4" aria-hidden /> Postmortem
        </div>
        {published ? (
          <span
            className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
            style={{ background: "rgba(16,185,129,0.18)", color: "#6ee7b7" }}
          >
            Published
          </span>
        ) : (
          required && (
            <span
              className="rounded-md px-2 py-0.5 text-[10px] font-bold uppercase"
              style={{ background: "rgba(245,158,11,0.18)", color: "#fcd34d" }}
            >
              Required
            </span>
          )
        )}
      </div>

      <label className="block">
        <span className="mb-1 block text-[11px] uppercase cv-text-muted">What happened</span>
        <textarea className={field} rows={2} value={summary} onChange={(e) => setSummary(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase cv-text-muted">Why it happened</span>
        <textarea className={field} rows={2} value={cause} onChange={(e) => setCause(e.target.value)} />
      </label>
      <label className="block">
        <span className="mb-1 block text-[11px] uppercase cv-text-muted">
          What would have caught it sooner
        </span>
        <textarea className={field} rows={2} value={detection} onChange={(e) => setDetection(e.target.value)} />
      </label>

      <button
        type="button"
        disabled={busy || !summary.trim() || !cause.trim()}
        onClick={() => onSend({ action: "postmortem", summary, cause, detection })}
        className="rounded-lg border cv-border px-3 py-1.5 text-xs font-semibold cv-text-secondary disabled:opacity-40"
      >
        {pm ? "Save" : "Start postmortem"}
      </button>

      {pm && (
        <div className="space-y-2 border-t pt-3" style={{ borderColor: "var(--cv-separator)" }}>
          <div className="text-[11px] uppercase cv-text-muted">Actions</div>

          {pm.actionItems.length === 0 && (
            <p className="text-[13px] cv-text-muted">
              None yet. An action with nobody&apos;s name on it is the most common one in the
              world and the least likely to happen, so an owner is required.
            </p>
          )}

          {pm.actionItems.map((a) => (
            <label key={a.id} className="flex items-start gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={a.done}
                disabled={busy}
                onChange={() => onSend({ action: "action-toggle", itemId: a.id })}
                className="mt-1"
              />
              <span className={a.done ? "line-through cv-text-muted" : "cv-text-secondary"}>
                <span className="cv-text-muted">{a.id}</span> {a.what}
                <span className="cv-text-muted">
                  {" "}
                  — {a.owner}
                  {a.due ? `, ${a.due}` : ""}
                </span>
              </span>
            </label>
          ))}

          <div className="flex flex-wrap gap-2">
            <input
              className={`${field} min-w-[180px] flex-1`}
              placeholder="What needs doing"
              value={what}
              onChange={(e) => setWhat(e.target.value)}
            />
            <input
              className={`${field} w-32`}
              placeholder="Owner"
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
            />
            <input
              className={`${field} w-32`}
              placeholder="When"
              value={due}
              onChange={(e) => setDue(e.target.value)}
            />
            <button
              type="button"
              disabled={busy || !what.trim() || !owner.trim()}
              onClick={() => {
                onSend({ action: "action-add", what, owner, due });
                setWhat("");
                setOwner("");
                setDue("");
              }}
              className="rounded-lg border cv-border px-3 text-xs font-semibold cv-text-secondary disabled:opacity-40"
            >
              Add
            </button>
          </div>

          {!published && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={busy || pm.actionItems.length === 0}
                onClick={() => onSend({ action: "postmortem-publish" })}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-300 disabled:opacity-40"
              >
                Publish
              </button>
              {pm.actionItems.length === 0 && (
                <span className="text-[11px] cv-text-muted">
                  Add at least one action first.
                </span>
              )}
            </div>
          )}
        </div>
      )}
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
  postmortem: FileText,
  linked: Link2,
  release: Rocket,
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




