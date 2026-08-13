/**
 * Persistence for incidents.
 *
 * The model in icm.ts is pure — it takes an incident and returns the next one.
 * This is the part that remembers, and the part that hands out IDs.
 *
 * SERVER ONLY.
 */
import { createFileStore } from "./data-file";
import { planFromAlerts } from "./icm-bridge";
import { logger } from "./logger";
import {
  planNotifications,
  renderNotification,
  markSent,
  pruneSent,
  type NotifyState,
} from "./icm-notify";
import type { Alert } from "./anomaly-monitor";
import {
  createIncident,
  queue,
  shouldEscalate,
  escalate,
  postmortemsOutstanding,
  stats,
  link,
  unlink,
  autoAssign,
  onCallFor,
  visibleViews,
  isOpen,
  DEFAULT_VIEWS,
  type Filters,
  type Incident,
  type NewIncident,
  type LinkKind,
  type Rotation,
  type SavedView,
  type OncallShift,
} from "./icm";

interface IcmDB {
  incidents: Incident[];
  /** Monotonic counter behind the human-facing ID. */
  seq: number;
  teams: string[];
  rotations?: Rotation[];
  views?: SavedView[];
}

/*
 * Seeded with the teams this platform actually has, so the routing dropdown is
 * not empty on first use. Editable from the UI; the list is only a convenience.
 */
const DEFAULT_TEAMS = [
  "Platform",
  "Control Plane",
  "Firmware",
  "Mobile",
  "Web",
  "Networking",
  "Data",
  "Support",
];

const store = createFileStore<IcmDB>("admin-icm.json", () => ({
  incidents: [],
  seq: 0,
  teams: [...DEFAULT_TEAMS],
}));

/*
 * The delivery ledger, kept apart from the incidents.
 *
 * Separate because it is written on a different rhythm and for a different
 * reason: an incident is a record of what happened, and this is a record of
 * what we said about it. Mixing them means every send rewrites the incident
 * document, and a mail failure could corrupt the incident it was about.
 */
const notifyStore = createFileStore<NotifyState>("admin-icm-notify.json", () => ({ sent: {} }));

/**
 * Incident IDs are sequential and human-quotable: INC-1043.
 *
 * People read these out on calls and paste them into chat, so a UUID would be
 * actively hostile. The counter lives in the same document as the incidents, so
 * it cannot drift from them.
 */
function nextId(db: IcmDB): string {
  db.seq += 1;
  return `INC-${String(db.seq).padStart(4, "0")}`;
}

export function listIncidents(): Incident[] {
  return store.read().incidents;
}

export function getIncident(id: string): Incident | null {
  return store.read().incidents.find((i) => i.id === id) ?? null;
}

export function listTeams(): string[] {
  return store.read().teams;
}

export function fileIncident(input: NewIncident, now = new Date().toISOString()): Incident {
  return store.mutate((db) => {
    const inc = createIncident(nextId(db), input, now);
    /* Newest first in storage as well as in the queue, so a truncated read
       still shows the incidents anybody is likely to want. */
    db.incidents.unshift(inc);
    if (inc.owningTeam && !db.teams.includes(inc.owningTeam)) db.teams.push(inc.owningTeam);
    return inc;
  });
}

/**
 * Applies a transition from icm.ts and persists the result.
 *
 * The caller supplies the pure function; this only handles finding the record,
 * writing it back, and reporting what happened. Keeping the decision out here
 * is what lets every rule in icm.ts be tested without a filesystem.
 */
export function updateIncident(
  id: string,
  apply: (inc: Incident) => { incident: Incident; error: string }
): { incident: Incident | null; error: string } {
  return store.mutate((db) => {
    const idx = db.incidents.findIndex((i) => i.id === id);
    if (idx < 0) return { incident: null, error: "No such incident." };

    const result = apply(db.incidents[idx]);
    if (result.error) return { incident: db.incidents[idx], error: result.error };

    db.incidents[idx] = result.incident;
    if (result.incident.owningTeam && !db.teams.includes(result.incident.owningTeam)) {
      db.teams.push(result.incident.owningTeam);
    }
    return { incident: result.incident, error: "" };
  });
}

/**
 * Applies any escalations that have come due.
 *
 * Run on read rather than from a scheduler. An escalation policy that needs a
 * cron is one that stops working the moment the cron does, silently — and the
 * symptom is an incident queue that looks calm. Reading the queue is the one
 * thing guaranteed to happen when somebody cares, and `shouldEscalate` is
 * idempotent within its grace period, so doing it here cannot double-escalate.
 *
 * It writes, which is unusual for a read path, but the alternative is a
 * severity that is correct only on screens nobody has opened.
 */
