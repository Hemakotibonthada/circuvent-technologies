// Command → state projection.
//
// WHY THIS EXISTS (the "toggle feels slow" bug):
// The control plane accepts a *command* payload and the device answers later
// with a *state* payload. For most devices the two use the same key ("power":
// true in, "power": true out) so a naive optimistic merge of the command into
// the state happened to work. For several devices they are DIFFERENT:
//
//   home-hub   command { ch: 1, on: true }  ->  state { power2: true }
//   home-hub   command { scene: "away"   }  ->  state { scene, power..power4 }
//   touchboard command { all: true       }  ->  state { g1, g2, g3 }
//   rfid-gate  command { action: "open"  }  ->  state { barrier: "open" }
//
// Merging the raw command into state therefore wrote junk keys (state.ch,
// state.on) and left the key the UI actually renders (state.power2) untouched,
// so the switch did not move until the device echoed back over MQTT/WS — the
// exact "device turns on but the dashboard lags" symptom.
//
// This module is the single source of truth translating a command into the
// state patch the firmware is guaranteed to report. Every mapping below is
// derived directly from the matching sketch in firmware/<type>/<type>.ino, so
// the optimistic UI and the physical relay can never disagree.
//
// Pure + isomorphic: no React, no DOM, no network. Safe to unit test.

export interface CommandPayload {
  action?: string;
  [key: string]: unknown;
}

/**
 * The camera's frame-rate ceiling, from firmware/camera/camera.ino.
 *
 * `#define FPS_MAX 30`. This was clamped to 15 here, so a camera told to run at
 * 30 reported 30 and the console immediately overwrote it with 15 — the number
 * on screen disagreed with the hardware, and the stepper appeared to refuse
 * anything above half its own maximum. The firmware constant is the only real
 * limit; keep this in step with it.
 */
export const CAM_FPS_MAX = 30;

/** The frame rates worth offering as presets. The device accepts any 1..30. */
export const CAM_FPS_PRESETS = [1, 5, 8, 10, 15, 20, 25, 30] as const;

export type StatePatch = Record<string, unknown>;

const isBool = (v: unknown): v is boolean => typeof v === "boolean";
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === "string";

/**
 * Relay index → state key for the 4-channel Home Hub.
 * firmware/home-hub/home-hub.ino writeRelay(): "power%s", i == 0 ? "" : i + 1
 */
export const HUB_CHANNEL_FIELDS = ["power", "power2", "power3", "power4"] as const;

/** Touch Board gangs — firmware/touchboard/touchboard.ino setRelay(): 'g' + (1+i). */
export const TOUCHBOARD_GANG_FIELDS = ["g1", "g2", "g3"] as const;

/** Highest relay index any Sentinel board exposes. */
const SENTINEL_MAX_RELAYS = 32;

/**
 * How many relays a Sentinel actually has.
 *
 * The standard board has four; the camera board gives two of them up to the
 * sensor bus. The firmware publishes `relays` on every boot precisely so this
 * is never guessed. Returns 0 when the device has not reported yet, which
 * makes bulk commands project nothing rather than invent relays.
 */
function sentinelRelayCount(state?: Record<string, unknown>): number {
  const n = state?.relays;
  if (typeof n === "number" && Number.isFinite(n)) return clamp(Math.round(n), 0, SENTINEL_MAX_RELAYS);
  return 0;
}

/**
 * Deterministic relay outcome of each Home Hub scene.
 * firmware/home-hub/home-hub.ino applyScene(). Channels the scene does not
 * touch are intentionally absent so we never assert state we can't predict.
 */
export const HUB_SCENE_EFFECTS: Record<string, StatePatch> = {
  away: { power: false, power2: false, power3: false, power4: false },
  night: { power: false, power2: false },
  movie: { power: false, power3: true },
  home: { power: true },
};

