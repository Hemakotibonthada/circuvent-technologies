import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config";

export interface UserClaims {
  uid: number;
  email: string;
}

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}

export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

export function signUserToken(claims: UserClaims): string {
  return jwt.sign(claims, config.JWT_SECRET, { expiresIn: config.JWT_EXPIRES_IN } as jwt.SignOptions);
}

export function verifyUserToken(token: string): UserClaims | null {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    // Postgres returns BIGINT ids as strings, so coerce the uid claim.
    const uid = Number(decoded.uid);
    if (Number.isFinite(uid) && typeof decoded.email === "string") {
      return { uid, email: decoded.email };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Short-lived, single-purpose provisioning token. The app mints one for the
 * logged-in user and hands it to a new device (encrypted over the setup link);
 * the device redeems it over TLS to self-provision its id+key. The permanent
 * device secret is therefore never carried on the local link.
 */
export interface ProvisionClaims {
  purpose: "provision";
  uid: number;
  type: string;
  name: string;
}

export function signProvisionToken(c: { uid: number; type: string; name: string }): string {
  return jwt.sign({ ...c, purpose: "provision" }, config.JWT_SECRET, { expiresIn: "15m" } as jwt.SignOptions);
}

export function verifyProvisionToken(token: string): ProvisionClaims | null {
  try {
    const d = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    const uid = Number(d.uid);
    if (d.purpose === "provision" && Number.isFinite(uid) && typeof d.type === "string") {
      return { purpose: "provision", uid, type: d.type, name: typeof d.name === "string" ? d.name : "" };
    }
    return null;
  } catch {
    return null;
  }
}

/** A random device claim key shown once at provisioning (stored only as a hash). */
export function generateDeviceKey(): string {
  return crypto.randomBytes(18).toString("base64url");
}

export function hashDeviceKey(key: string): Promise<string> {
  return bcrypt.hash(key, 10);
}

export function verifyDeviceKey(key: string, hash: string): Promise<boolean> {
  return bcrypt.compare(key, hash);
}

export interface AuthedRequest extends Request {
  user?: UserClaims;
}

function tokenFrom(req: Request): string | null {
  const h = req.headers.authorization;
  if (h && h.startsWith("Bearer ")) return h.slice(7).trim();
  return null;
}

/** Express middleware — requires a valid user JWT. */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = tokenFrom(req);
  const claims = token ? verifyUserToken(token) : null;
  if (!claims) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.user = claims;
  next();
}
