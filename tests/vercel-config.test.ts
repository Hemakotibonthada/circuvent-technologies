/**
 * vercel.json must be deployable.
 *
 * A sub-daily cron schedule was added here and every deployment from that
 * commit onward failed — "Hobby accounts are limited to daily cron jobs" —
 * while the code itself was fine and every local gate was green. Four commits
 * of fixes sat undeployed, including one written specifically to fix a bug a
 * customer had reported, and nothing in the repository said anything was
 * wrong. The only signal was in the Vercel dashboard.
 *
 * A configuration file that can stop every deploy is worth a test.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const config = JSON.parse(readFileSync(join(__dirname, "..", "vercel.json"), "utf8")) as {
  crons?: { path: string; schedule: string }[];
};

/**
 * Does this cron expression fire at most once a day?
 *
 * Hobby permits daily only, which means the minute and hour fields must both
 * be fixed — no step, no list, no range, no wildcard. Anything else fires more
 * than once in twenty-four hours and fails the deploy.
 */
function firesAtMostDaily(schedule: string): boolean {
  const [minute, hour] = schedule.trim().split(/\s+/);
  const fixed = (f: string) => /^\d+$/.test(f);
  return fixed(minute) && fixed(hour);
}

describe("vercel.json crons", () => {
  it("declares a schedule for every cron", () => {
    for (const c of config.crons ?? []) {
      expect(c.path).toMatch(/^\//);
      expect(c.schedule.trim().split(/\s+/)).toHaveLength(5);
    }
  });

  it.each((config.crons ?? []).map((c) => [c.path, c.schedule]))(
    "%s runs at most once a day, which is all the current plan allows",
    (_path, schedule) => {
      expect(firesAtMostDaily(schedule as string)).toBe(true);
    }
  );

  it("recognises the expression that broke the deployments", () => {
    // Guard the guard: if this helper stopped detecting sub-daily schedules,
    // the test above would pass on exactly the thing it exists to catch.
    expect(firesAtMostDaily("*/30 * * * *")).toBe(false);
    expect(firesAtMostDaily("0 * * * *")).toBe(false);
    expect(firesAtMostDaily("0,30 6 * * *")).toBe(false);
    expect(firesAtMostDaily("0 6-8 * * *")).toBe(false);
    expect(firesAtMostDaily("0 6 * * *")).toBe(true);
  });

  it("points every cron at a route that exists", () => {
    // A schedule aimed at a deleted route fails silently forever.
    const { existsSync } = require("node:fs") as typeof import("node:fs");
    for (const c of config.crons ?? []) {
      const route = join(__dirname, "..", "src", "app", ...c.path.split("/").filter(Boolean), "route.ts");
      expect({ path: c.path, exists: existsSync(route) }).toEqual({ path: c.path, exists: true });
    }
  });
});