/**
 * Translates a command into the state patch the device will report.
 *
 * Returns only fields whose post-command value is *deterministic*. Anything
 * the firmware stores without echoing (home-hub `restore`, schedule `rule`,
 * gate tag enrolment, door `pin`) yields no patch, so the UI keeps showing
 * real device state instead of an optimistic guess that may never arrive.
 */
export function projectCommand(type: string, cmd: CommandPayload, state?: Record<string, unknown>): StatePatch {
  const action = isStr(cmd.action) ? cmd.action : "set";
  const patch: StatePatch = {};

  switch (type) {
    // ---------------------------------------------------------- home hub --
    case "home-hub": {
      // { ch: 0..3, on: bool } — the primary path used by the Channels list.
      if (isNum(cmd.ch) && isBool(cmd.on)) {
        const field = HUB_CHANNEL_FIELDS[cmd.ch];
        if (field) patch[field] = cmd.on;
      }
      // Legacy single relay → channel 0.
      if (isBool(cmd.power)) patch.power = cmd.power;
      // Bulk { relays: [b,b,b,b] }.
      if (Array.isArray(cmd.relays)) {
        cmd.relays.slice(0, HUB_CHANNEL_FIELDS.length).forEach((v, i) => {
          if (isBool(v)) patch[HUB_CHANNEL_FIELDS[i]] = v;
        });
      }
      // Scenes drive both the scene label and a known set of relays.
      if (isStr(cmd.scene)) {
        patch.scene = cmd.scene;
        Object.assign(patch, HUB_SCENE_EFFECTS[cmd.scene] ?? {});
      }
      return patch;
    }

    // -------------------------------------------------------- touchboard --
    case "touchboard": {
      for (const g of TOUCHBOARD_GANG_FIELDS) {
        if (isBool(cmd[g])) patch[g] = cmd[g];
      }
      if (isBool(cmd.all)) {
        for (const g of TOUCHBOARD_GANG_FIELDS) patch[g] = cmd.all;
      }
      if (isNum(cmd.backlight)) patch.backlight = clamp(cmd.backlight, 0, 100);
      return patch;
    }

    // ---------------------------------------------------------- sentinel --
    // firmware/sentinel/sentinel.ino onCommand(). Relays are r1..rN.
    case "sentinel": {
      for (let i = 1; i <= SENTINEL_MAX_RELAYS; i++) {
        const k = `r${i}`;
        if (isBool(cmd[k])) patch[k] = cmd[k];
      }
      const n = sentinelRelayCount(state);
      // Bulk commands need to know how many relays exist. Without that we would
      // be asserting r3/r4 on a two-relay board and waiting forever for an echo
      // that cannot come.
      if (isBool(cmd.all) && n > 0) {
        for (let i = 1; i <= n; i++) patch[`r${i}`] = cmd.all;
      }
      if (isBool(cmd.away)) {
        patch.away = cmd.away;
        // Arming Away switches everything off — setAllRelays(false, "away-mode").
        if (cmd.away && n > 0) for (let i = 1; i <= n; i++) patch[`r${i}`] = false;
      }
      if (isBool(cmd.muted)) patch.muted = cmd.muted;
      if (isBool(cmd.streaming)) patch.streaming = cmd.streaming;
      if (isNum(cmd.safetyCutMask) && n > 0) {
        patch.safetyCutMask = Math.round(cmd.safetyCutMask) & ((1 << n) - 1);
      }
      if (isNum(cmd.exhaustRelay) && n > 0) {
        const r = Math.round(cmd.exhaustRelay);
        patch.exhaustRelay = r >= 0 && r < n ? r : -1;
      }
      if (action === "clearAlarm") patch.gasAlarm = false;
      // calibrateGas, test, recalibrateTouch and snapshot all report values we
      // cannot predict (a fresh baseline, a timestamp), so they get no patch
      // and the UI waits for the device rather than guessing.
      return patch;
    }

    // ------------------------------------------------------ simple relay --
    case "smart-plug":
      if (isBool(cmd.power)) patch.power = cmd.power;
      return patch;

    case "smart-switch":
      if (isBool(cmd.power)) patch.power = cmd.power;
      if (isBool(cmd.power2)) patch.power2 = cmd.power2;
      return patch;

    case "agri-starter":
      if (isBool(cmd.pump)) patch.pump = cmd.pump;
      return patch;

    // ------------------------------------------------------------- light --
    case "smart-light":
    case "light": {
      if (isBool(cmd.power)) patch.power = cmd.power;
      if (isNum(cmd.brightness)) patch.brightness = clamp(cmd.brightness, 0, 100);
      if (isStr(cmd.color)) patch.color = cmd.color;
      return patch;
    }

    // --------------------------------------------------------------- fan --
    case "smart-fan":
    case "fan":
    case "ceiling-fan": {
      // firmware/smart-fan: speed 0 forces power off; a non-zero speed without
      // an explicit power key forces power on.
      if (isBool(cmd.power)) patch.power = cmd.power;
      if (isNum(cmd.speed)) {
        const speed = clamp(Math.round(cmd.speed), 0, 3);
        patch.speed = speed;
        if (speed === 0) patch.power = false;
        else if (!isBool(cmd.power)) patch.power = true;
      }
      return patch;
    }

    // -------------------------------------------------------------- lock --
    case "smart-lock": {
      if (action === "lock") patch.locked = true;
      else if (action === "unlock") patch.locked = false;
      if (isBool(cmd.locked)) patch.locked = cmd.locked;
      if (isNum(cmd.autoLockSec)) patch.autoLockSec = cmd.autoLockSec;
      return patch;
    }

    case "facedoor": {
      if (action === "lock") patch.locked = true;
      else if (action === "unlock") patch.locked = false;
      if (isBool(cmd.locked)) patch.locked = cmd.locked;
      if (isNum(cmd.autoLockSec)) patch.autoLockSec = cmd.autoLockSec;
      return patch;
    }

    // ------------------------------------------------------------- water --
    case "aquaguard": {
      if (isBool(cmd.auto)) patch.auto = cmd.auto;
      // A manual pump command always drops the device out of auto mode.
      if (isBool(cmd.pump)) {
        patch.pump = cmd.pump;
        patch.auto = false;
      }
      if (isNum(cmd.startPct)) patch.startPct = clamp(cmd.startPct, 5, 90);
      if (isNum(cmd.stopPct)) patch.stopPct = clamp(cmd.stopPct, 10, 100);
      return patch;
    }

    case "watertank": {
      if (action === "pump") {
        patch.pump = true;
        patch.auto = false;
      } else if (action === "stop") {
        patch.pump = false;
        patch.auto = false;
      } else if (action === "resetDryRun") {
        patch.dryRun = false;
      }
      if (isBool(cmd.auto)) patch.auto = cmd.auto;
      if (isBool(cmd.pump)) {
        patch.pump = cmd.pump;
        patch.auto = false;
      }
      if (isNum(cmd.startPct)) patch.startPct = clamp(cmd.startPct, 5, 90);
      if (isNum(cmd.stopPct)) patch.stopPct = clamp(cmd.stopPct, 10, 100);
      if (isNum(cmd.sumpMinPct)) patch.sumpMinPct = clamp(cmd.sumpMinPct, 5, 60);
      return patch;
    }

    // ------------------------------------------------------------ safety --
    case "guardian": {
      if (isBool(cmd.armed)) patch.armed = cmd.armed;
      // Only clearing SOS is acknowledged by the firmware.
      if (cmd.sos === false) patch.sos = false;
      return patch;
    }

    case "motion-sensor":
      if (isBool(cmd.armed)) patch.armed = cmd.armed;
      return patch;

    // ------------------------------------------------------------ camera --
    // firmware/camera/camera.ino. Note the command keys deliberately differ
    // from the state keys ({action:"stream", on} -> state.streaming), which is
    // exactly the mismatch a default echo would get wrong.
    case "camera":
    case "cctv":
    case "doorbell": {
      if (action === "stream") {
        patch.streaming = isBool(cmd.on) ? cmd.on : true;
        if (isNum(cmd.fps)) patch.fps = clamp(Math.round(cmd.fps), 1, CAM_FPS_MAX);
        return patch;
      }
      if (action === "flash") {
        patch.flash = isNum(cmd.level) ? clamp(Math.round(cmd.level), 0, 100) : cmd.on === true ? 100 : 0;
        return patch;
      }
      // `snapshot` and `reboot` change nothing predictable — a snapshot's
      // counter and a reboot's uptime both come back from the device.
      if (action !== "set") return patch;

      if (isStr(cmd.resolution)) patch.resolution = cmd.resolution;
      if (isNum(cmd.quality)) patch.quality = clamp(Math.round(cmd.quality), 4, 63);
      if (isNum(cmd.rotation)) patch.rotation = cmd.rotation === 180 ? 180 : 0;
      if (isNum(cmd.fps)) patch.fps = clamp(Math.round(cmd.fps), 1, CAM_FPS_MAX);
      if (isNum(cmd.flash)) patch.flash = clamp(Math.round(cmd.flash), 0, 100);
      if (isNum(cmd.sensitivity)) patch.sensitivity = clamp(Math.round(cmd.sensitivity), 1, 100);
      if (isBool(cmd.motion)) {
        patch.motion = cmd.motion;
        // Disabling detection clears the live flag immediately in firmware.
        if (!cmd.motion) patch.motionActive = false;
      }
      if (isBool(cmd.streaming)) patch.streaming = cmd.streaming;
      return patch;
    }

    // ------------------------------------------------------------- gate ---
    case "rfid-gate": {
      if (action === "open" || action === "grantOpen") patch.barrier = "open";
      else if (action === "close") patch.barrier = "closed";
      if (isStr(cmd.mode)) patch.mode = cmd.mode;
      return patch;
    }

    // ----------------------------------------------------------- curtain --
    case "curtain": {
      if (action === "open") patch.position = 100;
      else if (action === "close") patch.position = 0;
      else if (isNum(cmd.position)) patch.position = clamp(Math.round(cmd.position), 0, 100);
      // `moving` is transient and driven by the motor loop — never predicted.
      return patch;
    }

    // ------------------------------------------------------------ thermo --
    case "thermostat":
    case "ac": {
      if (isBool(cmd.power)) patch.power = cmd.power;
      if (isNum(cmd.target)) patch.target = clamp(cmd.target, 16, 30);
      return patch;
    }

    // ----------------------------------------------------------- default --
    default: {
      // Unknown/generic devices: echo back only primitive scalar keys, which is
      // the long-standing convention for the simple `{ field: value }` command
      // shape. Structural keys are skipped so we never invent state.
      for (const [k, v] of Object.entries(cmd)) {
        if (k === "action") continue;
        if (isBool(v) || isNum(v) || isStr(v)) patch[k] = v;
      }
      return patch;
    }
  }
}

