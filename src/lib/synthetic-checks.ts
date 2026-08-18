/**
 * Synthetic availability checks for the whole suite.
 *
 * Motivated by a real outage nothing noticed: the Office app was live, loading
 * and completely unable to sign anybody in — its frontend pointed at a
 * decommissioned API returning 503, and its socket handshake was hitting the
 * wrong service on the right host. Both had been that way for days. Every
 * check the platform ran was against itself, so everything looked fine.
 *
 * The lesson encoded here: a check against the origin you are serving from
 * tells you almost nothing. The interesting failures are the ones where the
 * page loads and the thing behind it is gone.
 */

import type { Alert } from "./anomaly-monitor";

export type CheckMethod = "GET" | "HEAD" | "POST";

export interface SyntheticCheck {
  id: string;
  /** What a person calls it. Appears in the incident title. */
  name: string;
  url: string;
  method: CheckMethod;
  /**
   * Statuses that mean "working".
   *
   * A list rather than a range, because the useful check on an authenticated
   * endpoint is that it answers 401 — that proves the route exists, the
   * process is up and the guard is running. Insisting on 2xx would mean
   * either not checking authenticated surfaces at all, or checking them with
   * a credential this has no business holding.
   */
  expectStatus: number[];
  /** Optional substring the body must contain. */
  expectBody?: string;
  /** Which team owns the incident when this fails. */
  owningTeam: string;
  enabled: boolean;
  timeoutMs?: number;
}

export interface CheckResult {
  check: SyntheticCheck;
  ok: boolean;
  status: number;
  durationMs: number;
  errorType?: string;
  /** Why it failed, in the words the incident will use. */
  reason: string;
}

export const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * The suite, as it is actually deployed.
 *
 * Each entry is a URL that was verified by hand at the time of writing, and
 * the expectation is the weakest one that still proves the service is alive.
 * A check that asserts more than it needs to becomes a false alarm the first
 * time somebody changes a heading, and a monitor that cries wolf gets muted.
 */
export function defaultChecks(): SyntheticCheck[] {
  const web = (id: string, name: string, url: string, owningTeam = "Web"): SyntheticCheck => ({
    id,
    name,
    url,
    method: "GET",
    expectStatus: [200],
    owningTeam,
    enabled: true,
  });

  return [
    web("web-prod", "circuvent.com", "https://circuvent.com/api/health", "Platform"),
    web("web-dev", "dev.circuvent.com", "https://dev.circuvent.com/api/health", "Platform"),
    web("mail-prod", "mail.circuvent.com", "https://mail.circuvent.com/api/health", "Platform"),
    web("mail-dev", "dev.mail.circuvent.com", "https://dev.mail.circuvent.com/api/health", "Platform"),
    /*
     * Office was retired, so its three checks are gone with it — the web bundle,
     * the API behind the proxy, and the realtime socket.
     *
     * Monitoring a service nobody runs any more produces exactly one outcome: a
     * red row, or a page, for something that is supposed to be off. The first
     * time that happens somebody investigates; the second time they learn to
     * ignore the board, which costs more than the check ever saved.
     *
     * Worth noting what those checks knew that a simpler one would not, because
     * the same trap applies to whatever replaces them: the web check passed
     * throughout the outage that motivated it, since a static bundle serves fine
     * however dead its API is. The API check is the one that would have caught
     * it — and even that reports "ok" from a process whose database has been
     * deleted, because its health endpoint never asked the database anything.
     */
  ];
}

