/**
 * Who gets told about an incident, and when.
 *
 * Separated from the sending because the decision is the hard part and the
 * transport is not. Everything here is pure: given the incidents and what has
 * already been sent, it says what should go out. That makes the rules —
 * which are the parts that get an on-call engineer out of bed, or fail to —
 * testable without a mail server.
 *
 * The rule this is really built around: an incident management system that
 * files, escalates and assigns but never tells anybody is a filing cabinet.
 * That defect appears repeatedly in this codebase and twice in my own work on
 * it, so this module's job is to be the thing that is actually called.
 */
import { SLA, isOpen, onCallFor, postmortemRequired, type Incident, type Rotation } from "./icm";

export type NotifyReason =
  | "filed"
  | "escalated"
  | "assigned"
  | "unacknowledged"
  | "resolved"
  | "update"
  | "postmortem";

/**
 * Where a team's mail goes.
 *
 * `{ Platform: ["platform-oncall@circuvent.com"] }`. Incidents are routed to a
 * team by name, and until this existed that name reached nobody: recipients
 * were the assignee, whoever the rota named, and one global address that every
 * team's incidents landed in together. An incident filed against Firmware at
 * 2am notified the same inbox as one against Web, and if nobody was assigned
 * and the rota had a hole, it notified only that inbox — which is the
 * situation this is here to end.
 */
export type TeamContacts = Record<string, string[]>;

export interface Notification {
  /** Stable per incident-and-reason, so the same event is not sent twice. */
  key: string;
  incidentId: string;
  reason: NotifyReason;
  /** Addresses. May be empty — the caller decides whether to fall back. */
  to: string[];
  subject: string;
  /** Plain sentences; the transport wraps them. */
  lines: string[];
  severity: number;
}

/**
 * How long an unacknowledged incident waits before it nags again.
 *
 * Distinct from the escalation grace period: escalation changes severity and
 * happens once per level, while this is a reminder. Set long enough that a
 * person who has seen it and is working the problem is not interrupted, short
 * enough that one nobody saw is not silent all night.
 */
export const RENOTIFY_UNACKED_MINS = 30;

/**
 * How far back an update is still worth mailing.
 *
 * Every action on an incident appends a timeline entry, and each unsent entry
 * becomes an email. That is the behaviour asked for — the team should hear
 * about every update — but it needs a floor, for two reasons. The first time
 * this runs against incidents that already have months of history, every one
 * of those entries is unsent; without a window the first sweep would mail the
 * entire archive. And if the mail server is down for a day, the backlog that
 * accumulates is stale by the time it can be delivered. An update nobody can
 * act on any more is noise, and noise is how a paging system gets ignored.
 */
export const UPDATE_MAX_AGE_MINS = 240;

/**
 * How long a team gets after an outage before anybody asks for the write-up.
 *
 * A day. Chasing the postmortem an hour after the incident closed reaches
 * people who have just finished a long night, and it is the surest way to make
 * the reminder something they filter.
 */
export const POSTMORTEM_GRACE_MINS = 24 * 60;

/** How often the reminder repeats after that. Two days. */
export const POSTMORTEM_REMIND_MINS = 48 * 60;

/**
 * How many reminders are sent before the system stops asking.
 *
 * An unwritten postmortem two weeks after the outage is not waiting for
 * another email — it needs somebody to decide it matters. Continuing to send
 * would only teach the team that these reminders can be ignored, which costs
 * more than the one document.
 */
export const POSTMORTEM_MAX_REMINDERS = 5;

/** Timeline kinds that already have a dedicated notification of their own. */
const KIND_HAS_OWN_RULE = new Set(["created", "escalated", "resolved", "assigned"]);

/** How each kind of update is announced in the subject line. */
const UPDATE_LABEL: Record<string, string> = {
  acknowledged: "Acknowledged",
  mitigated: "Mitigated",
  reactivated: "Reopened",
  severity: "Severity changed",
  comment: "Comment",
  postmortem: "Postmortem",
  linked: "Linked",
  release: "Possible cause",
  sla: "SLA",
};

export interface NotifyState {
  /** Keys already delivered, so nothing is sent twice. */
  sent: Record<string, string>;
}

const key = (inc: Incident, reason: NotifyReason, salt = "") =>
  `${inc.id}:${reason}${salt ? `:${salt}` : ""}`;

/**
 * The distribution list for a team.
 *
 * Matched case-insensitively and ignoring surrounding space, because these
 * names are typed into a form on one side and into an environment variable on
 * the other. "Control Plane" and "control plane" being different teams is the
 * kind of mismatch that silently sends nothing.
 */
export function teamAddresses(contacts: TeamContacts, team: string): string[] {
  const wanted = team.trim().toLowerCase();
  if (!wanted) return [];
  for (const [name, addresses] of Object.entries(contacts)) {
    if (name.trim().toLowerCase() === wanted) return addresses.filter(Boolean);
  }
  return [];
}

