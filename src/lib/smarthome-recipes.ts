// Automation Recipes Library — curated, one-click automation templates. Each
// recipe describes a trigger/action shape compatible with the existing
// control-plane Automation API; "using" a recipe just calls
// controlPlane.createAutomation with the template filled in for a chosen
// device, so it produces a REAL automation (visible on /smarthome/automations)
// rather than a separate, disconnected feature.

const USED_KEY = "cv-console-used-recipes";

export type RecipeField = "power" | "level" | "watts" | "motion" | "sos";

export interface RecipeTemplate {
  id: string;
  title: string;
  description: string;
  icon: string;
  trigger:
    | { type: "state"; field: RecipeField; op: "<" | ">" | "truthy" | "falsy"; value?: number }
    | { type: "time"; at: string };
  action: { type: "command"; command: Record<string, unknown> } | { type: "notify"; title: string; body: string };
  needsDevice: boolean;
}

export const RECIPES: RecipeTemplate[] = [
  {
    id: "low-tank-alert",
    title: "Alert me when the tank runs low",
    description: "Get a push notification when a water level drops below 20%.",
    icon: "💧",
    trigger: { type: "state", field: "level", op: "<", value: 20 },
    action: { type: "notify", title: "Tank running low", body: "Water level has dropped below 20%." },
    needsDevice: true,
  },
  {
    id: "morning-on",
    title: "Turn on every morning at 7 AM",
    description: "Start the day with a device already switched on.",
    icon: "🌅",
    trigger: { type: "time", at: "07:00" },
    action: { type: "command", command: { action: "set", power: true } },
    needsDevice: true,
  },
  {
    id: "midnight-off",
    title: "Turn off automatically at midnight",
    description: "Never leave it running overnight by accident.",
    icon: "🌙",
    trigger: { type: "time", at: "00:00" },
    action: { type: "command", command: { action: "set", power: false } },
    needsDevice: true,
  },
  {
    id: "motion-notify",
    title: "Notify me on motion",
    description: "Instant alert the moment motion is detected.",
    icon: "🚶",
    trigger: { type: "state", field: "motion", op: "truthy" },
    action: { type: "notify", title: "Motion detected", body: "Motion was just detected." },
    needsDevice: true,
  },
  {
    id: "sos-notify",
    title: "Escalate on SOS",
    description: "Make sure an SOS trigger always sends a notification.",
    icon: "🆘",
    trigger: { type: "state", field: "sos", op: "truthy" },
    action: { type: "notify", title: "SOS triggered", body: "An SOS alert was triggered." },
    needsDevice: true,
  },
  {
    id: "high-power-alert",
    title: "Flag unusually high power draw",
    description: "Catch a stuck heater or faulty appliance early.",
    icon: "⚡",
    trigger: { type: "state", field: "watts", op: ">", value: 2000 },
    action: { type: "notify", title: "High power draw", body: "A device is drawing more than 2000W." },
    needsDevice: true,
  },
];

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
    window.localStorage.setItem(USED_KEY, JSON.stringify(Array.from(used)));
  } catch {
    /* ignore */
  }
}
