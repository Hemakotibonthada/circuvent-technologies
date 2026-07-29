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
export function projectCommand(type: string, cmd: CommandPayload): StatePatch {
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
        if (isNum(cmd.fps)) patch.fps = clamp(Math.round(cmd.fps), 1, 15);
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
      if (isNum(cmd.fps)) patch.fps = clamp(Math.round(cmd.fps), 1, 15);
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

/** The state keys a command is expected to change. */
export function projectedFields(type: string, cmd: CommandPayload): string[] {
  return Object.keys(projectCommand(type, cmd));
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
