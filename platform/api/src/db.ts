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
  `);
}
