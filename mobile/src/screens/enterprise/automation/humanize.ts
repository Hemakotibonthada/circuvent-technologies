import type { Automation, AutomationAction, AutomationBody, AutomationTrigger, Device, Scene, SceneAction } from "../../../api";
import { OP_LABEL, deviceName, safeJson } from "./types";

function valueText(v: unknown): string {
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return safeJson(v);
}

export function humanizeTrigger(trigger: AutomationTrigger, devices: Device[]): string {
  if (trigger.type === "time") {
    return trigger.at ? `At ${trigger.at}` : "At an unset time";
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
  if (action.type === "notify") {
    if (!action.title && !action.body) return "notify with an empty message";
    return `notify “${action.title || "Notification"}”${action.body ? ` — ${action.body}` : ""}`;
  }
  if (action.type === "command") {
    if (!action.deviceId) return `command ${safeJson(action)}`;
    return `${humanizeCommand(action.command)} ${deviceName(devices, action.deviceId)}`;
  }
  return safeJson(action);
}

export function humanizeAutomation(a: Pick<Automation, "trigger" | "action">, devices: Device[]): string {
  return `${humanizeTrigger(a.trigger, devices)}, ${humanizeAction(a.action, devices)}.`;
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
