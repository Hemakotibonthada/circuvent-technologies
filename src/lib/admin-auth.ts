// Admin / staff authentication for the Circuvent control center.
// - Staff are stored server-side (store.ts `adminUsers`) with scrypt-hashed passwords.
// - Sessions are STATELESS HMAC tokens bound to the email, so the same credentials
//   work on ANY device (fixes the cross-device "incorrect password" problem).
// - The current role is always read from the store at request time, so role changes
//   and de-activations take effect immediately without forcing a re-login.
// SERVER ONLY — uses node:crypto.

import crypto from "crypto";
import { hashPassword, verifyPassword } from "./account";
import { requireSecret, seedAdminPassword } from "./secrets";
import {
  countAdminUsers,
  getAdminUser,
  patchAdminUser,
  upsertAdminUser,
  type AdminRole,
  type AdminUser,
} from "./store";

// Staff sessions get their own key so a leaked customer key cannot mint one.
const SECRET = requireSecret(["ADMIN_SECRET", "ACCOUNT_SECRET"], "staff sessions");

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
  upsertAdminUser({
    email: DEFAULT_ADMIN_EMAIL,
    name: "Owner",
    hash,
    salt,
    role: "superadmin",
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: "system",
  });
}

/** Signs a stateless session token bound to the staff email. */
export function signAdminToken(email: string): string {
  const e = email.trim().toLowerCase();
  const sig = crypto.createHmac("sha256", SECRET).update(`admin:${e}`).digest("hex");
  return Buffer.from(`${e}:${sig}`).toString("base64");
}

/** Returns the email carried by a valid token, else null. */
export function verifyAdminToken(token: string | null | undefined): string | null {
  if (!token) return null;
  try {
    const dec = Buffer.from(token, "base64").toString("utf8");
    const idx = dec.lastIndexOf(":");
    if (idx < 0) return null;
    const email = dec.slice(0, idx);
    const sig = dec.slice(idx + 1);
    const expected = crypto.createHmac("sha256", SECRET).update(`admin:${email}`).digest("hex");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return email;
    return null;
  } catch {
    return null;
  }
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
