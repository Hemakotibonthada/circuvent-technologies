import { sleep } from "workflow";
import { sweepPostmortem, type PostmortemWatch } from "@/lib/icm-store";
import { POSTMORTEM_MAX_REMINDERS } from "@/lib/icm-notify";

/**
 * Chases the write-up a resolved incident owes.
 *
 * ── The gap this closes ──
 *
 * `postmortemsOutstanding` has always known which incidents owe a postmortem,
 * and the admin queue has always listed them. Both of those only work on
 * somebody who goes looking — and a resolved incident is closed, so nothing
 * draws anybody back to it. The result is the failure mode the incident model
 * itself warns about: the action items, which are the only part of an incident
 * that changes anything, are the part that never gets written.
 *
 * Nagging is a poor fit for a cron and a natural one for a durable workflow.
 * The schedule is per incident, measured from *its* resolution, and it runs for
 * days or weeks — which is a row in a scheduler's table, or one sleeping
 * workflow that costs nothing while it waits.
 *
 * ── Why it stops ──
 *
 * After {@link POSTMORTEM_MAX_REMINDERS} it gives up rather than continuing
 * forever. A write-up still missing two weeks after the outage is not waiting
 * for another email; continuing to send would only teach the team that these
 * reminders can be ignored, which costs more than the one document.
 */

export interface ChaseResult {
  incidentId: string;
  reminders: number;
  outcome: "published" | "not-required" | "gone" | "reopened" | "gave-up";
}

export async function chasePostmortem(incidentId: string): Promise<ChaseResult> {
  "use workflow";

  /* One more than the reminders, because the first pass happens before any is
     due — it establishes when the grace period ends. */
  for (let attempt = 0; attempt <= POSTMORTEM_MAX_REMINDERS; attempt++) {
    const state = await checkPostmortem(incidentId);

    if (!state.exists) {
      return { incidentId, reminders: attempt, outcome: "gone" };
    }
    if (state.reopened) {
      /*
       * Back to being an incident. It owes an acknowledgement before it owes a
       * document, and `watchIncident` is the workflow for that — so this one
       * stands down rather than nagging about paperwork during an outage.
       */
      return { incidentId, reminders: attempt, outcome: "reopened" };
    }
    if (!state.outstanding) {
      return { incidentId, reminders: attempt, outcome: "published" };
    }
    if (!state.nextCheckAt) {
      return { incidentId, reminders: attempt, outcome: "gave-up" };
    }

    /* The date came from the step, so it replays identically. */
    await sleep(new Date(state.nextCheckAt));
  }

  return { incidentId, reminders: POSTMORTEM_MAX_REMINDERS, outcome: "gave-up" };
}

/**
 * One look at whether the write-up has appeared, and a reminder if it has not.
 *
 * A step because it reads the database and sends mail, so a failure is retried
 * by the SDK rather than losing the chase entirely.
 */
async function checkPostmortem(incidentId: string): Promise<PostmortemWatch> {
  "use step";

  return sweepPostmortem(incidentId);
}
