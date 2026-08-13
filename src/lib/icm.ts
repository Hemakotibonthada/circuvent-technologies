/**
 * Incident management, modelled on Microsoft's IcM.
 *
 * This module is pure: it takes an incident and an action and returns the next
 * incident. Nothing here reads a clock it was not handed, touches disk, or
 * knows about HTTP. That is deliberate — the interesting behaviour is all
 * time-dependent (SLA clocks, breach detection, escalation), and time-dependent
 * logic that fetches its own `now` cannot be tested for the cases that matter:
 * the minute before a breach, the minute after, and the moment an incident is
 * acknowledged exactly on the deadline.
 *
 * The persistence lives in icm-store.ts and the transport in the API route.
 *
 * Vocabulary follows IcM closely, because the people who will use this already
 * know it and inventing new words for Sev2 and TTM helps nobody:
 *
 *   Sev 0..4    urgency, 0 being "the product is down for everyone"
 *   TTA         time to acknowledge — an owner has picked it up
 *   TTM         time to mitigate — customers are no longer impacted
 *   Mitigated   impact stopped; the cause may still be unknown
 *   Resolved    fixed and verified, cause understood
 */

export type Severity = 0 | 1 | 2 | 3 | 4;

/**
 * IcM tracks mitigation and resolution as distinct states, and the distinction
 * is the whole point of the tool: an incident can be mitigated in four minutes
 * by failing traffic away and stay open for a week while the cause is found.
 * Collapsing them into "closed" loses the only number anybody is measured on.
 */
export type IncidentStatus = "active" | "acknowledged" | "mitigated" | "resolved";

export type IncidentSource = "manual" | "monitor" | "customer" | "automation";

export interface TimelineEntry {
  id: string;
  at: string;
  /** Who did it. "system" for anything the platform did on its own. */
  actor: string;
  kind:
    | "created"
    | "acknowledged"
    | "mitigated"
    | "resolved"
    | "reactivated"
    | "severity"
    | "assigned"
    | "comment"
    | "escalated"
    | "postmortem"
    | "linked"
    | "sla";
  /** Human-readable, already past tense: "raised severity to Sev1". */
  text: string;
  /** Free-form detail for comments. */
  body?: string;
}

export interface Incident {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: IncidentStatus;
  source: IncidentSource;

  owningTeam: string;
  assignedTo: string;
  createdBy: string;

  createdAt: string;
  acknowledgedAt: string | null;
  mitigatedAt: string | null;
  resolvedAt: string | null;

  /** When customers started being affected — may predate the incident record. */
  impactStartedAt: string;
  affectedServices: string[];
  customersImpacted: number;

  /** Free-text cause, filled in at resolution. */
  mitigation: string;
  rootCause: string;

  timeline: TimelineEntry[];
  tags: string[];

  /*
   * Snapshotted from the severity at creation, not looked up when displayed.
   *
   * If the SLA table is edited, every historical incident would silently be
   * re-judged against the new targets and last quarter's breach report would
   * change. The commitment made at the time is the one it should be measured
   * against.
   */
  slaAckMins: number;
  /*
   * Null means "no mitigation target", which is a real state — Sev4 has none.
   *
   * Storing that as 0 would be read as a zero-minute budget and every Sev4
   * would be born breached. A number and its absence are different things and
   * have to stay different in the record.
   */
  slaMitigateMins: number | null;

  /*
   * The monitor finding this incident was raised from, if any.
   *
   * Present so a sweep that keeps reporting the same problem does not file a
   * new incident every time it runs — which is how an auto-filing integration
   * turns a queue into a firehose within an hour. Absent for anything a human
   * declared.
   */
  sourceKey?: string;

  /*
   * How many times the ack SLA breach has escalated this incident.
   *
   * Recorded rather than derived, because escalation must happen once per
   * level. Deriving it from the clock would re-escalate on every sweep for as
   * long as the incident stayed unacknowledged — a pager loop, and the fastest
   * way to get an escalation policy switched off entirely.
   */
  escalations?: number;
  /** When it last escalated, so a sweep can leave a grace period. */
  lastEscalatedAt?: string;

  /**
   * The write-up, once there is one.
   *
   * Separate from `rootCause`, which is a line typed at three in the morning to
   * close the incident. A postmortem is written afterwards, when somebody
   * understands it, and it carries the actions that stop a recurrence — the
   * only part of an incident that changes anything.
   */
  postmortem?: Postmortem;

  /**
   * Other incidents this one is related to.
   *
   * Stored on both ends by `link`, because a relationship visible from only
   * one side is one the person holding the other incident cannot see — and
   * they are the one who needs to know their outage is somebody else's
   * symptom.
   */
  links?: IncidentLink[];
}

export type LinkKind = "duplicate-of" | "related-to" | "caused-by" | "causes";

export interface IncidentLink {
  id: string;
  kind: LinkKind;
  at: string;
  by: string;
}

/** Each link's mirror, so both records agree about the direction. */
const INVERSE: Record<LinkKind, LinkKind> = {
  "duplicate-of": "duplicate-of",
  "related-to": "related-to",
  "caused-by": "causes",
  causes: "caused-by",
};

