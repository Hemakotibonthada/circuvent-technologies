/**
 * Persistence for anomaly alerts.
 *
 * The monitor in anomaly-monitor.ts is pure: it takes the previous alerts and
 * the current findings and returns the next state. This is the part that
 * remembers, keyed per account so one household's dead hub is not another's.
 *
 * SERVER ONLY.
 */
import { createHash } from "node:crypto";
import { createFileStore } from "./data-file";
import type { Alert } from "./anomaly-monitor";

interface AlertsDB {
  /** accountKey -> alerts */
  byAccount: Record<string, Alert[]>;
  /** accountKey -> ISO of the last completed sweep, so a caller can tell staleness from silence. */
  lastSweep: Record<string, string>;
}

const store = createFileStore<AlertsDB>("smarthome-alerts.json", () => ({ byAccount: {}, lastSweep: {} }));

/**
 * A stable key for whoever this console token belongs to.
 *
 * The control plane has no identity endpoint — /me, /auth/me, /account and
 * /users/me all return 404 — so the token itself has to answer the question.
 * When it is a JWT the subject claim is the right key, because it survives the
 * token being reissued and the user keeps their alert history. When it is not,
 * a hash of the token is the honest fallback: it scopes correctly, and the
 * only cost is that history restarts when the token rotates.
 *
 * The token is never stored, only its digest.
 */
export function accountKey(consoleToken: string): string {
  const token = String(consoleToken || "").trim();
  if (!token) return "anonymous";

  const parts = token.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as Record<string, unknown>;
      const subject = payload.sub ?? payload.userId ?? payload.uid ?? payload.email;
      if (subject) return `u:${createHash("sha256").update(String(subject)).digest("hex").slice(0, 32)}`;
    } catch {
      // Not a JWT after all, or an unexpected payload — fall through.
    }
  }
  return `t:${createHash("sha256").update(token).digest("hex").slice(0, 32)}`;
}

export function readAlerts(key: string): Alert[] {
  return store.read().byAccount[key] ?? [];
}

export function writeAlerts(key: string, alerts: Alert[]): void {
  store.mutate((db) => {
    db.byAccount[key] = alerts;
    db.lastSweep[key] = new Date().toISOString();
    return alerts;
  });
}

export function lastSweepAt(key: string): string | null {
  return store.read().lastSweep[key] ?? null;
}
