/**
 * Whether the scheduled jobs are actually running.
 *
 * WHY THIS EXISTS
 *
 * `vercel.json` schedules four jobs. Every one of them is authorised with
 * `CRON_SECRET`, and every one of them returns 403 when that variable is not
 * set — which is correct, because an unauthenticated trigger would be worse.
 * The problem is what happens next: Vercel calls the URL, gets a 403, and
 * nothing anywhere records that the job did not run.
 *
 * So the failure mode is four scheduled jobs that have never executed, on a
 * deployment where everything looks configured. The daily alert digest never
 * sends, the availability probe never probes, the anomaly sweep never sweeps,
 * and the first evidence is somebody eventually noticing they have not had an
 * email in a month. That is the house's least favourite shape of bug — a
 * control that is present, wired, scheduled, and does nothing — and it is
 * invisible precisely because a cron has no user watching it.
 *
 * This module is the source of truth for what is supposed to run and how often.
 * The routes record each successful run; the admin console reads the health.
 * `tests/cron-registry.test.ts` fails if vercel.json and this list disagree,
 * because two tables that must agree with nothing forcing them to is exactly
 * how the schedule and the code drift apart.
 */

export interface CronJob {
  /** The path in vercel.json. This is the join key, so it must match exactly. */
  path: string;
  /** What it does, in the words an operator would use. */
  label: string;
  /**
   * How long may pass between runs before something is wrong.
   *
   * Deliberately generous against the schedule — a daily job checked at
   * exactly 24h would report a fault every time a run was a minute late, and an
   * alert that cries wolf is one people turn off.
   */
  maxIntervalHours: number;
  /**
   * What stops working when this does not run. Shown to whoever has to decide
   * whether it matters at 9pm.
   */
  consequence: string;
}

/**
 * Every scheduled job. Adding one to vercel.json without adding it here fails
 * the registry test, and vice versa.
 */
export const CRON_JOBS: CronJob[] = [
  {
    path: "/api/admin/alerts/run",
    label: "Alert digest",
    maxIntervalHours: 36,
    consequence:
      "Nobody receives the daily digest of orders, returns and open tickets. Alert rules are still evaluated when somebody opens the admin area, so this is a notification gap rather than a data one.",
  },
  {
    path: "/api/admin/reports/send",
    label: "Scheduled reports",
    maxIntervalHours: 36,
    consequence:
      "Subscribed reports are not emailed. The reports themselves remain correct and can be downloaded by hand.",
  },
  {
    path: "/api/smarthome/alerts/cron",
    label: "Device anomaly sweep",
    maxIntervalHours: 36,
    consequence:
      "Offline devices, standby drain and stale sessions are only noticed when somebody opens the console. A device that fails overnight goes unreported until morning.",
  },
  {
    path: "/api/admin/availability/probe",
    label: "Availability probe",
    maxIntervalHours: 36,
    consequence:
      "The control plane is not checked from outside, so an outage is discovered by a customer rather than by us.",
  },
];

export type CronOutcome = "ok" | "skipped" | "failed";

export interface CronRun {
  at: string;
  outcome: CronOutcome;
  /** The job's own words — why it skipped, or what failed. */
  detail?: string;
}

export type CronRunLog = Record<string, CronRun>;

export type CronState = "healthy" | "late" | "never" | "degraded";

export interface CronStatus extends CronJob {
  state: CronState;
  lastRun: CronRun | null;
  hoursSince: number | null;
  /** One sentence naming the state and what to do, or null when healthy. */
  advice: string | null;
}

/**
 * Grades each job.
 *
 * `never` is kept distinct from `late` on purpose. A job that has run and
 * stopped is usually a transient; a job that has *never* run is almost always a
 * missing `CRON_SECRET`, and telling somebody to "check the schedule" when the
 * real answer is one environment variable wastes the hour they had.
 */
export function cronHealth(log: CronRunLog, now = Date.now()): CronStatus[] {
  return CRON_JOBS.map((job) => {
    const lastRun = log[job.path] ?? null;
    if (!lastRun) {
      return {
        ...job,
        state: "never" as CronState,
        lastRun: null,
        hoursSince: null,
        advice:
          "This job has never run. That is almost always CRON_SECRET missing from the deployment's environment variables — without it every scheduled request is refused, and the refusal is not recorded anywhere else.",
      };
    }

    const hoursSince = (now - Date.parse(lastRun.at)) / 3_600_000;
    if (!Number.isFinite(hoursSince)) {
      return { ...job, state: "never", lastRun, hoursSince: null, advice: "The recorded run time could not be read." };
    }

    if (hoursSince > job.maxIntervalHours) {
      return {
        ...job,
        state: "late" as CronState,
        lastRun,
        hoursSince,
        advice: `Last ran ${Math.round(hoursSince)} hours ago, and it is scheduled to run at least every ${job.maxIntervalHours}.`,
      };
    }

    /*
     * It ran, on time, and told us it could not do its work. That is not
     * healthy and it is not a scheduling fault, so it gets its own state —
     * reporting it as healthy is how CIRCUVENT_SWEEP_TOKEN could stay unset
     * indefinitely behind a green tick.
     */
    if (lastRun.outcome !== "ok") {
      return {
        ...job,
        state: "degraded" as CronState,
        lastRun,
        hoursSince,
        advice: lastRun.detail || "The job ran but reported that it could not do its work.",
      };
    }

    return { ...job, state: "healthy", lastRun, hoursSince, advice: null };
  });
}

/** True when anything needs attention — the one value a badge should read. */
export function cronNeedsAttention(statuses: CronStatus[]): boolean {
  return statuses.some((s) => s.state !== "healthy");
}
