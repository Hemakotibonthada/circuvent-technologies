/**
 * Reading an Agri GSM Starter's state — the phone's copy.
 *
 * WHY A PUMP BEING OFF NEEDS AN EXPLANATION
 *
 * The pump is at the bottom of a field. The farmer cannot look at it, and the
 * difference between the reasons it is not running is the difference between
 * doing nothing, waiting twenty seconds, and getting on a motorbike:
 *
 *   no mains        the board has cut the supply — wait, nothing is wrong
 *   restart delay   the supply just came back and the motor is not being
 *                   thrown straight into it — wait, nothing is wrong
 *   dry run         the water source has failed — go and look, now
 *   max runtime     it did its job and stopped itself
 *   idle            nobody asked it to run
 *
 * The old panel knew about exactly one of these and showed "Pump: off" for the
 * rest, which is the same information as no information.
 *
 * The firmware publishes `hold` and this turns it into a sentence.
 * src/lib/agri.ts is the same thing for the web console, and
 * tests/agri-parity.test.ts keeps the two — and the firmware — in step.
 */

export type AgriHoldReason =
  | "running"
  | "idle"
  | "no-mains"
  | "restart-delay"
  | "dry-run";

export type AgriState = {
  pump?: unknown;
  power_available?: unknown;
  hold?: unknown;
  dry?: unknown;
  dryGuard?: unknown;
  callers?: unknown;
  ringMin?: unknown;
  maxRunMin?: unknown;
  minsLeft?: unknown;
  runHours?: unknown;
};

function bool(v: unknown): boolean {
  return v === true || v === 1 || v === "true";
}

function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/**
 * Why the pump is not running.
 *
 * Derived from `hold` when the firmware sends it, and inferred from the older
 * fields when it does not — starters on 1.1.0 publish only `pump` and
 * `power_available`, and a panel that showed "unknown" for every one of them
 * would be a regression for the devices that are actually in fields today.
 */
export function readHold(state: AgriState): AgriHoldReason {
  const hold = typeof state.hold === "string" ? state.hold : "";
  if (
    hold === "running" ||
    hold === "idle" ||
    hold === "no-mains" ||
    hold === "restart-delay" ||
    hold === "dry-run"
  ) {
    return hold;
  }

  // Older firmware.
  if (bool(state.pump)) return "running";
  if (!bool(state.power_available)) return "no-mains";
  return "idle";
}

/**
 * What to tell somebody, and how loudly.
 *
 * `critical` is reserved for the one that needs a person to go and look. A
 * missing supply is the normal state of a rural connection for hours a day and
 * must not be dressed up as a fault, or the real alarm gets ignored with it.
 */
export function describeHold(
  reason: AgriHoldReason,
  state: AgriState = {},
): { severity: "none" | "info" | "warning" | "critical"; text: string } {
  switch (reason) {
    case "running": {
      const left = num(state.minsLeft);
      return {
        severity: "none",
        text: left > 0 ? `Running — about ${left} min left.` : "Running.",
      };
    }
    case "no-mains":
      return {
        severity: "warning",
        text: "No mains power at the pump. It will start on its own when the supply returns.",
      };
    case "restart-delay":
      return {
        severity: "info",
        text: "Supply is back. Waiting a few seconds for it to steady before starting the motor.",
      };
    case "dry-run":
      return {
        severity: "critical",
        text: "Stopped: dry run. The water source has failed — check it before restarting, then clear the cutout.",
      };
    case "idle":
    default:
      return { severity: "none", text: "Idle." };
  }
}

/**
 * Whether this starter can be operated from a phone at all.
 *
 * With no numbers provisioned, nothing is trusted — which is correct, and is
 * the fix for a firmware that let any incoming call toggle the pump. But it
 * also means the missed-call control the product is sold on does nothing, and
 * that is worth saying out loud on the setup screen rather than leaving
 * somebody ringing a number that ignores them.
 */
export function phoneControlReady(state: AgriState): boolean {
  return num(state.callers) > 0;
}

/** Bounds the firmware enforces, duplicated so a form can refuse early. */
export const AGRI_BOUNDS = {
  /** 0 means "run until told to stop", which the max runtime still ends. */
  ringMin: { min: 0, max: 720 },
  maxRunMin: { min: 5, max: 720 },
  restartSec: { min: 0, max: 600 },
  maxCallers: 4,
} as const;

export function clampRingMinutes(mins: number): number {
  if (!Number.isFinite(mins)) return 30;
  return Math.min(AGRI_BOUNDS.ringMin.max, Math.max(AGRI_BOUNDS.ringMin.min, Math.round(mins)));
}
