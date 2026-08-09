import { Pool } from "pg";
import { config } from "./config";
import { generateSerial } from "./serial";
import { logger } from "./logger";

export const pool = new Pool({ connectionString: config.DATABASE_URL, max: 10 });

/** Create the schema on boot (idempotent). Keeps deploy to a single `up`. */
export async function initDb(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id          BIGSERIAL PRIMARY KEY,
      email       TEXT UNIQUE NOT NULL,
      name        TEXT NOT NULL DEFAULT '',
      password    TEXT NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS devices (
      id           TEXT PRIMARY KEY,           -- device serial / id (matches MQTT topic)
      key_hash     TEXT NOT NULL,              -- bcrypt hash of the device's claim key
      owner_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
      name         TEXT NOT NULL DEFAULT '',
      type         TEXT NOT NULL DEFAULT 'generic',
      room         TEXT NOT NULL DEFAULT '',
      online       BOOLEAN NOT NULL DEFAULT false,
      last_seen    TIMESTAMPTZ,
      state        JSONB NOT NULL DEFAULT '{}'::jsonb,
      fw_version   TEXT NOT NULL DEFAULT '',
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_devices_owner ON devices(owner_id);

    CREATE TABLE IF NOT EXISTS telemetry (
      id          BIGSERIAL PRIMARY KEY,
      device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      ts          TIMESTAMPTZ NOT NULL DEFAULT now(),
      payload     JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_telemetry_device_ts ON telemetry(device_id, ts DESC);

    CREATE TABLE IF NOT EXISTS commands (
      id          BIGSERIAL PRIMARY KEY,
      device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      user_id     BIGINT REFERENCES users(id) ON DELETE SET NULL,
      payload     JSONB NOT NULL,
      ts          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_commands_device_ts ON commands(device_id, ts DESC);

    CREATE TABLE IF NOT EXISTS automations (
      id          BIGSERIAL PRIMARY KEY,
      owner_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      enabled     BOOLEAN NOT NULL DEFAULT true,
      trigger     JSONB NOT NULL,
      action      JSONB NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_automations_owner ON automations(owner_id);

    /*
     * Execution record, so a rule that never runs can be seen to never run.
     *
     * Switch timers spent weeks saving correctly, showing the right next-run
     * time, counting down, and never moving a relay — because the stored
     * command was a shape the device discards. Nothing in the product could
     * distinguish "fired and worked" from "never fired at all", so the fault
     * was invisible from every screen and every log a user can reach.
     *
     * last_error holds the reason a run failed rather than a boolean: "the
     * device is offline" and "you no longer own that device" need completely
     * different responses, and one undifferentiated failure flag is how
     * someone ends up reflashing firmware to chase an ownership change.
     */
    ALTER TABLE automations ADD COLUMN IF NOT EXISTS last_run_at TIMESTAMPTZ;
    ALTER TABLE automations ADD COLUMN IF NOT EXISTS last_run_ok BOOLEAN;
    ALTER TABLE automations ADD COLUMN IF NOT EXISTS last_error TEXT;
    ALTER TABLE automations ADD COLUMN IF NOT EXISTS run_count BIGINT NOT NULL DEFAULT 0;

    CREATE TABLE IF NOT EXISTS push_tokens (
      token       TEXT PRIMARY KEY,
      user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      platform    TEXT NOT NULL DEFAULT '',
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id);

    -- Favorite flag for quick-access on the dashboard.
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS favorite BOOLEAN NOT NULL DEFAULT false;

    -- Rooms: optional metadata (icon/order) + lets empty rooms exist. Device
    -- membership is the free-text devices.room matched by name.
    CREATE TABLE IF NOT EXISTS rooms (
      id          BIGSERIAL PRIMARY KEY,
      owner_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      icon        TEXT NOT NULL DEFAULT '🏠',
      sort        INT NOT NULL DEFAULT 0,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (owner_id, name)
    );
    CREATE INDEX IF NOT EXISTS idx_rooms_owner ON rooms(owner_id);

    -- Scenes: one-tap presets that publish a batch of device commands.
    CREATE TABLE IF NOT EXISTS scenes (
      id          BIGSERIAL PRIMARY KEY,
      owner_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name        TEXT NOT NULL,
      icon        TEXT NOT NULL DEFAULT '✨',
      actions     JSONB NOT NULL DEFAULT '[]'::jsonb,
      favorite    BOOLEAN NOT NULL DEFAULT false,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_scenes_owner ON scenes(owner_id);

    -- Events: the notification center + activity log feed.
    CREATE TABLE IF NOT EXISTS events (
      id          BIGSERIAL PRIMARY KEY,
      owner_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id   TEXT,
      kind        TEXT NOT NULL DEFAULT 'info',   -- info | alert | success | security | activity
      title       TEXT NOT NULL,
      body        TEXT NOT NULL DEFAULT '',
      read        BOOLEAN NOT NULL DEFAULT false,
      ts          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_events_owner_ts ON events(owner_id, ts DESC);

    -- Admin role flag for the control-plane admin console.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT false;

    -- Session revocation.
    --
    -- JWTs are stateless, so until these existed there was no way to end a
    -- session early: a stolen phone kept control of the owner's locks and gates
    -- for the full token lifetime, blocking an account did nothing, and there
    -- was no "sign out everywhere". token_epoch is stamped into every token and
    -- compared on each request, so bumping it invalidates every token that
    -- account has ever been issued.
    --
    -- Default 0 matches the absent claim on tokens issued before this shipped,
    -- so deploying it does not sign the whole user base out.
    ALTER TABLE users ADD COLUMN IF NOT EXISTS token_epoch BIGINT NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT false;

    -- Password reset codes.
    --
    -- Separate from pending_registrations because the two mean different
    -- things: one holds an account that does not exist yet, this one proves
    -- control of an address for an account that does. Sharing the table would
    -- make it possible for a reset to overwrite a sign-up in progress.
    --
    -- Only a bcrypt hash of the code is stored, so a database read does not
    -- hand over the ability to reset anyone's password.
    CREATE TABLE IF NOT EXISTS password_resets (
      email       TEXT PRIMARY KEY,
      otp_hash    TEXT NOT NULL,
      attempts    INT NOT NULL DEFAULT 0,
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Scheduler tick claims.
    --
    -- Time-triggered automations were de-duplicated by a variable inside the
    -- scheduler closure, which fails in two ways. Across replicas each process
    -- keeps its own copy, so every schedule fires once per replica. And on a
    -- single replica the variable resets when the process restarts, so a deploy
    -- at 07:30 re-runs every 07:30 automation — lights and pumps switching a
    -- second time because we shipped.
    --
    -- The primary key makes claiming a minute atomic: the insert either wins or
    -- conflicts, and only the winner runs the tick.
    CREATE TABLE IF NOT EXISTS scheduler_ticks (
      tick_key    TEXT PRIMARY KEY,
      ran_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_scheduler_ticks_ran_at ON scheduler_ticks(ran_at);

    -- Refresh tokens, for detecting replay.
    --
    -- token_epoch can revoke a session but cannot tell a thief's use of a token
    -- from the owner's — both present a valid signature. Refresh tokens are
    -- single-use and rotate, so a stolen one being presented twice is a signal
    -- rather than a guess, and the whole family is torn down.
    --
    -- Stored as a SHA-256 hash rather than bcrypt on purpose: lookup is BY the
    -- hash, and bcrypt's per-row salt would force a full-table scan. A fast
    -- hash is safe here because the token is 256 bits of randomness, so there
    -- is no dictionary to attack.
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          BIGSERIAL PRIMARY KEY,
      user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      family_id   TEXT NOT NULL,
      token_hash  TEXT NOT NULL UNIQUE,
      used_at     TIMESTAMPTZ,
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_tokens(family_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_expires ON refresh_tokens(expires_at);

    -- Email-OTP sign-up: the account is only created after the code is verified.
    CREATE TABLE IF NOT EXISTS pending_registrations (
      email       TEXT PRIMARY KEY,
      name        TEXT NOT NULL DEFAULT '',
      password    TEXT NOT NULL,
      otp_hash    TEXT NOT NULL,
      attempts    INT NOT NULL DEFAULT 0,
      expires_at  TIMESTAMPTZ NOT NULL,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Zone-1 gate guest passes: time-boxed QR/PIN codes that open a barrier.
    CREATE TABLE IF NOT EXISTS gate_passes (
      id          BIGSERIAL PRIMARY KEY,
      owner_id    BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_id   TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
      code        TEXT NOT NULL UNIQUE,
      label       TEXT NOT NULL DEFAULT 'Guest',
      valid_from  TIMESTAMPTZ NOT NULL DEFAULT now(),
      valid_to    TIMESTAMPTZ NOT NULL,
      max_uses    INT NOT NULL DEFAULT 1,
      uses        INT NOT NULL DEFAULT 0,
      revoked     BOOLEAN NOT NULL DEFAULT false,
      last_used   TIMESTAMPTZ,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_gate_passes_owner ON gate_passes(owner_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_gate_passes_code ON gate_passes(code);

    -- Developer API keys.
    --
    -- Long-lived, independently revocable, scoped credentials for third-party
    -- integrations. See api-keys.ts for why these exist rather than handing a
    -- developer a login JWT, and why the secret is SHA-256 and not bcrypt.
    --
    -- token_hash is UNIQUE so authentication is a single index probe.
    CREATE TABLE IF NOT EXISTS api_keys (
      id              BIGSERIAL PRIMARY KEY,
      owner_id        BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name            TEXT NOT NULL DEFAULT '',
      env             TEXT NOT NULL DEFAULT 'live',
      token_hash      TEXT NOT NULL UNIQUE,
      prefix          TEXT NOT NULL,
      scopes          TEXT[] NOT NULL DEFAULT '{}',
      -- Empty means server-to-server only: a request carrying any Origin
      -- header is refused. See originAllowed() for what this does and does
      -- not guarantee.
      allowed_origins TEXT[] NOT NULL DEFAULT '{}',
      expires_at      TIMESTAMPTZ,
      revoked_at      TIMESTAMPTZ,
      last_used_at    TIMESTAMPTZ,
      request_count   BIGINT NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_api_keys_owner ON api_keys(owner_id, created_at DESC);

    -- Outbound webhooks.
    --
    -- Without these the only way for a developer's backend to learn that a
    -- sensor tripped is to poll, which is both slower than the event and more
    -- load than delivering it once. Deliveries are HMAC-signed so the receiver
    -- can prove the request came from us; see webhooks.ts.
    --
    -- The secret is stored in plaintext on purpose and unusually: unlike an API
    -- key, we are the party that must COMPUTE the HMAC on every delivery, so a
    -- one-way hash would make it useless. It is a signing key, not a
    -- credential that authenticates anyone to us.
    CREATE TABLE IF NOT EXISTS webhooks (
      id            BIGSERIAL PRIMARY KEY,
      owner_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      url           TEXT NOT NULL,
      secret        TEXT NOT NULL,
      events        TEXT[] NOT NULL DEFAULT '{}',
      -- Empty means every device the account owns.
      device_ids    TEXT[] NOT NULL DEFAULT '{}',
      enabled       BOOLEAN NOT NULL DEFAULT true,
      failures      INT NOT NULL DEFAULT 0,
      last_status   INT,
      last_error    TEXT NOT NULL DEFAULT '',
      last_at       TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_webhooks_owner ON webhooks(owner_id);
    CREATE INDEX IF NOT EXISTS idx_webhooks_enabled ON webhooks(enabled) WHERE enabled;

    -- Device registry.
    --
    -- serial is the customer-facing identifier printed on the unit. devices.id
    -- is derived from the chip id and is fine as a key but poor on a label —
    -- see serial.ts. NULL is allowed because rows created before this existed
    -- have no serial until they are backfilled; the partial UNIQUE index means
    -- those NULLs do not collide with each other.
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS serial TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_devices_serial ON devices(serial) WHERE serial IS NOT NULL;

    -- The hardware id the device reported at provisioning. Kept so a unit that
    -- is factory reset can be recognised as the same physical board, and so a
    -- serial can be regenerated identically rather than a second one issued
    -- while the label on the case still shows the first.
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS hwid TEXT NOT NULL DEFAULT '';

    -- Credential lifecycle.
    --
    -- The claim key is bcrypt-hashed, so it cannot be read back — not by an
    -- admin, not by us. These columns are what can honestly be shown instead:
    -- when the credential was issued, when it was last replaced, and how often.
    -- Support answering "what is my device key" has to reissue, and reissuing
    -- needs to be visible.
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS key_issued_at TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS key_rotated_at TIMESTAMPTZ;
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS key_rotations INT NOT NULL DEFAULT 0;

    -- Notes the internal team keeps against a unit (RMA, batch, customer case).
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS notes TEXT NOT NULL DEFAULT '';
    ALTER TABLE devices ADD COLUMN IF NOT EXISTS batch TEXT NOT NULL DEFAULT '';

    -- Administrative audit trail for devices.
    --
    -- The activity feed in the events table belongs to the customer and
    -- answers "what did my house do". This answers a different question —
    -- "who inside the company changed this unit's ownership or reissued its
    -- credential, and why" — and it must not be mixed into a feed the
    -- customer can clear.
    --
    -- actor_id is nullable and ON DELETE SET NULL: an audit entry has to
    -- survive the departure of the operator who made it, which is precisely
    -- when it is most likely to be read.
    CREATE TABLE IF NOT EXISTS device_audit (
      id          BIGSERIAL PRIMARY KEY,
      device_id   TEXT NOT NULL,
      actor_id    BIGINT REFERENCES users(id) ON DELETE SET NULL,
      actor_email TEXT NOT NULL DEFAULT '',
      action      TEXT NOT NULL,
      detail      JSONB NOT NULL DEFAULT '{}'::jsonb,
      note        TEXT NOT NULL DEFAULT '',
      ts          TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_device_audit_device ON device_audit(device_id, ts DESC);
    CREATE INDEX IF NOT EXISTS idx_device_audit_actor ON device_audit(actor_id, ts DESC);
  `);

  await backfillSerials();
}

/**
 * Gives existing devices a serial.
 *
 * Runs once in practice — the UPDATE matches nothing on every later boot — but
 * has to exist, because without it the registry's whole premise ("read the
 * number off the unit and find it") would work for devices sold after this
 * shipped and fail for every device already in the field.
 *
 * Serials are derived from the hardware id embedded in the device id, so they
 * are stable: running this twice cannot produce a different answer, and a
 * device that is later re-provisioned keeps the number on its label.
 */
async function backfillSerials(): Promise<void> {
  const { rows } = await pool.query<{ id: string; type: string }>(
    `SELECT id, type FROM devices WHERE serial IS NULL`
  );
  if (!rows.length) return;

  let filled = 0;
  for (const d of rows) {
    // The chip id is the tail of `${type}-${hwid}`; fall back to the whole id
    // for anything that does not follow that shape.
    const hwid = d.id.startsWith(`${d.type}-`) ? d.id.slice(d.type.length + 1) : d.id;
    let serial = generateSerial(d.type, hwid);
    // A collision is possible in principle (7 payload characters, derived).
    // Retry with a random payload rather than leave the row without a serial.
    for (let attempt = 0; attempt < 5; attempt++) {
      const clash = await pool.query(`SELECT 1 FROM devices WHERE serial = $1 AND id <> $2`, [serial, d.id]);
      if (!clash.rowCount) break;
      serial = generateSerial(d.type);
    }
    try {
      await pool.query(`UPDATE devices SET serial = $2, hwid = COALESCE(NULLIF(hwid,''), $3) WHERE id = $1`, [
        d.id,
        serial,
        hwid,
      ]);
      filled++;
    } catch {
      /* a concurrent boot won the race for this serial — it has one either way */
    }
  }
  if (filled) logger.info({ filled }, "backfilled device serials");
}

/** Records an administrative action against a device (best-effort). */
export async function recordDeviceAudit(
  deviceId: string,
  actor: { uid: number; email: string } | null,
  action: string,
  detail: Record<string, unknown> = {},
  note = ""
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO device_audit (device_id, actor_id, actor_email, action, detail, note)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [deviceId, actor?.uid ?? null, actor?.email ?? "", action, detail, note]
    );
  } catch (err) {
    logger.error({ err, deviceId, action }, "device audit insert failed");
  }
}

/** Record an event for the notification center / activity log (best-effort). */
export async function recordEvent(
  ownerId: number,
  kind: string,
  title: string,
  body = "",
  deviceId: string | null = null
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO events (owner_id, device_id, kind, title, body) VALUES ($1, $2, $3, $4, $5)`,
      [ownerId, deviceId, kind, title, body]
    );
  } catch {
    /* best-effort: never block the caller on the activity feed */
  }
}
