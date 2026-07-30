import type { Automation, AutomationAction, AutomationActions, AutomationBody, AutomationTrigger, Device, Scene, SceneAction } from "../../../api";
import { actionList } from "../../../api";
import { OP_LABEL, deviceName, safeJson } from "./types";

function valueText(v: unknown): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return safeJson(v);
}

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** A week that starts on Monday reads better in a planner. */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];

/**
 * Names the days a time trigger runs on. Missing or complete means daily,
 * matching the control plane, which fails open when `days` is absent.
 */
export function daysText(days?: number[]): string {
  if (!days || days.length === 0 || days.length === 7) return "Every day";
  const set = new Set(days);
  if (set.size === 5 && [1, 2, 3, 4, 5].every((d) => set.has(d))) return "Weekdays";
  if (set.size === 2 && set.has(0) && set.has(6)) return "Weekends";
  return WEEK_ORDER.filter((d) => set.has(d)).map((d) => DAY_LABELS[d]).join(", ");
}

/** True when a time trigger runs on the given weekday (0=Sun … 6=Sat). */
export function runsOnDay(trigger: AutomationTrigger, weekday: number): boolean {
  if (!trigger.days || trigger.days.length === 0) return true;
  return trigger.days.includes(weekday);
}

export function humanizeTrigger(trigger: AutomationTrigger, devices: Device[]): string {
  if (trigger.type === "time") {
    return trigger.at ? `${daysText(trigger.days)} at ${trigger.at} IST` : "At an unset time";
  }
  if (trigger.type === "event") {
    const dev = deviceName(devices, trigger.deviceId);
    const kind = trigger.eventType ? `${trigger.eventType} event` : "any event";
    return `On ${dev} ${kind}`;
  }
  if (trigger.type === "state") {
    if (!trigger.deviceId || !trigger.field || !trigger.op) return `When ${safeJson(trigger)}`;
    const dev = deviceName(devices, trigger.deviceId);
    const op = OP_LABEL[trigger.op];
    if (!op) return `When ${safeJson(trigger)}`;
    const suffix = trigger.op === "truthy" || trigger.op === "falsy" ? "" : ` ${valueText(trigger.value)}`;
    return `When ${dev} ${trigger.field} ${op}${suffix}`;
  }
  return `When ${safeJson(trigger)}`;
}

export function humanizeCommand(command?: Record<string, unknown>): string {
  if (!command || !Object.keys(command).length) return "send an empty command";
  const entries = Object.entries(command);
  if (entries.length === 1) {
    const [k, v] = entries[0];
    if (k === "on" && typeof v === "boolean") return v ? "turn on" : "turn off";
    if (k === "power" && typeof v === "boolean") return v ? "power on" : "power off";
    if (k === "open" && typeof v === "boolean") return v ? "open" : "close";
    if (k === "locked" && typeof v === "boolean") return v ? "lock" : "unlock";
    return `set ${k} to ${valueText(v)}`;
  }
  return `send ${safeJson(command)}`;
}

export function humanizeAction(action: AutomationAction, devices: Device[]): string {
  const wait = action.delayMs && action.delayMs > 0 ? `wait ${action.delayMs / 1000}s, then ` : "";
  if (action.type === "notify") {
    if (!action.title && !action.body) return `${wait}notify with an empty message`;
    return `${wait}notify “${action.title || "Notification"}”${action.body ? ` — ${action.body}` : ""}`;
  }
  if (action.type === "tts") {
    const said = action.text || action.body || "";
    return `${wait}announce${said ? ` “${said}”` : ""} on ${deviceName(devices, action.deviceId)}`;
  }
  if (action.type === "command") {
    if (!action.deviceId) return `${wait}command ${safeJson(action)}`;
    return `${wait}${humanizeCommand(action.command)} ${deviceName(devices, action.deviceId)}`;
  }
  return safeJson(action);
}

/** Describes a whole action, joining the steps of a sequence in order. */
export function humanizeActions(action: AutomationActions, devices: Device[]): string {
  const steps = actionList(action);
  if (steps.length === 0) return "do nothing";
  return steps.map((s) => humanizeAction(s, devices)).join(", then ");
}

export function humanizeAutomation(a: Pick<Automation, "trigger" | "action">, devices: Device[]): string {
  return `${humanizeTrigger(a.trigger, devices)}, ${humanizeActions(a.action, devices)}.`;
}

export function humanizeBody(body: AutomationBody, devices: Device[]): string {
  if (!body.trigger || !body.action) return safeJson(body);
  return humanizeAutomation({ trigger: body.trigger, action: body.action }, devices);
}

export function humanizeSceneAction(action: SceneAction, devices: Device[]): string {
  return `${humanizeCommand(action.command)} ${deviceName(devices, action.deviceId)}`;
}

export function sceneSummary(scene: Scene, devices: Device[]): string {
  if (!scene.actions.length) return "No actions configured.";
  const first = scene.actions.slice(0, 2).map((a) => humanizeSceneAction(a, devices)).join("; ");
  return scene.actions.length > 2 ? `${first}; +${scene.actions.length - 2} more` : first;
}
