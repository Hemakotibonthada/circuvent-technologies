/**
 * What a Circuvent device looks like to Google Home and Alexa.
 *
 * Pure, so the mapping that decides what a voice assistant can reach is
 * testable without a broker, a database or a request. It is worth that: this
 * file is the difference between "turn off the lights" reaching four lamps and
 * it stopping the irrigation pump.
 *
 * TWO RULES THAT ARE NOT OBVIOUS
 *
 * A type absent from `onOff` does not exist to either assistant. That is the
 * security boundary for voice and it is deliberate — locks, gates, cameras,
 * ANPR and drones are all left out, because their only boolean is a *mode*
 * (locked, armed, cleared to fly) rather than a load. "Unlock the front door"
 * must not be reachable by anything that can hear through a window.
 *
 * The category a device is given matters as much as whether it appears.
 * Assistants sweep by category: "turn everything off" and every goodnight
 * routine reach whatever is typed as a SWITCH. A pump typed as a SWITCH — the
 * obvious mapping, since electrically that is what it is — means going to bed
 * cuts the water supply and stops an irrigation cycle halfway.
 *
 * This duplicates knowledge that also lives in the site's
 * src/lib/smarthome-command-map.ts, for the reason device-commands.ts gives:
 * the control plane is a separate deployable and must not depend on the site.
 * The two are kept honest by testing both against the same firmware behaviour.
 */

export interface DeviceLike {
  id: string;
  name: string;
  type: string;
  room?: string;
  online: boolean;
  state: Record<string, unknown>;
}

/** The state field and command shape for a device's primary load. */
export interface OnOffMap {
  field: string;
  cmd: (v: boolean) => Record<string, unknown>;
}

/**
 * On/off mapping per device type. Null for anything voice must not reach.
 *
 * `drone-link` is the sharpest omission and worth stating outright: its
 * boolean is an aircraft's permission to take off. There is no phrasing of
 * "turn on the drone" that an assistant should act on, and none of "turn it
 * off" that should ground an aircraft a pilot is about to fly. It stays out
 * permanently, not until somebody asks for it.
 *
 * The touch boards — `touchboard` and `touchboard-8` — are out for a quieter
 * reason. This map gives an assistant exactly one field per device, and a
 * wall panel has three or eight independent loads with no principled "the"
 * switch among them. Mapping it to g1, the way `sentinel` maps to r1, would
 * mean "turn off the switchboard" leaves seven gangs burning while the
 * assistant says it worked — a control that answers and does almost nothing,
 * which is exactly the failure this file keeps out. Individual gangs are
 * still reachable by voice through the app's Siri sync, which addresses
 * fields rather than devices.
 */
export function onOff(type: string): OnOffMap | null {
  switch (type) {
    case "smart-plug":
    case "smart-switch":
    case "smart-light":
    case "smart-fan":
      return { field: "power", cmd: (v) => ({ power: v }) };
    case "agri-starter":
    case "aquaguard":
      return { field: "pump", cmd: (v) => ({ pump: v }) };
    case "home-hub":
      return { field: "power", cmd: (v) => ({ ch: 0, on: v }) };
    case "sentinel":
      return { field: "r1", cmd: (v) => ({ r1: v }) };
    default:
      return null;
  }
}

/**
 * Brightness, where the hardware has it.
 *
 * Only for types whose firmware actually reads the field. Advertising a trait
 * a board ignores is worse than not having it: the assistant reports success,
 * says "OK, 40 per cent", and the lamp does not move — which reads as the lamp
 * being broken rather than the integration lying.
 */
export function brightness(
  type: string
): { field: string; cmd: (v: number) => Record<string, unknown> } | null {
  if (type !== "smart-light") return null;
  return {
    field: "brightness",
    cmd: (v) => ({ action: "set", brightness: Math.max(0, Math.min(100, Math.round(v))) }),
  };
}

/**
 * The four named fan speeds the original firmware understood.
 *
 * Level 1 is not one per cent of duty. A fan motor below roughly a third of
 * full duty stalls rather than turning slowly — it hums and draws locked-rotor
 * current through a winding its own airflow is no longer cooling — so the
 * firmware maps 1..100 onto the usable band above that floor.
 */
export const FAN_STEP_LEVEL = [0, 33, 66, 100] as const;

/** Nearest named step for a continuous level. Mirrors the firmware and the site. */
export function levelToSpeed(level: number): number {
  if (!Number.isFinite(level) || level <= 0) return 0;
  let best = 1;
  let bestDiff = Infinity;
  for (let s = 1; s <= 3; s++) {
    const d = Math.abs(level - FAN_STEP_LEVEL[s]);
    if (d < bestDiff) {
      bestDiff = d;
      best = s;
    }
  }
  return best;
}