/** Runs one check. Never throws: a failed check is a result, not an error. */
export async function runCheck(check: SyntheticCheck, now = Date.now()): Promise<CheckResult> {
  const controller = new AbortController();
  const timeout = check.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeout);

  let status = 0;
  let errorType: string | undefined;
  let body = "";

  try {
    const res = await fetch(check.url, {
      method: check.method,
      cache: "no-store",
      signal: controller.signal,
      redirect: "follow",
    });
    status = res.status;
    if (check.expectBody) {
      /* Only read the body when something depends on it. Downloading a page
         on every check to throw it away costs the monitored host bandwidth. */
      body = await res.text();
    }
  } catch (e) {
    /*
     * A timeout and a refused connection are different faults — one says the
     * host is there and not answering, the other that it is gone — and the
     * label is the first thing anybody reads at three in the morning.
     */
    errorType = e instanceof Error && e.name === "AbortError" ? "Timeout" : "NetworkError";
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - now;

  if (errorType) {
    return {
      check,
      ok: false,
      status: 0,
      durationMs,
      errorType,
      reason:
        errorType === "Timeout"
          ? `did not answer within ${timeout}ms`
          : "could not be reached at all",
    };
  }

  if (!check.expectStatus.includes(status)) {
    return {
      check,
      ok: false,
      status,
      durationMs,
      errorType: `HTTP ${status}`,
      reason: `answered ${status}; expected ${check.expectStatus.join(" or ")}`,
    };
  }

  if (check.expectBody && !body.includes(check.expectBody)) {
    return {
      check,
      ok: false,
      status,
      durationMs,
      errorType: "BodyMismatch",
      /* The body is not quoted back: it may be a page, and an incident title
         is not the place for one. */
      reason: `answered ${status} but the body did not contain "${check.expectBody}"`,
    };
  }

  return { check, ok: true, status, durationMs, reason: `answered ${status}` };
}

/**
 * Runs every enabled check, concurrently.
 *
 * Sequentially, a suite of ten checks with a ten-second timeout takes up to a
 * hundred seconds, which exceeds the request budget of the scheduler that
 * calls this — so a single dead host would stop the rest from being checked
 * at all, and the outage would look like silence.
 */
export async function runChecks(checks: SyntheticCheck[]): Promise<CheckResult[]> {
  const enabled = checks.filter((c) => c.enabled);
  return Promise.all(enabled.map((c) => runCheck(c, Date.now())));
}

/**
 * Turns failures into the Alert shape the ICM bridge already understands.
 *
 * Emitting alerts rather than filing directly means synthetic checks inherit
 * every rule that took real thought: one incident per fingerprint, no Sev0
 * from a machine, and no closing an incident somebody has picked up. The
 * fingerprint is the check id, so a host that is down for three days is one
 * incident and not seventy-two.
 */
export function checksToAlerts(results: CheckResult[], now: string): Alert[] {
  return results
    .filter((r) => !r.ok)
    .map((r) => ({
      fingerprint: `synthetic:${r.check.id}`,
      /*
       * Unreachable is critical; a wrong status is a warning.
       *
       * A service answering the wrong thing is often a deploy that needs
       * rolling back during business hours, while one that answers nothing is
       * gone. Waking somebody for the first devalues the second.
       */
      severity: r.errorType === "Timeout" || r.errorType === "NetworkError" ? "critical" : "warning",
      title: `${r.check.name} is failing its availability check`,
      detail: `${r.check.method} ${r.check.url} ${r.reason}.`,
      deviceIds: [],
      evidence: {
        check: r.check.id,
        url: r.check.url,
        status: r.status,
        durationMs: r.durationMs,
        expected: r.check.expectStatus.join(","),
      },
      suggestion: "Open Insights → Availability for this endpoint's history.",
      state: "open" as const,
      firstSeenAt: now,
      lastSeenAt: now,
      occurrences: 1,
    }));
}

/** The telemetry events a sweep records, so availability has a history. */
export function checksToTelemetry(results: CheckResult[]) {
  return results.map((r) => ({
    kind: "dependency" as const,
    target: r.check.id,
    path: new URL(r.check.url).pathname || "/",
    method: r.check.method,
    status: r.status,
    ok: r.ok,
    durationMs: r.durationMs,
    ...(r.errorType ? { errorType: r.errorType, errorMessage: r.reason } : {}),
  }));
}
