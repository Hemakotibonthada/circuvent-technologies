import mqtt, { type MqttClient } from "mqtt";
import { EventEmitter } from "node:events";
import { config, topics, deviceIdFromTopic } from "./config";
import { withDeviceLock } from "./device-lock";
import { pool, recordEvent } from "./db";
import { logger } from "./logger";
import { onStateChange, onEvent } from "./automations";
import { sendPushToHome } from "./push";
import { deviceChanged } from "./smarthome/report";

/** In-process bus: MQTT messages -> WebSocket fan-out to app clients. */
export const bus = new EventEmitter();
bus.setMaxListeners(0);

export interface DeviceUpdate {
  deviceId: string;
  kind: "state" | "telemetry" | "status";
  payload: unknown;
  at: string;
}

/**
 * A live camera frame. Kept off `DeviceUpdate` because it takes a different
 * path through the system: never persisted, and only delivered to sockets that
 * have explicitly asked to watch this camera.
 *
 * The JPEG stays a Buffer all the way to the socket. It used to be base64'd
 * here, which meant every frame paid an encode and grew by a third before it
 * had left the process — on the one path in the system where bytes and latency
 * are the whole product. ws.ts now encodes only for clients old enough to need
 * it, and most no longer do.
 */
export interface DeviceFrame {
  deviceId: string;
  /** Raw JPEG bytes, exactly as the device published them. */
  data: Buffer;
  bytes: number;
  at: string;
}

let client: MqttClient | null = null;

/** Throttle watts->telemetry snapshots so the energy chart has history w/o bloat. */
const lastEnergyLog = new Map<string, number>();

// Dynamic Security control channel. The control-plane is the dynsec admin; it
// manages broker clients (one per device) and their topic permissions here.
const DYNSEC_CMD = "$CONTROL/dynamic-security/v1";
const DYNSEC_RES = "$CONTROL/dynamic-security/v1/response";

export function getMqtt(): MqttClient {
  if (!client) throw new Error("MQTT not connected");
  return client;
}

/**
 * Test seam: installs a fake broker client.
 *
 * Refuses to run outside NODE_ENV=test, so it cannot be reached in production
 * even by accident. It exists because the alternative — running a real
 * Mosquitto in the unit suite — would make the tests slow and flaky for no
 * additional assurance about our own code.
 */
export function __setMqttClientForTests(fake: MqttClient | null): void {
  if (config.NODE_ENV !== "test") throw new Error("test-only");
  client = fake;
}

export function connectMqtt(): Promise<void> {
  return new Promise((resolve) => {
    client = mqtt.connect(config.MQTT_URL, {
      clientId: `control-plane-${Math.random().toString(16).slice(2, 10)}`,
      username: config.MQTT_USERNAME,
      password: config.MQTT_PASSWORD,
      reconnectPeriod: 2000,
      clean: true,
    });

    client.on("connect", () => {
      logger.info("MQTT connected");
      client!.subscribe(DYNSEC_RES, { qos: 1 });
      // Ensure the control-plane + device roles exist and the control-plane can
      // reach cv/#. Roles/ACLs applied here; subscribe to device topics just
      // after so the freshly-granted permission is in effect.
      bootstrapDynsec();
      setTimeout(() => {
        client!.subscribe([topics.allState, topics.allTelemetry, topics.allStatus], { qos: 1 }, (err) => {
          if (err) logger.error({ err }, "MQTT subscribe failed");
        });
        // Frames at QoS 0: a dropped frame is worth far less than the delay
        // and memory of retransmitting stale video.
        client!.subscribe(topics.allFrames, { qos: 0 }, (err) => {
          if (err) logger.error({ err }, "MQTT frame subscribe failed");
        });
        // ANPR captures, also QoS 0. A retransmitted capture of a car that has
        // already gone through the gate is worth nothing, and the burst gives
        // the redundancy that QoS 1 would otherwise be buying.
        client!.subscribe(topics.allAnpr, { qos: 0 }, (err) => {
          if (err) logger.error({ err }, "MQTT anpr subscribe failed");
        });
        // Drone position batches, also QoS 0 and for the same reason: a
        // retransmitted position from four seconds ago is worth nothing to a
        // moving aircraft, and the batch is already the redundancy.
        client!.subscribe(topics.allTrack, { qos: 0 }, (err) => {
          if (err) logger.error({ err }, "MQTT track subscribe failed");
        });
      }, 1500);
      resolve();
    });

    client.on("reconnect", () => logger.warn("MQTT reconnecting"));
    client.on("error", (err) => logger.error({ err }, "MQTT error"));
    client.on("message", (topic, buf) => {
      if (topic === DYNSEC_RES) {
        logDynsecResponse(buf);
        return;
      }
      void handleMessage(topic, buf);
    });
  });
}

