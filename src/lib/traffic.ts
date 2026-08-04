import crypto from "node:crypto";

/**
 * Traffic analytics — the pure parts.
 *
 * Kept free of database and request objects so the rules that matter (what a
 * path collapses to, how a visitor is identified) can be tested directly
 * rather than through an HTTP round-trip.
 */

/* ------------------------------------------------------------------ */
/* Path normalisation                                                  */
/* ------------------------------------------------------------------ */

/**
 * Dynamic segments, collapsed to a placeholder.
 *
 * WHY THIS IS NOT OPTIONAL
 *
 * The path arrives from the client and is used as a grouping key. Left raw,
 * every product slug, order number and blog post becomes its own row, and
 * anyone can mint unlimited distinct paths by requesting /anything?x=1 in a
 * loop. That is an unbounded-cardinality write amplifier pointed at our own
 * database — the "top pages" list becomes useless long before the disk does.
 *
 * Collapsing to /shop/[slug] keeps the report readable and the key space
 * bounded by the number of routes, which is a number we control.
 */
const DYNAMIC_ROUTES: { test: RegExp; as: string }[] = [
  { test: /^\/shop\/invoice\/[^/]+$/, as: "/shop/invoice/[orderNo]" },
  { test: /^\/shop\/[^/]+$/, as: "/shop/[slug]" },
  { test: /^\/blog\/[^/]+$/, as: "/blog/[slug]" },
  { test: /^\/projects\/[^/]+$/, as: "/projects/[id]" },
  { test: /^\/careers\/[^/]+$/, as: "/careers/[id]" },
  { test: /^\/domains\/[^/]+$/, as: "/domains/[slug]" },
  { test: /^\/case-studies\/[^/]+$/, as: "/case-studies/[slug]" },
  { test: /^\/smarthome\/device\/[^/]+$/, as: "/smarthome/device/[id]" },
];

/** Longest path we will store. Anything longer is a probe, not a page. */
const MAX_PATH = 128;

/**
 * Reduces a client-supplied path to a bounded, groupable route key.
 *
 * Returns null for anything that is not a page view we should count — a
 * missing value, an absolute URL pointing somewhere else, an asset, or a path
 * so long it cannot be a real route.
 */
export function normalizePath(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  let p = raw.trim();
  if (!p) return null;

  // Accept a full URL only if we can reduce it to a path; a client sending
  // https://evil.example/x must not create a row labelled with that host.
  if (/^https?:\/\//i.test(p)) {
    try {
      p = new URL(p).pathname;
    } catch {
      return null;
    }
  }

  // Query and hash are navigation state, not identity. Keeping them would
  // reintroduce the unbounded cardinality the route table exists to prevent.
  p = p.split("?")[0].split("#")[0];

  if (!p.startsWith("/")) return null;
  if (p.length > MAX_PATH) return null;

  // Control characters would corrupt a log line or a CSV export.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(p)) return null;

  // Assets and API calls are not page views.
  if (/^\/(api|_next|favicon|robots\.txt|sitemap\.xml)/.test(p)) return null;
  if (/\.(png|jpe?g|gif|webp|avif|svg|ico|css|js|map|woff2?|txt|xml|json)$/i.test(p)) return null;

  // Trailing slash is the same page. "/" itself stays.
  if (p.length > 1 && p.endsWith("/")) p = p.slice(0, -1);

  for (const r of DYNAMIC_ROUTES) {
    if (r.test.test(p)) return r.as;
  }

  // Anything with more segments than our deepest real route is a scan.
  if (p.split("/").length > 6) return null;

  return p;
}

/* ------------------------------------------------------------------ */
/* Referrer                                                            */
/* ------------------------------------------------------------------ */

/**
 * Reduces a referrer to its host, or null for direct traffic.
 *
 * Only the host is kept. A full referrer URL can carry a search query, a
 * session token or an internal path from another site — none of which we
 * need to answer "where did this visit come from", and all of which we would
 * then be responsible for storing.
 */
export function normalizeReferrer(raw: unknown, selfHost?: string): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const host = new URL(raw).hostname.replace(/^www\./, "").toLowerCase();
    if (!host) return null;
    // Our own pages are internal navigation, not a referral source.
    if (selfHost && host === selfHost.replace(/^www\./, "").toLowerCase()) return null;
    return host.slice(0, 120);
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Visitor identity                                                    */
/* ------------------------------------------------------------------ */

