// Command → state projection, for the optimistic update.
//
// WHY THIS EXISTS (the "first tap does nothing, then everything lags" bug)
//
// The control plane takes a *command* and the device answers later with a
// *state*. For most devices the two use the same key ("power": true in,
// "power": true out) so merging the command into the state happened to work.
// For several devices they are DIFFERENT:
//
//   home-hub   command { ch: 1, on: true }  ->  state { power2: true }
//   touchboard command { all: true       }  ->  state { g1, g2, g3 }
//   rfid-gate  command { action: "open"  }  ->  state { barrier: "open" }
//
// Merging the raw command therefore wrote junk keys (state.ch, state.on) and
// left the key the widget actually renders untouched. The switch snapped back
// immediately and stayed wrong until the device echoed over MQTT — which reads
// as "the first control is instant but nothing changes, and after that it is
// unusably slow".
//
// The web console solved this in src/lib/smarthome-command-map.ts and the app
// never got the same treatment. The mappings here mirror that file; both are
// derived from the matching sketch in firmware/<type>/<type>.ino, so the
// optimistic UI and the physical relay cannot disagree.

export type Cmd = Record<string, unknown>;
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
 * firmware/home-hub/home-hub.ino applyScene(). Channels a scene does not touch
 * are intentionally absent so nothing is asserted that cannot be predicted.
 */
const HUB_SCENE_EFFECTS: Record<string, StatePatch> = {
  away: { power: false, power2: false, power3: false, power4: false },
  night: { power: false, power2: false },
  movie: { power: false, power3: true },
  home: { power: true },
};

/** Keys that are addressing, not state. Echoing these pollutes the device. */
const STRUCTURAL = new Set(["action", "ch", "on", "relays", "scene", "idx", "method", "all"]);

/**
 * Translates a command into the state patch the device will report.
 *
 * Returns only fields whose value after the command is *deterministic*.
 * Anything the firmware stores without echoing yields no patch, so the UI keeps
 * showing real device state rather than a guess that may never arrive.
 */
