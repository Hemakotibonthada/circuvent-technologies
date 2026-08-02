import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config";
import { checkSession, currentEpoch } from "./sessions";
import { logger } from "./logger";

export interface UserClaims {
  uid: number;
  email: string;
  /**
   * Token epoch — the value of `users.token_epoch` when this token was minted.
   * Tokens issued before session revocation existed carry no claim and are read
   * as 0, which matches the column default, so they keep working until the
   * first revocation.
   */
  te?: number;
}

export function hashPassword(pw: string): Promise<string> {
  return bcrypt.hash(pw, 12);
}

export function verifyPassword(pw: string, hash: string): Promise<boolean> {
  return bcrypt.compare(pw, hash);
}

/**
 * Mints a session token, always stamped with the account's current epoch.
 *
 * Async on purpose. It could take the epoch as an argument and stay
 * synchronous, but then every future caller would have to remember to pass it,
 * and one that forgot would mint a token that silently ignores revocation.
 * Reading it here makes that mistake impossible.
 */
export async function signUserToken(claims: { uid: number; email: string }): Promise<string> {
  const te = await currentEpoch(claims.uid);
  return jwt.sign({ ...claims, te }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN,
  } as jwt.SignOptions);
}

export function verifyUserToken(token: string): UserClaims | null {
  try {
    const decoded = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    // Postgres returns BIGINT ids as strings, so coerce the uid claim.
    const uid = Number(decoded.uid);
    if (Number.isFinite(uid) && typeof decoded.email === "string") {
      const te = Number(decoded.te);
      return { uid, email: decoded.email, te: Number.isFinite(te) ? te : 0 };
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

/**
 * Express middleware — requires a valid, still-live user JWT.
 *
 * Signature verification alone is not enough: a JWT stays cryptographically
 * valid until it expires, so without the session check a stolen token would
 * keep opening doors for up to `JWT_EXPIRES_IN` and blocking an account would
 * do nothing. `checkSession` is one memoised primary-key read.
 *
 * Express 4 does not catch rejections from async middleware, so everything here
 * is inside a try/catch. A database failure must fail CLOSED — returning 401
 * rather than letting the request through — because the alternative is that a
 * revoked token starts working again the moment Postgres has a bad minute.
 */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const token = tokenFrom(req);
  const claims = token ? verifyUserToken(token) : null;
  if (!claims) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  void (async () => {
    try {
      const verdict = await checkSession(claims.uid, claims.te ?? 0);
      if (verdict === "ok") {
        req.user = claims;
        next();
        return;
      }
      // The distinction matters to the client: a blocked account should not be
      // invited to sign in again, whereas a revoked session should.
      if (verdict === "blocked") {
        res.status(403).json({ error: "This account has been disabled." });
        return;
      }
      res.status(401).json({ error: "Session ended. Please sign in again." });
    } catch (err) {
      logger.error({ err }, "requireAuth session check failed");
      res.status(401).json({ error: "Unauthorized" });
    }
  })();
}
