/**
 * Turning an API failure into something an operator can act on.
 *
 * WHY THIS FILE EXISTS
 *
 * The Safety tab once showed a red banner reading **"Not found"**. That string
 * is the control plane's own terminal 404 body, passed straight through to the
 * screen, and it is worse than useless: it names no thing that was not found,
 * suggests the aircraft or the settings are missing, and gives no next step. An
 * hour went into hunting a routing bug before anyone checked what the control
 * plane was actually running — a build 68 commits old, from before the drone
 * API existed.
 *
 * The distinction that matters, and that the raw string destroys:
 *
 *   404 on an endpoint that should always exist  → this control plane is older
 *                                                  than this console
 *   404 from a handler that ran                  → the thing really is missing
 *   status 0                                     → the control plane is
 *                                                  unreachable
 *
 * The console and the control plane are deployed separately — Vercel and a VM —
 * so a console newer than its API is a normal, recurring state, not an
 * exceptional one. It deserves a sentence that says so.
 *
 * `drone-routes.test.ts` holds the other half of this contract: every
 * documented path must resolve, and an unknown one must still 404, so the
 * status code stays a reliable signal.
 */

export interface ApiFailure {
  ok: boolean;
  status: number;
  data: unknown;
}

/** The message the server sent, if it sent one. */
function serverMessage(data: unknown): string | null {
  if (data && typeof data === "object" && "error" in data) {
    const e = (data as { error?: unknown }).error;
    if (typeof e === "string" && e.trim()) return e.trim();
  }
  return null;
}

/**
 * A human sentence for a failed request.
 *
 * `subject` names what was being loaded, in lower case, so it reads inside a
 * sentence: "Could not load the flight log."
 */
export function describeFailure(r: ApiFailure, subject: string): string {
  if (r.status === 0) {
    return "Cannot reach the control plane. Check your connection, or whether the server is running.";
  }

  if (r.status === 404) {
    const msg = serverMessage(r.data);
    /*
     * "Not found" is the terminal handler — no route matched, so no drone
     * endpoint exists on this control plane at all. Any other 404 came from a
     * handler that ran and made a decision ("No such aircraft"), and that
     * message is worth showing as-is.
     */
    if (!msg || msg.toLowerCase() === "not found") {
      return (
        "This control plane does not have the drone API yet. It is running a build older than " +
        "this console — deploy the control plane (git pull && docker compose up -d --build) and " +
        "reload."
      );
    }
    return msg;
  }

  if (r.status === 401 || r.status === 403) {
    return "You are not signed in, or this account cannot see these aircraft.";
  }

  if (r.status === 502 || r.status === 503 || r.status === 504) {
    return "The control plane is not responding. It may be restarting.";
  }

  return serverMessage(r.data) ?? `Could not load ${subject}.`;
}

/**
 * True when the failure means "this control plane predates the feature".
 *
 * Lets a panel show guidance rather than an error, since nothing is broken and
 * there is nothing to retry until somebody deploys.
 */
export function isUnsupported(r: ApiFailure): boolean {
  if (r.status !== 404) return false;
  const msg = serverMessage(r.data);
  return !msg || msg.toLowerCase() === "not found";
}
