import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { requireAuth, type AuthedRequest } from "../auth";
import {
  API_SCOPES,
  SCOPE_DESCRIPTIONS,
  generateApiKey,
  invalidateKeyCache,
  isApiScope,
  normalizeOrigin,
} from "../api-keys";
import {
  WEBHOOK_EVENTS,
  generateWebhookSecret,
  isPublicUrl,
  isWebhookEvent,
  refreshWebhookOwners,
  signWebhook,
} from "../webhooks";
import { logger } from "../logger";

/**
 * Developer settings: API keys and webhooks.
 *
 * EVERY ROUTE HERE IS `requireAuth`, NOT `requireApiAccess`, AND THAT IS THE
 * POINT. If an API key could reach these endpoints the scope system would be
 * decorative — a leaked read-only key would simply issue itself a key with
 * `devices:control` and open the locks. Managing credentials requires the
 * credential a human logs in with.
 */
export const developerRouter = Router();

/* ------------------------------------------------------------------ */
/* Metadata                                                            */
/* ------------------------------------------------------------------ */

/** GET /developer/scopes — drives the console's checkbox list and the docs. */
developerRouter.get("/scopes", requireAuth, (_req, res) => {
  res.json({
    scopes: API_SCOPES.map((s) => ({ scope: s, description: SCOPE_DESCRIPTIONS[s] })),
    webhookEvents: WEBHOOK_EVENTS,
  });
});

/* ------------------------------------------------------------------ */
/* API keys                                                            */
/* ------------------------------------------------------------------ */

interface KeyRow {
  id: string;
  name: string;
  env: string;
  prefix: string;
  scopes: string[] | null;
  allowed_origins: string[] | null;
  expires_at: Date | null;
  revoked_at: Date | null;
  last_used_at: Date | null;
  request_count: string;
  created_at: Date;
}

function keyShape(r: KeyRow) {
  return {
    id: Number(r.id),
    name: r.name,
    env: r.env,
    // The only thing we can show, because the secret was never stored.
    prefix: r.prefix,
    scopes: r.scopes ?? [],
    allowedOrigins: r.allowed_origins ?? [],
    expiresAt: r.expires_at ? r.expires_at.toISOString() : null,
    revokedAt: r.revoked_at ? r.revoked_at.toISOString() : null,
    lastUsedAt: r.last_used_at ? r.last_used_at.toISOString() : null,
    requestCount: Number(r.request_count),
    createdAt: r.created_at.toISOString(),
  };
}

const KEY_COLUMNS = `id, name, env, prefix, scopes, allowed_origins, expires_at, revoked_at, last_used_at, request_count, created_at`;

developerRouter.get("/keys", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query<KeyRow>(
    `SELECT ${KEY_COLUMNS} FROM api_keys WHERE owner_id = $1 ORDER BY created_at DESC`,
    [req.user!.uid]
  );
  res.json({ keys: rows.map(keyShape) });
});

/** A single account cannot hoard keys — each one is a standing credential. */
const MAX_KEYS_PER_USER = 25;

const createKeySchema = z.object({
  name: z.string().trim().min(1, "Give the key a name").max(80),
  env: z.enum(["live", "test"]).default("live"),
  scopes: z.array(z.string()).min(1, "Select at least one scope"),
  allowedOrigins: z.array(z.string()).max(20).default([]),
  /** Days until expiry. Omit for a key that does not expire. */
  expiresInDays: z.number().int().min(1).max(3650).nullable().default(null),
});

