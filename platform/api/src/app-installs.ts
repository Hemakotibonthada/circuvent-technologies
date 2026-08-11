import { pool } from "./db";

/**
 * The app installs signed in to each account.
 *
 * Support and security both need to answer "what is on this account, and from
 * where": an old build that cannot be reproduced, a sign-in from a country the
 * user has never visited, a phone they sold last year. None of that was
 * answerable before — `push_tokens` knew the platform and nothing else.
 *
 * Two things shape this module.
 *
 * The first is that it runs on the authenticated hot path, so it must not cost
 * a write per request. `recordSeen` throttles: an install that was seen a
 * minute ago is not written again. That turns a per-request UPDATE into roughly
 * one every ten minutes per phone, which is the difference between a useful
 * feature and a self-inflicted load problem.
 *
 * The second is what it deliberately does not collect. There are no
 * coordinates. The app holds location permission for the weather, and using it
 * to report a user's whereabouts to staff is a different purpose from the one
 * they granted — which is precisely what purpose limitation under the DPDP Act
 * and GDPR forbids. City and country are filled from the reverse proxy's own IP
 * geolocation where it supplies one, which is what every "recent sign-ins"
 * screen in the industry shows, and are left empty rather than guessed where it
 * does not.
 */

export interface InstallFacts {
  installId: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  model: string;
  ip: string;
  city: string;
  country: string;
}

export interface AppInstall {
  id: number;
  userId: number;
  installId: string;
  platform: string;
  osVersion: string;
  appVersion: string;
  model: string;
  lastIp: string;
  lastCity: string;
  lastCountry: string;
  firstSeen: string;
  lastSeen: string;
  revokedAt: string | null;
}

/** Trim and cap. Every one of these arrives in a header the client controls. */
const clean = (v: unknown, max = 64): string =>
  String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);

type Headers = { get(name: string): string | null | undefined } | Record<string, string | string[] | undefined>;

function header(h: Headers, name: string): string {
  if (typeof (h as { get?: unknown }).get === "function") {
    return String((h as { get(n: string): string | null }).get(name) ?? "");
  }
  const v = (h as Record<string, string | string[] | undefined>)[name.toLowerCase()];
  return Array.isArray(v) ? String(v[0] ?? "") : String(v ?? "");
}

/**
 * The client's address.
 *
 * `x-forwarded-for` is a list appended to by each proxy, so the client is the
 * first entry — the last is our own reverse proxy. Reading the wrong end gives
 * every user the same address, which looks like it works right up to the moment
 * somebody tries to use it.
 *
 * It is also client-controllable on the first hop, so this is evidence rather
 * than proof, and nothing security-critical should depend on it alone.
 */
export function clientIp(h: Headers, socketAddr?: string): string {
  const fwd = header(h, "x-forwarded-for");
  const first = fwd.split(",")[0]?.trim();
  const ip = first || header(h, "x-real-ip") || socketAddr || "";
  /* IPv4-mapped IPv6 (::ffff:1.2.3.4) reads as a different address from the
     same client over IPv4, which would show as two installs. */
  return clean(ip.replace(/^::ffff:/i, ""), 64);
}

/**
 * Geolocation, only where the edge already did it.
 *
 * Cloudflare, Vercel and a suitably configured nginx all inject these. Nothing
 * here looks anything up: an invented city is worse than an empty one, because
 * "signed in from Mumbai" is the sort of thing somebody acts on.
 */
export function geoFrom(h: Headers): { city: string; country: string } {
  const city = header(h, "cf-ipcity") || header(h, "x-vercel-ip-city") || header(h, "x-geo-city");
  const country = header(h, "cf-ipcountry") || header(h, "x-vercel-ip-country") || header(h, "x-geo-country");
  return {
    /* Vercel percent-encodes city names with spaces. */
    city: clean(safeDecode(city), 64),
    country: clean(country, 8).toUpperCase(),
  };
}

function safeDecode(v: string): string {
  try {
    return decodeURIComponent(v);
  } catch {
    return v;
  }
}

/** Everything worth recording about the caller, from its headers alone. */
export function factsFrom(h: Headers, socketAddr?: string): InstallFacts | null {
  const installId = clean(header(h, "x-cv-install"), 64);
  /* No install id means this is not the app — a browser, a curl, the console.
     Recording those as installs would fill the table with things nobody can
     act on. */
  if (!installId) return null;

  const geo = geoFrom(h);
  return {
    installId,
    platform: clean(header(h, "x-cv-platform"), 16).toLowerCase(),
    osVersion: clean(header(h, "x-cv-os"), 32),
    appVersion: clean(header(h, "x-cv-app"), 32),
    model: clean(header(h, "x-cv-model"), 64),
    ip: clientIp(h, socketAddr),
    city: geo.city,
    country: geo.country,
  };
}

/*
 * How stale a row may be before it is written again. Ten minutes keeps
 * "last seen" useful for support without turning every API call into an UPDATE.
 */
export const SEEN_THROTTLE_MS = 10 * 60_000;

const lastWrite = new Map<string, number>();

/** True when this install is due a write. Exported so the throttle is testable. */
export function isDue(key: string, now = Date.now(), throttleMs = SEEN_THROTTLE_MS): boolean {
  const prev = lastWrite.get(key);
  if (prev !== undefined && now - prev < throttleMs) return false;
  lastWrite.set(key, now);
  return true;
}

/** Forget the throttle — for tests, and after a revoke so the next call writes. */
export function resetThrottle(key?: string): void {
  if (key) lastWrite.delete(key);
  else lastWrite.clear();
}

