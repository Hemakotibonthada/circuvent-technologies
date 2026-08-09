// Quick automations: one tap instead of a seven-field form.
//
// This module existed with six templates and was imported by nothing at all --
// a whole feature written and never reachable. Wiring it up as it stood would
// have been worse than leaving it: each template carried a raw command like
// `{ action: "set", power: true }`, and that is precisely the shape a home-hub
// ignores. The hub is addressed positionally ({ ch, on }); `power` is a state
// key it publishes, never a command it reads. Every "turn it on at 7am" recipe
// applied to a hub would have created a rule that runs forever and moves
// nothing -- the same silent failure cameras had.
//
// So a template now declares the *field* it wants to change, and the command
// is built per device through buildFieldCommand, the same path the rule editor
// uses. A template that cannot be expressed for the chosen device is not
// offered for it.

import { buildFieldCommand, type CommandPayload } from "./smarthome-command-map";
import { getCommandFields } from "@/app/smarthome/automation/describe";

const USED_KEY = "cv-console-used-recipes";

export interface RecipeDevice {
  id: string;
  type: string;
  name?: string | null;
  state?: Record<string, unknown>;
}

export type RecipeTrigger =
  | { type: "state"; field: string; op: "<" | ">" | "truthy" | "falsy"; value?: number }
  | { type: "time"; at: string };

export type RecipeAction =
  | { kind: "command"; field: string; value: boolean | number | string }
  | { kind: "notify"; title: string; body: string };

export interface RecipeTemplate {
  id: string;
  title: string;
  description: string;
  icon: string;
  trigger: RecipeTrigger;
  action: RecipeAction;
  /**
   * State keys the device must report for the template to make sense.
   *
   * "Alert me when the tank runs low" on a light switch is not a useful offer,
   * and the old list showed every template for every device.
   */
  requiresState?: string[];
}

export const RECIPES: RecipeTemplate[] = [
  {
    id: "low-tank-alert",
    title: "Alert me when the tank runs low",
    description: "Get a notification when the water level drops below 20%.",
    icon: "💧",
    trigger: { type: "state", field: "level", op: "<", value: 20 },
    action: { kind: "notify", title: "Tank running low", body: "Water level has dropped below 20%." },
    requiresState: ["level"],
  },
  {
    id: "morning-on",
    title: "Switch on every morning at 7 AM",
    description: "Start the day with it already running.",
    icon: "🌅",
    trigger: { type: "time", at: "07:00" },
    action: { kind: "command", field: "power", value: true },
  },
  {
    id: "midnight-off",
    title: "Switch off at midnight",
    description: "Never leave it running overnight by accident.",
    icon: "🌙",
    trigger: { type: "time", at: "00:00" },
    action: { kind: "command", field: "power", value: false },
  },
  {
    id: "motion-notify",
    title: "Notify me on motion",
    description: "An alert the moment motion is detected.",
    icon: "🚶",
    trigger: { type: "state", field: "motion", op: "truthy" },
    action: { kind: "notify", title: "Motion detected", body: "Motion was just detected." },
    requiresState: ["motion"],
  },
  {
    id: "sos-notify",
    title: "Escalate on SOS",
    description: "Make sure an SOS always reaches your phone.",
    icon: "🆘",
    trigger: { type: "state", field: "sos", op: "truthy" },
    action: { kind: "notify", title: "SOS triggered", body: "An SOS alert was triggered." },
    requiresState: ["sos"],
  },
  {
    id: "high-power-alert",
    title: "Flag unusually high power draw",
    description: "Catch a stuck heater or a faulty appliance early.",
    icon: "⚡",
    trigger: { type: "state", field: "watts", op: ">", value: 2000 },
    action: { kind: "notify", title: "High power draw", body: "A device is drawing more than 2000 W." },
    requiresState: ["watts"],
  },
  {
    id: "night-camera-arm",
    title: "Arm motion detection at night",
    description: "Switch the camera's motion detection on at 10 PM.",
    icon: "🎥",
    trigger: { type: "time", at: "22:00" },
    action: { kind: "command", field: "motion", value: true },
  },
  {
    id: "morning-camera-stand-down",
    title: "Stand the camera down in the morning",
    description: "Switch motion detection off again at 7 AM.",
    icon: "🌞",
    trigger: { type: "time", at: "07:00" },
    action: { kind: "command", field: "motion", value: false },
  },
];

/**
 * The templates that are meaningful for a given device.
 *
 * A command template survives only if buildFieldCommand can express it for
 * that device type -- the same check the rule editor makes, so a recipe can
 * never create a rule the editor would consider incomplete.
 */
export function recipesFor(device: RecipeDevice | null | undefined): RecipeTemplate[] {
  if (!device) return [];
  const fieldKeys = new Set(getCommandFields(device.type).map((f) => f.key));
  const state = device.state ?? {};

  return RECIPES.filter((r) => {
    if (r.requiresState && !r.requiresState.every((k) => k in state)) return false;
    if (r.trigger.type === "state" && !(r.trigger.field in state)) return false;

    if (r.action.kind === "command") {
      if (!fieldKeys.has(r.action.field)) return false;
      if (!buildFieldCommand(device.type, r.action.field, r.action.value)) return false;
    }
    return true;
  });
}

export interface BuiltAutomation {
  name: string;
  enabled: boolean;
  trigger: Record<string, unknown>;
  action: Record<string, unknown>;
}

/**
 * Turn a template plus a device into the exact body the API expects.
 *
 * Returns null when the command cannot be built, rather than falling back to
 * something plausible -- a rule that stores an unusable command looks saved and
 * never moves anything.
 */
export function buildAutomation(recipe: RecipeTemplate, device: RecipeDevice): BuiltAutomation | null {
  const label = device.name || device.id;

  const trigger: Record<string, unknown> =
    recipe.trigger.type === "time"
      ? { type: "time", at: recipe.trigger.at }
      : {
          type: "state",
          deviceId: device.id,
          field: recipe.trigger.field,
          op: recipe.trigger.op,
          ...(recipe.trigger.value !== undefined ? { value: recipe.trigger.value } : {}),
        };

  let action: Record<string, unknown>;
  if (recipe.action.kind === "notify") {
    action = { type: "notify", title: recipe.action.title, body: recipe.action.body };
  } else {
    const command = buildFieldCommand(device.type, recipe.action.field, recipe.action.value) as CommandPayload | null;
    if (!command) return null;
    action = { type: "command", deviceId: device.id, command };
  }

  return {
    name: `${recipe.title} — ${label}`.slice(0, 120),
    enabled: true,
    trigger,
    action,
  };
}

export function listUsedRecipeIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(USED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function markUsed(id: string): void {
  if (typeof window === "undefined") return;
  try {
    const used = new Set(listUsedRecipeIds());
    used.add(id);
    window.localStorage.setItem(USED_KEY, JSON.stringify([...used]));
  } catch {
    /* a full or blocked localStorage must not stop a rule being created */
  }
}
