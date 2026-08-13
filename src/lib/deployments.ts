/**
 * Release annotations.
 *
 * "Did this start when we deployed?" is the first question anybody asks in an
 * incident, and nothing here could answer it. Diagnosing the Office outage
 * meant comparing minified bundle hashes between two hosts by hand, because no
 * deployment left a record anywhere a person could read.
 *
 * SERVER ONLY.
 */
import { createFileStore } from "./data-file";

export interface Deployment {
  /** Commit SHA, or a generated id when there is no git metadata. */
  id: string;
  sha: string;
  shortSha: string;
  branch: string;
  message: string;
  author: string;
  /** "production" | "preview" | "development". */
  environment: string;
  /**
   * When this build was first seen serving traffic.
   *
   * Not the build time and not the promotion time — neither is available at
   * runtime. It is within seconds of the deployment going live, because
   * something has to make a request for it to be recorded, and that is close
   * enough to correlate a spike against. Named `firstSeenAt` rather than
   * `deployedAt` so nobody reads more precision into it than it has.
   */
  firstSeenAt: string;
}

interface DeploymentsDB {
  deployments: Deployment[];
}

/*
 * Deliberately small. This is an annotation layer for charts and incidents,
 * not a deployment history — that lives in git and in the hosting provider,
 * both of which are authoritative and neither of which is this.
 */
const MAX_DEPLOYMENTS = 100;

const store = createFileStore<DeploymentsDB>("admin-deployments.json", () => ({
  deployments: [],
}));

/** What the runtime knows about the build it is part of. */
export function currentBuild(env: NodeJS.ProcessEnv = process.env): Omit<Deployment, "firstSeenAt" | "id"> | null {
  const sha = env.VERCEL_GIT_COMMIT_SHA || env.GIT_COMMIT_SHA || "";
  if (!sha) return null;

  return {
    sha,
    shortSha: sha.slice(0, 7),
    branch: env.VERCEL_GIT_COMMIT_REF || env.GIT_BRANCH || "",
    /* Trimmed to the subject line: a commit body can be several paragraphs,
       and this is rendered as a label on a chart. */
    message: (env.VERCEL_GIT_COMMIT_MESSAGE || "").split("\n")[0].slice(0, 200),
    author: env.VERCEL_GIT_COMMIT_AUTHOR_LOGIN || env.VERCEL_GIT_COMMIT_AUTHOR_NAME || "",
    environment: env.VERCEL_ENV || env.NODE_ENV || "development",
  };
}

export function listDeployments(): Deployment[] {
  return store.read().deployments;
}

/**
 * Records the running build if it has not been seen before.
 *
 * Idempotent on the sha, so calling it on every request costs one comparison
 * after the first. That is the point: there is no deploy hook to rely on, and
 * a record that depends on CI remembering to call an endpoint is a record that
 * is missing exactly when somebody changed the pipeline.
 */
export function recordCurrentBuild(now = new Date().toISOString()): Deployment | null {
  const build = currentBuild();
  if (!build) return null;

  const existing = store.read().deployments.find((d) => d.sha === build.sha);
  if (existing) return existing;

  return store.mutate((db) => {
    /* Re-checked inside the mutation: two concurrent requests after a deploy
       would both pass the check above, and a duplicated annotation puts two
       markers on the chart for one release. */
    const already = db.deployments.find((d) => d.sha === build.sha);
    if (already) return already;

    const record: Deployment = { ...build, id: build.sha, firstSeenAt: now };
    db.deployments.unshift(record);
    if (db.deployments.length > MAX_DEPLOYMENTS) {
      db.deployments.length = MAX_DEPLOYMENTS;
    }
    return record;
  });
}

/** Deployments within a window, newest first — the markers a chart draws. */
export function deploymentsIn(fromISO: string, toISO: string): Deployment[] {
  const from = Date.parse(fromISO);
  const to = Date.parse(toISO);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return [];

  return listDeployments()
    .filter((d) => {
      const t = Date.parse(d.firstSeenAt);
      return Number.isFinite(t) && t >= from && t <= to;
    })
    .sort((a, b) => b.firstSeenAt.localeCompare(a.firstSeenAt));
}

/**
 * How close the correlation has to be before it is worth mentioning.
 *
 * Ninety minutes. Long enough to cover a slow rollout or a problem that only
 * appears under load an hour later; short enough that "deployed this morning"
 * is not offered as a cause of an evening outage. A suspicion pointed at the
 * wrong change costs more time than no suspicion at all.
 */
export const DEPLOY_CORRELATION_MINS = 90;

export interface DeployCorrelation {
  deployment: Deployment;
  minutesBefore: number;
}

/**
 * The most recent deployment shortly before a moment, if there was one.
 *
 * Only looks backwards. A deployment after an incident started cannot have
 * caused it, and offering it as context invites somebody to roll back the
 * change that was fixing the problem.
 */
export function deployBefore(
  at: string,
  withinMins = DEPLOY_CORRELATION_MINS
): DeployCorrelation | null {
  const t = Date.parse(at);
  if (!Number.isFinite(t)) return null;

  let best: DeployCorrelation | null = null;
  for (const d of listDeployments()) {
    const dt = Date.parse(d.firstSeenAt);
    if (!Number.isFinite(dt) || dt > t) continue;

    const minutesBefore = Math.round((t - dt) / 60_000);
    if (minutesBefore > withinMins) continue;
    if (!best || minutesBefore < best.minutesBefore) {
      best = { deployment: d, minutesBefore };
    }
  }
  return best;
}

/** One line for an incident timeline or a notification. */
export function describeCorrelation(c: DeployCorrelation): string {
  const { deployment: d, minutesBefore } = c;
  const when = minutesBefore === 0 ? "in the same minute" : `${minutesBefore} minutes earlier`;
  const who = d.author ? ` by ${d.author}` : "";
  const subject = d.message ? ` — ${d.message}` : "";
  /* Worded as a coincidence, not a cause. The correlation is real and the
     causation is a judgement somebody else has to make with more context. */
  return `${d.shortSha} was deployed to ${d.branch || d.environment}${who} ${when}${subject}`;
}

export function isDurable(): boolean {
  return store.isDurable();
}