function applyDueEscalations(now: string): Incident[] {
  const all = listIncidents();
  const due = all.filter((inc) => shouldEscalate(inc, now));
  if (due.length === 0) return all;

  for (const inc of due) {
    updateIncident(inc.id, (current) => escalate(current, now));
  }
  return listIncidents();
}

/**
 * Relates two incidents, writing both ends in one transaction.
 *
 * One mutate rather than two updateIncident calls: a link half-written is
 * worse than no link, because the side that has it will claim a relationship
 * the other side denies.
 */
export function linkIncidents(
  fromId: string,
  toId: string,
  kind: LinkKind,
  actor: string,
  now = new Date().toISOString()
): { error: string } {
  return store.mutate((db) => {
    const a = db.incidents.findIndex((i) => i.id === fromId);
    const b = db.incidents.findIndex((i) => i.id === toId);
    if (a < 0 || b < 0) return { error: "No such incident." };

    const r = link(db.incidents[a], db.incidents[b], kind, actor, now);
    if (r.error) return { error: r.error };

    db.incidents[a] = r.from;
    db.incidents[b] = r.to;
    return { error: "" };
  });
}

export function unlinkIncidents(
  fromId: string,
  toId: string,
  actor: string,
  now = new Date().toISOString()
): { error: string } {
  return store.mutate((db) => {
    const a = db.incidents.findIndex((i) => i.id === fromId);
    const b = db.incidents.findIndex((i) => i.id === toId);
    if (a < 0 || b < 0) return { error: "No such incident." };

    const r = unlink(db.incidents[a], db.incidents[b], actor, now);
    if (r.error) return { error: r.error };

    db.incidents[a] = r.from;
    db.incidents[b] = r.to;
    return { error: "" };
  });
}

// ────────────────────────────────────────────────────── on call ──

export function listRotations(): Rotation[] {
  return store.read().rotations ?? [];
}

/** Replaces one team's shifts. Whole-rota writes, because a rota is edited as a whole. */
export function saveRotation(team: string, shifts: OncallShift[]): Rotation {
  return store.mutate((db) => {
    const next: Rotation = { team, shifts: shifts.map((s) => ({ ...s, team })) };
    db.rotations = [...(db.rotations ?? []).filter((r) => r.team !== team), next];
    if (!db.teams.includes(team)) db.teams.push(team);
    return next;
  });
}

/**
 * Routes unowned incidents to whoever is on call.
 *
 * Runs on read for the same reason escalation does: a router that needs a cron
 * stops routing the moment the cron stops, and the symptom is a queue of
 * unassigned incidents that looks like nobody has picked them up yet.
 */
function applyAutoAssign(now: string): void {
  const rotations = listRotations();
  if (rotations.length === 0) return;

  for (const inc of listIncidents()) {
    if (inc.assignedTo || !isOpen(inc)) continue;
    updateIncident(inc.id, (current) => autoAssign(current, rotations, now));
  }
}

// ─────────────────────────────────────────────────── saved views ──

export function listViews(who: string): SavedView[] {
  const saved = store.read().views ?? [];
  return [...DEFAULT_VIEWS, ...visibleViews(saved, who)];
}

