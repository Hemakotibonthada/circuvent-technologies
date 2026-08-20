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
import { deployBefore, describeCorrelation, deploymentsIn } from "./deployments";
import {
  planNotifications,
  renderNotification,
  markSent,
  pruneSent,
  RENOTIFY_UNACKED_MINS,
  POSTMORTEM_GRACE_MINS,
  POSTMORTEM_REMIND_MINS,
  POSTMORTEM_MAX_REMINDERS,
  type NotifyState,
  type TeamContacts,
} from "./icm-notify";
import type { Alert } from "./anomaly-monitor";
import {
  createIncident,
  queue,
  shouldEscalate,
  escalate,
  postmortemsOutstanding,
  openActionItems,
  actionsByOwner,
  stats,
  link,
  unlink,
  autoAssign,
  onCallFor,
  visibleViews,
  isOpen,
  slaSnapshot,
  postmortemRequired,
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
  /** Where each team's mail goes. See `TeamContacts`. */
  teamContacts?: TeamContacts;
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

const store = createFileStore<IcmDB>(
  "admin-icm.json",
  () => ({
    incidents: [],
    seq: 0,
    teams: [...DEFAULT_TEAMS],
  }),
  /*
   * Kept in the database, not just in a file.
   *
   * An incident that vanishes is worse than no incident tracker: the file this
   * store writes cannot be written on the serverless host at all, so every
   * incident filed lived in one lambda instance's memory until it was
   * recycled. The counter behind INC-0032 survived in whatever instance held
   * it while the incidents themselves did not, which is how a queue ends up
   * reading empty after a month of use.
   */
  { durable: true }
);

/*
 * The delivery ledger, kept apart from the incidents.
 *
 * Separate because it is written on a different rhythm and for a different
 * reason: an incident is a record of what happened, and this is a record of
 * what we said about it. Mixing them means every send rewrites the incident
 * document, and a mail failure could corrupt the incident it was about.
 */
const notifyStore = createFileStore<NotifyState>(
  "admin-icm-notify.json",
  () => ({ sent: {} }),
  /*
   * Durable for a different reason than the incidents: this ledger is what
   * stops the same page being sent twice. An instance that starts with an
   * empty ledger believes nothing has been sent and re-pages everybody about
   * incidents they already acknowledged.
   */
  { durable: true }
);

/**
 * Loads the authoritative copy before a request reads or writes.
 *
 * Mirrors `revalidate()` in the shop store: the accessors below stay
 * synchronous, and every route awaits this first. Skipping it does not corrupt
 * anything — `createFileStore` refuses to save a store it has not hydrated —
 * but it does serve one instance's stale copy.
 */
export async function revalidateIcm(): Promise<void> {
  await Promise.all([store.hydrate(), notifyStore.hydrate()]);
}

/**
 * Waits for pending writes to land, before the response is sent.
 *
 * A serverless function that returns while a write is still in flight is
 * frozen mid-write and the change is lost — the same class of failure this
 * whole change exists to remove, so it is awaited rather than trusted.
 */
export async function flushIcm(): Promise<void> {
  await Promise.all([store.flush(), notifyStore.flush()]);
}

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

/**
 * Where each team's mail goes.
 *
 * The environment variable seeds it so a deployment can be routed without
 * anybody opening the console, and the stored map wins where both name a team
 * — otherwise editing an address in the UI would appear to work and then be
 * overridden on every read by a value nobody can see.
 *
 * Format: `Platform=a@x.com,b@x.com;Firmware=fw@x.com`.
 */
export function envTeamContacts(raw = process.env.ICM_TEAM_EMAILS || ""): TeamContacts {
  const out: TeamContacts = {};
  for (const clause of raw.split(";")) {
    const at = clause.indexOf("=");
    if (at < 0) continue;
    const team = clause.slice(0, at).trim();
    const addresses = clause
      .slice(at + 1)
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (team && addresses.length) out[team] = addresses;
  }
  return out;
}

export function listTeamContacts(): TeamContacts {
  return { ...envTeamContacts(), ...(store.read().teamContacts ?? {}) };
}

/**
 * Sets, or with an empty list clears, one team's distribution list.
 *
 * Clearing removes the entry rather than storing an empty array, so the
 * environment default becomes visible again — a team whose stored list is
 * emptied should fall back to however the deployment was configured, not to
 * nobody.
 */
export function setTeamContact(team: string, addresses: string[]): TeamContacts {
  const name = team.trim();
  if (!name) return listTeamContacts();
  return store.mutate((db) => {
    const next = { ...(db.teamContacts ?? {}) };
    const clean = addresses.map((a) => a.trim()).filter(Boolean);
    if (clean.length) next[name] = clean;
    else delete next[name];
    db.teamContacts = next;
    /* A team can be given an address before it exists in the routing list;
       adding it here keeps the two from disagreeing. */
    if (clean.length && !db.teams.includes(name)) db.teams = [...db.teams, name];
    return { ...envTeamContacts(), ...next };
  });
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
 * Notes on the incident whether a deployment shortly preceded it.
 *
 * Attached at filing time, against the moment impact started rather than the
 * moment the incident was created — a monitor can take a while to notice, and
 * correlating against the noticing rather than the breaking points at the
 * wrong change.
 *
 * Written as a timeline entry rather than a field, because it is an
 * observation somebody made at a moment, not a property of the incident. If it
 * turns out to be irrelevant it should read as a note that did not pan out,
 * not as metadata that was wrong. Its own kind rather than a comment, so the
 * text is the observation itself: `comment` puts the message in `body` and
 * leaves `text` as the word "commented", which is invisible in any summary.
 */
export function annotateWithDeploy(inc: Incident, now = new Date().toISOString()): Incident {
  const correlation = deployBefore(inc.impactStartedAt || inc.createdAt);
  if (!correlation) return inc;

  return {
    ...inc,
    timeline: [
      ...inc.timeline,
      {
        id: `rel-${Date.parse(now).toString(36)}-${correlation.deployment.shortSha}`,
        at: now,
        actor: "icm-release",
        kind: "release" as const,
        text: `Possibly related: ${describeCorrelation(correlation)}.`,
      },
    ],
  };
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
    stats: stats(all, now, { from: filters.from, to: filters.to }),
    teams: listTeams(),
    /* So the console can show which teams actually reach somebody. An incident
       routed to a team with no address is a page that goes nowhere. */
    teamContacts: listTeamContacts(),
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
    /*
     * The actions that would stop a recurrence. Surfaced beside the queue for
     * the same reason postmortemsDue is: they live inside a closed incident,
     * so nothing else in the product would ever show them again.
     */
    actionsOutstanding: openActionItems(all),
    actionsByOwner: actionsByOwner(all),
    /* Release markers for the queue header — "what shipped today" is the
       question directly after "what is broken". */
    deployments: deploymentsIn(new Date(Date.parse(now) - 7 * 86_400_000).toISOString(), now),
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

  const filed = plan.toFile.map((input) => {
    const inc = fileIncident(input, now);
    /* Annotated immediately, so the note is on the incident before anybody is
       paged about it — the correlation is most useful in the first minute. */
    const annotated = annotateWithDeploy(inc, now);
    if (annotated !== inc) {
      updateIncident(inc.id, () => ({ incident: annotated, error: "" }));
      return annotated;
    }
    return inc;
  });

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
    contacts: listTeamContacts(),
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

/** What the postmortem chaser needs to decide whether to keep asking. */
export interface PostmortemWatch {
  exists: boolean;
  /** False for severities that owe no write-up, or once it is published. */
  outstanding: boolean;
  /** True when a draft exists but has not been published. */
  drafted: boolean;
  /** True when the incident was reopened — the chase stops and the watch resumes. */
  reopened: boolean;
  /** When to ask again, or null when there is nothing left to ask for. */
  nextCheckAt: string | null;
  notified: { sent: number; failed: number; skipped: number };
}

/**
 * Chases the write-up a resolved incident owes.
 *
 * The queue view has always listed these, which means the reminder only ever
 * reached somebody who went looking for it — and a resolved incident is closed,
 * so nothing draws anybody back to it. This is the same question asked on a
 * clock instead.
 */
export async function sweepPostmortem(
  id: string,
  now = new Date().toISOString()
): Promise<PostmortemWatch> {
  await revalidateIcm();

  const inc = getIncident(id);
  const none = { sent: 0, failed: 0, skipped: 0 };
  if (!inc) {
    return { exists: false, outstanding: false, drafted: false, reopened: false, nextCheckAt: null, notified: none };
  }

  /* Reopened: the incident is live again, so it owes an acknowledgement before
     it owes a document. `watchIncident` is the workflow for that. */
  if (inc.status !== "resolved") {
    return { exists: true, outstanding: false, drafted: !!inc.postmortem, reopened: true, nextCheckAt: null, notified: none };
  }

  const outstanding = postmortemRequired(inc) && !inc.postmortem?.publishedAt;
  if (!outstanding || !inc.resolvedAt) {
    return { exists: true, outstanding: false, drafted: !!inc.postmortem, reopened: false, nextCheckAt: null, notified: none };
  }

  const notified = await deliverNotifications(now);
  await flushIcm();

  /*
   * The next reminder, on the same schedule the planner buckets by — so the
   * workflow wakes when a reminder is actually due rather than a little before
   * it, which would send nothing and go back to sleep.
   */
  const ageMins = (Date.parse(now) - Date.parse(inc.resolvedAt)) / 60_000;
  const elapsedBuckets = Math.floor(Math.max(0, ageMins - POSTMORTEM_GRACE_MINS) / POSTMORTEM_REMIND_MINS);
  const nextBucket = ageMins < POSTMORTEM_GRACE_MINS ? 0 : elapsedBuckets + 1;

  const nextCheckAt =
    nextBucket >= POSTMORTEM_MAX_REMINDERS
      ? null
      : new Date(
          Date.parse(inc.resolvedAt) +
            (POSTMORTEM_GRACE_MINS + nextBucket * POSTMORTEM_REMIND_MINS) * 60_000
        ).toISOString();

  return {
    exists: true,
    outstanding: true,
    drafted: !!inc.postmortem,
    reopened: false,
    nextCheckAt,
    notified,
  };
}

/* ------------------------------------------------------------------ *
 * The watcher                                                         *
 * ------------------------------------------------------------------ */

/** What the escalation workflow needs to decide when to wake up next. */
export interface IncidentWatch {
  exists: boolean;
  status: Incident["status"] | null;
  severity: number | null;
  acknowledged: boolean;
  /** True when this sweep raised the severity. */
  escalated: boolean;
  /** When to look again, or null when there is nothing left to wait for. */
  nextCheckAt: string | null;
  notified: { sent: number; failed: number; skipped: number };
}

/**
 * Brings one incident up to date and tells the caller when to return.
 *
 * Escalation used to happen only inside `icmView` — the function that builds
 * the panel — so an incident was escalated when somebody **opened the queue**
 * and not before. An incident filed at 02:00 that nobody looked at until 09:00
 * was, as far as its own severity and its notifications were concerned, seven
 * hours old and untouched: the clock had run down, and nothing had acted on
 * it. The daily sweep was the only other trigger, and daily is the finest
 * schedule the deployment plan allows.
 *
 * This is the same logic, addressable for a single incident, so a durable
 * workflow can sleep until each deadline and act on it exactly then.
 */
export async function sweepIncident(
  id: string,
  now = new Date().toISOString()
): Promise<IncidentWatch> {
  /* The workflow's steps each run in their own invocation, so this loads the
     authoritative copy rather than trusting whatever this instance remembers. */
  await revalidateIcm();

  const before = getIncident(id);
  if (!before) {
    return {
      exists: false,
      status: null,
      severity: null,
      acknowledged: false,
      escalated: false,
      nextCheckAt: null,
      notified: { sent: 0, failed: 0, skipped: 0 },
    };
  }

  let escalated = false;
  if (shouldEscalate(before, now)) {
    const r = updateIncident(id, (current) => escalate(current, now));
    escalated = !r.error && !!r.incident;
  }

  const notified = await deliverNotifications(now);
  await flushIcm();

  const inc = getIncident(id) ?? before;
  const sla = slaSnapshot(inc, now);

  /*
   * When to come back.
   *
   * While nobody has acknowledged, the next interesting moment is the
   * acknowledgement deadline; once that has passed the incident is nagged on a
   * fixed interval. After acknowledgement a person owns it, so the only clock
   * still worth waking for is the mitigation deadline — and after that the
   * workflow stops rather than nagging somebody who is already working on it.
   *
   * A null `minutesRemaining` means the severity carries no budget for that
   * milestone at all, which is not the same as a deadline that has passed:
   * there is nothing to wake up for, so the watch ends.
   */
  let nextInMins: number | null = null;
  if (isOpen(inc)) {
    if (!inc.acknowledgedAt) {
      const remaining = sla.ack.minutesRemaining;
      if (remaining !== null) nextInMins = remaining > 0 ? remaining : RENOTIFY_UNACKED_MINS;
    } else if (!inc.mitigatedAt) {
      const remaining = sla.mitigate.minutesRemaining;
      if (remaining !== null && remaining > 0) nextInMins = remaining;
    }
  }

  return {
    exists: true,
    status: inc.status,
    severity: inc.severity,
    acknowledged: !!inc.acknowledgedAt,
    escalated,
    /* At least a minute, so a breached clock cannot spin the workflow. */
    nextCheckAt:
      nextInMins === null
        ? null
        : new Date(Date.parse(now) + Math.max(1, Math.ceil(nextInMins)) * 60_000).toISOString(),
    notified,
  };
}