export const LINK_LABEL: Record<LinkKind, string> = {
  "duplicate-of": "Duplicate of",
  "related-to": "Related to",
  "caused-by": "Caused by",
  causes: "Causes",
};

export const LINK_KINDS = Object.keys(LINK_LABEL) as LinkKind[];

export interface ActionItem {
  id: string;
  what: string;
  owner: string;
  /** Free text: "next sprint", a date, whatever the team actually uses. */
  due: string;
  done: boolean;
}

export interface Postmortem {
  summary: string;
  /** Why it happened, as distinct from what stopped the bleeding. */
  cause: string;
  /** What would have caught it sooner. Often the most useful line in the doc. */
  detection: string;
  actionItems: ActionItem[];
  authoredBy: string;
  updatedAt: string;
  /** Unpublished until somebody says it is finished. */
  publishedAt: string | null;
}

/**
 * Severities that owe a postmortem.
 *
 * Sev2 and worse. Requiring one for every Sev4 produces a stack of documents
 * nobody reads, and the requirement stops meaning anything for the incidents
 * where it matters.
 */
export function postmortemRequired(inc: Incident): boolean {
  return inc.severity <= 2;
}

/**
 * SLA targets per severity, in minutes.
 *
 * These are the numbers IcM ships as defaults for a 24/7 service, and they are
 * meant to be aggressive: a Sev0 that nobody has picked up in five minutes is
 * itself an incident. Sev4 has no mitigation clock — it is a "we should fix
 * this eventually" bucket, and putting a deadline on it only teaches people to
 * ignore deadlines.
 */
export const SLA: Record<Severity, { ack: number; mitigate: number | null; label: string; blurb: string }> = {
  0: { ack: 5, mitigate: 60, label: "Sev 0", blurb: "Complete outage — everyone is affected" },
  1: { ack: 15, mitigate: 240, label: "Sev 1", blurb: "Severe degradation or a major feature down" },
  2: { ack: 60, mitigate: 1440, label: "Sev 2", blurb: "Partial impact with a workaround" },
  3: { ack: 480, mitigate: 4320, label: "Sev 3", blurb: "Minor issue, few customers affected" },
  4: { ack: 2880, mitigate: null, label: "Sev 4", blurb: "Cosmetic or tracked for later" },
};

export const SEVERITIES: Severity[] = [0, 1, 2, 3, 4];

export type SlaState = "met" | "on-track" | "at-risk" | "breached" | "n/a";

export interface SlaClock {
  state: SlaState;
  /** Minutes remaining; negative once past the deadline. Null when n/a. */
  minutesRemaining: number | null;
  deadline: string | null;
  /** How long it actually took, once the milestone has happened. */
  actualMins: number | null;
}

const MIN = 60_000;

const minutesBetween = (a: string, b: string) =>
  Math.round((new Date(b).getTime() - new Date(a).getTime()) / MIN);

/**
 * "At risk" starts at 80% of the budget.
 *
 * A binary met/breached tells you only after it is too late to act, which makes
 * it a reporting metric rather than an operational one. The threshold exists so
 * a queue can be sorted by "about to go wrong".
 */
const AT_RISK_FRACTION = 0.8;

function clock(startedAt: string, budgetMins: number | null, doneAt: string | null, now: string): SlaClock {
  if (budgetMins == null) return { state: "n/a", minutesRemaining: null, deadline: null, actualMins: doneAt ? minutesBetween(startedAt, doneAt) : null };

  const deadline = new Date(new Date(startedAt).getTime() + budgetMins * MIN).toISOString();

  if (doneAt) {
    const actual = minutesBetween(startedAt, doneAt);
    /*
     * Judged against when it actually happened, not against now. A breach is a
     * fact about the past; an incident acknowledged late stays late forever,
     * and one acknowledged in time does not become a breach because the report
     * is run a week afterwards.
     */
    return { state: actual > budgetMins ? "breached" : "met", minutesRemaining: budgetMins - actual, deadline, actualMins: actual };
  }

  const elapsed = minutesBetween(startedAt, now);
  const remaining = budgetMins - elapsed;
  if (remaining < 0) return { state: "breached", minutesRemaining: remaining, deadline, actualMins: null };
  if (elapsed >= budgetMins * AT_RISK_FRACTION) return { state: "at-risk", minutesRemaining: remaining, deadline, actualMins: null };
  return { state: "on-track", minutesRemaining: remaining, deadline, actualMins: null };
}

/** The acknowledge clock: from creation until somebody owned it. */
export function ackClock(inc: Incident, now: string): SlaClock {
  return clock(inc.createdAt, inc.slaAckMins, inc.acknowledgedAt, now);
}

/**
 * The mitigate clock: from *impact*, not from creation.
 *
 * An incident reported an hour after it started has already burned an hour of
 * customer pain, and measuring from the moment somebody happened to file the
 * ticket would flatter the number by exactly the amount of time it took to
 * notice — rewarding poor detection.
 */
export function mitigateClock(inc: Incident, now: string): SlaClock {
  const done = inc.mitigatedAt ?? inc.resolvedAt;
  return clock(inc.impactStartedAt || inc.createdAt, inc.slaMitigateMins, done, now);
}