export function projectCommand(type: string, cmd: Cmd, state?: Record<string, unknown>): StatePatch {
  const action = isStr(cmd.action) ? cmd.action : "set";
  const patch: StatePatch = {};

  switch (type) {
    case "home-hub": {
      // { ch: 0..3, on: bool } — the shape the channel tiles send.
      if (isNum(cmd.ch) && isBool(cmd.on)) {
        const field = HUB_CHANNEL_FIELDS[cmd.ch];
        if (field) patch[field] = cmd.on;
      }
      if (isBool(cmd.power)) patch.power = cmd.power;
      if (Array.isArray(cmd.relays)) {
        cmd.relays.slice(0, HUB_CHANNEL_FIELDS.length).forEach((v, i) => {
          if (isBool(v)) patch[HUB_CHANNEL_FIELDS[i]] = v;
        });
      }
      if (isStr(cmd.scene)) {
        patch.scene = cmd.scene;
        Object.assign(patch, HUB_SCENE_EFFECTS[cmd.scene] ?? {});
      }
      return patch;
    }

    case "touchboard": {
      for (const g of TOUCHBOARD_GANG_FIELDS) if (isBool(cmd[g])) patch[g] = cmd[g];
      if (isBool(cmd.all)) for (const g of TOUCHBOARD_GANG_FIELDS) patch[g] = cmd.all;
      if (isNum(cmd.backlight)) patch.backlight = cmd.backlight;
      return patch;
    }

    case "sentinel": {
      for (let i = 1; i <= 32; i++) {
        const k = `r${i}`;
        if (isBool(cmd[k])) patch[k] = cmd[k];
      }
      // Bulk needs the relay count, which only the device knows. Without it,
      // asserting r3/r4 on a two-relay board waits forever for an echo that
      // cannot come.
      const n = isNum(state?.relays) ? Math.max(0, Math.min(32, Math.round(state!.relays as number))) : 0;
      if (isBool(cmd.all) && n > 0) for (let i = 1; i <= n; i++) patch[`r${i}`] = cmd.all;
      if (isBool(cmd.away)) {
        patch.away = cmd.away;
        if (cmd.away && n > 0) for (let i = 1; i <= n; i++) patch[`r${i}`] = false;
      }
      if (isBool(cmd.muted)) patch.muted = cmd.muted;
      if (action === "clearAlarm") patch.gasAlarm = false;
      return patch;
    }

    case "rfid-gate":
      if (action === "open") patch.barrier = "open";
      if (action === "close") patch.barrier = "closed";
      return patch;

    case "facedoor":
    case "smart-lock":
      if (action === "lock") patch.locked = true;
      if (action === "unlock") patch.locked = false;
      if (isBool(cmd.locked)) patch.locked = cmd.locked;
      return patch;

    case "curtain":
      if (action === "open") patch.position = 100;
      else if (action === "close") patch.position = 0;
      else if (isNum(cmd.position)) patch.position = cmd.position;
      return patch;

    case "aquaguard":
    case "watertank":
      // Driving the pump by hand drops auto mode — firmware does the same, and
      // leaving the badge showing "auto" after a manual start is a lie.
      if (isBool(cmd.pump)) { patch.pump = cmd.pump; patch.auto = false; }
      if (isBool(cmd.auto)) patch.auto = cmd.auto;
      if (action === "resetDryRun") patch.dryRun = false;
      return patch;

    default: {
      // Unknown/generic devices: echo scalar keys, which is the long-standing
      // convention for the simple { field: value } shape. Structural keys are
      // skipped so addressing never lands in state.
      for (const [k, v] of Object.entries(cmd)) {
        if (STRUCTURAL.has(k)) continue;
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
 * projectCommand above answers "what state will this command produce".
 * Schedules and rules need the opposite: the user picks a *switch*, which is
 * identified by its state key because that is what the UI renders, and
 * something has to turn that back into a command. Nothing did — every caller
 * inlined `{ [field]: value }`, a state key wearing a command's clothes, and
 * it failed twice over, silently:
 *
 *  1. No `action`. CircuventDevice::_dispatch() begins
 *         String action = doc["action"] | "";
 *         if (!action.length()) return;
 *     so the payload is discarded before any sketch handler runs. Nothing logs
 *     it, nothing rejects it. This broke scheduled switching for every device
 *     type — the rule saved, the countdown ran, the relay never moved.
 *
 *  2. Wrong key for the Home Hub, whose sketch reads { ch, on } and has no
 *     concept of power2/power3/power4 — those are what writeRelay() publishes
 *     back, not something onCommand() accepts.
 *
 * Mirrors buildFieldCommand in the web app's src/lib/smarthome-command-map.ts,
 * which is where the round-trip test lives: every field the UI offers, built
 * into a command here and fed back through projectCommand, must produce that
 * same field.
 */
export function buildFieldCommand(
  type: string,
  field: string,
  value: boolean | number | string
): Cmd | null {
  if (!field) return null;

  switch (type) {
    case "home-hub": {
      const ch = (HUB_CHANNEL_FIELDS as readonly string[]).indexOf(field);
      if (ch >= 0) {
        if (typeof value !== "boolean") return null;
        return { action: "set", ch, on: value };
      }
      if (field === "scene") {
        if (typeof value !== "string" || !value) return null;
        return { action: "set", scene: value };
      }
      return null;
    }

    case "rfid-gate": {
      if (field === "action" || field === "barrier") {
        const v = String(value);
        return v === "open" || v === "close" ? { action: v } : null;
      }
      if (field === "mode" && typeof value === "string") return { action: "set", mode: value };
      return null;
    }

    case "smart-lock":
    case "facedoor":
      if (field === "locked") {
        if (typeof value !== "boolean") return null;
        return { action: value ? "lock" : "unlock" };
      }
      return null;

    case "curtain":
      if (field === "position" && typeof value === "number") return { action: "set", position: value };
      if (field === "action" && (value === "open" || value === "close")) return { action: String(value) };
      return null;

    default:
      break;
  }

  // Everything else: the field name genuinely is the command key for these
  // sketches — touchboard gangs, smart-switch and smart-plug power, sentinel
  // relays, pumps, thresholds, armed flags. Only the action was missing.
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    return { action: "set", [field]: value };
  }
  return null;
}