developerRouter.post("/keys", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createKeySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { name, env, scopes, allowedOrigins, expiresInDays } = parsed.data;

  const bad = scopes.filter((s) => !isApiScope(s));
  if (bad.length) {
    res.status(400).json({ error: `Unknown scope: ${bad.join(", ")}`, code: "unknown_scope" });
    return;
  }

  const origins: string[] = [];
  for (const o of allowedOrigins) {
    const norm = normalizeOrigin(o);
    if (!norm) {
      res.status(400).json({
        error: `"${o}" is not a valid origin. Use the scheme and host only, e.g. https://dashboard.example.com — https is required except on localhost.`,
        code: "invalid_origin",
      });
      return;
    }
    if (!origins.includes(norm)) origins.push(norm);
  }

  const { rows: countRows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM api_keys WHERE owner_id = $1 AND revoked_at IS NULL`,
    [req.user!.uid]
  );
  if (Number(countRows[0]?.n ?? 0) >= MAX_KEYS_PER_USER) {
    res.status(409).json({
      error: `You already have ${MAX_KEYS_PER_USER} active keys. Revoke one first.`,
      code: "key_limit",
    });
    return;
  }

  const key = generateApiKey(env);
  try {
    const { rows } = await pool.query<KeyRow>(
      `INSERT INTO api_keys (owner_id, name, env, token_hash, prefix, scopes, allowed_origins, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, CASE WHEN $8::int IS NULL THEN NULL ELSE now() + ($8 || ' days')::interval END)
       RETURNING ${KEY_COLUMNS}`,
      [req.user!.uid, name, env, key.hash, key.prefix, scopes, origins, expiresInDays]
    );
    res.status(201).json({
      key: keyShape(rows[0]),
      // Shown exactly once. We store only a SHA-256 hash, so this cannot be
      // recovered later — the console tells the user so before they close it.
      secret: key.secret,
    });
  } catch (err) {
    logger.error({ err }, "api key create failed");
    res.status(500).json({ error: "Could not create the key." });
  }
});

const patchKeySchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  scopes: z.array(z.string()).min(1).optional(),
  allowedOrigins: z.array(z.string()).max(20).optional(),
});

developerRouter.patch("/keys/:id", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = patchKeySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { name, scopes, allowedOrigins } = parsed.data;

  if (scopes) {
    const bad = scopes.filter((s) => !isApiScope(s));
    if (bad.length) {
      res.status(400).json({ error: `Unknown scope: ${bad.join(", ")}`, code: "unknown_scope" });
      return;
    }
  }
  let origins: string[] | null = null;
  if (allowedOrigins) {
    origins = [];
    for (const o of allowedOrigins) {
      const norm = normalizeOrigin(o);
      if (!norm) {
        res.status(400).json({ error: `"${o}" is not a valid origin.`, code: "invalid_origin" });
        return;
      }
      if (!origins.includes(norm)) origins.push(norm);
    }
  }

  const { rows } = await pool.query<KeyRow & { token_hash: string }>(
    `UPDATE api_keys
        SET name = COALESCE($3, name),
            scopes = COALESCE($4::text[], scopes),
            allowed_origins = COALESCE($5::text[], allowed_origins)
      WHERE id = $1 AND owner_id = $2
      RETURNING ${KEY_COLUMNS}, token_hash`,
    [req.params.id, req.user!.uid, name ?? null, scopes ?? null, origins]
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Narrowing a key's scopes has to take effect now, not whenever the
  // verification cache happens to expire.
  invalidateKeyCache(rows[0].token_hash);
  res.json({ key: keyShape(rows[0]) });
});

/**
 * DELETE /developer/keys/:id — revoke.
 *
 * The row is kept rather than deleted so `last_used_at` and `request_count`
 * survive: after revoking a key because something looked wrong, the first
 * question is always what it had been doing.
 */
developerRouter.delete("/keys/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query<{ token_hash: string }>(
    `UPDATE api_keys SET revoked_at = now()
      WHERE id = $1 AND owner_id = $2 AND revoked_at IS NULL
      RETURNING token_hash`,
    [req.params.id, req.user!.uid]
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  invalidateKeyCache(rows[0].token_hash);
  res.json({ success: true });
});

/* ------------------------------------------------------------------ */
/* Webhooks                                                            */
/* ------------------------------------------------------------------ */

interface HookRow {
  id: string;
  url: string;
  secret: string;
  events: string[] | null;
  device_ids: string[] | null;
  enabled: boolean;
  failures: number;
  last_status: number | null;
  last_error: string;
  last_at: Date | null;
  created_at: Date;
}

function hookShape(r: HookRow, includeSecret = false) {
  return {
    id: Number(r.id),
    url: r.url,
    events: r.events ?? [],
    deviceIds: r.device_ids ?? [],
    enabled: r.enabled,
    failures: r.failures,
    lastStatus: r.last_status,
    lastError: r.last_error || null,
    lastAt: r.last_at ? r.last_at.toISOString() : null,
    createdAt: r.created_at.toISOString(),
    ...(includeSecret ? { secret: r.secret } : {}),
  };
}

const HOOK_COLUMNS = `id, url, secret, events, device_ids, enabled, failures, last_status, last_error, last_at, created_at`;

developerRouter.get("/webhooks", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query<HookRow>(
    `SELECT ${HOOK_COLUMNS} FROM webhooks WHERE owner_id = $1 ORDER BY created_at DESC`,
    [req.user!.uid]
  );
  // The signing secret is returned here on purpose. Unlike an API key it is
  // not a credential that authenticates anyone to us — it is the key the
  // receiver needs to verify our signature, and we hold it in plaintext
  // regardless because we have to compute the HMAC. Hiding it would only mean
  // a developer who lost it had to rotate, breaking their live receiver.
  res.json({ webhooks: rows.map((r) => hookShape(r, true)) });
});

const MAX_HOOKS_PER_USER = 10;

const createHookSchema = z.object({
  url: z.string().url(),
  events: z.array(z.string()).default([]),
  deviceIds: z.array(z.string()).max(200).default([]),
});

developerRouter.post("/webhooks", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = createHookSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { url, events, deviceIds } = parsed.data;

  const bad = events.filter((e) => !isWebhookEvent(e));
  if (bad.length) {
    res.status(400).json({ error: `Unknown event: ${bad.join(", ")}`, code: "unknown_event" });
    return;
  }

  const reachable = await isPublicUrl(url);
  if (!reachable.ok) {
    res.status(400).json({ error: reachable.reason, code: "invalid_url" });
    return;
  }

  const { rows: countRows } = await pool.query<{ n: string }>(
    `SELECT COUNT(*)::text AS n FROM webhooks WHERE owner_id = $1`,
    [req.user!.uid]
  );
  if (Number(countRows[0]?.n ?? 0) >= MAX_HOOKS_PER_USER) {
    res.status(409).json({ error: `Limit of ${MAX_HOOKS_PER_USER} webhooks reached.`, code: "webhook_limit" });
    return;
  }

  // Only devices the caller actually owns may be targeted, so a webhook cannot
  // be used to probe whether an id exists on someone else's account.
  let ids: string[] = [];
  if (deviceIds.length) {
    const { rows } = await pool.query<{ id: string }>(
      `SELECT id FROM devices WHERE owner_id = $1 AND id = ANY($2::text[])`,
      [req.user!.uid, deviceIds]
    );
    ids = rows.map((r) => r.id);
    if (ids.length !== deviceIds.length) {
      res.status(400).json({ error: "One or more device ids are not in this account.", code: "unknown_device" });
      return;
    }
  }

  const { rows } = await pool.query<HookRow>(
    `INSERT INTO webhooks (owner_id, url, secret, events, device_ids)
     VALUES ($1, $2, $3, $4, $5) RETURNING ${HOOK_COLUMNS}`,
    [req.user!.uid, url, generateWebhookSecret(), events, ids]
  );
  refreshWebhookOwners();
  res.status(201).json({ webhook: hookShape(rows[0], true) });
});

const patchHookSchema = z.object({
  enabled: z.boolean().optional(),
  events: z.array(z.string()).optional(),
  deviceIds: z.array(z.string()).max(200).optional(),
});

developerRouter.patch("/webhooks/:id", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = patchHookSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { enabled, events, deviceIds } = parsed.data;
  if (events) {
    const bad = events.filter((e) => !isWebhookEvent(e));
    if (bad.length) {
      res.status(400).json({ error: `Unknown event: ${bad.join(", ")}`, code: "unknown_event" });
      return;
    }
  }
  const { rows } = await pool.query<HookRow>(
    `UPDATE webhooks
        SET enabled = COALESCE($3, enabled),
            events = COALESCE($4::text[], events),
            device_ids = COALESCE($5::text[], device_ids),
            -- Re-enabling a webhook that was switched off for failing must
            -- clear the counter, or it trips again on the next failure.
            failures = CASE WHEN $3 IS TRUE THEN 0 ELSE failures END
      WHERE id = $1 AND owner_id = $2
      RETURNING ${HOOK_COLUMNS}`,
    [req.params.id, req.user!.uid, enabled ?? null, events ?? null, deviceIds ?? null]
  );
  if (!rows[0]) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  refreshWebhookOwners();
  res.json({ webhook: hookShape(rows[0], true) });
});

developerRouter.delete("/webhooks/:id", requireAuth, async (req: AuthedRequest, res) => {
  const { rowCount } = await pool.query(`DELETE FROM webhooks WHERE id = $1 AND owner_id = $2`, [
    req.params.id,
    req.user!.uid,
  ]);
  if (!rowCount) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  refreshWebhookOwners();
  res.json({ success: true });
});

/**
 * POST /developer/webhooks/:id/test — deliver a synthetic event now.
 *
 * Without this the only way to find out whether a receiver verifies signatures
 * correctly is to wait for a real device to change state, which during
 * development may be never.
 */
developerRouter.post("/webhooks/:id/test", requireAuth, async (req: AuthedRequest, res) => {
  const { rows } = await pool.query<HookRow>(
    `SELECT ${HOOK_COLUMNS} FROM webhooks WHERE id = $1 AND owner_id = $2`,
    [req.params.id, req.user!.uid]
  );
  const hook = rows[0];
  if (!hook) {
    res.status(404).json({ error: "Not found" });
    return;
  }
  // Re-validated at send time, not just at creation: DNS can change under a
  // URL that was public when it was registered.
  const reachable = await isPublicUrl(hook.url);
  if (!reachable.ok) {
    res.status(400).json({ error: reachable.reason, code: "invalid_url" });
    return;
  }

  const body = JSON.stringify({
    id: `evt_test_${Date.now()}`,
    event: "device.state",
    deviceId: "test-device",
    data: { power: true, test: true },
    at: new Date().toISOString(),
  });
  const ts = Math.floor(Date.now() / 1000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  const startedAt = Date.now();
  try {
    const r = await fetch(hook.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "user-agent": "Circuvent-Webhooks/1",
        "x-circuvent-event": "device.state",
        "x-circuvent-signature": signWebhook(hook.secret, body, ts),
      },
      body,
      signal: controller.signal,
      redirect: "error",
    });
    await pool.query(`UPDATE webhooks SET last_status = $2, last_at = now(), last_error = '' WHERE id = $1`, [
      hook.id,
      r.status,
    ]);
    res.json({ delivered: r.ok, status: r.status, ms: Date.now() - startedAt });
  } catch (err) {
    const message = err instanceof Error ? err.message.slice(0, 200) : "delivery failed";
    await pool.query(`UPDATE webhooks SET last_error = $2, last_at = now() WHERE id = $1`, [hook.id, message]);
    res.status(502).json({ delivered: false, error: message, ms: Date.now() - startedAt });
  } finally {
    clearTimeout(timer);
  }
});