/**
 * Fan speed as a percentage, which is how both assistants speak.
 *
 * Sends BOTH `level` and `speed`. Fans already in people's homes run firmware
 * that reads only `speed` and silently ignores anything else, so a command
 * carrying only `level` would have the assistant report success while the fan
 * did not move. `level` is sent too because it is the more precise statement
 * of the same intent, and updated firmware prefers it.
 */
export function fanSpeed(type: string): {
  field: string;
  legacyField: string;
  toPercent: (state: Record<string, unknown>) => number;
  cmd: (percent: number) => Record<string, unknown>;
} | null {
  if (type !== "smart-fan") return null;
  return {
    field: "level",
    legacyField: "speed",
    toPercent: (state) => {
      const level = Number(state.level);
      if (Number.isFinite(level)) return Math.max(0, Math.min(100, Math.round(level)));
      /* A fan predating `level` reports only `speed`, so the percentage is
         reconstructed from the step table rather than reported as zero — which
         would show a running fan as off. */
      const step = Number(state.speed);
      if (!Number.isFinite(step)) return 0;
      return FAN_STEP_LEVEL[Math.max(0, Math.min(3, Math.round(step)))] ?? 0;
    },
    cmd: (percent) => {
      const level = Math.max(0, Math.min(100, Math.round(percent)));
      return { action: "set", level, speed: levelToSpeed(level) };
    },
  };
}

/** Google's device type. See the note above about category sweeps. */
export function googleTypeFor(type: string): string {
  switch (type) {
    case "smart-plug":
      return "action.devices.types.OUTLET";
    case "smart-light":
      return "action.devices.types.LIGHT";
    case "smart-fan":
      return "action.devices.types.FAN";
    case "aquaguard":
    case "agri-starter":
      return "action.devices.types.VALVE";
    default:
      return "action.devices.types.SWITCH";
  }
}

/** Alexa's equivalent, kept beside Google's so the two cannot drift apart. */
export function alexaCategoryFor(type: string): string {
  switch (type) {
    case "smart-plug":
      return "SMARTPLUG";
    case "smart-light":
      return "LIGHT";
    case "smart-fan":
      return "FAN";
    case "aquaguard":
    case "agri-starter":
      return "WATER_HEATER";
    default:
      return "SWITCH";
  }
}

/** Google traits for a device, primary load first. */
export function googleTraits(type: string): string[] {
  const traits = ["action.devices.traits.OnOff"];
  if (brightness(type)) traits.push("action.devices.traits.Brightness");
  if (fanSpeed(type)) traits.push("action.devices.traits.FanSpeed");
  return traits;
}

/** Whether a device is exposed to voice at all. */
export function isExposed(type: string): boolean {
  return onOff(type) !== null;
}

/** The Google SYNC entry for one device. */
export function googleSyncEntry(d: DeviceLike, reportsState: boolean): Record<string, unknown> {
  const fan = fanSpeed(d.type);
  return {
    id: d.id,
    type: googleTypeFor(d.type),
    traits: googleTraits(d.type),
    name: { name: d.name || d.id },
    /*
     * True only when the server can actually push. Claiming it while nothing
     * reports leaves Google waiting for updates that never arrive and showing
     * the device as unresponsive — a worse failure than not claiming it,
     * because the user sees a fault rather than a limitation.
     */
    willReportState: reportsState,
    roomHint: d.room || undefined,
    deviceInfo: { manufacturer: "Circuvent", model: d.type },
    ...(fan
      ? {
          attributes: {
            /* Named steps as well as a percentage: "set the fan to low" is how
               people speak to a fan. The names match the firmware's four
               positions rather than inventing a finer scale it cannot honour. */
            availableFanSpeeds: {
              speeds: [1, 2, 3].map((n) => ({
                speed_name: `S${n}`,
                speed_values: [
                  {
                    speed_synonym: [
                      `${n}`,
                      ...(n === 1 ? ["low", "slow"] : n === 2 ? ["medium", "mid"] : ["high", "max", "full"]),
                    ],
                    lang: "en",
                  },
                ],
              })),
              ordered: true,
            },
            supportsFanSpeedPercent: true,
          },
        }
      : {}),
  };
}

/** The Google QUERY state for one device. */
export function googleState(d: DeviceLike): Record<string, unknown> {
  const m = onOff(d.type);
  if (!m) return { online: false, status: "ERROR" };
  const out: Record<string, unknown> = {
    online: d.online,
    status: "SUCCESS",
    on: !!d.state[m.field],
  };
  const b = brightness(d.type);
  if (b && d.state[b.field] != null) out.brightness = Number(d.state[b.field]) || 0;
  const f = fanSpeed(d.type);
  if (f) out.currentFanSpeedPercent = f.toPercent(d.state);
  return out;
}