/**
 * Turns "set this switch to this value" into the payload the firmware reads.
 *
 * WHY THIS EXISTS (the "timers save but nothing happens" bug)
 *
 * projectCommand answers "what state will this command produce". Automations
 * need the opposite: the user picks a *switch* — which is identified by its
 * state key, because that is what the UI renders — and something has to turn
 * that back into a command. Nothing did. Every caller inlined its own guess,
 * and the guess was `{ [field]: value }`, which is a state key wearing a
 * command's clothes.
 *
 * That failed twice over, both silently:
 *
 *  1. No `action`. CircuventDevice::_dispatch() starts with
 *         String action = doc["action"] | "";
 *         if (!action.length()) return;
 *     so a payload with no action is discarded before any sketch handler runs.
 *     Not logged, not rejected, not echoed — the command reaches the device,
 *     the device drops it, and every layer in between reports success. This
 *     broke scheduled switching for *every* device type.
 *
 *  2. Wrong key for the Home Hub. Its sketch reads { ch, on } and has no
 *     concept of power2/power3/power4 — those are what writeRelay() *publishes*
 *     back. So even a correctly actioned { action:"set", power2:true } does
 *     nothing on channels 2-4.
 *
 * Both are invisible from the app: the rule saves, the next-run time is
 * correct, the countdown ticks down, and the relay never moves. The only
 * honest way to keep it fixed is to make the round trip a test — every field
 * offered by the UI, built into a command here and fed back through
 * projectCommand, must produce that same field. See smarthome-command-map.test.ts.
 */
