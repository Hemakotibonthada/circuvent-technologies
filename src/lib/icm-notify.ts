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
import { SLA, isOpen, onCallFor, type Incident, type Rotation } from "./icm";

export type NotifyReason = "filed" | "escalated" | "assigned" | "unacknowledged" | "resolved";

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

export interface NotifyState {
  /** Keys already delivered, so nothing is sent twice. */
  sent: Record<string, string>;
}

const key = (inc: Incident, reason: NotifyReason, salt = "") =>
  `${inc.id}:${reason}${salt ? `:${salt}` : ""}`;

/** The people to tell about one incident, in the order they should be tried. */
export function recipientsFor(
  inc: Incident,
  rotations: Rotation[],
  now: string,
  fallback: string[] = []
): string[] {
  const out: string[] = [];
  if (inc.assignedTo) out.push(inc.assignedTo);

  const shift = onCallFor(rotations, inc.owningTeam, now);
  if (shift && !out.includes(shift.who)) out.push(shift.who);

  /*
   * The fallback is appended, not substituted. A team address that only
   * receives what the rota failed to route is a team address nobody reads;
   * one that receives everything is the safety net it is meant to be.
   */
  for (const f of fallback) if (f && !out.includes(f)) out.push(f);

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
  opts: { rotations?: Rotation[]; now: string; fallback?: string[] }
): Notification[] {
  const rotations = opts.rotations ?? [];
  const now = opts.now;
  const nowMs = Date.parse(now);
  const out: Notification[] = [];

  const push = (inc: Incident, reason: NotifyReason, k: string, subject: string, lines: string[]) => {
    if (state.sent[k]) return;
    out.push({
      key: k,
      incidentId: inc.id,
      reason,
      to: recipientsFor(inc, rotations, now, opts.fallback),
      subject,
      lines,
      severity: inc.severity,
    });
  };

  for (const inc of incidents) {
    const head = `[${sevLabel(inc)}] ${inc.id} — ${inc.title}`;

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

    if (inc.assignedTo) {
      push(
        inc,
        "assigned",
        key(inc, "assigned", inc.assignedTo),
        `Assigned to you: ${head}`,
        [`${inc.id} is yours.`, inc.description || ""]
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
