// Admin / staff authentication for the Circuvent control center.
// - Staff are stored server-side (store.ts `adminUsers`) with scrypt-hashed passwords.
// - Sessions are STATELESS HMAC tokens bound to the email, so the same credentials
//   work on ANY device (fixes the cross-device "incorrect password" problem).
// - The current role is always read from the store at request time, so role changes
//   and de-activations take effect immediately without forcing a re-login.
// SERVER ONLY — uses node:crypto.

import crypto from "crypto";
import { hashPassword, verifyPassword } from "./account";
import {
  countAdminUsers,
  getAdminUser,
  patchAdminUser,
  upsertAdminUser,
  type AdminRole,
  type AdminUser,
} from "./store";

const SECRET =
  process.env.ADMIN_SECRET ||
  process.env.ACCOUNT_SECRET ||
  process.env.ADMIN_PASSWORD ||
  "circuvent-admin-secret";

/** The always-available root administrator (as requested by the owner). */
export const DEFAULT_ADMIN_EMAIL = (
  process.env.ADMIN_DEFAULT_EMAIL || "admin@circuvent.com"
).toLowerCase();
export const DEFAULT_ADMIN_PASSWORD =
  process.env.ADMIN_DEFAULT_PASSWORD || "Hemakoti@003";

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
  | "settings";

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
  ],
  inventory: ["inventory"],
  orders: ["orders", "returns", "customers"],
  support: ["support", "returns", "customers"],
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
  const { salt, hash } = hashPassword(DEFAULT_ADMIN_PASSWORD);
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