export interface BuiltCommand extends CommandPayload {
  action: string;
}

/** Relay index for a Home Hub state key, or -1 when it is not a channel. */
function hubChannelIndex(field: string): number {
  return HUB_CHANNEL_FIELDS.indexOf(field as (typeof HUB_CHANNEL_FIELDS)[number]);
}

/**
 * Builds the wire command that sets `field` to `value` on a `type` device.
 *
 * Returns null when the pairing is not something the firmware can act on, so
 * callers surface "this switch cannot be scheduled" instead of saving a rule
 * that will never fire. Guessing here is the whole failure being fixed.
 */
export function buildFieldCommand(
  type: string,
  field: string,
  value: boolean | number | string
): BuiltCommand | null {
  if (!field) return null;

  switch (type) {
    case "home-hub": {
      // Channels are addressed positionally. The state key is an output of the
      // sketch, never an input to it.
      const ch = hubChannelIndex(field);
      if (ch >= 0) {
        if (typeof value !== "boolean") return null;
        return { action: "set", ch, on: value };
      }
      if (field === "scene") {
        if (typeof value !== "string" || !value) return null;
        return { action: "set", scene: value };
      }
      if (field === "relays" && Array.isArray(value)) return { action: "set", relays: value };
      return null;
    }

    case "rfid-gate": {
      // The barrier is a verb, not a field: the sketch switches on `action`.
      if (field === "action" || field === "barrier") {
        const v = String(value);
        return v === "open" || v === "close" ? { action: v } : null;
      }
      if (field === "mode" && typeof value === "string") return { action: "set", mode: value };
      return null;
    }

    case "smart-lock":
    case "facedoor": {
      if (field === "locked") {
        if (typeof value !== "boolean") return null;
        // Both sketches take lock/unlock as the action, and also accept
        // { locked } — the verb form is used because it is what the device
        // controls send, so there is one shape in the field to reason about.
        return { action: value ? "lock" : "unlock" };
      }
      return null;
    }

    case "curtain": {
      if (field === "position" && typeof value === "number") {
        return { action: "set", position: value };
      }
      if (field === "action" && (value === "open" || value === "close")) {
        return { action: String(value) };
      }
      return null;
    }

    /*
     * Cameras take everything under `set`, but `rotation` is read with
     * `p["rotation"].is<int>()` in the sketch, and the rule builder offers it
     * as a two-choice select -- which produces the string "180". A string there
     * fails the firmware's type check silently, so the command would be
     * accepted, acknowledged, and ignored. Coerce it.
     */
    case "camera":
    case "cctv":
    case "doorbell": {
      if (field === "rotation") {
        const deg = Number(value);
        if (!Number.isFinite(deg)) return null;
        return { action: "set", rotation: deg === 180 ? 180 : 0 };
      }
      if (field === "fps" || field === "quality" || field === "flash" || field === "sensitivity") {
        const num = Number(value);
        if (!Number.isFinite(num)) return null;
        return { action: "set", [field]: Math.round(num) };
      }
      if (field === "streaming" || field === "motion") {
        if (typeof value !== "boolean") return null;
        return { action: "set", [field]: value };
      }
      if (field === "resolution") {
        if (typeof value !== "string" || !value) return null;
        return { action: "set", resolution: value };
      }
      return null;
    }

    default:
      break;
  }

  /*
   * Everything else takes { action:"set", <field>: value } — touchboard gangs,
   * smart-switch and smart-plug power, sentinel relays, pumps, thresholds,
   * armed flags. The field name genuinely is the command key for these
   * sketches; the only thing that was missing is the action.
   */
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return { action: "set", [field]: value };
  }
  return null;
}

