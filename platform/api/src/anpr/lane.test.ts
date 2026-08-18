// Must come first: lane.ts reaches config.ts through db.ts, and config
// process.exit(1)s on an incomplete environment before any assertion runs.
import "../test-env";
import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import type { MqttClient } from "mqtt";
import { pool } from "../db";
import { bus, frameTaps, __setMqttClientForTests } from "../mqtt";
import { __resetAnprForTests } from "./index";
import { __setRecogniserForTests, type PlateRecogniser } from "./recognizer";
import { __resetLanesForTests, isLane, reloadLanes, startCameraLanes, triggerLane } from "./lane";

/**
 * ANPR on an ordinary camera, end to end.
 *
 * This covers the seam the feature is: everything between "the camera reported
 * motion" and "a burst of frames reached the recogniser as one capture". None
 * of those steps fails loudly, which is why they are pinned here rather than
 * left to be noticed at a gate.
 *
 *   - a lane that never triggers looks exactly like a gate nobody drove through
 *   - a frame tap left open looks like nothing, until a camera is streaming to
 *     an audience of zero
 *   - an illuminator left on looks like nothing, until the board cooks
 *   - frames filed under separate capture ids look like three cars arriving
 *
 * Deliberately driven through the *real* pipeline rather than a stubbed one.
 * The broker and the OCR provider are replaced at their existing test seams —
 * `__setMqttClientForTests` and `__setRecogniserForTests` — so what runs in
 * between is the same collector, the same burst window and the same frame
 * selection that production runs. Stubbing `ingestFrame` would have proved the
 * lane calls a function, which is not the thing in doubt.
 */

type QueryHandler = (sql: string, params?: unknown[]) => unknown[] | undefined;

const realQuery = pool.query.bind(pool);
const DEVICE = "camera-e8fc-648a";
const OWNER = 8;

interface Published {
  topic: string;
  payload: Record<string, unknown>;
  at: number;
}

let published: Published[] = [];
/** Every JPEG the recogniser was actually asked about. */
let recognised: Buffer[] = [];
/** One entry per row the pipeline wrote to plate_reads. */
let reads: unknown[][] = [];
let laneRows: Record<string, unknown>[] = [];

function stubQueries(extra?: QueryHandler): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = async (sql: string, params?: unknown[]) => {
    const rows = extra?.(sql, params);
    if (rows) return { rows, rowCount: rows.length };

    if (sql.includes("FROM anpr_lanes")) return { rows: laneRows, rowCount: laneRows.length };
    // deviceInfo(): the owner and the lane direction for a capture.
    if (sql.includes("FROM devices d")) {
      return { rows: [{ owner_id: OWNER, state: {}, lane_direction: "both" }], rowCount: 1 };
    }
    if (sql.includes("INSERT INTO plate_reads")) {
      reads.push(params ?? []);
      return { rows: [{ id: String(reads.length) }], rowCount: 1 };
    }
    return { rows: [], rowCount: 0 };
  };
}

/** One enabled lane, with everything fast enough for a test to wait on it. */
function laneRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    device_id: DEVICE,
    owner_id: String(OWNER),
    enabled: true,
    direction: "both",
    burst: 3,
    burst_gap_ms: 120,
    cooldown_ms: 5000,
    illuminate: 0,
    triggers: "0",
    last_trigger_at: null,
    ...over,
  };
}

const recogniser: PlateRecogniser = {
  name: "test",
  async recognise(jpeg: Buffer) {
    recognised.push(jpeg);
    return { candidates: [{ raw: "KA01AB1234", confidence: 90 }], ms: 1 };
  },
};

before(() => {
  __setMqttClientForTests({
    publish: (topic: string, payload: string) => {
      published.push({ topic, payload: JSON.parse(payload), at: Date.now() });
    },
  } as unknown as MqttClient);
  __setRecogniserForTests(recogniser);
  /*
   * The bus listeners are registered once, by the same call the control plane
   * makes at boot. Wiring the handlers by hand here would prove they work
   * while leaving "is anything actually listening" — the failure that makes a
   * lane silently never fire — untested.
   */
  startCameraLanes();
});