/** The people to tell about one incident, in the order they should be tried. */
export function recipientsFor(
  inc: Incident,
  rotations: Rotation[],
  now: string,
  fallback: string[] = [],
  contacts: TeamContacts = {}
): string[] {
  const out: string[] = [];
  const add = (address: string) => {
    const clean = address.trim();
    /* Case-insensitive, because a rota entry and a distribution list written by
       different people differ by capitals more often than by address. */
    if (clean && !out.some((x) => x.toLowerCase() === clean.toLowerCase())) out.push(clean);
  };

  if (inc.assignedTo) add(inc.assignedTo);

  const shift = onCallFor(rotations, inc.owningTeam, now);
  if (shift) add(shift.who);

  /*
   * The team itself. Added before the global fallback and never in place of
   * the people above: the assignee is who acts, and the team is who needs to
   * know it is happening. Microsoft's IcM works the same way — the DRI is
   * paged, the team's list is copied.
   */
  for (const address of teamAddresses(contacts, inc.owningTeam)) add(address);

  /*
   * The fallback is appended, not substituted. A team address that only
   * receives what the rota failed to route is a team address nobody reads;
   * one that receives everything is the safety net it is meant to be.
   */
  for (const f of fallback) add(f);

  return out;
}

const sevLabel = (inc: Incident) => SLA[inc.severity].label;

/**
 * What should be sent right now.
 *
 * Deliberately conservative about repeats. Every rule here exists because the
 * failure mode of a paging system is not missing an alert — it is sending so
 * many that people stop reading them, at which point missing an alert is
 * guaranteed.
 */
