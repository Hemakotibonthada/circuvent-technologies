import { sleep } from "workflow";
import { sweepIncident, type IncidentWatch } from "@/lib/icm-store";

/**
 * Watches one incident until somebody owns it.
 *
 * ── Why this is a workflow ──
 *
 * Escalation and re-notification were driven by two things: `icmView`, which
 * builds the admin queue, and a once-daily sweep. That means an incident
 * escalated when **somebody opened the panel** — and if nobody did, the
 * severity clock ran down and the page nobody had acknowledged stayed silent
 * until the next morning. An incident management system whose escalation
 * depends on being observed is a filing cabinet with a clock painted on it.
 *
 * The obvious fix, a cron every few minutes, is not available: the deployment
 * plan permits one scheduled run a day. The next-obvious one, a timer held in
 * the function that filed the incident, does not survive that function
 * returning — which on serverless is immediately.
 *
 * A durable workflow is the shape that fits. It sleeps until the exact
 * acknowledgement deadline, wakes, escalates if it must, and sleeps again —
 * consuming nothing while it waits, and surviving deploys, cold starts and
 * crashes because its position is persisted rather than held in memory.
 *
 * ── The prerequisite ──
 *
 * Each step runs in its own invocation, so this only works because the
 * incident store is now backed by the database. While it was a JSON file that
 * the host cannot write, a step would have woken in a different instance and
 * found no incident to escalate.
 */

/**
 * How many times one incident will be looked at before the workflow gives up.
 *
 * A ceiling rather than a duration, because the interval changes as the
 * incident does. At the nag interval this is a little over a day of unbroken
 * silence — by which point nobody is going to acknowledge it because of one
 * more email, and a workflow that runs for a month is a cost with no reader.
 */
export const MAX_CHECKS = 60;

export interface WatchResult {
  incidentId: string;
  checks: number;
  /** Why the watch stopped, for the observability UI and for the tests. */
  outcome: "acknowledged" | "resolved" | "gone" | "exhausted";
  escalations: number;
}

export async function watchIncident(incidentId: string): Promise<WatchResult> {
  "use workflow";

  let escalations = 0;

  for (let check = 1; check <= MAX_CHECKS; check++) {
    const state = await checkIncident(incidentId);

    if (state.escalated) escalations++;

    if (!state.exists) {
      return { incidentId, checks: check, outcome: "gone", escalations };
    }
    if (state.status === "resolved") {
      return { incidentId, checks: check, outcome: "resolved", escalations };
    }
    /*
     * `nextCheckAt` being null is the step saying there is nothing left to
     * wait for — acknowledged and mitigated, or otherwise settled. Deciding
     * that in the step rather than here keeps the SLA arithmetic in one place,
     * beside the incident model that defines it.
     */
    if (!state.nextCheckAt) {
      return {
        incidentId,
        checks: check,
        outcome: state.acknowledged ? "acknowledged" : "resolved",
        escalations,
      };
    }

    /*
     * Sleeping until a date the *step* returned, rather than one computed
     * here. A workflow body is replayed, so reading the clock in it would give
     * a different answer on each replay; a value that arrived from a step is
     * recorded and replays identically.
     */
    await sleep(new Date(state.nextCheckAt));
  }

  return { incidentId, checks: MAX_CHECKS, outcome: "exhausted", escalations };
}

/**
 * One look at the incident: escalate it if it is overdue, send what is due,
 * and report when to come back.
 *
 * A step rather than inline workflow code because it touches the database and
 * sends mail. If it throws — the database briefly unreachable, the mail host
 * refusing — the SDK retries it rather than losing the watch, which is the
 * behaviour the daily sweep could not offer: a sweep that failed simply did
 * not happen until tomorrow.
 */
async function checkIncident(incidentId: string): Promise<IncidentWatch> {
  "use step";

  return sweepIncident(incidentId);
}