after(() => {
  __setMqttClientForTests(null);
  __setRecogniserForTests(null);
  __resetAnprForTests();
  __resetLanesForTests();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = realQuery;
});

beforeEach(() => {
  published = [];
  recognised = [];
  reads = [];
  laneRows = [laneRow()];
  frameTaps.clear();
  __resetLanesForTests();
  __resetAnprForTests();
  stubQueries();
});

const cmds = (action: string) =>
  published.filter((p) => p.topic === `cv/${DEVICE}/cmd` && p.payload.action === action);

function sendFrame(bytes = 5000, deviceId = DEVICE): void {
  bus.emit("device:frame", {
    deviceId,
    data: Buffer.alloc(bytes, 0x41),
    bytes,
    at: new Date().toISOString(),
  });
}

function sendTelemetry(payload: unknown, deviceId = DEVICE): void {
  bus.emit("device:update", {
    deviceId,
    kind: "telemetry",
    payload,
    at: new Date().toISOString(),
  });
}

describe("loading", () => {
  it("only drives cameras that have been enrolled", async () => {
    await reloadLanes();
    assert.equal(isLane(DEVICE), true);
    assert.equal(isLane("camera-somebody-else"), false);
  });

  it("refuses to drive a camera it knows nothing about", async () => {
    /*
     * The trigger is reached from a bus event carrying a device id, so an
     * unknown device has to be a no-op rather than a snapshot storm aimed at
     * whatever that id happens to be.
     */
    laneRows = [];
    await reloadLanes();
    assert.equal(triggerLane(DEVICE, "motion"), null);
    assert.equal(published.length, 0);
  });

  it("drops a lane whose row has been disabled", async () => {
    laneRows = [laneRow({ enabled: false })];
    await reloadLanes();
    assert.equal(isLane(DEVICE), false);
  });
});

describe("a burst", () => {
  it("asks for one snapshot per frame, spaced out", async () => {
    /*
     * The whole mechanism. Three snapshot commands, not one — a single frame of
     * a moving vehicle is a coin toss, and the pipeline's vote needs frames to
     * agree with each other before it will trust one. Spaced, because an
     * ESP32-CAM asked twice in the same millisecond answers once.
     */
    await reloadLanes();
    assert.ok(triggerLane(DEVICE, "manual"));

    // The first goes immediately: the vehicle is in frame now, not in 120ms.
    assert.equal(cmds("snapshot").length, 1);

    await sleep(500);
    assert.equal(cmds("snapshot").length, 3);
    const gap = cmds("snapshot")[1].at - cmds("snapshot")[0].at;
    assert.ok(gap >= 100, `frames should be spaced, got ${gap}ms`);
  });

  it("opens the frame tap before the first command", async () => {
    /*
     * Order matters and is not incidental. Frames are dropped unless the tap is
     * open, and a camera can answer a snapshot faster than the next line of
     * JavaScript runs — so opening it afterwards would lose the first frame of
     * every burst.
     */
    laneRows = [laneRow({ burst: 1 })];
    await reloadLanes();
    triggerLane(DEVICE, "manual");
    assert.equal(frameTaps.has(DEVICE), true);
  });

  it("closes the tap once it has the frames it asked for", async () => {
    // A camera left tapped keeps every frame flowing to the control plane for
    // an audience of zero, which is the exact cost `watchedDevices` exists to
    // avoid on the live-video path.
    laneRows = [laneRow({ burst: 2, burst_gap_ms: 100 })];
    await reloadLanes();
    triggerLane(DEVICE, "manual");
    sendFrame();
    sendFrame();
    await sleep(50);
    assert.equal(frameTaps.has(DEVICE), false);
  });

  it("closes the tap even when no frame ever comes back", async () => {
    // The failure that leaks. An offline camera answers nothing, and a tap held
    // open on every missed burst accumulates for as long as the process runs.
    laneRows = [laneRow({ burst: 1 })];
    await reloadLanes();
    triggerLane(DEVICE, "manual");
    await sleep(2600);
    assert.equal(frameTaps.has(DEVICE), false);
  });

  it("will not start a second burst while one is running", async () => {
    // Two overlapping bursts on one camera are one vehicle; extending or
    // restarting would blur two arrivals into a single read.
    await reloadLanes();
    assert.ok(triggerLane(DEVICE, "manual"));
    assert.equal(triggerLane(DEVICE, "manual"), null);
  });
});

