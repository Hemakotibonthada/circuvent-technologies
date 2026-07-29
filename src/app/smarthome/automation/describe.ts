"use client";

import type { AutomationTrigger, AutomationAction } from "@/lib/control-plane";

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
    return `Every day at ${trigger.at ?? "--:--"}`;
  }
  const dev = deviceName(trigger.deviceId);
  const field = trigger.field ?? "unknown field";
  const op = OP_TEXT[trigger.op ?? "=="] ?? (trigger.op ?? "==");
  if (trigger.op === "truthy" || trigger.op === "falsy") {
    return `When ${dev} · ${field} ${op}`;
  }
  return `When ${dev} · ${field} ${op} ${String(trigger.value ?? "")}`;
}

export function actionText(
  action: AutomationAction,
  deviceName: (id?: string) => string,
): string {
  if (action.type === "notify") {
    const title = action.title ? `"${action.title}"` : "a notification";
    return `Send ${title}${action.body ? ` — ${action.body}` : ""}`;
  }
  const dev = deviceName(action.deviceId);
  const entries = action.command
    ? Object.entries(action.command).filter(([k]) => k !== "action")
    : [];
  if (entries.length === 0) {
    const act = (action.command as Record<string, unknown> | undefined)?.action;
    return act ? `${String(act)} ${dev}` : `Command ${dev}`;
  }
  const desc = entries.map(([k, v]) => `${k} → ${String(v)}`).join(", ");
  return `Set ${dev}: ${desc}`;
}

/**
 * One-liner preview combining trigger + action for the rule builder preview
 * strip.
 */
export function rulePreviewText(
  trigger: AutomationTrigger,
  action: AutomationAction,
  deviceName: (id?: string) => string,
): string {
  return `${triggerText(trigger, deviceName)} → ${actionText(action, deviceName)}`;
}

/* ------------------------------------------------------------------ */
/* Schedule helpers                                                    */
/* ------------------------------------------------------------------ */

/**
 * How long until the next occurrence of a daily HH:MM schedule.
 * The server does not store a timezone; we compare against local time.
 */
export function nextRunText(at: string): string {
  const [hStr, mStr] = at.split(":");
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return "—";

  const now = new Date();
  const next = new Date(now);
  next.setHours(h, m, 0, 0);
  // If that time has already passed today, it runs tomorrow.
  if (next <= now) next.setDate(next.getDate() + 1);

  const diffMs = next.getTime() - now.getTime();
  const diffMins = Math.round(diffMs / 60_000);
  if (diffMins < 60) return `in ${diffMins}m`;
  const diffHrs = Math.round(diffMins / 60);
  if (diffHrs < 24) return `in ${diffHrs}h`;
  return `tomorrow at ${at}`;
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

    default:
      return [{ key: "power", label: "Power", kind: "bool" }];
  }
}

/**
 * Build the command object from a CommandField and its chosen value.
 * Action-type fields (rfid-gate barrier) use the `action` key; all others
 * use the field key directly — matching what each firmware sketch reads.
 */
export function buildCommand(
  field: CommandField,
  value: boolean | number | string,
): Record<string, unknown> {
  if (field.key === "action") return { action: value };
  return { [field.key]: value };
}
