import type { Automation, AutomationAction, AutomationBody, AutomationTrigger, Device, SceneAction } from "../../../api";
import { actionList } from "../../../api";

export type TriggerType = "state" | "time";
export type ActionType = "command" | "notify";
export type AutomationOp = NonNullable<AutomationTrigger["op"]>;

export const OPS: AutomationOp[] = ["<", "<=", ">", ">=", "==", "!=", "truthy", "falsy"];

export const OP_LABEL: Record<AutomationOp, string> = {
  "<": "is below",
  "<=": "is at most",
  ">": "rises above",
  ">=": "is at least",
  "==": "equals",
  "!=": "does not equal",
  truthy: "is truthy",
  falsy: "is falsy",
};

export interface FieldInfo {
  key: string;
  types: string[];
  sample?: unknown;
  source: "state" | "telemetry" | "both";
}

export interface RuleDraft {
  id?: number;
  name: string;
  enabled: boolean;
  trigger: AutomationTrigger;
  action: AutomationAction;
  /**
   * Steps beyond the first, for rules authored as a sequence in the web
   * console. This builder edits only the first action, so the rest are carried
   * through untouched rather than being dropped on save.
   */
  extraSteps?: AutomationAction[];
}

export interface SceneDraft {
  id?: number;
  name: string;
  icon: string;
  favorite: boolean;
  actions: SceneAction[];
}

export interface AutomationLoad {
  automations: Automation[];
  devices: Device[];
}

export type FieldErrors = Record<string, string | undefined>;

export function emptyDraft(): RuleDraft {
  return {
    name: "",
    enabled: true,
    trigger: { type: "state" },
    action: { type: "command", command: {} },
  };
}

export function cloneAutomation(a: Automation): RuleDraft {
  // The mobile rule builder edits one action. Cloning the first step keeps that
  // contract, but a sequence must not be silently flattened here — callers that
  // save a clone would drop the remaining steps.
  const steps = actionList(a.action);
  const first = steps[0];
  return {
    id: a.id,
    name: a.name,
    enabled: a.enabled,
    trigger: { ...a.trigger },
    action: first
      ? { ...first, command: first.command ? { ...first.command } : undefined }
      : { type: "notify" },
    extraSteps: steps.length > 1 ? steps.slice(1).map((s) => ({ ...s })) : undefined,
  };
}

export function duplicateAutomation(a: Automation): RuleDraft {
  const d = cloneAutomation(a);
  delete d.id;
  d.name = `${a.name} copy`;
  return d;
}

export function toAutomationBody(d: RuleDraft): AutomationBody {
  return {
    name: d.name.trim(),
    enabled: d.enabled,
    trigger: d.trigger,
    // Re-attach any steps this builder could not show, so editing the first
    // action of a sequence does not delete the rest of it.
    action: d.extraSteps?.length ? [d.action, ...d.extraSteps] : d.action,
  };
}

export function deviceName(devices: Device[], id?: string): string {
  if (!id) return "Unknown device";
  return devices.find((d) => d.id === id)?.name || id;
}

export function deviceById(devices: Device[], id?: string): Device | undefined {
  return devices.find((d) => d.id === id);
}

export function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function parseJsonObject(raw: string): { value?: Record<string, unknown>; error?: string } {
  try {
    const value = JSON.parse(raw || "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return { error: "Enter a JSON object." };
    return { value: value as Record<string, unknown> };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Invalid JSON." };
  }
}

export function inferValue(raw: string, sample?: unknown): number | string | boolean {
  if (typeof sample === "boolean") return raw === "true";
  if (typeof sample === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  const n = Number(raw);
  return raw.trim() !== "" && Number.isFinite(n) ? n : raw;
}

export function stringifyValue(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  return String(v);
}

export function isValidTime(value?: string): boolean {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value || "");
}

export function minutesOf(at?: string): number {
  if (!isValidTime(at)) return -1;
  const [h, m] = String(at).split(":").map(Number);
  return h * 60 + m;
}

export function asHHMM(minutes: number): string {
  const m = ((minutes % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