/**
 * Records that an install was seen.
 *
 * Upsert on (user, install): one phone stays one row across sign-outs and
 * reinstalls of the same build, because `install_id` is generated by the app
 * and persists. Fire-and-forget by design — an authenticated request must not
 * fail because a bookkeeping write did.
 */
export async function recordSeen(userId: number, facts: InstallFacts): Promise<void> {
  const key = `${userId}:${facts.installId}`;
  if (!isDue(key)) return;

  try {
    await pool.query(
      `INSERT INTO app_installs
         (user_id, install_id, platform, os_version, app_version, model, last_ip, last_city, last_country)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (user_id, install_id) DO UPDATE SET
         platform     = EXCLUDED.platform,
         os_version   = EXCLUDED.os_version,
         app_version  = EXCLUDED.app_version,
         model        = EXCLUDED.model,
         last_ip      = EXCLUDED.last_ip,
         /* Keep the last known city when this hop had no geo headers, rather
            than blanking a good answer with an empty one. */
         last_city    = COALESCE(NULLIF(EXCLUDED.last_city, ''), app_installs.last_city),
         last_country = COALESCE(NULLIF(EXCLUDED.last_country, ''), app_installs.last_country),
         last_seen    = now(),
         revoked_at   = NULL`,
      [
        userId,
        facts.installId,
        facts.platform,
        facts.osVersion,
        facts.appVersion,
        facts.model,
        facts.ip,
        facts.city,
        facts.country,
      ]
    );
  } catch (err) {
    /* Never fail the caller's request over bookkeeping. */
    console.error("[app-installs] recordSeen failed", err);
  }
}

const ROW = `id, user_id AS "userId", install_id AS "installId", platform,
             os_version AS "osVersion", app_version AS "appVersion", model,
             last_ip AS "lastIp", last_city AS "lastCity", last_country AS "lastCountry",
             first_seen AS "firstSeen", last_seen AS "lastSeen", revoked_at AS "revokedAt"`;

/** One account's installs, newest activity first. */
export async function listForUser(userId: number): Promise<AppInstall[]> {
  const { rows } = await pool.query<AppInstall>(
    `SELECT ${ROW} FROM app_installs WHERE user_id = $1 ORDER BY last_seen DESC`,
    [userId]
  );
  return rows;
}

export interface AdminInstallRow extends AppInstall {
  email: string;
  name: string;
}

/** Every install, for the admin console. */
export async function listAll(opts: { limit?: number; platform?: string; q?: string } = {}): Promise<AdminInstallRow[]> {
  const limit = Math.min(1000, Math.max(1, Math.round(opts.limit ?? 200)));
  const params: unknown[] = [];
  const where: string[] = [];

  if (opts.platform) {
    params.push(opts.platform.toLowerCase());
    where.push(`i.platform = $${params.length}`);
  }
  if (opts.q) {
    params.push(`%${opts.q.toLowerCase()}%`);
    const p = `$${params.length}`;
    where.push(
      `(LOWER(u.email) LIKE ${p} OR LOWER(u.name) LIKE ${p} OR LOWER(i.model) LIKE ${p} OR i.last_ip LIKE ${p})`
    );
  }
  params.push(limit);

  const { rows } = await pool.query<AdminInstallRow>(
    `SELECT ${ROW.replace(/\b(id|user_id|install_id|platform|os_version|app_version|model|last_ip|last_city|last_country|first_seen|last_seen|revoked_at)\b/g, "i.$1")},
            u.email, u.name
       FROM app_installs i
       JOIN users u ON u.id = i.user_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY i.last_seen DESC
      LIMIT $${params.length}`,
    params
  );
  return rows;
}

/**
 * Marks an install as revoked.
 *
 * This is a record, not an eviction: the token is what grants access, and
 * ending a session means bumping the account's token epoch. The two are
 * separate on purpose — revoking one phone should not sign out the others, and
 * the caller decides which it wants.
 */
export async function markRevoked(userId: number, installId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE app_installs SET revoked_at = now() WHERE user_id = $1 AND install_id = $2 AND revoked_at IS NULL`,
    [userId, installId]
  );
  resetThrottle(`${userId}:${installId}`);
  return (rowCount ?? 0) > 0;
}

/** Headline counts for the admin overview. */
export async function stats(): Promise<{
  total: number;
  android: number;
  ios: number;
  activeDay: number;
  versions: { appVersion: string; n: number }[];
}> {
  const { rows } = await pool.query<{
    total: string;
    android: string;
    ios: string;
    active_day: string;
  }>(
    `SELECT COUNT(*)::text total,
            COUNT(*) FILTER (WHERE platform = 'android')::text android,
            COUNT(*) FILTER (WHERE platform = 'ios')::text ios,
            COUNT(*) FILTER (WHERE last_seen > now() - interval '1 day')::text active_day
       FROM app_installs`
  );
  const { rows: vers } = await pool.query<{ appVersion: string; n: string }>(
    `SELECT app_version AS "appVersion", COUNT(*)::text n
       FROM app_installs WHERE app_version <> ''
       GROUP BY app_version ORDER BY COUNT(*) DESC LIMIT 10`
  );
  const r = rows[0];
  return {
    total: Number(r?.total ?? 0),
    android: Number(r?.android ?? 0),
    ios: Number(r?.ios ?? 0),
    activeDay: Number(r?.active_day ?? 0),
    versions: vers.map((v) => ({ appVersion: v.appVersion, n: Number(v.n) })),
  };
}
