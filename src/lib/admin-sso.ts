// Single sign-on for the staff console, against auth.circuvent.com.
//
// The console keeps its bearer token in sessionStorage and sends it as a
// header. That is deliberate and is not changed here: moving staff auth onto a
// cookie would make every one of the admin API routes automatically
// credentialed and therefore open to cross-site request forgery, which is a
// worse problem than the one being solved.
//
// So the handshake ends by handing the browser a short-lived code that the
// console swaps for the usual token. The code is signed rather than stored,
// because the callback and the exchange are two different serverless
// invocations and anything held in one instance's memory is not there for the
// other — the same fault that made the warranty register look like it worked.
//
// SERVER ONLY.

import crypto from "crypto";
import { lazySecret } from "./secrets";

/** Where the identity service lives. Overridable for staging. */
export const ISSUER = (process.env.ADMIN_SSO_ISSUER || "https://auth.circuvent.com").replace(/\/$/, "");

/**
 * The relying-party identity.
 *
 * Public client with PKCE, matching every other app in the suite: the
 * handshake is completed by a server route, so the verifier never reaches the
 * browser, and there is no secret to leak or rotate.
 */
export const CLIENT_ID = process.env.ADMIN_SSO_CLIENT_ID || "website-admin";

const secret = lazySecret(["ADMIN_SECRET", "ACCOUNT_SECRET"], "staff single sign-on");

/** How long the console has to redeem the handoff code. */
export const HANDOFF_TTL_MS = 90_000;

/**
 * How long a sign-in may sit at the identity service before it goes stale.
 *
 * Thirty minutes rather than ten. The person is usually not signed in to
 * auth.circuvent.com when they arrive, so the round trip includes a password,
 * a second factor and — the first time — enrolling one. Ten minutes covered a
 * sign-in already in progress and quietly failed the ordinary case, landing
 * somebody back with `sso_error=expired` and nothing they did wrong.
 */
export const FLOW_TTL_MS = 30 * 60_000;

export const STATE_COOKIE = "cv_admin_sso";

export interface SsoStart {
  url: string;
  verifier: string;
  state: string;
}

const b64url = (b: Buffer) => b.toString("base64url");

/** True when this deployment has been told where to send people. */
export function ssoConfigured(): boolean {
  return Boolean(ISSUER && CLIENT_ID);
}

/**
 * PKCE, per RFC 7636.
 *
 * S256 rather than `plain`: the identity service advertises only S256, and a
 * plain challenge is the verifier, which defeats the point of sending it.
 */
export function pkcePair(): { verifier: string; challenge: string } {
  const verifier = b64url(crypto.randomBytes(32));
  const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

/** The URL to send the browser to, plus the secrets the callback will need. */
export function beginSso(redirectUri: string): SsoStart {
  const { verifier, challenge } = pkcePair();
  const state = b64url(crypto.randomBytes(16));

  const url = new URL(`${ISSUER}/authorize`);
  url.searchParams.set("client_id", CLIENT_ID);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "openid email profile");
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");

  return { url: url.toString(), verifier, state };
}

/**
 * The value kept in the browser between the two halves of the handshake.
 *
 * State and verifier travel together in one httpOnly cookie so they cannot get
 * out of step, and are signed so a forged cookie cannot nominate a verifier of
 * somebody else's choosing.
 */
export function packFlow(state: string, verifier: string): string {
  return seal("flow", { state, verifier });
}

export function unpackFlow(
  cookie: string | undefined | null,
  now = Date.now()
): { state: string; verifier: string } | null {
  const claims = open<{ state: string; verifier: string }>("flow", cookie, FLOW_TTL_MS, now);
  if (!claims?.state || !claims.verifier) return null;
  return { state: claims.state, verifier: claims.verifier };
}

/**
 * The code handed back to the console in the redirect.
 *
 * Bound to a nonce that only ever exists in an httpOnly cookie on the browser
 * that started the sign-in, so the code on its own — in a server log, a
 * referrer header, somebody's shoulder — cannot be redeemed anywhere else.
 */
export function signHandoff(email: string, nonce: string, now = Date.now()): string {
  return seal("handoff", { email: email.trim().toLowerCase(), nonce }, now);
}

export function verifyHandoff(
  code: string | undefined | null,
  nonce: string | undefined | null,
  now = Date.now()
): string | null {
  if (!nonce) return null;
  const claims = open<{ email: string; nonce: string }>("handoff", code, HANDOFF_TTL_MS, now);
  if (!claims?.email || !claims.nonce) return null;
  if (!timingSafeEqual(claims.nonce, nonce)) return null;
  return claims.email;
}

export function newNonce(): string {
  return b64url(crypto.randomBytes(16));
}

/**
 * The profile picture from the identity provider, or "" if there isn't a
 * usable one.
 *
 * This value is written straight into an `<img src>` on the staff console, so
 * the scheme is constrained to http(s): a `javascript:` or `data:` URL in a
 * userinfo response would otherwise become script execution on an admin page.
 * Length is capped because this is persisted per staff member and an unbounded
 * string from an upstream service has no business growing the record.
 */
export function safeAvatarUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const url = raw.trim();
  if (!url || url.length > 2048) return "";
  return /^https?:\/\//i.test(url) ? url : "";
}

/*
 * Fields are carried as JSON rather than joined with a separator.
 *
 * The first version joined them with a dot and split on it to read them back,
 * which quietly could not work at all: every email address contains a dot, so
 * `ada@circuvent.com.<nonce>.<issued>` parsed into four pieces and the code was
 * rejected as malformed. Single sign-on would have failed every time with
 * "that link has expired" — a control that is present, looks right, and never
 * once succeeds. A happy-path test caught it; the refusals all passed.
 */
function seal(kind: string, claims: Record<string, string>, now = Date.now()): string {
  const body = JSON.stringify({ ...claims, iat: now });
  const encoded = b64url(Buffer.from(body, "utf8"));
  return `${encoded}.${hmac(`${kind}:${body}`)}`;
}

function open<T>(
  kind: string,
  token: string | undefined | null,
  ttl: number,
  now: number
): (T & { iat: number }) | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const encoded = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  let body: string;
  try {
    body = Buffer.from(encoded, "base64url").toString("utf8");
  } catch {
    return null;
  }
  if (!timingSafeEqual(hmac(`${kind}:${body}`), mac)) return null;

  let claims: (T & { iat: number }) | null;
  try {
    claims = JSON.parse(body) as T & { iat: number };
  } catch {
    return null;
  }
  if (!claims || typeof claims.iat !== "number") return null;
  if (now - claims.iat > ttl) return null;
  return claims;
}

function hmac(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(payload).digest("hex");
}

/** Constant-time compare that does not throw on length mismatch. */
function timingSafeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
