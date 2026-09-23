// Server-only attendance OIDC handshake. The control plane verifies the ID
// token signature and owns user provisioning and attendance permissions.
import crypto from "node:crypto";
import { lazySecret } from "./secrets";

export const ATTENDANCE_CLIENT_ID = process.env.ATTENDANCE_SSO_CLIENT_ID || "attendance";
export const ATTENDANCE_ISSUER = (process.env.ATTENDANCE_SSO_ISSUER || "https://myaccount.circuvent.com").replace(/\/+$/, "");
export const SSO_PATH = "/api/attendance/auth/sso";
export const FLOW_COOKIE = "cv_attendance_flow";
export const SESSION_COOKIE = "cv_attendance_handoff";
export const FLOW_TTL = 30 * 60;
export const SESSION_TTL = 90;

/** Hostnames that mean "listen address", never a browser-facing origin. */
const BIND_HOSTS = new Set([
  "0.0.0.0",
  "127.0.0.1",
  "::",
  "::1",
  "localhost",
  "host.docker.internal",
]);

/**
 * Public origin for OIDC redirect_uri / post-login landing.
 *
 * Must NOT prefer FRONTEND_URL / NEXT_PUBLIC_SITE_URL: this app serves many
 * hostnames (attendance / home / iot / apex) and Auth allowlists each one.
 * Behind Traefik, Next often sees request.url as http://0.0.0.0:3022 when
 * HOSTNAME is the Docker bind address — that must never be minted into a
 * Location header or redirect_uri.
 */
export function publicRequestOrigin(request: {
  url: string;
  headers: { get(name: string): string | null };
}): string {
  const forwardedHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() || "";
  const hostHeader = request.headers.get("host")?.split(",")[0]?.trim() || "";
  const candidate = forwardedHost || hostHeader;
  const hostname = (candidate.split(":")[0] || "").toLowerCase();

  if (hostname && !BIND_HOSTS.has(hostname) && !hostname.endsWith(".internal")) {
    const proto =
      request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
      (/\.circuvent\.com$/i.test(hostname) ? "https" : new URL(request.url).protocol.replace(/:$/, ""));
    // Traefik sets X-Forwarded-Host without a port; keep Host ports for local dev.
    const hostPart = forwardedHost ? hostname : candidate;
    return `${proto}://${hostPart}`;
  }

  const configured =
    process.env.FRONTEND_URL?.replace(/\/+$/, "") ||
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (configured) return configured;

  const fallback = new URL(request.url).origin;
  if (!BIND_HOSTS.has(new URL(fallback).hostname.toLowerCase())) return fallback;
  return "https://circuvent.com";
}

const secret = lazySecret(["ATTENDANCE_SSO_SECRET", "ACCOUNT_SECRET"], "attendance SSO");

export interface AttendanceFlow {
  state: string;
  verifier: string;
  nonce: string;
  redirectUri: string;
  landing: string;
}
export interface AttendanceSession {
  token: string;
  refreshToken?: string;
  user: { id: number; email: string; name: string; avatarUrl?: string; organization?: { id: string; name: string; domain: string | null } };
}

export function landingPath(origin: string, tab?: string | null): string {
  const path = new URL(origin).hostname === "attendance.circuvent.com" ? "/" : "/smarthome/attendance";
  return tab && /^[a-z0-9_-]{1,64}$/i.test(tab) ? `${path}?tab=${encodeURIComponent(tab)}` : path;
}

export function beginAttendanceSso(origin: string, tab?: string | null) {
  const random = () => crypto.randomBytes(32).toString("base64url");
  const flow: AttendanceFlow = {
    state: random(), verifier: random(), nonce: random(),
    redirectUri: `${origin}${SSO_PATH}/callback`, landing: landingPath(origin, tab),
  };
  const url = new URL(`${ATTENDANCE_ISSUER}/authorize`);
  url.search = new URLSearchParams({
    client_id: ATTENDANCE_CLIENT_ID, redirect_uri: flow.redirectUri,
    response_type: "code", scope: "openid email profile", state: flow.state,
    nonce: flow.nonce, code_challenge_method: "S256",
    code_challenge: crypto.createHash("sha256").update(flow.verifier).digest("base64url"),
  }).toString();
  return { flow, url: url.toString() };
}

// Encrypt both the PKCE verifier and the short-lived console token handoff.
// Separate AAD purposes prevent substituting one cookie for another.
export function sealAttendance<T>(purpose: "flow" | "session", value: T, now = Date.now()): string {
  const key = crypto.createHash("sha256").update(secret()).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(`attendance:${purpose}:v1`));
  const data = Buffer.concat([cipher.update(JSON.stringify({ value, at: now }), "utf8"), cipher.final()]);
  const cookie = Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url");
  if (cookie.length > 3800) throw new Error("Attendance handoff exceeds cookie limit");
  return cookie;
}

export function openAttendance<T>(purpose: "flow" | "session", cookie?: string, now = Date.now()): T | null {
  if (!cookie) return null;
  try {
    const data = Buffer.from(cookie, "base64url");
    const key = crypto.createHash("sha256").update(secret()).digest();
    const cipher = crypto.createDecipheriv("aes-256-gcm", key, data.subarray(0, 12));
    cipher.setAuthTag(data.subarray(12, 28));
    cipher.setAAD(Buffer.from(`attendance:${purpose}:v1`));
    const decoded = JSON.parse(Buffer.concat([cipher.update(data.subarray(28)), cipher.final()]).toString("utf8"));
    const ttl = purpose === "flow" ? FLOW_TTL : SESSION_TTL;
    if (!Number.isFinite(decoded.at) || decoded.at > now || now - decoded.at >= ttl * 1000) return null;
    return decoded.value as T;
  } catch { return null; }
}

/** Binding checks only. Never use these claims until /auth/sso verifies the signature. */
export function boundIdentity(idToken: string, flow: AttendanceFlow): { email: string } | null {
  try {
    const parts = idToken.split(".");
    if (parts.length !== 3) return null;
    const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    if (claims.iss !== ATTENDANCE_ISSUER || claims.aud !== ATTENDANCE_CLIENT_ID ||
        claims.nonce !== flow.nonce || typeof claims.sub !== "string" || !claims.sub ||
        claims.email_verified !== true || typeof claims.email !== "string" ||
        !Number.isFinite(claims.exp) || claims.exp * 1000 <= Date.now()) return null;
    const email = claims.email.trim().toLowerCase();
    return email ? { email } : null;
  } catch { return null; }
}
