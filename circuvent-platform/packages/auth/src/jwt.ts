// ──────────────────────────────────────────────────────────────
// Circuvent Platform — JWT Token Utilities
// ──────────────────────────────────────────────────────────────

import jwt from "jsonwebtoken";
import { JwtPayload, Role } from "@circuvent/shared";

// ──────────────────────────────────────────────────────────────
// Signing secrets
// ──────────────────────────────────────────────────────────────
// These used to be `process.env.JWT_SECRET || "dev-secret"`. Combined with a
// docker-compose.yml that never passed JWT_SECRET through, every service in
// this platform verified production tokens against a string published in this
// file. Anyone reading the repository could mint
// `{ userId, email, role: "SUPER_ADMIN" }`, satisfy `authenticate` and
// `authorize`, and reach HR/payroll, the financial ledger and the IoT registry.
//
// A missing secret must stop the process, not silently downgrade it to a known
// one. The same compose file already does this for POSTGRES_PASSWORD with the
// `:?` operator, and platform/api/config.ts exits on a missing secret — this
// was the odd one out.
//
// Read lazily rather than at module load so that importing this package (in a
// test, or a tool that never signs anything) does not require the environment
// to be configured.
const MIN_SECRET_LENGTH = 32;

function requireSecret(name: "JWT_SECRET" | "JWT_REFRESH_SECRET"): string {
  const value = process.env[name];
  if (!value || value.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `${name} must be set to at least ${MIN_SECRET_LENGTH} characters. ` +
        `Refusing to start: a short or missing secret makes every token forgeable.`
    );
  }
  return value;
}

const JWT_EXPIRY = process.env.JWT_EXPIRY || "15m";
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || "7d";

export function generateAccessToken(payload: {
  userId: string;
  email: string;
  role: Role;
}): string {
  return jwt.sign(payload, requireSecret("JWT_SECRET"), {
    expiresIn: JWT_EXPIRY as any,
  });
}

export function generateRefreshToken(payload: {
  userId: string;
  email: string;
  role: Role;
}): string {
  return jwt.sign(payload, requireSecret("JWT_REFRESH_SECRET"), {
    expiresIn: JWT_REFRESH_EXPIRY as any,
  });
}

export function verifyAccessToken(token: string): JwtPayload {
  // The algorithm is pinned so the token's own header cannot select `none` or
  // provoke an algorithm-confusion attack.
  return jwt.verify(token, requireSecret("JWT_SECRET"), {
    algorithms: ["HS256"],
  }) as JwtPayload;
}

export function verifyRefreshToken(token: string): JwtPayload {
  return jwt.verify(token, requireSecret("JWT_REFRESH_SECRET"), {
    algorithms: ["HS256"],
  }) as JwtPayload;
}
