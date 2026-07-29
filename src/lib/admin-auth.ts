// Admin / staff authentication for the Circuvent control center.
// - Staff are stored server-side (store.ts `adminUsers`) with scrypt-hashed passwords.
// - Sessions are STATELESS HMAC tokens bound to the email, so the same credentials
//   work on ANY device (fixes the cross-device "incorrect password" problem).
// - The current role is always read from the store at request time, so role changes
//   and de-activations take effect immediately without forcing a re-login.
// SERVER ONLY — uses node:crypto.

import crypto from "crypto";
import { hashPassword, verifyPassword } from "./account";
import { lazySecret, seedAdminPassword } from "./secrets";
import {
  checkPassword,
  passwordAge,
  PASSWORD_HISTORY_DEPTH,
  type PasswordAge,
} from "./admin-password-policy";
import {
  countAdminUsers,
  getAdminUser,
  patchAdminUser,
  setAdminPassword,
  upsertAdminUser,
  type AdminRole,
  type AdminUser,
} from "./store";

// Staff sessions get their own key so a leaked customer key cannot mint one.
const secret = lazySecret(["ADMIN_SECRET", "ACCOUNT_SECRET"], "staff sessions");

/** The always-available root administrator (as requested by the owner). */
export const DEFAULT_ADMIN_EMAIL = (
  process.env.ADMIN_DEFAULT_EMAIL || "admin@circuvent.com"
).toLowerCase();

/**
 * Stored in the pending-2FA slot when the second factor is an authenticator.
 * Its presence proves the password stage was passed, so a TOTP code can never
 * be the only factor, and guesses land on the same attempt counter as email
 * codes. It can never collide with a 6-digit numeric code.
 */
export const TOTP_PENDING = "totp-pending";

/** Areas of the admin control center that can be independently permissioned. */
export type AdminArea =
  | "overview"
  | "analytics"
  | "inventory"
  | "orders"
  | "returns"
  | "customers"
  | "coupons"
  | "support"
  | "staff"
  | "settings"
  // --- extended feature areas (added for the growth-stage feature buildout) ---
  | "cms"
  | "marketing"
  | "pricing"
  | "vendors"
  | "fraud"
  | "flags"
  | "integrations"
  | "tax"
  | "crm"
  | "subscriptions"
  | "affiliates"
  | "warranty"
  | "jobs"
  | "bulk"
  | "seo"
  | "shipping"
  | "bundles"
  | "macros"
  | "surveys"
  | "currency"
  | "privacy"
  | "forecasting"
  | "reportbuilder";

/** What each role is allowed to touch. superadmin is allowed everything. */
const ROLE_AREAS: Record<AdminRole, AdminArea[]> = {
  superadmin: [
    "overview",
    "analytics",
    "inventory",
    "orders",
    "returns",
    "customers",
    "coupons",
    "support",
    "staff",
    "settings",
    "cms",
    "marketing",
    "pricing",
    "vendors",
    "fraud",
    "flags",
    "integrations",
    "tax",
    "crm",
    "subscriptions",
    "affiliates",
    "warranty",
    "jobs",
    "bulk",
    "seo",
    "shipping",
    "bundles",
    "macros",
    "surveys",
    "currency",
    "privacy",
    "forecasting",
    "reportbuilder",
  ],
  manager: [
    "overview",
    "analytics",
    "inventory",
    "orders",
    "returns",
    "customers",
    "coupons",
    "support",
    "cms",
    "marketing",
    "pricing",
    "vendors",
    "fraud",
    "crm",
    "subscriptions",
    "affiliates",
    "warranty",
    "seo",
    "shipping",
    "bundles",
    "macros",
    "surveys",
    "currency",
    "privacy",
    "forecasting",
    "reportbuilder",
  ],
  inventory: ["inventory", "vendors", "pricing", "shipping", "bundles", "forecasting"],
  orders: ["orders", "returns", "customers", "fraud", "warranty", "shipping"],
  support: ["support", "returns", "customers", "warranty", "macros", "surveys", "privacy"],
};

export const ROLE_LABELS: Record<AdminRole, string> = {
  superadmin: "Super Admin — full access",
  manager: "Manager — everything except staff & settings",
  inventory: "Inventory Staff — products & stock only",
  orders: "Orders Staff — orders, returns & customers",
  support: "Support Staff — tickets, returns & customers",
};

export const ALL_ROLES: AdminRole[] = ["superadmin", "manager", "inventory", "orders", "support"];

/** Ensures the default super-admin always exists so the owner can never be locked out. */
export function ensureSeeded(): void {
  if (countAdminUsers() > 0) return;
  const { salt, hash } = hashPassword(seedAdminPassword());
  const now = new Date().toISOString();
  upsertAdminUser({
    email: DEFAULT_ADMIN_EMAIL,
    name: "Owner",
    hash,
    salt,
    role: "superadmin",
    active: true,
    createdAt: now,
    createdBy: "system",
    // The seed password comes from an env var / shared default, so it is treated
    // as already due for rotation rather than given a fresh 90 days.
    passwordChangedAt: now,
    mustChangePassword: true,
    tokenVersion: 0,
  });
}

/**
 * Session tokens.
 *
 * The old format was `base64(email + ":" + HMAC(email))` — a pure function of
 * the address. It never expired and could not be revoked, so changing a
 * password left every previously issued token fully valid, including one a
 * departing employee had already copied. Tokens now carry an issue time and the
 * account's token version, both covered by the signature, and both re-checked
 * against live account state on every request. `setAdminPassword` bumps the
 * version, which is what makes a password change actually end other sessions.
 *
 * This mirrors the fix already applied to customer sessions in account.ts.
 * Tokens in the old format no longer verify; staff simply sign in again, and
 * admin tokens live in sessionStorage so most die at tab close anyway.
 */
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000;