export function planNotifications(
  incidents: Incident[],
  state: NotifyState,
  opts: { rotations?: Rotation[]; now: string; fallback?: string[]; contacts?: TeamContacts }
): Notification[] {
  const rotations = opts.rotations ?? [];
  const contacts = opts.contacts ?? {};
  const now = opts.now;
  const nowMs = Date.parse(now);
  const out: Notification[] = [];

  const push = (inc: Incident, reason: NotifyReason, k: string, subject: string, lines: string[]) => {
    if (state.sent[k]) return;
    out.push({
      key: k,
      incidentId: inc.id,
      reason,
      to: recipientsFor(inc, rotations, now, opts.fallback, contacts),
      subject,
      lines,
      severity: inc.severity,
    });
  };

  for (const inc of incidents) {
    const head = `[${sevLabel(inc)}] ${inc.id} — ${inc.title}`;
    /* Repeated on every message: somebody reading the third mail about an
       incident needs to know where it stands now, not only what just changed. */
    const state_ = `Now ${inc.status}, ${sevLabel(inc)}, owned by ${inc.owningTeam || "nobody"}${
      inc.assignedTo ? `, assigned to ${inc.assignedTo}` : ", unassigned"
    }.`;

    if (isOpen(inc)) {
      push(inc, "filed", key(inc, "filed"), head, [
        inc.description || "No description was given.",
        `Team: ${inc.owningTeam || "unrouted"}.`,
        inc.assignedTo ? `Assigned to ${inc.assignedTo}.` : "Nobody is assigned yet.",
        `Acknowledge within ${inc.slaAckMins} minutes.`,
      ]);
    }

    /*
     * Escalations are keyed on the count, so each level notifies exactly once.
     * Keying on the incident alone would send only the first, which is the
     * level least worth sending.
     */
    if (inc.escalations) {
      push(
        inc,
        "escalated",
        key(inc, "escalated", String(inc.escalations)),
        `Escalated: ${head}`,
        [
          `Raised to ${sevLabel(inc)} after no acknowledgement.`,
          `Filed ${inc.createdAt}.`,
          "This escalated on a clock, not a judgement — confirm the severity is right.",
        ]
      );
    }

    /*
     * Routing, keyed on the timeline entry rather than on the assignee.
     *
     * Keyed on the assignee, this missed the two cases that matter most to a
     * team: an incident routed to a team with nobody named — the commonest way
     * work is handed over — sent nothing at all, because `assignedTo` had not
     * changed; and handing an incident back to somebody who had held it before
     * was silently treated as already sent. The entry id changes on every
     * assignment, so each one is announced exactly once.
     */
    const lastAssignment = [...inc.timeline].reverse().find((t) => t.kind === "assigned");
    if (lastAssignment) {
      push(
        inc,
        "assigned",
        key(inc, "assigned", lastAssignment.id),
        `${inc.assignedTo ? "Assigned" : "Routed"}: ${head}`,
        [
          `${lastAssignment.actor} ${lastAssignment.text}.`,
          state_,
          inc.description || "",
        ]
      );
    }

    /*
     * The nag. Only for incidents nobody has acknowledged, and only after the
     * ack target has already passed — before that, the clock is doing its job
     * and a reminder is just noise aimed at somebody who is within their SLA.
     */
    if (inc.status === "active" && !inc.acknowledgedAt) {
      const ageMins = (nowMs - Date.parse(inc.createdAt)) / 60_000;
      if (ageMins > inc.slaAckMins) {
        const bucket = Math.floor((ageMins - inc.slaAckMins) / RENOTIFY_UNACKED_MINS);
        push(
          inc,
          "unacknowledged",
          key(inc, "unacknowledged", String(bucket)),
          `Still unacknowledged: ${head}`,
          [
            `Filed ${Math.round(ageMins)} minutes ago; the target was ${inc.slaAckMins}.`,
            "Nobody has acknowledged it.",
          ]
        );
      }
    }

    if (inc.status === "resolved" && inc.resolvedAt) {
      push(inc, "resolved", key(inc, "resolved"), `Resolved: ${head}`, [
        inc.rootCause || "No root cause was recorded.",
        inc.mitigation ? `Mitigation: ${inc.mitigation}` : "",
      ]);
    }

    /*
     * The write-up nobody chases.
     *
     * `postmortemsOutstanding` has always known which incidents owe one, and
     * the admin queue has always listed them — which means the reminder only
     * reached somebody who went looking. A resolved incident is closed, so
     * nothing draws anybody back to it, and the action items that would stop it
     * happening again are exactly the part that never gets written.
     *
     * Bucketed like the unacknowledged nag so each reminder is sent once, and
     * capped so it stops asking rather than becoming background noise.
     */
    if (
      inc.status === "resolved" &&
      inc.resolvedAt &&
      postmortemRequired(inc) &&
      !inc.postmortem?.publishedAt
    ) {
      const ageMins = (nowMs - Date.parse(inc.resolvedAt)) / 60_000;
      if (ageMins > POSTMORTEM_GRACE_MINS) {
        const bucket = Math.floor((ageMins - POSTMORTEM_GRACE_MINS) / POSTMORTEM_REMIND_MINS);
        if (bucket < POSTMORTEM_MAX_REMINDERS) {
          const started = !!inc.postmortem;
          push(
            inc,
            "postmortem",
            key(inc, "postmortem", String(bucket)),
            `Postmortem due: ${head}`,
            [
              `Resolved ${Math.round(ageMins / 60)} hours ago and still owes a write-up.`,
              started
                ? "A draft exists but has not been published."
                : "Nothing has been written yet.",
              `${sevLabel(inc)} incidents require one.`,
              "The action items are the only part of an incident that changes anything.",
            ]
          );
        }
      }
    }

    /*
     * Everything else that happened.
     *
     * Driven off the timeline rather than a rule per action, so acknowledging,
     * mitigating, commenting, changing severity, publishing a postmortem and
     * anything added later are all announced without this file having to learn
     * about them one at a time. The kinds that already have a dedicated
     * message above are skipped, or every action would arrive twice.
     */
    for (const t of inc.timeline) {
      if (KIND_HAS_OWN_RULE.has(t.kind)) continue;
      const ageMins = (nowMs - Date.parse(t.at)) / 60_000;
      if (!Number.isFinite(ageMins) || ageMins > UPDATE_MAX_AGE_MINS) continue;

      const label = UPDATE_LABEL[t.kind] ?? "Updated";
      push(inc, "update", key(inc, "update", t.id), `${label}: ${head}`, [
        `${t.actor} ${t.text}.`,
        t.body || "",
        state_,
      ]);
    }
  }

  /* Worst first: if a batch is truncated anywhere downstream, the Sev1 survives. */
  return out.sort((a, b) => a.severity - b.severity);
}

/** Renders one notification as the email body. */
export function renderNotification(n: Notification): { subject: string; html: string; text: string } {
  const lines = n.lines.filter(Boolean);
  return {
    subject: n.subject,
    text: `${n.subject}\n\n${lines.join("\n")}`,
    html: `<p style="font-weight:600">${escapeHtml(n.subject)}</p>${lines
      .map((l) => `<p style="margin:4px 0">${escapeHtml(l)}</p>`)
      .join("")}`,
  };
}

/*
 * Escaped, because incident titles and root causes are free text typed by
 * people during an outage and end up inside an HTML email. A title containing
 * a stray angle bracket should read oddly, not break the message.
 */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Marks a batch as delivered. Returns the next state rather than mutating. */
export function markSent(state: NotifyState, notifications: Notification[], now: string): NotifyState {
  const sent = { ...state.sent };
  for (const n of notifications) sent[n.key] = now;
  return { sent };
}

/**
 * Drops delivery records for incidents that no longer exist.
 *
 * Without it the ledger grows forever, and it is the one document here with no
 * natural bound. Keyed on incident id, so this is a prefix match.
 */
export function pruneSent(state: NotifyState, incidents: Incident[]): NotifyState {
  const live = new Set(incidents.map((i) => i.id));
  const sent: Record<string, string> = {};
  for (const [k, v] of Object.entries(state.sent)) {
    if (live.has(k.split(":")[0])) sent[k] = v;
  }
  return { sent };
}