describe("the trigger", () => {
  it("fires on the camera's own motion telemetry", async () => {
    /*
     * The point of the whole design: the ordinary camera firmware already
     * publishes this, and has since long before ANPR existed. Nothing has to
     * be flashed for a deployed camera to start reading plates.
     */
    await reloadLanes();
    sendTelemetry({ type: "motion", source: "image", ts: 1 });
    await sleep(20);
    assert.equal(cmds("snapshot").length, 1);
  });

  it("ignores telemetry that is not motion", async () => {
    // A camera publishes snapshot records, recording state and fault reports on
    // the same channel. Triggering on those would burst on its own output.
    await reloadLanes();
    sendTelemetry({ type: "snapshot", bytes: 9000 });
    sendTelemetry({ type: "sd", ok: false });
    sendTelemetry(null);
    await sleep(20);
    assert.equal(cmds("snapshot").length, 0);
  });

  it("ignores motion from a camera that is not a lane", async () => {
    await reloadLanes();
    sendTelemetry({ type: "motion" }, "camera-not-a-lane");
    await sleep(20);
    assert.equal(published.length, 0);
  });

  it("holds off a second motion trigger for the quiet period", async () => {
    /*
     * One vehicle idling at a barrier with its indicator flashing produces
     * motion events for as long as it sits there. Without this, each one is a
     * burst, a paid recogniser call, and an arrival in somebody's log.
     */
    laneRows = [laneRow({ burst: 1, cooldown_ms: 60_000 })];
    await reloadLanes();
    assert.ok(triggerLane(DEVICE, "motion"));
    await sleep(2600);
    assert.equal(triggerLane(DEVICE, "motion"), null);
  });

  it("never holds off a person pressing the button", async () => {
    /*
     * "Capture now" that silently does nothing for the next minute is a control
     * that appears broken — and whoever pressed it is usually standing at the
     * barrier looking at the vehicle the camera just missed.
     */
    laneRows = [laneRow({ burst: 1, cooldown_ms: 60_000 })];
    await reloadLanes();
    assert.ok(triggerLane(DEVICE, "motion"));
    await sleep(2600);
    assert.ok(triggerLane(DEVICE, "manual"));
  });
});

describe("the illuminator", () => {
  it("is left alone when the lane does not ask for it", async () => {
    // A camera indoors does not want a flash, and turning one on because ANPR
    // was enabled is a change nobody asked for in a room somebody lives in.
    laneRows = [laneRow({ burst: 1, illuminate: 0 })];
    await reloadLanes();
    triggerLane(DEVICE, "manual");
    await sleep(2600);
    assert.equal(cmds("flash").length, 0);
  });

  it("is pulsed for the burst and turned off after it", async () => {
    /*
     * Held on continuously a flash LED is a nuisance pointed at a window and
     * the fastest way to cook an ESP32-CAM. The "off" is the assertion that
     * matters, and it has to happen on the path where no frame ever came back
     * as well as the happy one.
     */
    laneRows = [laneRow({ burst: 1, illuminate: 60 })];
    await reloadLanes();
    triggerLane(DEVICE, "manual");
    assert.deepEqual(cmds("flash")[0].payload, { action: "flash", level: 60 });

    await sleep(2600);
    assert.equal(cmds("flash").length, 2, "the illuminator must be turned off again");
    assert.deepEqual(cmds("flash")[1].payload, { action: "flash", level: 0 });
  });
});

