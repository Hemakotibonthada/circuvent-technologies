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
