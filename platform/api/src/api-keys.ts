import crypto from "node:crypto";
import { pool } from "./db";

/**
 * Developer API keys.
 *
 * WHY THESE EXIST AT ALL
 *
 * Before this module the only credential the platform issued was a login JWT.
 * That is the wrong instrument for a third party building against us:
 *
 *   - it expires in JWT_EXPIRES_IN (30 days), so every integration breaks on a
 *     schedule and the only fix is to re-enter a human's password;
 *   - it is minted from an email + password, so a developer wiring up a server
 *     would have to store the account password to keep it alive;
 *   - "sign out everywhere" bumps token_epoch, which would silently kill an
 *     unrelated production integration;
 *   - it carries every permission the account has, including provisioning
 *     devices and reading the activity feed, with no way to narrow it.
 *
 * An API key is long-lived, independently revocable, and scoped.
 *
 * WHY SHA-256 AND NOT BCRYPT
 *
 * Device claim keys and passwords use bcrypt because they are low-entropy or
 * human-chosen and the per-row salt is what makes a stolen table useless. An
 * API key is 256 bits from the CSPRNG, so there is no dictionary to attack and
 * the salt buys nothing. What it would cost is the lookup: bcrypt's per-row
 * salt means you cannot SELECT ... WHERE hash = $1, so authenticating would
 * become a full table scan plus a bcrypt compare per row. This is the same
 * trade-off, for the same reason, that refresh_tokens already documents.
 */

/** Scopes a key may hold. Anything not listed here is rejected at creation. */
export const API_SCOPES = [
  "devices:read",
  "devices:control",
  "devices:write",
  "telemetry:read",
  "rooms:read",
  "scenes:read",
  "scenes:run",
  "automations:read",
  "automations:write",
  "events:read",
  /*
   * Plate data is its own scope, not part of `telemetry:read`.
   *
   * A telemetry key reads power and water level. A plate log is a record of
   * which vehicles came to a property and when — about people who never
   * agreed to anything and are not the account holder. Granting that silently
   * alongside a meter reading is exactly the kind of over-broad credential
   * the whole scope system exists to prevent, so a key must be given it
   * deliberately.
   */
  "plates:read",
  "plates:write",
] as const;

export type ApiScope = (typeof API_SCOPES)[number];

const SCOPE_SET = new Set<string>(API_SCOPES);

export function isApiScope(s: string): s is ApiScope {
  return SCOPE_SET.has(s);
}

/**
 * Human-readable descriptions, exported so the console and the docs render the
 * same text as the server enforces rather than a copy that can drift.
 */
export const SCOPE_DESCRIPTIONS: Record<ApiScope, string> = {
  "devices:read": "List devices and read their current state.",
  "devices:control": "Send commands to devices — switch relays, set levels, run actions.",
  "devices:write": "Rename devices, assign rooms, and set favourites.",
  "telemetry:read": "Read historical telemetry and energy series.",
  "rooms:read": "List rooms.",
  "scenes:read": "List scenes and their actions.",
  "scenes:run": "Activate a scene.",
  "automations:read": "List automation rules.",
  "automations:write": "Create, update, enable, disable and delete automation rules.",
  "events:read": "Read the event and activity feed.",
  "plates:read": "Read ANPR number-plate reads and the allow / deny / watch list.",
  "plates:write": "Add, change and remove entries on the plate allow / deny / watch list.",
};

/** Environment marker in the key body. Both are real keys against real data. */
export type KeyEnv = "live" | "test";

const KEY_RE = /^cvk_(live|test)_[A-Za-z0-9_-]{43}$/;

export interface NewKey {
  /** Full secret. Returned exactly once, at creation, and never stored. */
  secret: string;
  /** Non-secret display prefix, e.g. `cvk_live_A1b2C3d4`. */
  prefix: string;
  hash: string;
}

/** Mints a key. 32 bytes of CSPRNG output — 256 bits, base64url, 43 chars. */
export function generateApiKey(env: KeyEnv = "live"): NewKey {
  const secret = `cvk_${env}_${crypto.randomBytes(32).toString("base64url")}`;
  return { secret, prefix: displayPrefix(secret), hash: hashApiKey(secret) };
}

/**
 * The part of a key that is safe to store and show, so a developer can tell
 * two keys apart in a list without us keeping anything that can authenticate.
 */
export function displayPrefix(secret: string): string {
  return secret.slice(0, 17);
}

export function hashApiKey(secret: string): string {
  return crypto.createHash("sha256").update(secret).digest("hex");
}

export function looksLikeApiKey(v: string): boolean {
  return KEY_RE.test(v);
}

export interface ApiKeyRecord {
  id: number;
  ownerId: number;
  name: string;
  env: KeyEnv;
  scopes: ApiScope[];
  /** Empty means server-to-server only — see originAllowed. */
  allowedOrigins: string[];
}

interface KeyRow {
  id: string | number;
  owner_id: string | number;
  name: string;
  env: string;
  scopes: string[] | null;
  allowed_origins: string[] | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  blocked: boolean;
}