/** Publish a Dynamic Security command batch on the $CONTROL channel. */
function dynsec(commands: Array<Record<string, unknown>>): void {
  try {
    getMqtt().publish(DYNSEC_CMD, JSON.stringify({ commands }));
  } catch (err) {
    logger.error({ err }, "dynsec publish failed");
  }
}

/** Idempotently create the control-plane + device roles (safe on every boot). */
function bootstrapDynsec(): void {
  dynsec([
    { command: "createRole", rolename: "controlplane" },
    { command: "addRoleACL", rolename: "controlplane", acltype: "publishClientSend", topic: "cv/#", priority: 0, allow: true },
    { command: "addRoleACL", rolename: "controlplane", acltype: "publishClientReceive", topic: "cv/#", priority: 0, allow: true },
    { command: "addRoleACL", rolename: "controlplane", acltype: "subscribePattern", topic: "cv/#", priority: 0, allow: true },
    { command: "addClientRole", username: config.MQTT_USERNAME, rolename: "controlplane" },
    { command: "createRole", rolename: "device" },
    { command: "addRoleACL", rolename: "device", acltype: "publishClientSend", topic: "cv/%u/#", priority: 0, allow: true },
    { command: "addRoleACL", rolename: "device", acltype: "publishClientReceive", topic: "cv/%u/#", priority: 0, allow: true },
    { command: "addRoleACL", rolename: "device", acltype: "subscribePattern", topic: "cv/%u/#", priority: 0, allow: true },
  ]);
}

/** Create a broker client for a freshly-provisioned device (username=id, password=key). */
export function provisionBrokerClient(id: string, key: string): void {
  dynsec([
    { command: "createClient", username: id, password: key },
    { command: "addClientRole", username: id, rolename: "device" },
  ]);
}

/** Remove a device's broker client (on unclaim/delete). */
export function deprovisionBrokerClient(id: string): void {
  dynsec([{ command: "deleteClient", username: id }]);
}

function logDynsecResponse(buf: Buffer): void {
  try {
    const doc = JSON.parse(buf.toString("utf8")) as { responses?: Array<{ command: string; error?: string }> };
    for (const r of doc.responses ?? []) {
      if (r.error && !/already exists/i.test(r.error)) {
        logger.warn({ command: r.command, error: r.error }, "dynsec command error");
      }
    }
  } catch {
    /* ignore malformed dynsec response */
  }
}

async function handleMessage(topic: string, buf: Buffer): Promise<void> {
  const deviceId = deviceIdFromTopic(topic);
  if (!deviceId) return;
  const kind = topic.split("/")[2] as DeviceUpdate["kind"] | "frame" | "anpr" | "track";

  // Frames are binary JPEG — they must be intercepted before any utf8 decode,
  // and must never reach persistMessage.
  if (kind === "frame") {
    handleFrame(deviceId, buf);
    return;
  }

  /*
   * ANPR captures are also binary, and are handled by their own pipeline.
   *
   * Deliberately NOT gated on `watchedDevices` the way frames are: a gate
   * camera does its work when nobody is looking, so requiring a live viewer
   * would mean plates were only ever read while an operator happened to have
   * the console open.
   *
   * Imported lazily to keep the module graph acyclic — anpr/index.ts publishes
   * commands and emits on the bus, so it depends on this file.
   */
  if (kind === "anpr") {
    void import("./anpr").then((m) => m.handleAnprCapture(deviceId, buf));
    return;
  }

  /*
   * Drone track batches are binary too, and must be intercepted before any
   * utf8 decode for the same reason frames are.
   *
   * Like ANPR, and unlike `frame`, this is NOT gated on anybody watching: the
   * flight record is the thing that gets read after an incident, and a record
   * that only exists when an operator happened to have the console open is not
   * a record.
   */
  if (kind === "track") {
    void import("./drone").then((m) => m.handleTrackBatch(deviceId, buf));
    return;
  }

  const raw = buf.toString("utf8");
  let payload: unknown;
  try {
    payload = raw ? JSON.parse(raw) : {};
  } catch {
    payload = { raw };
  }
  const at = new Date().toISOString();

  // Fan out to live WebSocket clients BEFORE touching Postgres. The dashboard
  // only needs the payload to confirm a command, so making it wait on two DB
  // round-trips plus automation evaluation added tens-to-hundreds of ms to
  // every toggle confirmation. Persistence still happens, just off the hot path.
  bus.emit("device:update", { deviceId, kind, payload, at } satisfies DeviceUpdate);

  try {
    // Serialised per device. persistMessage reads the previous state, writes
    // the new one, then diffs them to decide which alerts and automations to
    // fire — and every await in that sequence yields. Two messages from the
    // same device would otherwise both read the same "previous" value, firing
    // a false->true edge twice, and could land their writes out of order.
    // Different devices still run concurrently.
    await withDeviceLock(deviceId, () => persistMessage(deviceId, kind, payload, raw));
  } catch (err) {
    logger.error({ err, deviceId, kind }, "Failed to persist device message");
  }
}

