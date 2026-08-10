"use client";

import type { AutomationTrigger, AutomationAction, AutomationActions } from "@/lib/control-plane";
import { actionList } from "@/lib/control-plane";
import { daysText } from "@/lib/smarthome-switches";
import { buildFieldCommand } from "@/lib/smarthome-command-map";

/* ------------------------------------------------------------------ */
/* Operator display labels                                             */
/* ------------------------------------------------------------------ */

const OP_TEXT: Record<string, string> = {
  "<": "is less than",
  "<=": "is at most",
  ">": "is greater than",
  ">=": "is at least",
  "==": "equals",
  "!=": "is not equal to",
  truthy: "is on (truthy)",
  falsy: "is off (falsy)",
};

/* ------------------------------------------------------------------ */
/* Plain-English summaries                                             */
/* ------------------------------------------------------------------ */

export function triggerText(
  trigger: AutomationTrigger,
  deviceName: (id?: string) => string,
): string {
  if (trigger.type === "time") {
    // Say which days it actually runs. This used to read "Every day" for every
    // schedule, including ones restricted to weekdays — the summary contradicted
    // the rule it was describing.
    return `${daysText(trigger.days)} at ${trigger.at ?? "--:--"}`;
  }
  if (trigger.type === "event") {
    const dev = deviceName(trigger.deviceId);
    const match = trigger.match ?? {};

    /*
     * Plate rules get a sentence rather than a key=value dump.
     *
     * This string is what somebody scans down a list of rules to find the one
     * they need to change, and "plate event where plate = KA01AB1234 and
     * direction = in" is a description of the data structure rather than of
     * what the rule does.
     */
    if (trigger.eventType === "plate") {
      const plate = typeof match.plate === "string" && match.plate ? formatPlate(match.plate) : "any vehicle";
      const dir = match.direction === "in" ? "arrives" : match.direction === "out" ? "leaves" : "is seen";
      const listed =
        match.decision === "allow" ? " (on the allow list)"
        : match.decision === "deny" ? " (on the block list)"
        : match.decision === "watch" ? " (on the watchlist)"
        : match.decision === "unknown" ? " (not on any list)"
        : "";
      return `When ${plate}${listed} ${dir} at ${dev}`;
    }

    const kind = trigger.eventType ? `${trigger.eventType} event` : "any event";
    const pairs = Object.entries(match);
    const where = pairs.length
      ? ` where ${pairs.map(([k, v]) => `${k} = ${String(v)}`).join(" and ")}`
      : "";
    return `On ${dev} · ${kind}${where}`;
  }
  const dev = deviceName(trigger.deviceId);
  const field = trigger.field ?? "unknown field";
  const op = OP_TEXT[trigger.op ?? "=="] ?? (trigger.op ?? "==");
  if (trigger.op === "truthy" || trigger.op === "falsy") {
    return `When ${dev} · ${field} ${op}`;
  }
  return `When ${dev} · ${field} ${op} ${String(trigger.value ?? "")}`;
}

/** Describes one step of an automation. */
export function singleActionText(
  action: AutomationAction,
  deviceName: (id?: string) => string,
): string {
  const wait = action.delayMs && action.delayMs > 0 ? `wait ${formatDelay(action.delayMs)}, then ` : "";

  if (action.type === "notify") {
    const title = action.title ? `"${action.title}"` : "a notification";
    return `${wait}Send ${title}${action.body ? ` — ${action.body}` : ""}`;
  }
  if (action.type === "tts") {
    const dev = deviceName(action.deviceId);
    const said = action.text || action.body || "";
    return `${wait}Announce${said ? ` "${said}"` : ""} on ${dev}`;
  }
  const dev = deviceName(action.deviceId);
  const entries = action.command
    ? Object.entries(action.command).filter(([k]) => k !== "action")
    : [];
  if (entries.length === 0) {
    const act = (action.command as Record<string, unknown> | undefined)?.action;
    return act ? `${wait}${String(act)} ${dev}` : `${wait}Command ${dev}`;
  }
  const desc = entries.map(([k, v]) => `${k} → ${String(v)}`).join(", ");
  return `${wait}Set ${dev}: ${desc}`;
}