export function saveView(
  input: { name: string; filters: Filters; shared: boolean },
  who: string,
  now = new Date().toISOString()
): SavedView {
  return store.mutate((db) => {
    const views = db.views ?? [];
    /*
     * Keyed on name-and-owner: saving over your own view of the same name is an
     * edit, but it must not overwrite somebody else's view that happens to
     * share a name.
     */
    const existing = views.find((v) => v.name === input.name && v.createdBy === who);
    const next: SavedView = {
      id: existing?.id ?? `view-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name: input.name,
      filters: input.filters,
      createdBy: who,
      createdAt: existing?.createdAt ?? now,
      shared: input.shared,
    };
    db.views = [...views.filter((v) => v.id !== next.id), next];
    return next;
  });
}

/** Deletes a saved view. Only its owner may; the defaults cannot be deleted. */
export function deleteView(id: string, who: string): { error: string } {
  return store.mutate((db) => {
    if (DEFAULT_VIEWS.some((v) => v.id === id)) return { error: "Built-in views cannot be deleted." };
    const v = (db.views ?? []).find((x) => x.id === id);
    if (!v) return { error: "No such view." };
    if (v.createdBy !== who) return { error: "That view belongs to somebody else." };
    db.views = (db.views ?? []).filter((x) => x.id !== id);
    return { error: "" };
  });
}

/** The queue plus the headline numbers, which is what the panel loads. */
export function icmView(filters: Filters, now = new Date().toISOString(), who = "") {
  applyAutoAssign(now);
  const all = applyDueEscalations(now);
  const rotations = listRotations();
  return {
    incidents: queue(all, filters, now),
    stats: stats(all, now),
    teams: listTeams(),
    views: listViews(who),
    rotations,
    /* Who to reach for each team, resolved once here rather than per row. */
    onCall: Object.fromEntries(
      listTeams().map((t) => [t, onCallFor(rotations, t, now)?.who ?? ""])
    ),
    /*
     * Resolved incidents that owe a write-up. Surfaced beside the queue because
     * an unwritten postmortem is invisible otherwise — the incident is closed,
     * so nothing shows it, and the action items that would stop a recurrence
     * are the part that never gets written.
     */
    postmortemsDue: postmortemsOutstanding(all).map((i) => ({
      id: i.id,
      title: i.title,
      severity: i.severity,
      resolvedAt: i.resolvedAt,
    })),
    now,
  };
}

/**
 * Files and closes incidents from a set of monitor alerts.
 *
 * The judgement lives in icm-bridge.ts, which is pure; this is only the part
 * that reads and writes. Returns what changed so a caller — a cron sweep, an
 * admin action — can report it rather than guess.
 */
export function syncFromAlerts(
  alerts: Alert[],
  opts: { owningTeam?: string; now?: string; autoResolve?: boolean } = {}
): { filed: Incident[]; resolved: Incident[] } {
  const now = opts.now ?? new Date().toISOString();
  const plan = planFromAlerts(alerts, listIncidents(), { ...opts, now });

  const filed = plan.toFile.map((input) => fileIncident(input, now));

  const resolved: Incident[] = [];
  for (const next of plan.toUpdate) {
    /*
     * Written back by id rather than wholesale, so a change made by a person
     * between the plan being computed and applied is not silently overwritten —
     * the transition is recomputed against whatever is in the store now.
     */
    const r = updateIncident(next.id, (current) =>
      current.acknowledgedAt
        ? { incident: current, error: "Somebody picked it up while this ran." }
        : { incident: next, error: "" }
    );
    if (r.incident && !r.error) resolved.push(r.incident);
  }

  return { filed, resolved };
}

/**
 * Sends what is due, and records that it went.
 *
 * Async and isolated: this is the only part of ICM that talks to the outside
 * world, and a mail server being down must not stop an incident being filed.
 * Delivery is recorded only for messages that were actually accepted, so a
 * failed send is retried on the next sweep rather than silently swallowed —
 * the alternative is an outage nobody hears about because SMTP blipped once.
 */
export async function deliverNotifications(
  now = new Date().toISOString()
): Promise<{ sent: number; failed: number; skipped: number }> {
  const incidents = listIncidents();
  const state = notifyStore.read();
  const fallback = (process.env.ICM_NOTIFY_EMAIL || process.env.ALERTS_NOTIFY_EMAIL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const plan = planNotifications(incidents, state, {
    rotations: listRotations(),
    now,
    fallback,
  });

  let sent = 0;
  let failed = 0;
  let skipped = 0;
  const delivered: typeof plan = [];

  for (const n of plan) {
    if (n.to.length === 0) {
      /*
       * Nobody to tell. Logged rather than dropped: an incident with no
       * recipient means the rota has a hole, and that is a finding in itself.
       */
      logger.warn("icm.notify_no_recipient", { incident: n.incidentId, reason: n.reason });
      skipped += 1;
      continue;
    }

    const body = renderNotification(n);
    try {
      /*
       * Imported here, not at the top of the file.
       *
       * sendMail lives in order-core, which pulls in the whole shop module
       * graph — coupons, inventory, a store with top-level await. Importing it
       * statically makes every consumer of icm-store carry all of that, and it
       * broke two test suites that only wanted to file an incident. Mail is
       * only sent when there is something to send, so paying for the module
       * then is both cheaper and honest about the dependency.
       */
      const { sendMail } = await import("./order-core");
      /*
       * The fourth argument is replyTo, not a plain-text body — sendMail has no
       * text parameter. Passing body.text here would have set Reply-To to the
       * entire message, and both are strings, so nothing would have complained.
       */
      const ok = await sendMail(n.to.join(","), body.subject, body.html, undefined, {
        type: "alert",
        related: n.incidentId,
      });
      if (ok) {
        delivered.push(n);
        sent += 1;
      } else {
        failed += 1;
      }
    } catch (e) {
      logger.error("icm.notify_failed", { incident: n.incidentId }, e);
      failed += 1;
    }
  }

  if (delivered.length) {
    notifyStore.mutate((db) => {
      const next = markSent(db, delivered, now);
      db.sent = next.sent;
    });
  }

  /* Pruned here rather than on a schedule of its own: this is the only code
     that writes the ledger, so it is the only place it can grow. */
  notifyStore.mutate((db) => {
    db.sent = pruneSent(db, incidents).sent;
  });

  if (sent || failed || skipped) {
    logger.info("icm.notified", { sent, failed, skipped });
  }
  return { sent, failed, skipped };
}

export function isDurable(): boolean {
  return store.isDurable();
}