describe("frames reaching the pipeline", () => {
  it("delivers a burst to the recogniser as one capture", async () => {
    /*
     * The end-to-end claim, and the reason a capture id exists. Three frames
     * filed as three captures would be three reads of one car, two of them
     * wrong, three timeline entries and possibly three gate pulses.
     *
     * The pipeline recognises at most MAX_RECOGNISE_FRAMES (3) of a burst and
     * picks the largest first, so the order asserted here proves both that the
     * frames arrived as one group and that selection ran over the set rather
     * than over one frame at a time.
     */
    laneRows = [laneRow({ burst: 3, burst_gap_ms: 100 })];
    await reloadLanes();
    triggerLane(DEVICE, "manual");

    sendFrame(4000);
    sendFrame(9000);
    sendFrame(6000);

    await sleep(400);
    assert.equal(recognised.length, 3, "one burst should reach the recogniser once");
    // Sharpest first: at a fixed quantiser, size tracks detail.
    assert.deepEqual(
      recognised.map((b) => b.length),
      [9000, 6000, 4000]
    );
  });

  it("ignores frames from a camera that is not mid-burst", async () => {
    /*
     * Somebody watching a different camera live is publishing frames the whole
     * time. Feeding those to the recogniser would bill an OCR call per frame
     * and file plate reads against a camera nobody enrolled.
     */
    await reloadLanes();
    sendFrame(5000, "camera-not-a-lane");
    sendFrame(5000);
    await sleep(300);
    assert.equal(recognised.length, 0);
  });

  it("produces exactly one read per burst, not one per race", async () => {
    /*
     * The regression that shipped and was caught on a real camera. Every single
     * capture produced *two* rows: a 2-frame read, then a 1-frame read exactly
     * four seconds later.
     *
     * `ingestFrame` is asynchronous — the pipeline resolves the device's owner
     * before buffering a byte — so the last frame handed over had not reached
     * the collector when the lane flushed on the very next line. The flush
     * closed the burst on the two frames that had won the race; the straggler
     * then arrived, found no burst, opened a second one, and that timed out
     * four seconds later as a second read.
     *
     * One vehicle became two arrivals, which is not a cosmetic duplicate: the
     * ledger pairs reads into visits, so on a "both" lane the second read is
     * recorded as the car leaving again.
     *
     * Counting *recogniser calls* does not catch this — the same three frames
     * are recognised either way, just in two passes. Counting the rows written
     * to plate_reads is the assertion that does, because "one arrival, one
     * read" is the actual invariant.
     */
    laneRows = [laneRow({ burst: 3, burst_gap_ms: 100 })];
    await reloadLanes();
    triggerLane(DEVICE, "manual");

    /*
     * Spaced, because that is what makes the race real. Frames sent in one tick
     * all suspend in `collect` before any of them lands, so the premature flush
     * finds no burst at all and is a harmless no-op — the bug hides. A camera
     * answers snapshots hundreds of milliseconds apart, by which time the
     * earlier frames *have* landed and the flush closes the burst on them.
     */
    sendFrame(4000);
    await sleep(120);
    sendFrame(9000);
    await sleep(120);
    sendFrame(6000);

    // Well past BURST_WINDOW_MS (4s), so a second burst would have closed too.
    await sleep(5000);
    assert.equal(reads.length, 1, `one burst wrote ${reads.length} reads`);
    assert.equal(recognised.length, 3, "all three frames should still be recognised");
  });

  it("bounds what one capture will swallow", async () => {
    /*
     * A lane on a camera somebody is also watching live receives frames
     * continuously, not only the ones it asked for. Without a ceiling one burst
     * would take the whole live stream, and every frame past the third is a
     * paid call for another photograph of the same stationary car.
     */
    laneRows = [laneRow({ burst: 8, burst_gap_ms: 100 })];
    await reloadLanes();
    triggerLane(DEVICE, "manual");
    for (let i = 0; i < 40; i++) sendFrame(1000 + i);

    await sleep(400);
    assert.ok(recognised.length <= 3, `the recogniser saw ${recognised.length} frames`);
  });
});