interface AdminClaims {
  email: string;
  issuedAt: number;
  version: number;
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", secret()).update(`admin:${payload}`).digest("hex");
}

/** Signs a stateless session token bound to the staff email and token version. */
export function signAdminToken(email: string, version?: number): string {
  const e = email.trim().toLowerCase();
  const ver = version ?? getAdminUser(e)?.tokenVersion ?? 0;
  const payload = `${e}|${Date.now().toString(36)}|${ver}`;
  return Buffer.from(`${payload}:${sign(payload)}`).toString("base64");
}

/** Parses and cryptographically validates a token. Does not check account state. */
function readAdminToken(token: string | null | undefined): AdminClaims | null {
  if (!token) return null;
  try {
    const dec = Buffer.from(token, "base64").toString("utf8");
    const idx = dec.lastIndexOf(":");
    if (idx < 0) return null;
    const payload = dec.slice(0, idx);
    const sig = dec.slice(idx + 1);

    const a = Buffer.from(sig);
    const b = Buffer.from(sign(payload));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

    const parts = payload.split("|");
    if (parts.length !== 3) return null;
    const issuedAt = parseInt(parts[1], 36);
    const version = Number(parts[2]);
    if (!Number.isFinite(issuedAt) || !Number.isFinite(version)) return null;

    return { email: parts[0], issuedAt, version };
  } catch {
    return null;
  }
}

/** Returns the email carried by a valid, unexpired, current-version token. */
export function verifyAdminToken(token: string | null | undefined): string | null {
  const claims = readAdminToken(token);
  if (!claims) return null;
  if (Date.now() - claims.issuedAt > TOKEN_TTL_MS) return null;

  // A warm instance that has not hydrated this account yet falls back to the
  // signature, which is still time-limited — it never grants more than the
  // token already claimed.
  const user = getAdminUser(claims.email);
  if (user && (user.tokenVersion || 0) !== claims.version) return null;

  return claims.email;
}

/** Validates email + password and returns the active staff user (or null). */
export function authenticate(email: string, password: string): AdminUser | null {
  ensureSeeded();
  const user = getAdminUser(email);
  if (!user || !user.active) return null;
  if (!verifyPassword(password, user.salt, user.hash)) return null;
  patchAdminUser(user.email, { lastLoginAt: new Date().toISOString() });
  return user;
}

function tokenFromRequest(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return req.headers.get("x-admin-token");
}

/** Resolves the current staff user from a request's token (role read live from store). */
export function adminFromRequest(req: Request): AdminUser | null {
  ensureSeeded();
  const email = verifyAdminToken(tokenFromRequest(req));
  if (!email) return null;
  const user = getAdminUser(email);
  if (!user || !user.active) return null;
  return user;
}

/** True if the role may access the given area. */
export function roleCan(role: AdminRole, area: AdminArea): boolean {
  return ROLE_AREAS[role]?.includes(area) ?? false;
}

/** True if the (already-resolved) staff user may access the area. */
export function requireArea(user: AdminUser | null, area: AdminArea): boolean {
  return !!user && roleCan(user.role, area);
}

/** Convenience guard for API routes: returns the user if allowed, else null. */
export function guard(req: Request, area: AdminArea): AdminUser | null {
  const user = adminFromRequest(req);
  if (!user || !requireArea(user, area)) return null;
  return user;
}

// ------------------------------------------------------- password policy ---

/** Rotation status for a staff account. */
export function adminPasswordAge(user: AdminUser): PasswordAge {
  return passwordAge(user);
}

export type ChangePasswordResult =
  | { ok: true; user: AdminUser; token: string }
  | { ok: false; status: number; error: string; errors?: string[] };

/**
 * Changes a staff password after proving knowledge of the current one.
 *
 * Reuse is checked against the stored history by re-deriving each old hash with
 * its own salt — the salts differ per entry, so a plain hash comparison would
 * never match and the rule would silently pass everything.
 *
 * On success every other session for this account is invalidated (tokenVersion
 * bumps), and a freshly signed token is returned so the caller who *made* the
 * change is not logged out by their own action.
 */
export function changeAdminPassword(
  email: string,
  currentPassword: string,
  nextPassword: string
): ChangePasswordResult {
  const user = getAdminUser(email);
  if (!user || !user.active) {
    return { ok: false, status: 401, error: "Not signed in" };
  }

  if (!verifyPassword(currentPassword, user.salt, user.hash)) {
    return { ok: false, status: 400, error: "Current password is incorrect" };
  }

  if (currentPassword === nextPassword) {
    return { ok: false, status: 400, error: "New password must be different from the current one" };
  }

  const check = checkPassword(nextPassword, { email: user.email, name: user.name });
  if (!check.ok) {
    return {
      ok: false,
      status: 400,
      error: "Password does not meet the security policy",
      errors: check.errors,
    };
  }

  for (const prev of user.passwordHistory || []) {
    if (verifyPassword(nextPassword, prev.salt, prev.hash)) {
      return {
        ok: false,
        status: 400,
        error: `You cannot reuse any of your last ${PASSWORD_HISTORY_DEPTH} passwords`,
      };
    }
  }

  const { salt, hash } = hashPassword(nextPassword);
  const updated = setAdminPassword(user.email, hash, salt, PASSWORD_HISTORY_DEPTH);
  if (!updated) {
    return { ok: false, status: 500, error: "Could not save the new password" };
  }

  return { ok: true, user: updated, token: signAdminToken(updated.email, updated.tokenVersion) };
}