/**
 * Hard ceiling per camera. Protects the broker and every watching socket from
 * a misconfigured or compromised device streaming as fast as it can.
 *
 * This was 30, which quietly made it the real frame-rate limit of the whole
 * product: a camera asked for 60 would capture 60, encrypt 60 and publish 60,
 * and this line dropped every other one before it reached a socket. The device
 * had no way to know, so it kept paying for frames nobody would ever see.
 *
 * 60 is a genuine abuse ceiling rather than a policy: it is above anything the
 * firmware will ask for (FPS_MAX is 60) and still bounds a rogue device.
 */
const MAX_FPS = 60;
const MAX_FRAME_BYTES = 512 * 1024;
const lastFrameAt = new Map<string, number>();

/**
 * Device ids at least one WebSocket client is currently viewing, maintained by
 * ws.ts. A camera that keeps streaming with nobody watching — a stale lease, a
 * rogue command — would otherwise cost work on every frame for an audience of
 * zero.
 */
export const watchedDevices = new Set<string>();

function handleFrame(deviceId: string, buf: Buffer): void {
  if (!watchedDevices.has(deviceId)) return;
  if (buf.length === 0 || buf.length > MAX_FRAME_BYTES) return;

  const now = Date.now();
  const prev = lastFrameAt.get(deviceId) ?? 0;
  if (now - prev < 1000 / MAX_FPS) return;
  lastFrameAt.set(deviceId, now);

  bus.emit("device:frame", {
    deviceId,
    data: buf,
    bytes: buf.length,
    at: new Date(now).toISOString(),
  } satisfies DeviceFrame);
}

