/** @jest-environment node */
import {
  currentBuild,
  recordCurrentBuild,
  listDeployments,
  deploymentsIn,
  deployBefore,
  describeCorrelation,
  DEPLOY_CORRELATION_MINS,
} from "./deployments";

const NOW = "2026-06-01T12:00:00.000Z";
const at = (mins: number) => new Date(Date.parse(NOW) + mins * 60_000).toISOString();

/*
 * The store is file-backed and persists across tests in this file, and
 * deployBefore searches all of it. Rather than add a reset function to
 * production code purely for tests, each test that cares about proximity gets
 * its own day — which also documents that the correlation is time-local: a
 * deployment a day away is invisible to it, by design.
 */
const DAY_MS = 24 * 3_600_000;
const day = (n: number) => new Date(Date.parse(NOW) + n * DAY_MS).toISOString();
const dayAt = (n: number, mins: number) =>
  new Date(Date.parse(NOW) + n * DAY_MS + mins * 60_000).toISOString();

const ENV_KEYS = [
  "VERCEL_GIT_COMMIT_SHA",
  "VERCEL_GIT_COMMIT_REF",
  "VERCEL_GIT_COMMIT_MESSAGE",
  "VERCEL_GIT_COMMIT_AUTHOR_LOGIN",
  "VERCEL_ENV",
  "GIT_COMMIT_SHA",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const setBuild = (sha: string, over: Record<string, string> = {}) => {
  process.env.VERCEL_GIT_COMMIT_SHA = sha;
  process.env.VERCEL_GIT_COMMIT_REF = over.ref ?? "develop";
  process.env.VERCEL_GIT_COMMIT_MESSAGE = over.message ?? "Some change";
  process.env.VERCEL_GIT_COMMIT_AUTHOR_LOGIN = over.author ?? "hema";
  process.env.VERCEL_ENV = over.env ?? "production";
};

describe("currentBuild", () => {
  it("returns null when there is no git metadata", () => {
    expect(currentBuild({} as NodeJS.ProcessEnv)).toBeNull();
  });

  it("reads the Vercel build variables", () => {
    setBuild("abc1234567890");
    const b = currentBuild()!;

    expect(b.sha).toBe("abc1234567890");
    expect(b.shortSha).toBe("abc1234");
    expect(b.branch).toBe("develop");
    expect(b.environment).toBe("production");
  });

  it("keeps only the subject line of a commit message", () => {
    // Commit bodies in this repo run to several paragraphs, and this is
    // rendered as a label on a chart.
    setBuild("abc1234", { message: "Fix the thing\n\nA long explanation.\nAnd more." });
    expect(currentBuild()!.message).toBe("Fix the thing");
  });

  it("truncates an absurdly long subject", () => {
    setBuild("abc1234", { message: "x".repeat(500) });
    expect(currentBuild()!.message).toHaveLength(200);
  });

  it("falls back to a generic git variable when not on Vercel", () => {
    process.env.GIT_COMMIT_SHA = "deadbeef00";
    expect(currentBuild()!.shortSha).toBe("deadbee");
  });
});

describe("recordCurrentBuild", () => {
  it("does nothing when there is no build metadata", () => {
    expect(recordCurrentBuild(NOW)).toBeNull();
  });

  it("records a build the first time it is seen", () => {
    setBuild("sha-first");
    const rec = recordCurrentBuild(NOW)!;

    expect(rec.sha).toBe("sha-first");
    expect(rec.firstSeenAt).toBe(NOW);
    expect(listDeployments().some((d) => d.sha === "sha-first")).toBe(true);
  });

  it("is idempotent, so calling it on every request adds one marker not thousands", () => {
    setBuild("sha-idem");
    const first = recordCurrentBuild(NOW)!;
    const second = recordCurrentBuild(at(30))!;

    expect(second.firstSeenAt).toBe(first.firstSeenAt);
    expect(listDeployments().filter((d) => d.sha === "sha-idem")).toHaveLength(1);
  });

  it("records each distinct build separately", () => {
    setBuild("sha-a");
    recordCurrentBuild(NOW);
    setBuild("sha-b");
    recordCurrentBuild(at(10));

    const shas = listDeployments().map((d) => d.sha);
    expect(shas).toContain("sha-a");
    expect(shas).toContain("sha-b");
  });

  it("keeps the newest first", () => {
    setBuild("sha-old");
    recordCurrentBuild(NOW);
    setBuild("sha-new");
    recordCurrentBuild(at(5));

    expect(listDeployments()[0].sha).toBe("sha-new");
  });
});

describe("deploymentsIn", () => {
  it("returns only what falls inside the window", () => {
    setBuild("sha-in");
    recordCurrentBuild(at(-10));
    setBuild("sha-out");
    recordCurrentBuild(at(-600));

    const found = deploymentsIn(at(-60), NOW).map((d) => d.sha);
    expect(found).toContain("sha-in");
    expect(found).not.toContain("sha-out");
  });

  it("returns nothing for an unparseable window rather than throwing", () => {
    expect(deploymentsIn("nonsense", NOW)).toEqual([]);
  });
});

describe("deployBefore", () => {
  it("finds a deployment shortly before the moment", () => {
    setBuild("sha-cause", { message: "Refactor the pricing engine" });
    recordCurrentBuild(dayAt(10, -12));

    const c = deployBefore(day(10))!;
    expect(c.deployment.sha).toBe("sha-cause");
    expect(c.minutesBefore).toBe(12);
  });

  it("ignores a deployment that came after — it cannot have caused anything", () => {
    /*
     * Offering it would invite somebody to roll back the change that was
     * fixing the problem.
     */
    setBuild("sha-after");
    recordCurrentBuild(dayAt(11, 30));

    expect(deployBefore(day(11))).toBeNull();
  });

  it("ignores a deployment too long before to be worth mentioning", () => {
    setBuild("sha-ancient");
    recordCurrentBuild(dayAt(12, -(DEPLOY_CORRELATION_MINS + 10)));

    expect(deployBefore(day(12))).toBeNull();
  });

  it("prefers the closest deployment when several are in range", () => {
    setBuild("sha-far");
    recordCurrentBuild(dayAt(13, -80));
    setBuild("sha-near");
    recordCurrentBuild(dayAt(13, -5));

    expect(deployBefore(day(13))!.deployment.sha).toBe("sha-near");
  });

  it("returns null for an unparseable moment", () => {
    expect(deployBefore("not a date")).toBeNull();
  });
});

describe("describeCorrelation", () => {
  it("reads as a coincidence, not an accusation", () => {
    setBuild("abcdef1234", { ref: "main", author: "hema", message: "Change the retry policy" });
    recordCurrentBuild(dayAt(20, -7));

    const line = describeCorrelation(deployBefore(day(20))!);

    expect(line).toContain("abcdef1");
    expect(line).toContain("main");
    expect(line).toContain("by hema");
    expect(line).toContain("7 minutes earlier");
    expect(line).toContain("Change the retry policy");
    // The correlation is real; the causation is somebody else's judgement.
    expect(line).not.toMatch(/caused|broke|because/i);
  });

  it("words a same-minute deployment readably", () => {
    setBuild("sha-same");
    recordCurrentBuild(day(21));
    expect(describeCorrelation(deployBefore(day(21))!)).toContain("in the same minute");
  });
});
