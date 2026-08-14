/**
 * The schedule and the code must agree about what is scheduled.
 *
 * WHY THIS GUARD
 *
 * `vercel.json` says what runs. `src/lib/cron-health.ts` says what is supposed
 * to run and how often, and the routes record that they ran. Three places, and
 * nothing forcing them to agree — which is the exact shape of every parity bug
 * this codebase has found.
 *
 * The failure it prevents is quiet in both directions. Add a cron to
 * vercel.json and forget the registry, and the job runs unmonitored forever.
 * Remove one from vercel.json and leave the registry, and the console reports a
 * job as overdue that nobody asked to run — which trains people to ignore the
 * panel, and then the real one goes unnoticed too.
 *
 * THE BUG BEHIND ALL OF IT
 *
 * Every scheduled route is authorised with CRON_SECRET and returns 403 without
 * it. That is correct. What was missing is that nothing recorded the refusal,
 * so on a deployment with CRON_SECRET unset all four jobs had never run, and
 * there was no surface anywhere that could say so.
 */
import fs from "node:fs";
import path from "node:path";
import { CRON_JOBS, cronHealth, cronNeedsAttention, type CronRunLog } from "@/lib/cron-health";

const root = path.join(__dirname, "..");

function scheduledPaths(): string[] {
  const raw = fs.readFileSync(path.join(root, "vercel.json"), "utf8");
  const cfg = JSON.parse(raw) as { crons?: Array<{ path: string; schedule: string }> };
  return (cfg.crons ?? []).map((c) => c.path).sort();
}

describe("the schedule and the registry agree", () => {
  it("registers every job vercel.json schedules", () => {
    const missing = scheduledPaths().filter((p) => !CRON_JOBS.some((j) => j.path === p));
    expect(missing).toEqual([]);
  });

  it("schedules every job the registry claims", () => {
    const scheduled = scheduledPaths();
    const orphaned = CRON_JOBS.filter((j) => !scheduled.includes(j.path)).map((j) => j.path);
    expect(orphaned).toEqual([]);
  });

  it("points every registered job at a route that exists", () => {
    /*
     * A path that 404s is scheduled, authorised, and does nothing — and looks
     * identical from the outside to one that is working.
     */
    for (const job of CRON_JOBS) {
      const file = path.join(root, "src", "app", job.path.replace(/^\//, ""), "route.ts");
      expect(fs.existsSync(file)).toBe(true);
    }
  });

  it("has every route record that it ran", () => {
    // A job that never calls recordCronRun is permanently "never ran", which
    // would make the panel cry wolf until somebody muted it.
    for (const job of CRON_JOBS) {
      const file = path.join(root, "src", "app", job.path.replace(/^\//, ""), "route.ts");
      expect(fs.readFileSync(file, "utf8")).toMatch(/recordCronRun\(/);
    }
  });

  it("gives every job a consequence somebody can act on", () => {
    // "Job failed" tells an operator nothing at 9pm. What stops working does.
    for (const job of CRON_JOBS) {
      expect(job.consequence.length).toBeGreaterThan(40);
      expect(job.maxIntervalHours).toBeGreaterThan(0);
    }
  });
});

describe("grading the runs", () => {
  const now = Date.parse("2026-08-14T12:00:00.000Z");
  const ago = (hours: number) => new Date(now - hours * 3_600_000).toISOString();

  function log(over: CronRunLog = {}): CronRunLog {
    const base: CronRunLog = {};
    for (const j of CRON_JOBS) base[j.path] = { at: ago(2), outcome: "ok" };
    return { ...base, ...over };
  }

  it("calls a job that has never run 'never', not 'late'", () => {
    /*
     * This distinction is the whole point. A job that ran and stopped is
     * usually transient; a job that has *never* run is almost always a missing
     * CRON_SECRET, and sending somebody to check the schedule when the answer
     * is one environment variable wastes their afternoon.
     */
    const statuses = cronHealth({}, now);
    expect(statuses.every((s) => s.state === "never")).toBe(true);
    expect(statuses[0].advice).toMatch(/CRON_SECRET/);
  });

  it("is healthy when everything ran recently", () => {
    const statuses = cronHealth(log(), now);
    expect(statuses.every((s) => s.state === "healthy")).toBe(true);
    expect(cronNeedsAttention(statuses)).toBe(false);
    // A healthy job says nothing. Advice on everything is advice on nothing.
    expect(statuses.every((s) => s.advice === null)).toBe(true);
  });

  it("flags a job that has stopped running", () => {
    const statuses = cronHealth(log({ "/api/admin/alerts/run": { at: ago(50), outcome: "ok" } }), now);
    const late = statuses.find((s) => s.path === "/api/admin/alerts/run");
    expect(late?.state).toBe("late");
    expect(late?.advice).toMatch(/50 hours ago/);
  });

  it("does not call a job healthy just because it ran on time", () => {
    /*
     * The anomaly sweep returns 200 with `configured: false` when
     * CIRCUVENT_SWEEP_TOKEN is unset — deliberately, so a nightly failure
     * email does not train everyone to ignore it. That makes it perfectly
     * punctual and completely useless, and reporting it green is how the token
     * stays unset indefinitely.
     */
    const statuses = cronHealth(
      log({
        "/api/smarthome/alerts/cron": {
          at: ago(1),
          outcome: "skipped",
          detail: "CIRCUVENT_SWEEP_TOKEN is not set, so no sweep was performed.",
        },
      }),
      now
    );
    const swept = statuses.find((s) => s.path === "/api/smarthome/alerts/cron");
    expect(swept?.state).toBe("degraded");
    expect(swept?.advice).toMatch(/CIRCUVENT_SWEEP_TOKEN/);
    expect(cronNeedsAttention(statuses)).toBe(true);
  });

  it("survives an unreadable timestamp rather than reporting a healthy job", () => {
    const statuses = cronHealth({ "/api/admin/alerts/run": { at: "not a date", outcome: "ok" } }, now);
    expect(statuses.find((s) => s.path === "/api/admin/alerts/run")?.state).toBe("never");
  });
});
