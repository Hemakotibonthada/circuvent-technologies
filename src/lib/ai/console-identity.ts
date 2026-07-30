/**
 * Persona derivation for callers who authenticate against the control plane
 * rather than the website.
 *
 * The website decides "customer" from its own account cookie. The mobile app
 * has no such cookie — it signs in to the control plane and holds a console
 * token. Without this module a mobile user with a perfectly valid session was
 * treated as a guest, so the assistant was never offered `list_devices` or
 * `home_analysis` and could not answer a single question about their own home.
 *
 * A token is never trusted because it is present, only because the control
 * plane accepted it. `GET /admin/me` settles all three cases in one request:
 *
 *   200 -> valid token, user is an administrator
 *   403 -> valid token, user is an ordinary customer
 *   401 -> token is invalid or expired; caller stays a guest
 *
 * Any other status (or a network failure) is treated as "cannot tell", which
 * deliberately fails closed to guest rather than guessing upward.
 *
 * SERVER ONLY.
 */

import { logger } from "../logger";
import type { Persona } from "./types";

const CONTROL_PLANE_URL = (
  process.env.CONTROL_PLANE_URL ||
  process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ||
  "https://api.circuvent.com"
).replace(/\/$/, "");

const TIMEOUT_MS = 5000;

export type ConsoleIdentity = "admin" | "customer" | "unknown";

export async function resolveConsoleIdentity(token: string | undefined): Promise<ConsoleIdentity> {
  if (!token || typeof token !== "string" || token.trim() === "") return "unknown";

  try {
    const res = await fetch(`${CONTROL_PLANE_URL}/admin/me`, {
      headers: { authorization: `Bearer ${token.trim()}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (res.status === 200) return "admin";
    if (res.status === 403) return "customer";
    if (res.status === 401) return "unknown";

    logger.warn("ai.console_identity_unexpected", { status: res.status });
    return "unknown";
  } catch {
    // A control-plane outage must not silently promote or demote anyone.
    logger.warn("ai.console_identity_unreachable", {});
    return "unknown";
  }
}

/** Never lowers an already-established persona — the website session still counts. */
export function mergePersona(current: Persona, fromConsole: ConsoleIdentity): Persona {
  if (current === "admin" || fromConsole === "admin") return "admin";
  if (current === "customer" || fromConsole === "customer") return "customer";
  return "guest";
}
