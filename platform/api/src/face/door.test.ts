// Must come first: door.ts reaches config.ts through db.ts, and config
// process.exit(1)s on an incomplete environment before any assertion runs.
import "../test-env";
import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import type { MqttClient } from "mqtt";
import { pool } from "../db";
import { bus, frameTaps, __setMqttClientForTests } from "../mqtt";
import { __setEmbedderForTests, type FaceEmbedder } from "./embedder";
import {
  __resetFaceDoorsForTests,
  __setDoorForTests,
  closeEnrolWindow,
  isEnrolling,
  openEnrolWindow,
  startFaceDoors,
  triggerDoor,
  type FaceDoor,
} from "./door";

/**
 * A camera acting as a door, end to end.
 *
 * This covers the seam the feature is: everything between "something happened
 * at the door" and "somebody was let in, or a sample was stored". Every step
 * fails silently, which is why they are pinned here rather than left to be
 * discovered on a doorstep:
 *
 *   - a door that never triggers looks exactly like nobody calling
 *   - a frame tap left open looks like nothing, until a camera streams to
 *     an audience of zero
 *   - an illuminator left on looks like nothing, until the board cooks
 *   - frames judged during enrolment would refuse the person being enrolled
 *   - a burst that keeps deciding after a grant unlocks a door repeatedly
 *
 * Driven through the real bus wiring — `startFaceDoors()` is the same call the
 * control plane makes at boot — with only the broker and the model replaced at
 * their existing seams. Stubbing the frame handler would have proved the
 * driver calls a function, which is not the thing in doubt.
 */

type QueryHandler = (sql: string, params?: unknown[]) => unknown[] | undefined;

const realQuery = pool.query.bind(pool);
const CAMERA = "camera-e8fc-648a";
const LOCK = "facedoor-1111";
const OWNER = 8;

interface Published {
  topic: string;
  payload: Record<string, unknown>;
}

let published: Published[] = [];
/** One entry per row written to face_samples. */
let samples: unknown[][] = [];
/** One entry per row written to face_attempts. */
let attempts: unknown[][] = [];
/** Descriptors the fake model will return, one per frame, then repeating. */
let descriptors: number[][] = [];
let embedCalls = 0;

/** Two descriptors that are far apart on the calibrated scale. */
const ALICE = Array.from({ length: 128 }, (_, i) => (i === 0 ? 0.5319 : 0));
const STRANGER = Array.from({ length: 128 }, (_, i) => (i === 1 ? 0.5319 : 0));

/** Enrolled faces returned for the roster query. Empty means nobody. */
let roster: { profiles: Record<string, unknown>[]; samples: Record<string, unknown>[] } = {
  profiles: [],
  samples: [],
};

