// Console auth bridge — verifies a console user's Bearer token for the ONE
// console feature that needs real server-side persistence (the Developer
// Portal: API tokens + webhooks). The console's JWT is issued and signed by
// the external, self-hosted control plane (platform/api — see
// src/lib/control-plane.ts); this app has no way to verify that signature
// locally. Instead we confirm the token is currently valid by calling a
// cheap, already-authenticated endpoint on the real control plane
// (introspection-by-call) and read the uid/email out of the JWT payload
// (unverified, but only trusted AFTER the live introspection call succeeds —
// i.e. trust is delegated to the actual token issuer, not decoded blindly).
//
// SERVER ONLY.

import { CONTROL_PLANE_URL } from "./control-plane";

export interface ConsolePrincipal {
  uid: number;
  email: string;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    const normalized = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(part.length + ((4 - (part.length % 4)) % 4), "=");
    const json = Buffer.from(normalized, "base64").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function tokenFromRequest(request: Request): string | null {
  const auth = request.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  return request.headers.get("x-console-token");
}

/**
 * Resolves the authenticated console principal for a request, or null.
 * Makes one lightweight network call to the real control plane to confirm
 * the token is live — this endpoint list is intentionally minimal (GET
 * /devices), matching what the console SPA already calls on every page load.
 */
export async function verifyConsolePrincipal(request: Request): Promise<ConsolePrincipal | null> {
  const token = tokenFromRequest(request);
  if (!token) return null;

  try {
    const res = await fetch(`${CONTROL_PLANE_URL}/devices`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
  } catch {
    return null;
  }

  const payload = decodeJwtPayload(token);
  const uidRaw = payload?.uid ?? payload?.id ?? payload?.sub;
  const uid = Number(uidRaw);
  if (!uidRaw || Number.isNaN(uid)) return null;
  return { uid, email: String(payload?.email ?? "") };
}
