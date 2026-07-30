"use client";

import type { AutomationTrigger, AutomationAction, AutomationActions } from "@/lib/control-plane";
import { actionList } from "@/lib/control-plane";
import { daysText } from "@/lib/smarthome-switches";

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
    const kind = trigger.eventType ? `${trigger.eventType} event` : "any event";
    const pairs = Object.entries(trigger.match ?? {});
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
