import type { Incident, TimelineEntry } from "@/lib/icm";
import { formatMins, formatWhen } from "@/lib/icm";

/**
 * The incident, summarised from its own record.
 *
 * WHY THIS IS NOT A LANGUAGE MODEL
 *
 * IcM puts an assistant-written summary at the top of an incident and it is
 * genuinely the most useful thing on the page: somebody paged at 3am needs
 * "what is broken and what has already been tried" before they need a
 * timeline. The value is the shape, not the generation.
 *
 * So this derives. Every line traces to a field or a timeline entry that
 * somebody actually wrote, and a fact that is not in the record does not
 * appear. A summary that invents a plausible cause is worse than no summary at
 * the top of an incident — it is the first thing read, it is read under
 * pressure, and it will be believed. IcM's own card carries "AI-generated
 * content may be incorrect" for exactly that reason; this one does not need
 * the disclaimer because it does not generate.
 *
 * `src/workflows/icm-watch.ts` is where a model belongs if one is ever wanted:
 * it runs off the critical path and its output is reviewable before it lands.
 */

export interface IncidentSummary {
  /** What the record says is wrong, in the order somebody needs it. */
  known: string[];
  /** What has already been done, newest last, so it reads as a story. */
  done: string[];
  /** Nothing has been recorded beyond the report itself. */
  quiet: boolean;
}

const MINUTE = 60_000;

function minutesBetween(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(0, Math.round((b - a) / MINUTE));
}

/** The entries that represent somebody doing something, not the system noting it. */
function isAction(entry: TimelineEntry): boolean {
  return entry.kind !== "created";
}

/**
 * A timeline entry as one line of prose.
 *
 * The actor is kept because "who" is half of what a responder joining an
 * incident needs, and the original text is never paraphrased — a summary that
 * rewords somebody's note is a summary that can change what it meant.
 */
function describe(entry: TimelineEntry): string {
  const who = entry.actor?.trim();
  const text = entry.text?.trim() || entry.kind;
  return who ? `${text} — ${who}` : text;
}

export function summariseIncident(inc: Incident, now: string = new Date().toISOString()): IncidentSummary {
  const known: string[] = [];

  const impactFor = minutesBetween(inc.impactStartedAt || inc.createdAt, now);
  const services = inc.affectedServices?.filter(Boolean) ?? [];

  known.push(
    services.length
      ? `Impact: ${services.join(", ")}${inc.customersImpacted ? `, ${inc.customersImpacted.toLocaleString("en-IN")} customers affected` : ""}.`
      : inc.customersImpacted
        ? `Impact: ${inc.customersImpacted.toLocaleString("en-IN")} customers affected.`
        : "Impact: no affected service recorded on this incident."
  );

  /*
   * The description is deliberately not repeated here. The detail header prints
   * it in full two inches above this card, and echoing it would push the
   * derived facts — the clocks, the SLA, the duplicate — below the fold to say
   * something the reader has already read. One owner per fact; the header owns
   * the description, this card owns what can only be worked out.
   */
  /*
   * "filed by monitor via monitor" is what the naive sentence produces when an
   * automated source files its own incident, which is most of them. The origin
   * is one fact; say it once.
   */
  const filedBy =
    inc.createdBy && inc.createdBy.toLowerCase() !== inc.source.toLowerCase()
      ? `filed by ${inc.createdBy} via ${inc.source}`
      : `filed by ${inc.createdBy || inc.source}`;

  known.push(
    `Severity ${inc.severity}, ${filedBy}, owned by ${inc.owningTeam}${inc.assignedTo ? ` (${inc.assignedTo})` : ""}.`
  );

  /*
   * The clock, stated plainly. "Active for four hours" is the sentence that
   * changes what somebody does next, and it is the one thing a status pill
   * cannot say on its own.
   */
  if (inc.status === "resolved" && inc.resolvedAt) {
    known.push(`Resolved after ${formatMins(minutesBetween(inc.createdAt, inc.resolvedAt))}.`);
  } else if (inc.status === "mitigated" && inc.mitigatedAt) {
    known.push(
      `Mitigated after ${formatMins(minutesBetween(inc.createdAt, inc.mitigatedAt))}; not yet resolved.`
    );
  } else {
    known.push(
      `Still ${inc.status}, ${formatMins(impactFor)} since impact began${
        inc.acknowledgedAt ? "" : " and not yet acknowledged"
      }.`
    );
  }

  if (inc.escalations) {
    known.push(
      `Escalated ${inc.escalations} time${inc.escalations === 1 ? "" : "s"}${
        inc.lastEscalatedAt ? `, most recently ${formatWhen(inc.lastEscalatedAt)}` : ""
      }.`
    );
  }

  const duplicates = (inc.links ?? []).filter((l) => l.kind === "duplicate-of");
  if (duplicates.length) {
    known.push(
      `Marked as a duplicate of ${duplicates.map((l) => l.id).join(", ")} — check there before working this one.`
    );
  }

  const done: string[] = (inc.timeline ?? []).filter(isAction).map(describe);

  if (inc.mitigation?.trim()) done.push(`Mitigation recorded: ${inc.mitigation.trim()}`);
  if (inc.rootCause?.trim()) done.push(`Root cause recorded: ${inc.rootCause.trim()}`);

  return { known, done, quiet: done.length === 0 };
}