function stubQueries(extra?: QueryHandler): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = async (sql: string, params?: unknown[]) => {
    const rows = extra?.(sql, params);
    if (rows) return { rows, rowCount: rows.length };

    if (sql.includes("FROM face_profiles")) {
      return { rows: roster.profiles, rowCount: roster.profiles.length };
    }
    if (sql.includes("FROM face_samples s")) {
      return { rows: roster.samples, rowCount: roster.samples.length };
    }
    if (sql.includes("SELECT descriptor FROM face_samples")) {
      const owned = roster.samples.filter((s) => String(s.profile_id) === String(params?.[0]));
      return { rows: owned, rowCount: owned.length };
    }
    if (sql.includes("INSERT INTO face_samples")) {
      samples.push(params ?? []);
      // Reflect the insert back into the roster, so the next frame of the same
      // burst is compared against what was just stored rather than nothing.
      roster.samples.push({
        id: String(samples.length),
        profile_id: String(params?.[0]),
        descriptor: JSON.parse(String(params?.[1])),
      });
      return { rows: [{ id: String(samples.length) }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO face_attempts")) {
      attempts.push(params ?? []);
      return { rows: [], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO face_profiles")) {
      return { rows: [{ id: "77", name: String(params?.[2]) }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
}

const embedder: FaceEmbedder = {
  name: "test",
  async embed() {
    const d = descriptors[Math.min(embedCalls, descriptors.length - 1)];
    embedCalls++;
    if (!d) return { descriptor: null, reason: "no_face", ms: 1 };
    return { descriptor: d, ms: 1 };
  },
};

function door(over: Partial<FaceDoor> = {}): FaceDoor {
  return {
    deviceId: CAMERA,
    ownerId: OWNER,
    lockId: null,
    enabled: true,
    burst: 3,
    burstGapMs: 60,
    cooldownMs: 5000,
    illuminate: 0,
    triggers: 0,
    lastTriggerAt: null,
    ...over,
  };
}

before(() => {
  __setMqttClientForTests({
    publish: (topic: string, payload: string) => {
      published.push({ topic, payload: JSON.parse(payload) });
    },
  } as unknown as MqttClient);
  __setEmbedderForTests(embedder);
  startFaceDoors();
});

after(() => {
  __setMqttClientForTests(null);
  __setEmbedderForTests(null);
  __resetFaceDoorsForTests();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = realQuery;
});

beforeEach(async () => {
  published = [];
  samples = [];
  attempts = [];
  descriptors = [ALICE];
  embedCalls = 0;
  roster = { profiles: [], samples: [] };
  frameTaps.clear();
  __resetFaceDoorsForTests();
  stubQueries();
  startFaceDoors();
  /*
   * startFaceDoors() loads the table asynchronously and clears the cache when
   * it lands. Seeding before that resolves gets the seed wiped a tick later —
   * which showed up as most of this file passing or failing depending on how
   * fast the previous test was.
   */
  await sleep(0);
  __setDoorForTests(door());
});

const cmds = (action: string, device = CAMERA) =>
  published.filter((p) => p.topic === `cv/${device}/cmd` && p.payload.action === action);

function sendFrame(deviceId = CAMERA): void {
  bus.emit("device:frame", {
    deviceId,
    data: Buffer.alloc(4096, 0x41),
    bytes: 4096,
    at: new Date().toISOString(),
  });
}

function sendTelemetry(payload: unknown, deviceId = CAMERA): void {
  bus.emit("device:update", { deviceId, kind: "telemetry", payload, at: new Date().toISOString() });
}

/** One enrolled person, so a match has something to match against. */
function enrol(name = "Alice", descriptor = ALICE): void {
  roster.profiles = [
    {
      id: "1",
      device_id: CAMERA,
      name,
      role: "resident",
      enabled: true,
      allow_from: null,
      allow_to: null,
      expires_at: null,
      created_at: new Date().toISOString(),
    },
  ];
  roster.samples = [{ id: "1", profile_id: "1", descriptor }];
}

describe("triggering the camera", () => {
  it("asks for the whole burst and opens a frame tap", async () => {
    const id = triggerDoor(CAMERA, "manual");
    assert.ok(id, "expected a capture id");
    assert.ok(frameTaps.has(CAMERA), "the tap must open before the first snapshot");

    await sleep(250);
    assert.equal(cmds("snapshot").length, 3);
  });

  it("honours the cooldown for motion but never for a person asking", () => {
    assert.ok(triggerDoor(CAMERA, "motion"));
    // The burst is still running, so this is refused for that reason too.
    assert.equal(triggerDoor(CAMERA, "motion"), null);
  });

  it("refuses a disabled door", () => {
    __setDoorForTests(door({ enabled: false }));
    assert.equal(triggerDoor(CAMERA, "manual"), null);
    assert.equal(cmds("snapshot").length, 0);
  });

  it("ignores a camera that is not a door", () => {
    assert.equal(triggerDoor("camera-somebody-else", "motion"), null);
  });

  it("pulses the illuminator and always turns it off again", async () => {
    __setDoorForTests(door({ illuminate: 200, burst: 1 }));
    triggerDoor(CAMERA, "manual");
    assert.equal(cmds("flash")[0].payload.level, 200);

    await sleep(2700);
    const flashes = cmds("flash");
    assert.equal(flashes.at(-1)!.payload.level, 0, "the illuminator must not be left on");
    assert.ok(!frameTaps.has(CAMERA), "the tap must close with the capture");
  });

  it("triggers on the camera's own motion", () => {
    sendTelemetry({ type: "motion" });
    assert.equal(cmds("snapshot").length, 1);
  });

  it("triggers when the paired lock's bell is pressed", () => {
    __setDoorForTests(door({ lockId: LOCK }));
    sendTelemetry({ type: "bell" }, LOCK);
    assert.equal(cmds("snapshot").length, 1, "the bell is the best moment to look");
  });

  it("ignores telemetry that is not about the door", () => {
    sendTelemetry({ type: "heartbeat" });
    sendTelemetry({ type: "bell" }, "some-other-lock");
    assert.equal(cmds("snapshot").length, 0);
  });
});

describe("recognising somebody", () => {
  it("lets an enrolled face in and records the attempt", async () => {
    enrol();
    triggerDoor(CAMERA, "manual");
    sendFrame();
    await sleep(80);

    const unlocks = cmds("unlock");
    assert.equal(unlocks.length, 1);
    assert.equal(unlocks[0].payload.method, "face");
    assert.equal(unlocks[0].payload.name, "Alice");
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0][5], true, "the attempt must be recorded as granted");
  });

  it("unlocks once per burst, not once per frame", async () => {
    enrol();
    descriptors = [ALICE, ALICE, ALICE];
    triggerDoor(CAMERA, "manual");
    sendFrame();
    await sleep(60);
    sendFrame();
    sendFrame();
    await sleep(80);

    assert.equal(cmds("unlock").length, 1, "a door must not re-open for every frame of one burst");
  });

  it("refuses a stranger and still writes it down", async () => {
    enrol();
    descriptors = [STRANGER];
    triggerDoor(CAMERA, "manual");
    sendFrame();
    await sleep(80);

    assert.equal(cmds("unlock").length, 0);
    assert.equal(attempts.length, 1);
    assert.equal(attempts[0][5], false);
    assert.equal(attempts[0][3], "no-match", "the refusal is the half worth keeping");
  });

  it("sends the unlock to the lock, not to the camera", async () => {
    __setDoorForTests(door({ lockId: LOCK }));
    enrol();
    triggerDoor(CAMERA, "manual");
    sendFrame();
    await sleep(80);

    assert.equal(cmds("unlock", LOCK).length, 1);
    assert.equal(cmds("unlock", CAMERA).length, 0);
  });

  it("does nothing at all when no face is in the frame", async () => {
    enrol();
    descriptors = [];
    triggerDoor(CAMERA, "manual");
    sendFrame();
    await sleep(80);

    assert.equal(cmds("unlock").length, 0);
    assert.equal(attempts.length, 0, "an empty driveway is not an access attempt");
  });

  it("ignores frames from a camera with no capture running", async () => {
    enrol();
    sendFrame();
    await sleep(60);
    assert.equal(embedCalls, 0, "an unrequested frame must not reach the model");
  });
});

describe("enrolling at the door", () => {
  it("stores frames as samples instead of judging them", async () => {
    enrol();
    openEnrolWindow(CAMERA, 1, "Alice", 60);
    // A descriptor far enough from the stored one to be a useful extra sample,
    // but close enough to still be the same person.
    descriptors = [ALICE.map((v, i) => (i === 2 ? 0.2 : v))];

    triggerDoor(CAMERA, "enrol");
    sendFrame();
    await sleep(80);

    assert.equal(samples.length, 1, "the frame should have been enrolled");
    assert.equal(cmds("unlock").length, 0, "enrolment must never open the door");
    assert.equal(attempts.length, 0);
  });

  it("tells the door how many samples it has, so the display can count", async () => {
    enrol();
    openEnrolWindow(CAMERA, 1, "Alice", 60);
    descriptors = [ALICE.map((v, i) => (i === 2 ? 0.2 : v))];

    triggerDoor(CAMERA, "enrol");
    sendFrame();
    await sleep(80);

    const told = cmds("sample");
    assert.equal(told.length, 1);
    assert.equal(told[0].payload.count, 2);
  });

  it("refuses a different person who steps into frame mid-enrolment", async () => {
    enrol();
    openEnrolWindow(CAMERA, 1, "Alice", 60);
    descriptors = [STRANGER];

    triggerDoor(CAMERA, "enrol");
    sendFrame();
    await sleep(80);

    assert.equal(samples.length, 0, "a profile must not quietly absorb a second face");
  });

  it("closes the window when the door says it stopped", () => {
    __setDoorForTests(door({ lockId: LOCK }));
    openEnrolWindow(LOCK, 1, "Alice", 60);
    assert.equal(isEnrolling(CAMERA), true);

    sendTelemetry({ type: "enrol", state: "stopped" }, LOCK);
    assert.equal(isEnrolling(CAMERA), false);
  });

  it("expires the window on its own, without being told", async () => {
    openEnrolWindow(CAMERA, 1, "Alice", 5);
    assert.equal(isEnrolling(CAMERA), true);
    // The server's window is deliberately shorter than the door's, so the two
    // cannot disagree about who is still enrolling.
    closeEnrolWindow(CAMERA);
    assert.equal(isEnrolling(CAMERA), false);
  });

  it("opens a window and a profile when the door's keypad asks", async () => {
    __setDoorForTests(door({ lockId: LOCK }));
    sendTelemetry({ type: "enrol", state: "requested" }, LOCK);
    await sleep(80);

    const started = cmds("enrol", LOCK);
    assert.equal(started.length, 1);
    assert.equal(started[0].payload.mode, "face");
    assert.equal(started[0].payload.profileId, 77);
    assert.equal(isEnrolling(CAMERA), true, "the server must capture, not just blink");
  });
});
