import type { Response, NextFunction } from "express";
import { requireAuth, type AuthedRequest } from "./auth";
import {
  verifyApiKey,
  hasScope,
  originAllowed,
  looksLikeApiKey,
  type ApiKeyRecord,
  type ApiScope,
} from "./api-keys";
import { logger } from "./logger";

export interface ApiRequest extends AuthedRequest {
  /** Present only when the caller authenticated with an API key. */
  apiKey?: ApiKeyRecord;
}

function bearer(req: ApiRequest): string | null {
  const h = req.headers.authorization;
  if (h && h.startsWith("Bearer ")) return h.slice(7).trim();
  // A plain `X-API-Key` header is what most dashboard SDKs reach for first,
  // and rejecting it teaches nothing except that our API is fussy.
  const x = req.headers["x-api-key"];
  if (typeof x === "string" && x.trim()) return x.trim();
  return null;
}

/**
 * Requires a caller with `scope`, authenticated by either an API key or a
 * console login JWT.
 *
 * WHY BOTH
 *
 * The console and the mobile app hold a JWT and already own everything in the
 * account, so making them mint an API key to call their own platform would be
 * ceremony for nothing. A JWT therefore satisfies every scope. An API key
 * satisfies only the scopes it was granted.
 *
 * WHAT THIS DELIBERATELY DOES NOT COVER
 *
 * Key and webhook management, device provisioning, claiming and unclaiming,
 * account and session endpoints, and everything under /admin stay JWT-only.
 * A key that could mint keys would make the scope list decorative — a leaked
 * `devices:read` key would simply issue itself a `devices:control` one. That
 * boundary is enforced by those routes using requireAuth directly, not this.
 */
export function requireApiAccess(scope: ApiScope) {
  return function (req: ApiRequest, res: Response, next: NextFunction): void {
    const token = bearer(req);

    // Not an API key — fall through to the normal session check.
    if (!token || !looksLikeApiKey(token)) {
      requireAuth(req, res, next);
      return;
    }

    void (async () => {
      try {
        const verdict = await verifyApiKey(token);
        if (!verdict.ok || !verdict.key) {
          // The reason is safe to disclose: the caller already holds the key,
          // so telling them it expired rather than "unauthorized" costs no
          // information and saves a support round-trip.
          const msg =
            verdict.reason === "expired"
              ? "This API key has expired."
              : verdict.reason === "revoked"
                ? "This API key has been revoked."
                : verdict.reason === "blocked"
                  ? "The account that owns this API key is disabled."
                  : "Invalid API key.";
          res.status(401).json({ error: msg, code: `key_${verdict.reason ?? "invalid"}` });
          return;
        }

        const key = verdict.key;
        const origin = req.headers.origin;
        if (!originAllowed(key, typeof origin === "string" ? origin : undefined)) {
          res.status(403).json({
            error: key.allowedOrigins.length
              ? `Origin ${origin} is not allowed for this key.`
              : "This key is server-side only. Register an allowed origin to call it from a browser.",
            code: "origin_not_allowed",
          });
          return;
        }

        if (!hasScope(key, scope)) {
          res.status(403).json({
            error: `This key is missing the '${scope}' scope.`,
            code: "insufficient_scope",
            required: scope,
            granted: key.scopes,
          });
          return;
        }

        req.apiKey = key;
        // Downstream handlers read req.user.uid for ownership, so a key
        // presents as its owner. Email is informational only.
        req.user = { uid: key.ownerId, email: "" };
        next();
      } catch (err) {
        logger.error({ err }, "API key check failed");
        // Fail closed: a database blip must not turn into open access.
        res.status(401).json({ error: "Unauthorized", code: "key_check_failed" });
      }
    })();
  };
}

/**
 * CORS for the developer API.
 *
 * The global cors() middleware answers with a single configured origin list,
 * which cannot work here: whether an origin is allowed depends on which key is
 * being presented, and a browser preflight (OPTIONS) carries no Authorization
 * header at all — it is sent before the real request, precisely so the browser
 * can find out whether sending credentials is permitted.
 *
 * So preflights are answered permissively and the real request is where the
 * origin is actually checked, against that key's list. That ordering is safe
 * because a preflight neither reads nor writes anything: passing it only earns
 * the browser the right to send the real request, which then has to present a
 * key whose allowed_origins include it.
 */
export function developerCors(req: ApiRequest, res: Response, next: NextFunction): void {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type, X-API-Key");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}