/**
 * Reads a wire command back into the switch it addresses.
 *
 * The exact inverse of buildFieldCommand, and it has to exist for the same
 * reason the builder does: something has to turn `{action:"set", ch:1, on:true}`
 * back into "channel 2, on" so the timers list can group and display it.
 *
 * WHY THIS IS A SEPARATE FUNCTION AND NOT `Object.keys(cmd)[0]`
 *
 * That is what the panel used to do, and it worked only for as long as the
 * command happened to be a single field. The moment commands became real —
 * carrying an action, and addressing Home Hub channels positionally — every
 * switch timer vanished from its own tab while continuing to run correctly. A
 * decoder that guesses is a decoder that breaks the first time the encoder
 * gets more precise.
 *
 * Both shapes are accepted. Rows written before the fix still hold
 * `{ power2: true }`, and they have to keep displaying until they are rewritten
 * — a schedule that disappears from the UI looks deleted, and someone will
 * make a second one.
 */
export function readFieldCommand(
  type: string,
  cmd: CommandPayload | null | undefined
): { field: string; value: boolean | number | string } | null {
  if (!cmd || typeof cmd !== "object") return null;
  const action = typeof cmd.action === "string" ? cmd.action : "";

  if (type === "home-hub") {
    if (typeof cmd.ch === "number" && typeof cmd.on === "boolean") {
      const field = HUB_CHANNEL_FIELDS[cmd.ch];
      return field ? { field, value: cmd.on } : null;
    }
    if (typeof cmd.scene === "string") return { field: "scene", value: cmd.scene };
  }

  if (type === "smart-lock" || type === "facedoor") {
    if (action === "lock") return { field: "locked", value: true };
    if (action === "unlock") return { field: "locked", value: false };
  }

  if (type === "rfid-gate") {
    if (action === "open" || action === "close") return { field: "action", value: action };
    if (typeof cmd.mode === "string") return { field: "mode", value: cmd.mode };
  }

  if (type === "curtain") {
    if (action === "open" || action === "close") return { field: "action", value: action };
    if (typeof cmd.position === "number") return { field: "position", value: cmd.position };
  }

  /*
   * Camera rotation goes out as a number and has to come back as the string
   * the select uses, or editing a saved rule shows an empty Rotation box and
   * saving it again drops the setting.
   */
  if (type === "camera" || type === "cctv" || type === "doorbell") {
    if (typeof cmd.rotation === "number") return { field: "rotation", value: String(cmd.rotation) };
  }

  // The general shape, and the legacy one: a single field beside the action.
  const entries = Object.entries(cmd).filter(([k]) => k !== "action");
  if (entries.length !== 1) return null;
  const [field, value] = entries[0];
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return { field, value };
  }
  return null;
}

