import { Pool } from "pg";
import { config } from "./config";

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
  `);
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