/** The worse of the two clocks, for a single at-a-glance state. */
export function overallSla(inc: Incident, now: string): SlaState {
  const order: SlaState[] = ["breached", "at-risk", "on-track", "met", "n/a"];
  const a = ackClock(inc, now).state;
  const m = mitigateClock(inc, now).state;
  return order[Math.min(order.indexOf(a), order.indexOf(m))];
}

/** True while the incident still needs somebody. */
export function isOpen(inc: Incident): boolean {
  return inc.status === "active" || inc.status === "acknowledged";
}

/**
 * How long customers were impacted, in minutes.
 *
 * Ends at mitigation, not resolution — that is the number that describes the
 * outage. Still running for an unmitigated incident.
 */
export function impactMinutes(inc: Incident, now: string): number {
  const end = inc.mitigatedAt ?? inc.resolvedAt ?? now;
  return Math.max(0, minutesBetween(inc.impactStartedAt || inc.createdAt, end));
}

export function slaSnapshot(inc: Incident, now: string) {
  return {
    ack: ackClock(inc, now),
    mitigate: mitigateClock(inc, now),
    overall: overallSla(inc, now),
    impactMins: impactMinutes(inc, now),
  };
}

/* ------------------------------------------------------------ transitions -- */

export interface ActionResult {
  incident: Incident;
  /** Empty when the action was applied; a reason when it was refused. */
  error: string;
}