/**
 * Verified keys are memoised briefly.
 *
 * Authentication runs on every request, so an unconditional Postgres round-trip
 * here is pure added latency on the command hot path — the same argument
 * ownership.ts and sessions.ts already make. Negative results are never cached,
 * so a newly created key works immediately.
 *
 * SECURITY: revocation must call invalidateKeyCache, or a revoked key keeps
 * working until the entry expires. The cache is process-local, so scaling the
 * API past one replica requires moving this to Redis or dropping the TTL to
 * zero — invalidation does not cross process boundaries.
 */
const keyCache = new Map<string, { rec: ApiKeyRecord; expires: number }>();
export const KEY_CACHE_TTL_MS = 5_000;

export function invalidateKeyCache(hash?: string): void {
  if (hash) keyCache.delete(hash);
  else keyCache.clear();
}

export type KeyFailure = "invalid" | "expired" | "revoked" | "blocked";

export interface KeyVerdict {
  ok: boolean;
  key?: ApiKeyRecord;
  reason?: KeyFailure;
}

/**
 * Resolves a presented secret to a live key.
 *
 * The account's own `blocked` flag is joined in deliberately: disabling an
 * account has to stop its keys too, or blocking somebody would leave every
 * integration they ever created still opening their locks.
 */
export async function verifyApiKey(secret: string): Promise<KeyVerdict> {
  if (!looksLikeApiKey(secret)) return { ok: false, reason: "invalid" };
  const hash = hashApiKey(secret);

  const hit = keyCache.get(hash);
  if (hit && Date.now() < hit.expires) {
    void touch(hash);
    return { ok: true, key: hit.rec };
  }

  const { rows } = await pool.query<KeyRow>(
    `SELECT k.id, k.owner_id, k.name, k.env, k.scopes, k.allowed_origins,
            k.expires_at, k.revoked_at, u.blocked
       FROM api_keys k
       JOIN users u ON u.id = k.owner_id
      WHERE k.token_hash = $1`,
    [hash]
  );
  const row = rows[0];
  if (!row) return { ok: false, reason: "invalid" };
  if (row.revoked_at) return { ok: false, reason: "revoked" };
  if (row.expires_at && row.expires_at.getTime() <= Date.now()) return { ok: false, reason: "expired" };
  if (row.blocked) return { ok: false, reason: "blocked" };

  const rec: ApiKeyRecord = {
    id: Number(row.id),
    ownerId: Number(row.owner_id),
    name: row.name,
    env: row.env === "test" ? "test" : "live",
    scopes: (row.scopes ?? []).filter(isApiScope),
    allowedOrigins: row.allowed_origins ?? [],
  };
  keyCache.set(hash, { rec, expires: Date.now() + KEY_CACHE_TTL_MS });
  void touch(hash);
  return { ok: true, key: rec };
}

/**
 * Records that a key was used, at most once a minute per key.
 *
 * "Last used" is what lets somebody retire a key they are no longer sure
 * about, so it has to be recorded — but writing a row on every request would
 * put a Postgres UPDATE in front of every command. Throttling in-process keeps
 * the signal (accurate to the minute, which is all anyone reads it at) without
 * the write amplification.
 */
const lastTouch = new Map<string, number>();
const TOUCH_INTERVAL_MS = 60_000;

async function touch(hash: string): Promise<void> {
  const now = Date.now();
  const prev = lastTouch.get(hash) ?? 0;
  if (now - prev < TOUCH_INTERVAL_MS) return;
  lastTouch.set(hash, now);
  try {
    await pool.query(
      `UPDATE api_keys SET last_used_at = now(), request_count = request_count + 1 WHERE token_hash = $1`,
      [hash]
    );
  } catch {
    /* usage stats must never fail a request */
  }
}

export function hasScope(key: ApiKeyRecord, scope: ApiScope): boolean {
  return key.scopes.includes(scope);
}

/**
 * Decides whether a key may be used from a browser at `origin`.
 *
 * WHAT THIS DOES AND DOES NOT GUARANTEE
 *
 * The Origin header is set by the browser and cannot be forged by page
 * JavaScript, so this genuinely stops someone embedding a key they scraped
 * from your site into a page on their own domain. It is NOT a defence against
 * a server-side caller: curl can send any Origin it likes. A key whose secret
 * has leaked is compromised regardless of this list.
 *
 * That is why a key with no origins registered rejects browser requests
 * outright rather than allowing them: a key intended for a server should never
 * be in a browser, and silently accepting it there would turn a copy-paste
 * mistake into a public credential. The documentation says this in the same
 * words — see docs "Using a key from the browser".
 */
export function originAllowed(key: ApiKeyRecord, origin: string | undefined): boolean {
  if (!origin) return true; // no Origin header — a server-side caller
  if (!key.allowedOrigins.length) return false;
  return key.allowedOrigins.includes(origin);
}

/** Normalises a user-entered origin to scheme://host[:port], or null. */
export function normalizeOrigin(raw: string): string | null {
  try {
    const u = new URL(raw.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    // http is only sensible for local development; allowing it on a public
    // host would advertise a key over a link anyone on the path can read.
    if (u.protocol === "http:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return null;
    return u.origin;
  } catch {
    return null;
  }
}
