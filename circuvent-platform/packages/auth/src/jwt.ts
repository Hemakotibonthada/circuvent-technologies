// ──────────────────────────────────────────────────────────────
// Circuvent Platform — JWT Token Utilities
// ──────────────────────────────────────────────────────────────

import jwt from "jsonwebtoken";
import { JwtPayload, Role } from "@circuvent/shared";

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret";
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "dev-refresh-secret";
const JWT_EXPIRY = process.env.JWT_EXPIRY || "15m";
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || "7d";

export function generateAccessToken(payload: {
  userId: string;
  email: string;
  role: Role;
}): string {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRY as any,
  });
}

export function generateRefreshToken(payload: {
  userId: string;
  email: string;
  role: Role;
}): string {
  return jwt.sign(payload, JWT_REFRESH_SECRET, {
    expiresIn: JWT_REFRESH_EXPIRY as any,
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_REFRESH_SECRET) as JwtPayload;
}