const entry = (
  at: string,
  actor: string,
  kind: TimelineEntry["kind"],
  text: string,
  body?: string
): TimelineEntry => ({
  id: `${new Date(at).getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  at,
  actor,
  kind,
  text,
  ...(body ? { body } : {}),
});

export interface NewIncident {
  title: string;
  description?: string;
  severity: Severity;
  owningTeam: string;
  createdBy: string;
  source?: IncidentSource;
  impactStartedAt?: string;
  affectedServices?: string[];
  customersImpacted?: number;
  tags?: string[];
  assignedTo?: string;
  /** See Incident.sourceKey — the monitor finding this was raised from. */
  sourceKey?: string;
}

export function createIncident(id: string, input: NewIncident, now: string): Incident {
  const severity = normaliseSeverity(input.severity);
  const sla = SLA[severity];
  /*
   * An impact time in the future would give a negative elapsed and an SLA that
   * gets healthier as it ages. Clamped to now.
   */
  const impact = input.impactStartedAt && new Date(input.impactStartedAt) <= new Date(now) ? input.impactStartedAt : now;

  return {
    id,
    title: String(input.title || "").trim() || "Untitled incident",
    description: String(input.description || "").trim(),
    severity,
    status: "active",
    source: input.source ?? "manual",
    owningTeam: String(input.owningTeam || "").trim() || "Unassigned",
    assignedTo: String(input.assignedTo || "").trim(),
    createdBy: input.createdBy,
    createdAt: now,
    acknowledgedAt: null,
    mitigatedAt: null,
    resolvedAt: null,
    impactStartedAt: impact,
    affectedServices: (input.affectedServices ?? []).filter(Boolean),
    customersImpacted: Math.max(0, Math.round(Number(input.customersImpacted) || 0)),
    mitigation: "",
    rootCause: "",
    tags: (input.tags ?? []).filter(Boolean),
    slaAckMins: sla.ack,
    slaMitigateMins: sla.mitigate,
    ...(input.sourceKey ? { sourceKey: input.sourceKey } : {}),
    timeline: [entry(now, input.createdBy, "created", `filed ${sla.label}: ${String(input.title || "").trim()}`)],
  };
}

export function normaliseSeverity(v: unknown): Severity {
  /*
   * Explicitly reject the empty cases before coercing.
   *
   * `Number(null)`, `Number("")` and `Number([])` are all 0, and 0 is a valid
   * severity — the most severe one. So a missing or blank severity field would
   * quietly become "Sev0: the product is down for everyone" and page the entire
   * on-call rota. The default for "we do not know" has to be a middling
   * severity, never the loudest one.
   */
  if (v === null || v === undefined || v === "") return 3;
  const n = Math.round(Number(v));
  return (SEVERITIES.includes(n as Severity) ? n : 3) as Severity;
}

export function acknowledge(inc: Incident, actor: string, now: string): ActionResult {
  if (inc.acknowledgedAt) return { incident: inc, error: "Already acknowledged." };
  if (inc.status === "resolved") return { incident: inc, error: "Resolved incidents cannot be acknowledged." };
  return {
    error: "",
    incident: {
      ...inc,
      status: inc.status === "active" ? "acknowledged" : inc.status,
      acknowledgedAt: now,
      /* Acknowledging without an owner is how an incident ends up owned by
         nobody while looking handled. Whoever acknowledges owns it until they
         hand it on. */
      assignedTo: inc.assignedTo || actor,
      timeline: [...inc.timeline, entry(now, actor, "acknowledged", "acknowledged the incident")],
    },
  };
}

export function mitigate(inc: Incident, actor: string, note: string, now: string): ActionResult {
  if (inc.status === "resolved") return { incident: inc, error: "Already resolved." };
  if (inc.mitigatedAt) return { incident: inc, error: "Already mitigated." };
  return {
    error: "",
    incident: {
      ...inc,
      status: "mitigated",
      mitigatedAt: now,
      /* Mitigating implies somebody was on it. Backfilling the acknowledgement
         keeps the TTA honest rather than leaving it eternally unacknowledged —
         and it is recorded as happening now, so it still counts as late if it
         was. */
      acknowledgedAt: inc.acknowledgedAt ?? now,
      assignedTo: inc.assignedTo || actor,
      mitigation: note.trim() || inc.mitigation,
      timeline: [
        ...inc.timeline,
        entry(now, actor, "mitigated", "mitigated customer impact", note.trim() || undefined),
      ],
    },
  };
}

export function resolve(inc: Incident, actor: string, rootCause: string, now: string): ActionResult {
  if (inc.status === "resolved") return { incident: inc, error: "Already resolved." };
  return {
    error: "",
    incident: {
      ...inc,
      status: "resolved",
      resolvedAt: now,
      mitigatedAt: inc.mitigatedAt ?? now,
      acknowledgedAt: inc.acknowledgedAt ?? now,
      rootCause: rootCause.trim() || inc.rootCause,
      timeline: [
        ...inc.timeline,
        entry(now, actor, "resolved", "resolved the incident", rootCause.trim() || undefined),
      ],
    },
  };
}

/**
 * Reopens a resolved incident.
 *
 * The mitigation and resolution stamps are cleared because the impact is
 * happening again, but `impactStartedAt` is left alone: a recurrence is
 * evidence the first fix did not work, and restarting the impact clock would
 * hide exactly that.
 */
export function reactivate(inc: Incident, actor: string, why: string, now: string): ActionResult {
  if (isOpen(inc)) return { incident: inc, error: "Incident is already open." };
  return {
    error: "",
    incident: {
      ...inc,
      status: "acknowledged",
      mitigatedAt: null,
      resolvedAt: null,
      timeline: [...inc.timeline, entry(now, actor, "reactivated", "reactivated the incident", why.trim() || undefined)],
    },
  };
}

/**
 * Changes severity.
 *
 * The SLA snapshot moves with it, and the clocks still run from the original
 * timestamps — so upgrading a Sev3 that has been open for two hours to a Sev1
 * shows an immediate acknowledge breach. That is correct and is the point:
 * it was always this urgent, and the response was always this late.
 */
export function setSeverity(inc: Incident, actor: string, next: Severity, why: string, now: string): ActionResult {
  const sev = normaliseSeverity(next);
  if (sev === inc.severity) return { incident: inc, error: "Severity unchanged." };
  const dir = sev < inc.severity ? "raised" : "lowered";
  const sla = SLA[sev];
  return {
    error: "",
    incident: {
      ...inc,
      severity: sev,
      slaAckMins: sla.ack,
      slaMitigateMins: sla.mitigate,
      timeline: [
        ...inc.timeline,
        entry(now, actor, "severity", `${dir} severity to ${sla.label}`, why.trim() || undefined),
      ],
    },
  };
}

export function assign(inc: Incident, actor: string, to: string, team: string, now: string): ActionResult {
  const who = to.trim();
  const owningTeam = team.trim() || inc.owningTeam;
  if (!who && owningTeam === inc.owningTeam) return { incident: inc, error: "Nothing to change." };
  const text = who
    ? `assigned to ${who}${owningTeam !== inc.owningTeam ? ` (${owningTeam})` : ""}`
    : `routed to ${owningTeam}`;
  return {
    error: "",
    incident: {
      ...inc,
      assignedTo: who || inc.assignedTo,
      owningTeam,
      timeline: [...inc.timeline, entry(now, actor, "assigned", text)],
    },
  };
}

export function comment(inc: Incident, actor: string, body: string, now: string): ActionResult {
  const text = body.trim();
  if (!text) return { incident: inc, error: "A comment needs something in it." };
  return {
    error: "",
    incident: { ...inc, timeline: [...inc.timeline, entry(now, actor, "comment", "commented", text)] },
  };
}

/* ---------------------------------------------------------------- queries -- */

// ───────────────────────────────────────────────────── escalation ──

/** Minutes to wait after an escalation before escalating again. */
export const ESCALATION_GRACE_MINS = 15;

/**
 * Should this incident escalate right now?
 *
 * Four conditions, and each exists because of the way an escalation policy
 * fails in practice:
 *
 *   the ack clock must have breached — that is the trigger
 *   it must be unacknowledged — an acknowledged incident has somebody on it,
 *     and paging their manager because the clock ran out anyway is how people
 *     learn to acknowledge things they are not working on
 *   it must not be mitigated or resolved
 *   it must not have escalated within the grace period — otherwise every sweep
 *     re-escalates for as long as it stays open, which is a pager loop
 *
 * There is also a ceiling: this never reaches Sev0. Sev0 means the product is
 * gone for everybody, and that is a judgement a person makes with context a
 * clock does not have.
 */
export function shouldEscalate(inc: Incident, now: string): boolean {
  if (inc.acknowledgedAt) return false;
  if (inc.status !== "active") return false;
  if (inc.severity <= 1) return false;
  if (ackClock(inc, now).state !== "breached") return false;

  if (inc.lastEscalatedAt) {
    const since = (Date.parse(now) - Date.parse(inc.lastEscalatedAt)) / 60_000;
    if (since < ESCALATION_GRACE_MINS) return false;
  }
  return true;
}

/**
 * Raises severity by one and records why.
 *
 * The severity change is the escalation: it shortens the SLA, moves the
 * incident up the queue, and changes who is looking. Notifying without
 * changing anything would be a louder version of the same silence.
 *
 * `slaAckMins` is deliberately NOT restamped. The commitment was made when the
 * incident was filed, and rewriting it here would clear the breach that caused
 * the escalation — the incident would look as though it had been handled on
 * time, which is the opposite of what happened.
 */
export function escalate(inc: Incident, now: string, reason?: string): ActionResult {
  if (!shouldEscalate(inc, now)) {
    return { incident: inc, error: "This incident does not meet the escalation conditions." };
  }

  const next = (inc.severity - 1) as Severity;
  const why =
    reason ??
    `no acknowledgement within the ${inc.slaAckMins}-minute Sev ${inc.severity} target`;

  return {
    error: "",
    incident: {
      ...inc,
      severity: next,
      escalations: (inc.escalations ?? 0) + 1,
      lastEscalatedAt: now,
      timeline: [
        ...inc.timeline,
        entry(now, "icm-escalation", "escalated", `raised to Sev ${next} — ${why}`),
      ],
    },
  };
}

/** Every incident currently due to escalate. */
export function planEscalations(all: Incident[], now: string): Incident[] {
  return all.filter((inc) => shouldEscalate(inc, now)).map((inc) => escalate(inc, now).incident);
}

// ────────────────────────────────────────────────────── linking ──

/**
 * Relates two incidents, writing the relationship into both.
 *
 * Returns both records because the caller has to persist both. A link stored
 * on one side only is invisible from the other, and the person holding the
 * other incident is exactly who needs to know that their outage is a symptom
 * of somebody else's.
 */
export function link(
  from: Incident,
  to: Incident,
  kind: LinkKind,
  actor: string,
  now: string
): { from: Incident; to: Incident; error: string } {
  if (from.id === to.id) {
    return { from, to, error: "An incident cannot be linked to itself." };
  }
  if ((from.links ?? []).some((l) => l.id === to.id)) {
    return { from, to, error: `Already linked to ${to.id}.` };
  }

  const label = LINK_LABEL[kind].toLowerCase();
  return {
    error: "",
    from: {
      ...from,
      links: [...(from.links ?? []), { id: to.id, kind, at: now, by: actor }],
      timeline: [...from.timeline, entry(now, actor, "linked", `marked ${label} ${to.id} — ${to.title}`)],
    },
    to: {
      ...to,
      links: [...(to.links ?? []), { id: from.id, kind: INVERSE[kind], at: now, by: actor }],
      timeline: [
        ...to.timeline,
        entry(now, actor, "linked", `marked ${LINK_LABEL[INVERSE[kind]].toLowerCase()} ${from.id} — ${from.title}`),
      ],
    },
  };
}

/** Removes a link from both ends. */
export function unlink(
  from: Incident,
  to: Incident,
  actor: string,
  now: string
): { from: Incident; to: Incident; error: string } {
  if (!(from.links ?? []).some((l) => l.id === to.id)) {
    return { from, to, error: `${from.id} is not linked to ${to.id}.` };
  }
  return {
    error: "",
    from: {
      ...from,
      links: (from.links ?? []).filter((l) => l.id !== to.id),
      timeline: [...from.timeline, entry(now, actor, "linked", `removed the link to ${to.id}`)],
    },
    to: {
      ...to,
      links: (to.links ?? []).filter((l) => l.id !== from.id),
      timeline: [...to.timeline, entry(now, actor, "linked", `removed the link to ${from.id}`)],
    },
  };
}

/**
 * The incidents this one duplicates, or that duplicate it.
 *
 * Used to keep a duplicate out of the stats: counting five reports of one
 * outage as five incidents overstates both the volume and, because each
 * carries its own clock, the number of SLA breaches.
 */
export function duplicateIds(inc: Incident): string[] {
  return (inc.links ?? []).filter((l) => l.kind === "duplicate-of").map((l) => l.id);
}

/**
 * Drops incidents that duplicate an older one still in the set.
 *
 * The oldest is kept: it is the one with the real impact start, and the one
 * whose timeline holds the response. Ties are broken on id so the result does
 * not depend on array order.
 */
export function dedupe(all: Incident[]): Incident[] {
  const byId = new Map(all.map((i) => [i.id, i]));
  return all.filter((inc) => {
    const dupes = duplicateIds(inc)
      .map((id) => byId.get(id))
      .filter((x): x is Incident => Boolean(x));
    return !dupes.some((other) => {
      const ta = Date.parse(inc.createdAt);
      const tb = Date.parse(other.createdAt);
      return tb < ta || (tb === ta && other.id < inc.id);
    });
  });
}

// ────────────────────────────────────────────────────── on call ──

export interface OncallShift {
  team: string;
  /** The person, as they appear in `assignedTo`. */
  who: string;
  /** ISO. Half-open: [startsAt, endsAt), so back-to-back shifts do not overlap. */
  startsAt: string;
  endsAt: string;
}

export interface Rotation {
  team: string;
  shifts: OncallShift[];
}

/**
 * Who is on call for a team right now.
 *
 * Returns null rather than a fallback when the rota has a hole. A rota that
 * quietly names somebody who is not on call is worse than one that admits the
 * gap: the page goes to a person who is not expecting it, and everyone else
 * assumes it was handled.
 */
export function onCallFor(rotations: Rotation[], team: string, now: string): OncallShift | null {
  const t = Date.parse(now);
  const rota = rotations.find((r) => r.team === team);
  if (!rota) return null;

  const live = rota.shifts.filter((s) => {
    const from = Date.parse(s.startsAt);
    const to = Date.parse(s.endsAt);
    return Number.isFinite(from) && Number.isFinite(to) && t >= from && t < to;
  });
  if (live.length === 0) return null;

  // Overlaps are a rota bug, not a reason to fail: the later shift wins,
  // because it is the one somebody most recently intended to be in force.
  return live.sort((a, b) => Date.parse(b.startsAt) - Date.parse(a.startsAt))[0];
}

/** Gaps in a team's cover over a window, so a rota can be checked before it matters. */
export function rotationGaps(
  rota: Rotation,
  fromISO: string,
  toISO: string
): { from: string; to: string }[] {
  const from = Date.parse(fromISO);
  const to = Date.parse(toISO);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) return [];

  const spans = rota.shifts
    .map((s) => ({ from: Date.parse(s.startsAt), to: Date.parse(s.endsAt) }))
    .filter((s) => Number.isFinite(s.from) && Number.isFinite(s.to) && s.to > from && s.from < to)
    .sort((a, b) => a.from - b.from);

  const gaps: { from: string; to: string }[] = [];
  let cursor = from;
  for (const s of spans) {
    if (s.from > cursor) gaps.push({ from: new Date(cursor).toISOString(), to: new Date(s.from).toISOString() });
    cursor = Math.max(cursor, s.to);
    if (cursor >= to) break;
  }
  if (cursor < to) gaps.push({ from: new Date(cursor).toISOString(), to: new Date(to).toISOString() });
  return gaps;
}

/**
 * Assigns an unassigned incident to whoever is on call for its team.
 *
 * Only touches incidents nobody owns. Reassigning an incident somebody is
 * already working on because a shift boundary passed is how work gets dropped
 * at exactly the moment it is being handed over.
 */
export function autoAssign(inc: Incident, rotations: Rotation[], now: string): ActionResult {
  if (inc.assignedTo) return { incident: inc, error: "Already assigned." };
  if (!isOpen(inc)) return { incident: inc, error: "Not open." };

  const shift = onCallFor(rotations, inc.owningTeam, now);
  if (!shift) return { incident: inc, error: `Nobody is on call for ${inc.owningTeam}.` };

  return {
    error: "",
    incident: {
      ...inc,
      assignedTo: shift.who,
      timeline: [
        ...inc.timeline,
        entry(now, "icm-oncall", "assigned", `assigned to ${shift.who}, on call for ${inc.owningTeam}`),
      ],
    },
  };
}

// ──────────────────────────────────────────────────── postmortem ──

/**
 * Starts or updates the write-up.
 *
 * Allowed only once the incident is mitigated. Writing a postmortem while the
 * site is still down is time spent on the document instead of the outage, and
 * the cause recorded then is usually the first guess.
 */
export function savePostmortem(
  inc: Incident,
  actor: string,
  draft: Pick<Postmortem, "summary" | "cause" | "detection">,
  now: string
): ActionResult {
  if (inc.status !== "mitigated" && inc.status !== "resolved") {
    return { incident: inc, error: "Write the postmortem once the incident is mitigated." };
  }

  const existing = inc.postmortem;
  return {
    error: "",
    incident: {
      ...inc,
      postmortem: {
        summary: draft.summary,
        cause: draft.cause,
        detection: draft.detection,
        actionItems: existing?.actionItems ?? [],
        authoredBy: existing?.authoredBy || actor,
        updatedAt: now,
        // Editing a published postmortem does not silently unpublish it.
        publishedAt: existing?.publishedAt ?? null,
      },
      timeline: [
        ...inc.timeline,
        entry(now, actor, "postmortem", existing ? "updated the postmortem" : "started a postmortem"),
      ],
    },
  };
}

export function addActionItem(
  inc: Incident,
  actor: string,
  item: Pick<ActionItem, "what" | "owner" | "due">,
  now: string
): ActionResult {
  if (!inc.postmortem) {
    return { incident: inc, error: "Start the postmortem before adding actions." };
  }
  if (!item.what.trim()) return { incident: inc, error: "An action needs a description." };
  /*
   * An owner is required. "We should improve monitoring" with nobody's name on
   * it is the single most common action item in the world and the least likely
   * to happen.
   */
  if (!item.owner.trim()) return { incident: inc, error: "An action needs an owner." };

  const next: ActionItem = {
    id: `AI-${(inc.postmortem.actionItems.length + 1).toString().padStart(2, "0")}`,
    what: item.what.trim(),
    owner: item.owner.trim(),
    due: item.due.trim(),
    done: false,
  };

  return {
    error: "",
    incident: {
      ...inc,
      postmortem: {
        ...inc.postmortem,
        actionItems: [...inc.postmortem.actionItems, next],
        updatedAt: now,
      },
      timeline: [...inc.timeline, entry(now, actor, "postmortem", `added action ${next.id}: ${next.what}`)],
    },
  };
}

export function toggleActionItem(inc: Incident, actor: string, id: string, now: string): ActionResult {
  if (!inc.postmortem) return { incident: inc, error: "No postmortem." };
  const item = inc.postmortem.actionItems.find((a) => a.id === id);
  if (!item) return { incident: inc, error: "No such action." };

  return {
    error: "",
    incident: {
      ...inc,
      postmortem: {
        ...inc.postmortem,
        actionItems: inc.postmortem.actionItems.map((a) =>
          a.id === id ? { ...a, done: !a.done } : a
        ),
        updatedAt: now,
      },
      timeline: [
        ...inc.timeline,
        entry(now, actor, "postmortem", `${item.done ? "reopened" : "completed"} ${id}`),
      ],
    },
  };
}

/**
 * Publishes the write-up.
 *
 * Refused without at least one action item. A postmortem that produced no
 * actions is either an incident that could not recur — vanishingly rare — or a
 * document written to close a ticket, and publishing those is how the whole
 * practice comes to be seen as paperwork.
 */
export function publishPostmortem(inc: Incident, actor: string, now: string): ActionResult {
  if (!inc.postmortem) return { incident: inc, error: "No postmortem to publish." };
  if (inc.postmortem.publishedAt) return { incident: inc, error: "Already published." };
  if (!inc.postmortem.summary.trim() || !inc.postmortem.cause.trim()) {
    return { incident: inc, error: "A postmortem needs a summary and a cause." };
  }
  if (inc.postmortem.actionItems.length === 0) {
    return { incident: inc, error: "A postmortem with no actions is not finished." };
  }

  return {
    error: "",
    incident: {
      ...inc,
      postmortem: { ...inc.postmortem, publishedAt: now, updatedAt: now },
      timeline: [...inc.timeline, entry(now, actor, "postmortem", "published the postmortem")],
    },
  };
}

/** Resolved incidents that owe a postmortem and do not have a published one. */
export function postmortemsOutstanding(all: Incident[]): Incident[] {
  return all.filter(
    (inc) =>
      inc.status === "resolved" && postmortemRequired(inc) && !inc.postmortem?.publishedAt
  );
}

export interface OpenAction extends ActionItem {
  incidentId: string;
  incidentTitle: string;
  severity: Severity;
  /** When the incident it came from was resolved. */
  since: string | null;
}

/**
 * Every unfinished action item, across every incident.
 *
 * These are the only part of an incident that changes anything, and they are
 * also the easiest thing in the system to lose: they live inside a postmortem,
 * inside an incident that is closed, so nothing shows them. The queue is a
 * list of things on fire; this is the list of reasons the next fire will be
 * the same one.
 *
 * Ordered by the severity of the incident that produced them. An action from
 * a Sev1 is not the same commitment as one from a Sev4, and a flat list sorted
 * by date buries the important ones under whatever was filed most recently.
 */
export function openActionItems(all: Incident[]): OpenAction[] {
  const out: OpenAction[] = [];
  for (const inc of all) {
    for (const item of inc.postmortem?.actionItems ?? []) {
      if (item.done) continue;
      out.push({
        ...item,
        incidentId: inc.id,
        incidentTitle: inc.title,
        severity: inc.severity,
        since: inc.resolvedAt,
      });
    }
  }
  return out.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity - b.severity;
    return (a.since ?? "").localeCompare(b.since ?? "");
  });
}

/**
 * The same list, grouped by owner — which is how it gets chased.
 *
 * There is no "unassigned" bucket because there cannot be an unassigned
 * action: addActionItem refuses one without an owner, on the grounds that "we
 * should improve monitoring" with nobody's name on it is the most common
 * action item in the world and the least likely to happen.
 */
export function actionsByOwner(all: Incident[]): { owner: string; items: OpenAction[] }[] {
  const by = new Map<string, OpenAction[]>();
  for (const a of openActionItems(all)) {
    const bag = by.get(a.owner);
    if (bag) bag.push(a);
    else by.set(a.owner, [a]);
  }
  return [...by.entries()]
    .map(([owner, items]) => ({ owner, items }))
    /* Most-owed first: the person with six outstanding actions is the
       conversation to have, not the one with one. */
    .sort((a, b) => b.items.length - a.items.length || a.owner.localeCompare(b.owner));
}

export interface Filters {
  status?: "open" | "all" | IncidentStatus;
  severity?: Severity | null;
  team?: string;
  assignedTo?: string;
  search?: string;
  slaState?: SlaState | null;
  /** Fold duplicates into the incident they duplicate. */
  hideDuplicates?: boolean;
}

export interface SavedView {
  id: string;
  name: string;
  filters: Filters;
  createdBy: string;
  createdAt: string;
  /** Shared views are everybody's; private ones belong to `createdBy`. */
  shared: boolean;
}

/**
 * The views a given person should see.
 *
 * Shared first, then their own, each alphabetical — so the list does not
 * reorder itself as views are added, which is how muscle memory for a queue
 * gets broken.
 */
export function visibleViews(all: SavedView[], who: string): SavedView[] {
  return all
    .filter((v) => v.shared || v.createdBy === who)
    .sort((a, b) => {
      if (a.shared !== b.shared) return a.shared ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

/** The built-in views. Present so a fresh install has a usable queue. */
export const DEFAULT_VIEWS: SavedView[] = [
  { id: "all-open", name: "All open", filters: { status: "open", hideDuplicates: true }, createdBy: "system", createdAt: "", shared: true },
  { id: "breaching", name: "Breaching SLA", filters: { status: "open", slaState: "breached" }, createdBy: "system", createdAt: "", shared: true },
  { id: "unacked", name: "Awaiting acknowledgement", filters: { status: "active" }, createdBy: "system", createdAt: "", shared: true },
];

/**
 * The queue.
 *
 * Sorted by severity, then by how close the SLA is to breaching, then newest.
 * Not by creation date: a Sev0 filed a minute ago matters more than a Sev3
 * filed an hour ago, and the queue is a work list rather than a log.
 */
export function queue(all: Incident[], f: Filters, now: string): Incident[] {
  const q = (f.search ?? "").trim().toLowerCase();
  /*
   * Deduped before filtering, not after: whether an incident is a duplicate is
   * decided against the whole set. Deduping a filtered list would keep a
   * duplicate whenever the original had been filtered out of view.
   */
  const source = f.hideDuplicates ? dedupe(all) : all;

  const filtered = source.filter((inc) => {
    if (f.status === "open" && !isOpen(inc)) return false;
    if (f.status && f.status !== "open" && f.status !== "all" && inc.status !== f.status) return false;
    if (f.severity != null && inc.severity !== f.severity) return false;
    if (f.team && inc.owningTeam !== f.team) return false;
    if (f.assignedTo && inc.assignedTo !== f.assignedTo) return false;
    if (f.slaState && overallSla(inc, now) !== f.slaState) return false;
    if (q) {
      const hay = `${inc.id} ${inc.title} ${inc.description} ${inc.owningTeam} ${inc.assignedTo} ${inc.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  const rank: Record<SlaState, number> = { breached: 0, "at-risk": 1, "on-track": 2, met: 3, "n/a": 4 };

  return filtered.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity - b.severity;
    const ra = rank[overallSla(a, now)];
    const rb = rank[overallSla(b, now)];
    if (ra !== rb) return ra - rb;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export interface IcmStats {
  open: number;
  active: number;
  acknowledged: number;
  mitigated: number;
  resolved: number;
  breached: number;
  atRisk: number;
  bySeverity: Record<Severity, number>;
  /** Medians, in minutes, over incidents that reached the milestone. */
  medianTta: number | null;
  medianTtm: number | null;
  slaAttainment: number;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
};

export function stats(all: Incident[], now: string): IcmStats {
  const bySeverity = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 } as Record<Severity, number>;
  let active = 0, acknowledged = 0, mitigated = 0, resolved = 0, breached = 0, atRisk = 0;
  const ttas: number[] = [];
  const ttms: number[] = [];
  /*
   * Attainment counts only incidents whose clocks have stopped. Including open
   * ones would let a quiet afternoon improve the score simply by having
   * incidents that have not had time to breach yet.
   */
  let judged = 0;
  let met = 0;

  for (const inc of all) {
    bySeverity[inc.severity]++;
    if (inc.status === "active") active++;
    else if (inc.status === "acknowledged") acknowledged++;
    else if (inc.status === "mitigated") mitigated++;
    else resolved++;

    const s = overallSla(inc, now);
    if (s === "breached") breached++;
    else if (s === "at-risk") atRisk++;

    const a = ackClock(inc, now);
    if (a.actualMins != null) ttas.push(a.actualMins);
    const m = mitigateClock(inc, now);
    if (m.actualMins != null) ttms.push(m.actualMins);

    if (!isOpen(inc)) {
      judged++;
      if (a.state !== "breached" && m.state !== "breached") met++;
    }
  }

  return {
    open: active + acknowledged,
    active,
    acknowledged,
    mitigated,
    resolved,
    breached,
    atRisk,
    bySeverity,
    medianTta: median(ttas),
    medianTtm: median(ttms),
    slaAttainment: judged ? Math.round((met / judged) * 100) : 100,
  };
}

/** "4m", "2h 10m", "3d 4h" — compact enough for a table cell. */
export function formatMins(mins: number | null): string {
  if (mins == null) return "—";
  const n = Math.abs(Math.round(mins));
  if (n < 60) return `${n}m`;
  if (n < 1440) {
    const h = Math.floor(n / 60);
    const m = n % 60;
    return m ? `${h}h ${m}m` : `${h}h`;
  }
  const d = Math.floor(n / 1440);
  const h = Math.floor((n % 1440) / 60);
  return h ? `${d}d ${h}h` : `${d}d`;
}