/** "1.5s" / "10s" / "2m" — short enough to sit inside a summary line. */
export function formatDelay(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${Number.isInteger(s) ? s : s.toFixed(1)}s`;
  const m = s / 60;
  return `${Number.isInteger(m) ? m : m.toFixed(1)}m`;
}

/**
 * Describes an automation's action, which may be a single action or an ordered
 * sequence. A sequence is summarised by its first step plus a count, so a list
 * row stays one line; the editor shows every step.
 */
export function actionText(
  action: AutomationActions,
  deviceName: (id?: string) => string,
): string {
  const list = actionList(action);
  if (list.length === 0) return "Do nothing";
  const first = singleActionText(list[0], deviceName);
  if (list.length === 1) return first;
  return `${first} +${list.length - 1} more step${list.length - 1 === 1 ? "" : "s"}`;
}

/**
 * One-liner preview combining trigger + action for the rule builder preview
 * strip.
 */
export function rulePreviewText(
  trigger: AutomationTrigger,
  action: AutomationActions,
  deviceName: (id?: string) => string,
): string {
  return `${triggerText(trigger, deviceName)} → ${actionText(action, deviceName)}`;
}

/* ------------------------------------------------------------------ */
/* Field type inference                                                */
/* ------------------------------------------------------------------ */

/** Infer the likely data kind from the current value of a device state field. */
export function inferFieldKind(value: unknown): "boolean" | "number" | "string" {
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  return "string";
}

/**
 * Which comparison operators make sense for a given field kind.
 * Boolean fields only support truthy/falsy — numeric comparison on a boolean
 * is meaningless and the server won't fire it as expected.
 */
export function operatorsFor(
  kind: "boolean" | "number" | "string",
): { value: AutomationTrigger["op"]; label: string }[] {
  if (kind === "boolean") {
    return [
      { value: "truthy", label: "is on / true" },
      { value: "falsy", label: "is off / false" },
    ];
  }
  if (kind === "number") {
    return [
      { value: "<", label: "is less than" },
      { value: "<=", label: "is at most (≤)" },
      { value: ">", label: "is greater than" },
      { value: ">=", label: "is at least (≥)" },
      { value: "==", label: "equals" },
      { value: "!=", label: "is not equal to" },
    ];
  }
  return [
    { value: "==", label: "equals" },
    { value: "!=", label: "is not equal to" },
    { value: "truthy", label: "is truthy (non-empty)" },
    { value: "falsy", label: "is falsy (empty / false)" },
  ];
}

/* ------------------------------------------------------------------ */
/* Action command field definitions per device type                    */
/* ------------------------------------------------------------------ */

export interface CommandField {
  /** The key inside the command object, or "action" for action-type commands. */
  key: string;
  label: string;
  kind: "bool" | "number" | "select";
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  choices?: { value: string; label: string }[];
}

/**
 * Returns the command fields a device type's firmware actually reads.
 * Derived directly from `projectCommand` in smarthome-command-map.ts so the
 * rule builder can never produce a command the device ignores.
 */
export function getCommandFields(type: string): CommandField[] {
  switch (type) {
    case "smart-plug":
      return [{ key: "power", label: "Power", kind: "bool" }];

    case "smart-switch":
      return [
        { key: "power", label: "Channel 1", kind: "bool" },
        { key: "power2", label: "Channel 2", kind: "bool" },
      ];

    case "home-hub":
      return [
        { key: "power", label: "Channel 1", kind: "bool" },
        { key: "power2", label: "Channel 2", kind: "bool" },
        { key: "power3", label: "Channel 3", kind: "bool" },
        { key: "power4", label: "Channel 4", kind: "bool" },
        {
          key: "scene",
          label: "Scene",
          kind: "select",
          choices: [
            { value: "away", label: "Away" },
            { value: "night", label: "Night" },
            { value: "movie", label: "Movie" },
            { value: "home", label: "Home" },
          ],
        },
      ];

    case "touchboard":
      return [
        { key: "g1", label: "Gang 1", kind: "bool" },
        { key: "g2", label: "Gang 2", kind: "bool" },
        { key: "g3", label: "Gang 3", kind: "bool" },
        { key: "all", label: "All gangs", kind: "bool" },
        { key: "backlight", label: "Backlight", kind: "number", min: 0, max: 100, unit: "%" },
      ];

    case "sentinel":
      // Relays are r1..rN. Sixteen are listed because that is the expander
      // board's count; a four-relay unit simply ignores commands for relays it
      // does not have, and the schedule list filters by the count the device
      // reports (see switchTargetsOf in lib/smarthome-switches.ts).
      return [
        ...Array.from({ length: 16 }, (_, i) => ({
          key: `r${i + 1}`,
          label: `Relay ${i + 1}`,
          kind: "bool" as const,
        })),
        { key: "all", label: "All relays", kind: "bool" },
        { key: "away", label: "Away mode", kind: "bool" },
        { key: "muted", label: "Buzzer muted", kind: "bool" },
      ];

    case "aquaguard":
      return [
        { key: "pump", label: "Pump", kind: "bool" },
        { key: "auto", label: "Auto mode", kind: "bool" },
        { key: "startPct", label: "Start threshold", kind: "number", min: 5, max: 90, unit: "%" },
        { key: "stopPct", label: "Stop threshold", kind: "number", min: 10, max: 100, unit: "%" },
      ];

    case "watertank":
      return [
        { key: "pump", label: "Pump", kind: "bool" },
        { key: "auto", label: "Auto mode", kind: "bool" },
        { key: "startPct", label: "Start threshold", kind: "number", min: 5, max: 90, unit: "%" },
        { key: "stopPct", label: "Stop threshold", kind: "number", min: 10, max: 100, unit: "%" },
        { key: "sumpMinPct", label: "Sump minimum", kind: "number", min: 5, max: 60, unit: "%" },
      ];

    case "agri-starter":
      return [{ key: "pump", label: "Pump", kind: "bool" }];

    case "guardian":
      return [{ key: "armed", label: "Armed", kind: "bool" }];

    case "motion-sensor":
      return [{ key: "armed", label: "Armed", kind: "bool" }];

    case "smart-lock":
    case "facedoor":
      return [{ key: "locked", label: "Locked", kind: "bool" }];

    case "rfid-gate":
      return [
        {
          key: "action",
          label: "Barrier",
          kind: "select",
          choices: [
            { value: "open", label: "Open" },
            { value: "close", label: "Close" },
          ],
        },
        {
          key: "mode",
          label: "Access mode",
          kind: "select",
          choices: [
            { value: "normal", label: "Normal" },
            { value: "always_open", label: "Always open" },
            { value: "locked", label: "Locked" },
          ],
        },
      ];

    /*
     * Cameras.
     *
     * These were missing, so a camera fell to the default below and the rule
     * builder offered exactly one command: "Power". The camera firmware does
     * not read `power` at all -- it reads resolution, quality, fps, rotation,
     * flash, sensitivity, motion and streaming. So a rule aimed at a camera
     * saved happily, showed a next-run time, and did nothing, forever. That is
     * the worst shape a bug can take: everything says it worked.
     *
     * The ranges come from firmware/camera/camera.ino: FPS_MIN/FPS_MAX 1..30,
     * quality 4..63 (lower is sharper), flash 0..100.
     */
    case "camera":
    case "cctv":
    case "doorbell":
      return [
        { key: "streaming", label: "Live stream", kind: "bool" },
        { key: "motion", label: "Motion detection", kind: "bool" },
        { key: "fps", label: "Frame rate", kind: "number", unit: " fps", min: 1, max: 30, step: 1 },
        { key: "quality", label: "JPEG quality (lower is sharper)", kind: "number", min: 4, max: 63, step: 2 },
        { key: "flash", label: "Illuminator", kind: "number", unit: "%", min: 0, max: 100, step: 10 },
        { key: "sensitivity", label: "Motion sensitivity", kind: "number", unit: "%", min: 1, max: 100, step: 5 },
        {
          key: "resolution",
          label: "Resolution",
          kind: "select",
          choices: [
            { value: "qqvga", label: "QQVGA (160×120)" },
            { value: "qvga", label: "QVGA (320×240)" },
            { value: "cif", label: "CIF (400×296)" },
            { value: "vga", label: "VGA (640×480)" },
            { value: "svga", label: "SVGA (800×600)" },
            { value: "xga", label: "XGA (1024×768)" },
            { value: "sxga", label: "SXGA (1280×1024)" },
          ],
        },
        {
          key: "rotation",
          label: "Rotation",
          kind: "select",
          choices: [
            { value: "0", label: "Upright" },
            { value: "180", label: "Rotated 180°" },
          ],
        },
      ];

    /*
     * ANPR camera.
     *
     * Deliberately NOT folded in with the cameras above. This firmware reads
     * `armed`, `burst`, `settleMs` and `cooldownMs`, and does not read
     * `motion` or `flash` at all, so inheriting the camera list would offer
     * four controls that are discarded on arrival while hiding the four that
     * work — the exact failure the camera block above exists to fix.
     *
     * `streaming` is omitted on purpose even though the device accepts it. A
     * stream is a 20-second lease the firmware cancels by itself, so a
     * schedule that turned it on would save happily, show a next-run time,
     * fire correctly, and leave nothing running twenty seconds later. A
     * control that cannot meaningfully be scheduled must not appear in the
     * scheduler.
     *
     * Ranges come from firmware/anpr-cam/anpr-cam.ino.
     */
    case "anpr-cam":
      return [
        { key: "armed", label: "Armed", kind: "bool" },
      {
        key: "direction",
        label: "Traffic direction",
        kind: "select",
        choices: [
          { value: "in", label: "Entry lane" },
          { value: "out", label: "Exit lane" },
          { value: "both", label: "Both ways" },
        ],
      },
        { key: "sensitivity", label: "Motion sensitivity", kind: "number", unit: "%", min: 1, max: 100, step: 5 },
        { key: "burst", label: "Frames per vehicle", kind: "number", min: 1, max: 8, step: 1 },
        { key: "settleMs", label: "Capture delay", kind: "number", unit: " ms", min: 0, max: 2000, step: 50 },
        { key: "cooldownMs", label: "Re-trigger delay", kind: "number", unit: " ms", min: 1000, max: 30000, step: 1000 },
        { key: "quality", label: "JPEG quality (lower is sharper)", kind: "number", min: 4, max: 40, step: 2 },
        { key: "illum", label: "Illuminator", kind: "number", unit: "%", min: 0, max: 100, step: 10 },
        {
          key: "resolution",
          label: "Capture resolution",
          kind: "select",
          choices: [
            { value: "QVGA", label: "QVGA (320×240)" },
            { value: "VGA", label: "VGA (640×480)" },
            { value: "SVGA", label: "SVGA (800×600)" },
            { value: "XGA", label: "XGA (1024×768)" },
            { value: "SXGA", label: "SXGA (1280×1024)" },
            { value: "UXGA", label: "UXGA (1600×1200)" },
          ],
        },
        {
          key: "rotation",
          label: "Rotation",
          kind: "select",
          choices: [
            { value: "0", label: "Upright" },
            { value: "180", label: "Rotated 180°" },
          ],
        },
      ];

    /*
     * Drone Link.
     *
     * Deliberately only the safety envelope — there is no arm, take-off, mode
     * or goto field here. An automation that could launch an aircraft is an
     * automation that flies a drone when nobody intended to, and there is no
     * schedule, sensor threshold or scene for which that is the right outcome.
     *
     * `allowArm` points the safe way: a rule may ground an aircraft, never
     * launch one. It is a mode rather than a load, so it is also listed in
     * NON_LOAD_FIELDS — without that, the schedule list would offer to switch
     * an aircraft on and off at 7 pm as if it were a lamp.
     *
     * Ranges come from firmware/drone-link/drone-link.ino.
     */
    case "drone-link":
    case "drone-x1":
      return [
        { key: "allowArm", label: "Allow arming", kind: "bool" },
        { key: "maxAlt", label: "Altitude ceiling", kind: "number", unit: " m", min: 5, max: 500, step: 5 },
        { key: "maxRange", label: "Range from home", kind: "number", unit: " m", min: 10, max: 5000, step: 50 },
        { key: "trackHz", label: "Position samples", kind: "number", unit: " /s", min: 1, max: 10, step: 1 },
      ];

    default:
      return [{ key: "power", label: "Power", kind: "bool" }];
  }
}

/**
 * Groups a stored plate for display: `KA01AB1234` → `KA 01 AB 1234`.
 *
 * Display only. The authoritative grouping lives in `prettyPlate` on the
 * control plane, which derives it from the shape the plate actually matched;
 * this is a cosmetic regex over an already-normalised string, so the worst it
 * can do is space a rule description oddly. It deliberately cannot affect
 * matching — the value sent to the server is the raw text the user typed, and
 * the server normalises it with the same function the recogniser uses.
 */
function formatPlate(plate: string): string {
  const s = plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const m = /^([A-Z]{2})(\d{1,2})([A-Z]{1,3})(\d{4})$/.exec(s);
  if (m) return `${m[1]} ${m[2]} ${m[3]} ${m[4]}`;
  const bh = /^(\d{2})(BH)(\d{4})([A-Z]{1,2})$/.exec(s);
  if (bh) return `${bh[1]} ${bh[2]} ${bh[3]} ${bh[4]}`;
  return s;
}

/**
 * Build the command object from a CommandField and its chosen value.
 *
 * WHY THIS TAKES A DEVICE TYPE NOW
 *
 * It used to be `{ [field.key]: value }`, which is a *state* key posing as a
 * command. Two things were wrong with that and both were silent:
 *
 *  - No `action`. CircuventDevice::_dispatch() drops any payload without one
 *    before the sketch's handler runs, so every rule and scene built here
 *    reached the device and was discarded with nothing logged.
 *  - The Home Hub reads { ch, on }, never power2/power3/power4 — those are
 *    what it publishes back.
 *
 * The real mapping lives in lib/smarthome-command-map.ts beside its inverse,
 * so the two are read together and tested against each other. This wrapper
 * stays because callers hold a CommandField rather than a bare key.
 */
export function buildCommand(
  type: string,
  field: CommandField,
  value: boolean | number | string,
): Record<string, unknown> | null {
  return buildFieldCommand(type, field.key, value);
}
