// Server-side persistence for per-user console preferences that the Circuvent
// control plane does not own.
//
// The control plane owns devices, rooms, automations, scenes and telemetry. It
// does not model presentation concerns: what an individual relay channel should
// be called in this household, or which widgets a user wants on their
// dashboard. Those are persisted here, keyed by the authenticated user, so they
// follow the account across browsers and devices instead of being stranded in
// one browser's localStorage.
//
// ── Why this is database-backed ──
//
// It was not. Everything here went through `createFileStore`, which writes a
// JSON file under DATA_DIR and, when that write fails, catches the error and
// keeps going in memory for the life of the process. On Vercel that write
// always fails: the filesystem is read-only, and there is no single process
// anyway. The result was a preference store that
//
//   * lost every rename on the next cold start, and
//   * was invisible to any other lambda instance in the meantime.
//
// The console hid it well, because it paints from a localStorage cache first —
// so the browser that did the renaming kept showing the names and looked
// correct. A different browser, a private window, or the phone asked the server
// and got nothing. That is precisely the reported symptom: channels renamed on
// Android showing as "Channel 3" in Chrome, and nothing at all in incognito.
//
// The database is used when DATABASE_URL is set. The file store remains for
// local development, where it is durable and correct.
//
// SERVER ONLY — imported exclusively by /api/smarthome/prefs.

import { createFileStore } from "./data-file";
import {
  dbClearUserPrefScope,
  dbEnabled,
  dbReadUserPrefs,
  dbWriteUserPrefScope,
} from "./db";

export const SCOPES = ["channel-labels", "dashboard", "device-widgets", "profile", "ui"] as const;
export type Scope = (typeof SCOPES)[number];

export function isScope(v: string): v is Scope {
  return (SCOPES as readonly string[]).includes(v);
}

/** One user's preferences: scope -> arbitrary JSON document. */
type UserPrefs = Record<string, unknown>;

interface PrefsDb {
  /** keyed by control-plane user id */
  users: Record<string, UserPrefs>;
}

const store = createFileStore<PrefsDb>("smarthome-user-prefs.json", () => ({ users: {} }));

export async function readScope(userKey: string, scope: Scope): Promise<unknown> {
  if (dbEnabled()) {
    try {
      return (await dbReadUserPrefs(userKey))[scope] ?? null;
    } catch (e) {
      // Falling through to the file copy rather than failing the request: a
      // console that cannot reach the database should still render the names
      // it has, not reset every switch to its default.
      console.error("[user-prefs] read failed, using local copy:", e);
    }
  }
  return store.read().users[userKey]?.[scope] ?? null;
}

export async function readAll(userKey: string): Promise<UserPrefs> {
  if (dbEnabled()) {
    try {
      return await dbReadUserPrefs(userKey);
    } catch (e) {
      console.error("[user-prefs] read failed, using local copy:", e);
    }
  }
  return store.read().users[userKey] ?? {};
}

export async function writeScope(userKey: string, scope: Scope, value: unknown): Promise<unknown> {
  if (dbEnabled()) {
    // Not caught: a save that silently only reached this instance's memory is
    // the bug this module was rewritten to remove. The caller reports it.
    await dbWriteUserPrefScope(userKey, scope, value);
    return value;
  }
  return store.mutate((db) => {
    if (!db.users[userKey]) db.users[userKey] = {};
    db.users[userKey][scope] = value;
    return value;
  });
}

export async function clearScope(userKey: string, scope: Scope): Promise<boolean> {
  if (dbEnabled()) return dbClearUserPrefScope(userKey, scope);
  return store.mutate((db) => {
    if (!db.users[userKey] || !(scope in db.users[userKey])) return false;
    delete db.users[userKey][scope];
    return true;
  });
}

/**
 * True when this instance can persist beyond its own memory.
 *
 * With a database configured that is always true. Without one it depends on the
 * filesystem being writable — and the honest answer matters, because the
 * console shows it: a user whose renames are not being kept should be told,
 * rather than discovering it when a different browser shows the defaults.
 */
export function isDurable(): boolean {
  return dbEnabled() || store.isDurable();
}

// ------------------------------------------------------------------- auth ----

const CONTROL_PLANE = process.env.NEXT_PUBLIC_CONTROL_PLANE_URL || "https://api.circuvent.com";

export interface Caller {
  /** Stable storage key derived from the validated token. */
  key: string;
}

/**
 * Reads the `sub`/`uid` claim from a JWT payload **without** trusting it on its
 * own. Only called after the control plane has confirmed the token is valid.
 */
function claimKey(token: string): string | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = Buffer.from(part.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const claims = JSON.parse(json) as { sub?: unknown; uid?: unknown; id?: unknown; email?: unknown };
    const id = claims.uid ?? claims.sub ?? claims.id ?? claims.email;
    return id == null ? null : `u${String(id)}`;
  } catch {
    return null;
  }
}

/**
 * Verifies the caller by replaying their bearer token against the control
 * plane. `/rooms` is used because it is the smallest authenticated response;
 * a 401 there means the token is not valid for this account.
 *
 * We never mint our own session — the control plane stays the single source of
 * truth for identity.
 */
export async function verifyCaller(request: Request): Promise<Caller | null> {
  const auth = request.headers.get("authorization") || "";
  const m = /^Bearer\s+(\S+)$/i.exec(auth);
  if (!m) return null;
  const key = claimKey(m[1]);
  if (!key) return null;
  try {
    const res = await fetch(`${CONTROL_PLANE}/rooms`, {
      headers: { authorization: auth },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return { key };
  } catch {
    return null;
  }
}