async function persistMessage(
  deviceId: string,
  kind: DeviceUpdate["kind"],
  payload: unknown,
  raw: string
): Promise<void> {
  if (kind === "state") {
      const prev = await pool.query<{ owner_id: number | null; name: string | null; state: Record<string, unknown> | null }>(
        `SELECT owner_id, name, state FROM devices WHERE id = $1`,
        [deviceId]
      );
      const row = prev.rows[0];
      const prevState = row?.state ?? null;
      // Keep fw_version in step with what the device reports.
      //
      // It was read in ten places — the registry, device reports, the public
      // /v1 API, the admin fleet list and OTA targeting — and written in none,
      // so every device showed a blank firmware and an OTA campaign filtered
      // by version matched nothing. The value lives in the state payload the
      // firmware already sends on every publish; it just was never lifted out.
      const reportedFw = (payload as Record<string, unknown>)?.fw;
      const fw = typeof reportedFw === "string" ? reportedFw.slice(0, 40) : null;
      await pool.query(
        `UPDATE devices
            SET state = $2, online = true, last_seen = now(),
                fw_version = COALESCE(NULLIF($3, ''), fw_version)
          WHERE id = $1`,
        [deviceId, payload as object, fw]
      );
      if (row?.owner_id != null) {
        await notifyStateEvents(row.owner_id, row.name || deviceId, prevState, payload as Record<string, unknown>);
        await onStateChange(deviceId, prevState, payload as Record<string, unknown>);
        /*
         * Tell Google and Alexa, if this customer has linked either.
         *
         * Deliberately not awaited. The assistants are a third party over the
         * internet and this is the path a wall switch travels: a slow gateway
         * must not delay persisting the state or the dashboard seeing it. The
         * call coalesces internally and does nothing at all for the accounts
         * that have never linked, which is most of them.
         */
        deviceChanged(deviceId);
      }
      // Snapshot numeric watts into telemetry (throttled) so the energy
      // dashboard has real history even for devices that only report in state.
      const w = Number((payload as Record<string, unknown>)?.watts);
      if (Number.isFinite(w)) {
        const now = Date.now();
        if (now - (lastEnergyLog.get(deviceId) ?? 0) > 60000) {
          lastEnergyLog.set(deviceId, now);
          void pool
            .query(
              `INSERT INTO telemetry (device_id, payload) SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM devices WHERE id = $1)`,
              [deviceId, { watts: w }]
            )
            .catch(() => {});
        }
      }
    } else if (kind === "telemetry") {
      await pool.query(
        `INSERT INTO telemetry (device_id, payload) SELECT $1, $2
         WHERE EXISTS (SELECT 1 FROM devices WHERE id = $1)`,
        [deviceId, payload as object]
      );
      await pool.query(`UPDATE devices SET online = true, last_seen = now() WHERE id = $1`, [deviceId]);
      // Discrete events (facedoor access, gate rfid, doorbell) can drive
      // event-triggered automations (welcome-home greeting + lights + AC).
      const evt = payload as Record<string, unknown>;
      if (evt && typeof evt === "object" && typeof evt.type === "string") {
        const owner = await pool.query<{ owner_id: number | null }>(`SELECT owner_id FROM devices WHERE id = $1`, [deviceId]);
        if (owner.rows[0]?.owner_id != null) await onEvent(deviceId, evt);
      }
    } else if (kind === "status") {
      const online = (payload as { online?: boolean })?.online ?? raw.includes("online");
      const prev = await pool.query<{ owner_id: number | null; name: string | null; online: boolean | null }>(
        // Reads the raw flag deliberately: this is transition detection, not a
        // liveness report. The edge true -> false is what emits the offline
        // event, so it must compare against what was stored, not against a
        // derived value. /* raw-flag: transition detection */
        `SELECT owner_id, name, online FROM devices WHERE id = $1`,
        [deviceId]
      );
      const row = prev.rows[0];
      await pool.query(`UPDATE devices SET online = $2, last_seen = now() WHERE id = $1`, [deviceId, online]);
      if (row?.owner_id != null && row.online === true && online === false) {
        await sendPushToHome(row.owner_id, { title: "Device offline", body: `${row.name || deviceId} went offline.` }, "residents");
        await recordEvent(row.owner_id, "info", "Device offline", `${row.name || deviceId} went offline.`, deviceId);
      }
      if (row?.owner_id != null && row.online === false && online === true) {
        await recordEvent(row.owner_id, "success", "Device online", `${row.name || deviceId} reconnected.`, deviceId);
      }
  }
}

/** Push notifications for notable AquaGuard/Guardian state transitions (edge-triggered). */
async function notifyStateEvents(
  ownerId: number,
  name: string,
  prev: Record<string, unknown> | null,
  next: Record<string, unknown>
): Promise<void> {
  const rose = (f: string) => !!next?.[f] && !prev?.[f];
  if (rose("dryRun")) {
    // Water damage is everybody's problem, including a houseguest who is the
    // only person in the building.
    await sendPushToHome(ownerId, { title: "AquaGuard alert", body: `${name}: dry-run detected — pump stopped.` }, "everyone");
    await recordEvent(ownerId, "alert", "AquaGuard dry-run", `${name}: dry-run detected — pump stopped.`);
  }
  if (rose("overflow")) {
    await sendPushToHome(ownerId, { title: "AquaGuard alert", body: `${name}: tank overflow — pump stopped.` }, "everyone");
    await recordEvent(ownerId, "alert", "Tank overflow", `${name}: tank overflow — pump stopped.`);
  }
  if (rose("sos")) {
    // Somebody in this house has pressed a panic button. There is no role
    // that should be left out of that.
    await sendPushToHome(ownerId, { title: "SOS alert", body: `${name}: SOS triggered!` }, "everyone");
    await recordEvent(ownerId, "security", "SOS triggered", `${name}: SOS triggered!`);
  }
  if (rose("motion")) {
    await recordEvent(ownerId, "security", "Motion detected", `${name}: motion detected.`);
  }
}

/** Publish a command to a device. QoS 1 for reliable delivery. */
export function publishCommand(deviceId: string, payload: unknown): void {
  getMqtt().publish(topics.cmd(deviceId), JSON.stringify(payload), { qos: 1 });
}