/**
 * Repairs a command stored before buildFieldCommand existed.
 *
 * Rules already in the database carry the broken shape, and there are two
 * places that could fix them: here, or by asking every user to delete and
 * recreate every schedule they ever made. Rewriting on read means a timer
 * someone set weeks ago starts working the moment this ships.
 *
 * Only touches payloads that are unambiguously the old shape. A command that
 * already names an action is left exactly as authored — including hand-written
 * ones from the rule editor, which may legitimately use actions this module
 * knows nothing about.
 */
export function repairLegacyCommand(
  type: string,
  cmd: CommandPayload | null | undefined
): CommandPayload | null {
  if (!cmd || typeof cmd !== "object") return null;
  const keys = Object.keys(cmd);
  if (!keys.length) return null;
  if (typeof cmd.action === "string" && cmd.action.length) {
    // Already actioned. One exception: the Home Hub's channel keys are never
    // valid as command keys, whatever action they were sent with.
    if (type === "home-hub") {
      const bad = keys.find((k) => hubChannelIndex(k) >= 0);
      if (bad && typeof cmd[bad] === "boolean") {
        return buildFieldCommand(type, bad, cmd[bad] as boolean);
      }
    }
    return cmd;
  }

  // Single-field legacy shape — what every switch timer was written as.
  const field = keys[0];
  const value = cmd[field];
  if (keys.length === 1 && (typeof value === "boolean" || typeof value === "number" || typeof value === "string")) {
    return buildFieldCommand(type, field, value);
  }

  // Multi-key with no action: the safest reading is "a set with several
  // fields", which is exactly what the sketches implement.
  return { action: "set", ...cmd };
}