/**
 * Per-process salt, rotated daily.
 *
 * WHY NOT STORE AN IP, AND WHY NOT A STABLE HASH
 *
 * The previous tracker kept the raw IP on every visitor record. An IP is
 * personal data, it is not needed to count anybody, and holding it makes an
 * analytics table into something that has to be explained to a regulator.
 *
 * A plain hash of the IP is barely better: the address space is small enough
 * to enumerate, so a stable hash is reversible in practice. Salting fixes
 * that, and rotating the salt daily also bounds how long a visitor can be
 * followed — after midnight the same person is a different id, so the table
 * cannot be used to build a history of one individual even by us.
 *
 * The salt is random per process rather than configured, so it is not
 * recoverable from the environment either. The cost is that unique counts are
 * per-day only, which is exactly the granularity the dashboard reports.
 */
let saltDay = "";
let saltValue = "";

function currentSalt(now = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  if (day !== saltDay) {
    saltDay = day;
    saltValue = crypto.randomBytes(32).toString("hex");
  }
  return saltValue;
}

/** Test seam — forces the next call to mint a fresh salt. */
export function _resetSalt(): void {
  saltDay = "";
  saltValue = "";
}

/**
 * A stable-for-today, unlinkable-tomorrow identifier for one visitor.
 *
 * Derived server-side from the address and user agent, so it needs no cookie
 * and no client storage — which is also why it is more accurate than the
 * sessionStorage id it replaces: that was per-tab, so one person with three
 * tabs open counted as three visitors.
 */
export function visitorHash(ip: string, userAgent: string, now = new Date()): string {
  return crypto
    .createHash("sha256")
    .update(`${currentSalt(now)}|${ip}|${userAgent}`)
    .digest("hex")
    .slice(0, 32);
}

/* ------------------------------------------------------------------ */
/* Client classification                                               */
/* ------------------------------------------------------------------ */

export type DeviceClass = "mobile" | "tablet" | "desktop" | "bot";

/**
 * Buckets a user agent.
 *
 * Bots are classified rather than silently dropped: a traffic report that
 * quietly discards crawler hits looks wrong to anyone comparing it against
 * server logs, and "how much of my traffic is crawlers" is a real question.
 * The caller decides whether to exclude them.
 */
export function classifyDevice(ua: unknown): DeviceClass {
  const s = typeof ua === "string" ? ua.toLowerCase() : "";
  if (!s) return "desktop";
  if (/bot|crawl|spider|slurp|bingpreview|headless|lighthouse|pingdom|monitor|curl|wget|python-requests|axios|node-fetch/.test(s)) {
    return "bot";
  }
  if (/ipad|tablet|playbook|silk|(android(?!.*mobile))/.test(s)) return "tablet";
  if (/mobi|iphone|ipod|android|blackberry|iemobile|opera mini/.test(s)) return "mobile";
  return "desktop";
}

/** Coarse browser family, for the audience breakdown. */
export function classifyBrowser(ua: unknown): string {
  const s = typeof ua === "string" ? ua : "";
  if (!s) return "Unknown";
  // Order matters: Edge and Opera both claim to be Chrome, Chrome claims Safari.
  if (/Edg\//.test(s)) return "Edge";
  if (/OPR\/|Opera/.test(s)) return "Opera";
  if (/SamsungBrowser/.test(s)) return "Samsung";
  if (/Firefox\/|FxiOS/.test(s)) return "Firefox";
  if (/Chrome\/|CriOS/.test(s)) return "Chrome";
  if (/Safari\//.test(s)) return "Safari";
  return "Unknown";
}

/**
 * Whether this request has asked not to be measured.
 *
 * Honoured even though a first-party, cookieless, daily-rotating count is
 * defensible without consent: the site already gates Vercel Analytics behind
 * an explicit opt-in, and running our own tracker on someone who has said no
 * would make that gate a fiction.
 */
export function optedOut(headers: {
  get(name: string): string | null;
}): boolean {
  return headers.get("dnt") === "1" || headers.get("sec-gpc") === "1";
}
