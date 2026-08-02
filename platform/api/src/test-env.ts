/**
 * Environment for tests, imported for its side effect before anything else.
 *
 * `config.ts` validates the environment at import time and calls
 * process.exit(1) when it is incomplete, which would kill the test runner
 * before a single assertion ran. Importing this first satisfies the schema.
 *
 * These values never reach a real service: `pg` opens no connection until a
 * query is issued, and every test replaces `pool.query`.
 */

process.env.DATABASE_URL ??= "postgres://test:test@127.0.0.1:5432/test";
process.env.MQTT_PASSWORD ??= "test-mqtt-password";
process.env.MQTT_URL ??= "mqtt://127.0.0.1:1883";
process.env.JWT_SECRET ??= "test-secret-at-least-16-chars-long";
process.env.NODE_ENV = "test";

export {};