/** The state keys a command is expected to change. */
export function projectedFields(type: string, cmd: CommandPayload, state?: Record<string, unknown>): string[] {
  return Object.keys(projectCommand(type, cmd, state));
}

/**
 * True when `state` already reflects every field of `patch` — i.e. the device
 * has confirmed the command. Used to resolve the optimistic pin and to stop
 * the round-trip latency timer.
 */
export function patchSatisfied(state: Record<string, unknown>, patch: StatePatch): boolean {
  for (const [k, want] of Object.entries(patch)) {
    if (!sameValue(state[k], want)) return false;
  }
  return true;
}

/** Loose equality that tolerates the 1/0 ⇄ true/false drift some sketches emit. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof b === "boolean") return !!a === b;
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) < 1e-6;
  if (a == null || b == null) return false;
  return String(a) === String(b);
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

// ------------------------------------------------------------ master power --

/**
 * A device's single "everything on/off" control.
 *
 * Multi-gang hardware does NOT respond to a bare `{power}`: a home-hub would
 * only switch relay 1 and a touchboard ignores it entirely (its firmware reads
 * `g1`/`g2`/`g3` or `all`). Bulk actions — group power, room power, quick
 * toggles on cards — must go through here so every device type receives the
 * command shape its sketch actually parses.
 *
 * Returns `null` for devices where a one-tap power switch would be unsafe or
 * meaningless (pumps, locks, gates, alarms, read-only meters); those stay
 * behind their dedicated device page.
 */
export interface MasterPower {
  /** True when *any* output of the device is currently on. */
  on: boolean;
  label: string;
  cmd: (v: boolean) => CommandPayload;
}

export function masterPower(device: {
  type: string;
  state?: Record<string, unknown>;
}): MasterPower | null {
  const s = device.state ?? {};
  const any = (...v: unknown[]) => v.some(Boolean);
  switch (device.type) {
    case "smart-plug":
      return { on: !!s.power, label: "Power", cmd: (v) => ({ power: v }) };
    case "smart-switch":
      return { on: any(s.power, s.power2), label: "All gangs", cmd: (v) => ({ power: v, power2: v }) };
    case "home-hub":
      return {
        on: any(s.power, s.power2, s.power3, s.power4),
        label: "All channels",
        cmd: (v) => ({ relays: [v, v, v, v] }),
      };
    case "touchboard":
      return { on: any(s.g1, s.g2, s.g3), label: "All gangs", cmd: (v) => ({ all: v }) };
    case "sentinel": {
      const n = sentinelRelayCount(s);
      // Without a reported relay count there is no honest "all" to offer.
      if (n === 0) return null;
      const keys = Array.from({ length: n }, (_, i) => `r${i + 1}`);
      return { on: any(...keys.map((k) => s[k])), label: "All relays", cmd: (v) => ({ all: v }) };
    }
    case "light":
    case "smart-light":
      return { on: !!s.power, label: "Light", cmd: (v) => ({ power: v }) };
    case "fan":
    case "ceiling-fan":
    case "smart-fan":
      return { on: !!s.power, label: "Fan", cmd: (v) => ({ power: v }) };
    default:
      return null;
  }
}
