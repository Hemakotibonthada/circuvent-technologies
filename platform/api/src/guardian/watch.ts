/**
 * Journey mode, and what happens when nobody answers.
 *
 * TWO PROBLEMS, ONE SHAPE
 *
 * **Journey mode** is the "walk me home" case: somebody sets off, says when
 * they expect to arrive, and if they do not say they got there, an alarm is
 * raised for them. It covers the situation the panic button cannot — being
 * unable to press it, because you are unconscious, or because pressing it for
 * thirty seconds is not something you can do while it is happening.
 *
 * **Escalation** is the case where the alarm went out and nothing came back.
 * An SOS that was delivered to four phones, all of which are in pockets, is not
 * an SOS anybody is dealing with. Assuming somebody saw it is the failure that
 * makes the whole thing theatre.
 *
 * Both are timers over a decision, and both go wrong in the same two ways —
 * firing early on somebody who is fine, and never firing on somebody who is
 * not — so both live here, pure and tested.
 */

export type JourneyStatus = "running" | "arrived" | "overdue" | "cancelled";

export type Journey = {
  startedAt: number;
  /** When the wearer said they would arrive. */
  dueAt: number;
  status: JourneyStatus;
  /** Where they said they were going, if anywhere. */
  destination?: string;
};

/**
 * Grace after the deadline before anybody is alarmed.
 *
 * People are late. A journey deadline is somebody's guess at how long a walk
 * takes, made before they set off, and treating it as a hard boundary would
 * raise an emergency every time a bus was slow — which is most days. Five
 * minutes absorbs ordinary lateness without being long enough to matter if
 * something has actually happened.
 */
export const JOURNEY_GRACE_MS = 5 * 60_000;

/**
 * Warn the wearer before alarming everybody else.
 *
 * The overwhelming majority of overdue journeys are somebody who forgot to
 * press "I'm home". Nudging them first — quietly, on their own phone — turns
 * most false alarms into a tap, and costs the genuine cases nothing, because a
 * person who cannot answer a nudge is exactly the person the alarm is for.
 */
export const JOURNEY_NUDGE_MS = 60_000;

export type JourneyAction =
  | { kind: "none" }
  | { kind: "nudge"; lateBy: number }
  | { kind: "raise"; lateBy: number };

/**
 * What to do about a journey, now.
 *
 * Pure so that "does a journey that is four minutes late raise an alarm?" is a
 * question with a test rather than an argument.
 */
export function journeyAction(j: Journey, now: number, nudged: boolean): JourneyAction {
  if (j.status !== "running") return { kind: "none" };

  const lateBy = now - j.dueAt;
  if (lateBy < JOURNEY_NUDGE_MS) return { kind: "none" };
  if (lateBy >= JOURNEY_GRACE_MS) return { kind: "raise", lateBy };
  if (!nudged) return { kind: "nudge", lateBy };
  return { kind: "none" };
}

/**
 * Bounds on how long a journey may be.
 *
 * The floor stops a mistyped "1" arming something that fires before the wearer
 * has left the building. The ceiling is not about safety but about honesty: a
 * twelve-hour journey is not a journey, it is a person forgetting to cancel,
 * and the alarm it eventually raises will be a false one that teaches everybody
 * to ignore the next.
 */
export const JOURNEY_BOUNDS_MIN = { min: 2, max: 8 * 60 } as const;

export function clampJourneyMinutes(mins: number): number {
  if (!Number.isFinite(mins)) return 20;
  return Math.min(JOURNEY_BOUNDS_MIN.max, Math.max(JOURNEY_BOUNDS_MIN.min, Math.round(mins)));
}

/* ------------------------------------------------------------------ */
/* Escalation                                                          */
/* ------------------------------------------------------------------ */

/**
 * How long an SOS may go unacknowledged before we widen it.
 *
 * Three minutes is chosen against the two failures either side. Shorter, and a
 * contact who is already dialling gets escalated past while they are doing
 * exactly the right thing. Longer, and a phone left in a bag has cost somebody
 * the only useful window there was.
 */
export const ESCALATE_AFTER_MS = 3 * 60_000;

/** And again, if the second wave is also ignored. */
export const ESCALATE_AGAIN_MS = 8 * 60_000;

export type EscalationStep = "none" | "widen" | "authorities";

/**
 * How far an unacknowledged incident should have been pushed by now.
 *
 * "widen" means everybody who was not in the first wave — the remaining
 * contacts, the account owner, push to every linked app. "authorities" means
 * the emergency number, if it has not already been messaged.
 *
 * Acknowledgement stops the ladder dead. Somebody saying "I have this" is the
 * only signal that matters, and continuing to escalate past it is how a
 * neighbour ends up with three police cars.
 */
export function escalationFor(
  openedAt: number,
  acknowledgedAt: number | null,
  now: number,
): EscalationStep {
  if (acknowledgedAt !== null) return "none";
  const age = now - openedAt;
  if (age >= ESCALATE_AGAIN_MS) return "authorities";
  if (age >= ESCALATE_AFTER_MS) return "widen";
  return "none";
}

/**
 * Whether this step has already been taken.
 *
 * The sweep runs on a timer, so without this an incident that is ten minutes
 * old re-escalates on every pass — a fresh set of notifications every minute
 * to people who are already on their way.
 */
export function shouldEscalate(step: EscalationStep, alreadyDone: EscalationStep[]): boolean {
  if (step === "none") return false;
  return !alreadyDone.includes(step);
}
