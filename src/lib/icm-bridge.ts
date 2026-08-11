/**
 * Turns monitor alerts into incidents.
 *
 * The anomaly monitor already detects that a hub has gone silent or a tank is
 * draining; the incident queue already tracks response. Nothing connected them,
 * so a problem the platform had spotted still needed a human to notice the
 * alert and file a ticket — which is the step that does not happen at 3am.
 *
 * Pure, like icm.ts: it takes the current alerts and the current incidents and
 * says what should change. The caller persists it.
 *
 * Three rules do almost all the work here, and each of them exists because the
 * obvious implementation fails in a specific, well-known way:
 *
 *   1. Not every alert becomes an incident. An integration that files one per
 *      finding produces a queue nobody reads by lunchtime, which is worse than
 *      no integration — the queue is the thing being protected.
 *   2. The same alert must never file twice. The sweep runs on a schedule and
 *      re-reports anything still wrong, so without a stable key this turns into
 *      a firehose on its second run.
 *   3. A monitor may not overrule a human. If somebody has acknowledged an
 *      incident, the monitor stops touching it — it can add to the timeline,
 *      but it cannot resolve work that a person has taken on.
 */
import type { Alert } from "./anomaly-monitor";
import type { Severity as AlertSeverity } from "./ai/analysis";
import { comment, resolve, type Incident, type NewIncident, type Severity } from "./icm";

/**
 * Which alerts are worth an incident, and at what severity.
 *
 * `info` never files. It is the level used for "you might want to know", and a
 * queue that contains those is a queue that gets ignored.
 *
 * Note the ceiling: a monitor cannot file a Sev0. Sev0 means the product is
 * down for everyone, which requires judgement a threshold does not have — and
 * automatic paging at the loudest level is precisely how a team learns to mute
 * the pager. A human can always raise it, and that is recorded.
 */
export const SEVERITY_MAP: Partial<Record<AlertSeverity, Severity>> = {
  critical: 1,
  warning: 3,
};

/** A stable key tying an incident back to the finding that raised it. */
export function sourceKeyFor(alert: Alert): string {
  return `monitor:${alert.fingerprint}`;
}

export interface BridgePlan {
  /** Incidents to file. */
  toFile: NewIncident[];
  /** Existing incidents to change, already transitioned. */
  toUpdate: Incident[];
}

export interface BridgeOptions {
  /** Which team monitor-filed incidents are routed to. */
  owningTeam?: string;
  now?: string;
  /**
   * Close an incident when its alert clears and nobody has picked it up.
   *
   * On by default. Without it the queue slowly fills with incidents for
   * problems that fixed themselves — a hub that rebooted, a tank that refilled
   * — and a queue full of stale entries is one nobody trusts.
   */
  autoResolve?: boolean;
}

/**
 * Works out what should happen, given the alerts and the incidents that exist.
 *
 * Deliberately takes both and returns a plan rather than mutating: this is the
 * part with all the judgement in it, and it is only testable if it does not
 * also need a filesystem and a clock.
 */
export function planFromAlerts(
  alerts: Alert[],
  incidents: Incident[],
  opts: BridgeOptions = {}
): BridgePlan {
  const now = opts.now ?? new Date().toISOString();
  const owningTeam = opts.owningTeam ?? "Platform";
  const autoResolve = opts.autoResolve !== false;

  /* Existing monitor-filed incidents, by the finding that raised them. */
  const byKey = new Map<string, Incident>();
  for (const inc of incidents) {
    if (inc.sourceKey) byKey.set(inc.sourceKey, inc);
  }

  const toFile: NewIncident[] = [];
  const toUpdate: Incident[] = [];
  const seenKeys = new Set<string>();

  for (const alert of alerts) {
    const key = sourceKeyFor(alert);
    seenKeys.add(key);

    const severity = SEVERITY_MAP[alert.severity];
    if (severity === undefined) continue; // info, or a level with no mapping

    const existing = byKey.get(key);

    if (!existing) {
      /*
       * Only open and acknowledged alerts file. A resolved alert on the very
       * first sweep after a restart describes something that is already over,
       * and filing it would ask somebody to respond to history.
       */
      if (alert.state === "resolved") continue;

      toFile.push({
        title: alert.title,
        description: [alert.detail, alert.suggestion].filter(Boolean).join("\n\n"),
        severity,
        owningTeam,
        createdBy: "monitor",
        source: "monitor",
        /*
         * Impact began when the problem was first seen, not when the sweep got
         * round to filing. Otherwise the mitigate clock is reset by the
         * schedule, and a monitor that runs every ten minutes flatters every
         * number by up to ten minutes.
         */
        impactStartedAt: alert.firstSeenAt,
        affectedServices: alert.deviceIds.slice(0, 8),
        tags: ["auto", alert.severity],
        sourceKey: key,
      });
      continue;
    }

    /*
     * The alert is still firing and an incident already exists.
     *
     * If a human has picked it up, say nothing further — a comment on every
     * sweep would bury their discussion under a log. If nobody has, and the
     * incident was auto-resolved earlier, leave it: reopening on a flapping
     * alert is how an incident becomes a metronome.
     */
    void existing;
  }

  if (autoResolve) {
    for (const inc of incidents) {
      if (!inc.sourceKey || !inc.sourceKey.startsWith("monitor:")) continue;
      if (inc.status === "resolved") continue;
      /*
       * A human has taken it. The monitor no longer owns this incident and must
       * not close work somebody is doing — the underlying alert clearing may be
       * the *result* of that work, and resolving it out from under them loses
       * the root cause they were about to write down.
       */
      if (inc.acknowledgedAt) continue;
      if (seenKeys.has(inc.sourceKey)) continue;

      const closed = resolve(
        inc,
        "monitor",
        "The condition that raised this stopped being reported. Closed automatically; nobody had picked it up.",
        now
      );
      if (!closed.error) toUpdate.push(closed.incident);
    }
  }

  return { toFile, toUpdate };
}

/**
 * Notes on an existing incident that its alert has escalated.
 *
 * Kept separate from the plan because it is the one thing here that writes to
 * an incident a human may already own — a comment is additive and safe, where
 * a status change would not be.
 */
export function noteEscalation(inc: Incident, alert: Alert, now: string): Incident {
  const r = comment(
    inc,
    "monitor",
    `The monitor raised this finding to ${alert.severity} (${alert.occurrences} sightings).`,
    now
  );
  return r.error ? inc : r.incident;
}
