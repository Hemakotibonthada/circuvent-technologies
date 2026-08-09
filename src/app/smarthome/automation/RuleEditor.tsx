"use client";

import { useMemo, useState } from "react";
import { AlertCircle, Info, Plus, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { controlPlane, actionList } from "@/lib/control-plane";
import type {
  Automation,
  AutomationBody,
  AutomationTrigger,
  AutomationAction,
  Device,
} from "@/lib/control-plane";
import { useFleet, useTelemetry } from "../_data/hooks";
import { daysText, istOffsetNote, EVERY_DAY, WEEK_ORDER, WEEKDAY_LABELS } from "@/lib/smarthome-switches";
import { useChannelLabels } from "@/lib/smarthome-prefs";
import { useToast, Modal } from "../_kit/overlays";
import { Button, Field, NumberInput, SelectInput, SwitchRow, TextInput } from "../_kit/primitives";
import {
  triggerText,
  actionText,
  inferFieldKind,
  operatorsFor,
  getCommandFields,
  buildCommand,
  type CommandField,
} from "./describe";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type TriggerType = "state" | "time" | "event";
type ActionType = "command" | "notify" | "tts";

/** The control plane caps a single step's pause at 30s. */
const MAX_DELAY_MS = 30000;
/** And accepts at most 12 steps in one automation. */
const MAX_STEPS = 12;

interface Props {
  rule: Automation | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * One step of an action sequence, held in the shape the form needs rather than
 * the shape the API takes. Every command kind keeps its own value so switching
 * field or device does not discard what was already typed.
 */
interface Step {
  id: string;
  type: ActionType;
  deviceId: string;
  cmdFieldKey: string;
  boolValue: boolean;
  numValue: number;
  selectValue: string;
  title: string;
  body: string;
  text: string;
  delayMs: number;
}

let stepSeq = 0;
const newStepId = () => `s${Date.now().toString(36)}${stepSeq++}`;

function blankStep(type: ActionType = "notify"): Step {
  return {
    id: newStepId(),
    type,
    deviceId: "",
    cmdFieldKey: "",
    boolValue: true,
    numValue: 0,
    selectValue: "",
    title: "",
    body: "",
    text: "",
    delayMs: 0,
  };
}

/** Rebuilds form state from a stored action so editing round-trips exactly. */
function stepFromAction(a: AutomationAction): Step {
  const cmd = (a.command ?? {}) as Record<string, unknown>;
  const explicit = typeof cmd.action === "string";
  const key = explicit ? "action" : Object.keys(cmd).filter((k) => k !== "action")[0] ?? "";
  const raw = explicit ? cmd.action : key ? cmd[key] : undefined;

  return {
    id: newStepId(),
    type: a.type,
    deviceId: a.deviceId ?? "",
    cmdFieldKey: key,
    boolValue: typeof raw === "boolean" ? raw : true,
    numValue: typeof raw === "number" ? raw : 0,
    selectValue: typeof raw === "string" ? raw : "",
    title: a.title ?? "",
    body: a.body ?? "",
    text: a.text ?? "",
    delayMs: a.delayMs ?? 0,
  };
}

function parseValue(raw: string, kind: "boolean" | "number" | "string"): number | boolean | string {
  if (kind === "boolean") return raw === "true";
  if (kind === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  return raw;
}

/** Command fields for a device, relabelled with the user's own switch names. */
function commandFieldsFor(
  device: Device | undefined,
  labelFor: (deviceId: string, key: string, fallback: string) => string,
): CommandField[] {
  if (!device) return [];
  return getCommandFields(device.type).map((f) =>
    f.kind === "bool" ? { ...f, label: labelFor(device.id, f.key, f.label) } : f
  );
}

/** The value a step contributes to its command, given the selected field. */
function stepValue(step: Step, field: CommandField): boolean | number | string {
  if (field.kind === "bool") return step.boolValue;
  if (field.kind === "number") return step.numValue;
  return step.selectValue;
}

/**
 * Converts a step to the API shape, or null when it is not yet complete.
 *
 * `deviceType` is a separate argument rather than looked up from `fields`,
 * because the command shape depends on the sketch and not on the field list —
 * two device types can offer the same field key and read it differently.
 */
function actionFromStep(step: Step, fields: CommandField[], deviceType: string): AutomationAction | null {
  const delay = step.delayMs > 0 ? { delayMs: Math.min(step.delayMs, MAX_DELAY_MS) } : {};

  if (step.type === "notify") {
    if (!step.title.trim()) return null;
    return {
      type: "notify",
      title: step.title.trim(),
      body: step.body.trim() || undefined,
      ...delay,
    };
  }
  if (step.type === "tts") {
    if (!step.deviceId || !step.text.trim()) return null;
    return { type: "tts", deviceId: step.deviceId, text: step.text.trim(), ...delay };
  }
  const field = fields.find((f) => f.key === step.cmdFieldKey);
  if (!step.deviceId || !field) return null;
  const command = buildCommand(deviceType, field, stepValue(step, field));
  // A step whose command cannot be expressed is dropped rather than saved.
  // A rule that stores an unusable command looks saved, shows a next-run time,
  // and never moves anything — which is the failure this guards against.
  if (!command) return null;
  return {
    type: "command",
    deviceId: step.deviceId,
    command,
    ...delay,
  };
}

/* ------------------------------------------------------------------ */
/* Main component                                                      */
/* ------------------------------------------------------------------ */

export default function RuleEditor({ rule, onClose, onSaved }: Props) {
  const { devices, byId: deviceById } = useFleet();
  const { labelFor } = useChannelLabels();
  const toast = useToast();

  // ---- core fields ----
  const [name, setName] = useState(rule?.name ?? "");
  const [enabled, setEnabled] = useState(rule?.enabled ?? true);

  // ---- trigger ----
  const [triggerType, setTriggerType] = useState<TriggerType>(rule?.trigger.type ?? "state");
  const [triggerDeviceId, setTriggerDeviceId] = useState(rule?.trigger.deviceId ?? "");
  const [triggerField, setTriggerField] = useState(rule?.trigger.field ?? "");
  const [triggerOp, setTriggerOp] = useState<NonNullable<AutomationTrigger["op"]>>(
    rule?.trigger.op ?? "truthy",
  );
  const [triggerValue, setTriggerValue] = useState(String(rule?.trigger.value ?? ""));
  const [at, setAt] = useState(rule?.trigger.at ?? "06:00");
  const [days, setDays] = useState<number[]>(
    rule?.trigger.days?.length ? rule.trigger.days : EVERY_DAY
  );
  const [eventType, setEventType] = useState(rule?.trigger.eventType ?? "");
  const [matchText, setMatchText] = useState(() =>
    Object.entries(rule?.trigger.match ?? {})
      .map(([k, v]) => `${k}=${String(v)}`)
      .join(", ")
  );

  // ---- action steps ----
  const [steps, setSteps] = useState<Step[]>(() => {
    const existing = actionList(rule?.action).map(stepFromAction);
    return existing.length ? existing : [blankStep()];
  });

  const [busy, setBusy] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ---- derived state ----
  const triggerDevice = triggerDeviceId ? deviceById.get(triggerDeviceId) : undefined;

  const stateFields = useMemo(
    () => Object.keys(triggerDevice?.state ?? {}).sort(),
    [triggerDevice],
  );

  const { numericFields } = useTelemetry(triggerDeviceId || null, 50);

  const allTriggerFields = useMemo(() => {
    const combined = new Set([...stateFields, ...numericFields]);
    return Array.from(combined).sort();
  }, [stateFields, numericFields]);

  const fieldKind = useMemo(() => {
    if (!triggerField || !triggerDevice) return "string" as const;
    const val = triggerDevice.state[triggerField];
    if (val === undefined) {
      return numericFields.includes(triggerField) ? "number" : "string";
    }
    return inferFieldKind(val);
  }, [triggerField, triggerDevice, numericFields]);

  const operators = useMemo(() => operatorsFor(fieldKind), [fieldKind]);

  // Keep the operator valid for the field kind. Derived rather than corrected in
  // an effect, so the form never renders a combination it would reject.
  const effectiveOp = useMemo(() => {
    const valid = operators.map((o) => o.value);
    return valid.includes(triggerOp) ? triggerOp : (valid[0] as NonNullable<AutomationTrigger["op"]>);
  }, [operators, triggerOp]);

  const needsValue = effectiveOp !== "truthy" && effectiveOp !== "falsy";

  const deviceName = (id?: string) => (id ? (deviceById.get(id)?.name ?? id) : "any device");

  /** `a=1, b=true` → `{ a: 1, b: true }`. Blank keys are ignored. */
  const parsedMatch = useMemo((): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const pair of matchText.split(",")) {
      const [k, ...rest] = pair.split("=");
      const key = k?.trim();
      if (!key || rest.length === 0) continue;
      const raw = rest.join("=").trim();
      if (raw === "true" || raw === "false") out[key] = raw === "true";
      else if (raw !== "" && Number.isFinite(Number(raw))) out[key] = Number(raw);
      else out[key] = raw;
    }
    return out;
  }, [matchText]);

  // ---- step helpers ----
  const patchStep = (id: string, patch: Partial<Step>) =>
    setSteps((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  const addStep = () =>
    setSteps((prev) => (prev.length >= MAX_STEPS ? prev : [...prev, blankStep("command")]));

  const removeStep = (id: string) =>
    setSteps((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));

  const moveStep = (index: number, dir: -1 | 1) =>
    setSteps((prev) => {
      const next = [...prev];
      const target = index + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  /**
   * Selecting a device picks a sensible default command in the same update, so
   * the form is never briefly showing a device with no command selected.
   */
  const setStepDevice = (step: Step, deviceId: string) => {
    const fields = commandFieldsFor(deviceById.get(deviceId), labelFor);
    const first = fields[0];
    patchStep(step.id, {
      deviceId,
      cmdFieldKey: first?.key ?? "",
      boolValue: first?.kind === "bool" ? true : step.boolValue,
      numValue: first?.kind === "number" ? first.min ?? 0 : step.numValue,
      selectValue: first?.kind === "select" ? first.choices?.[0]?.value ?? "" : step.selectValue,
    });
  };

  // ---- live preview ----
  const previewTrigger = useMemo((): AutomationTrigger | null => {
    if (triggerType === "time") {
      return { type: "time", at, days: days.length === 7 ? undefined : days };
    }
    if (triggerType === "event") {
      if (!triggerDeviceId) return null;
      return {
        type: "event",
        deviceId: triggerDeviceId,
        eventType: eventType.trim() || undefined,
        match: Object.keys(parsedMatch).length ? parsedMatch : undefined,
      };
    }
    if (!triggerDeviceId || !triggerField) return null;
    const base: AutomationTrigger = {
      type: "state",
      deviceId: triggerDeviceId,
      field: triggerField,
      op: effectiveOp,
    };
    if (needsValue && triggerValue !== "") base.value = parseValue(triggerValue, fieldKind);
    return base;
  }, [
    triggerType, at, days, triggerDeviceId, triggerField, effectiveOp, triggerValue,
    needsValue, fieldKind, eventType, parsedMatch,
  ]);

  const previewActions = useMemo(
    () =>
      steps
        .map((s) => actionFromStep(s, commandFieldsFor(deviceById.get(s.deviceId), labelFor), deviceById.get(s.deviceId)?.type ?? ""))
        .filter((a): a is AutomationAction => a !== null),
    [steps, deviceById, labelFor],
  );

  // ---- validation & submit ----
  const validate = (): string | null => {
    if (!name.trim()) return "Please enter a rule name.";

    if (triggerType === "state") {
      if (!triggerDeviceId) return "Select a trigger device.";
      if (!triggerField.trim()) return "Enter or pick a trigger field.";
    }
    if (triggerType === "time") {
      if (!/^\d{2}:\d{2}$/.test(at)) return "Enter a valid time as HH:MM.";
      if (days.length === 0) return "Select at least one day — a rule with no days would never run.";
    }
    if (triggerType === "event" && !triggerDeviceId) {
      return "Select the device whose events should trigger this rule.";
    }

    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const where = steps.length > 1 ? `Step ${i + 1}: ` : "";
      if (s.type === "notify" && !s.title.trim()) return `${where}enter a notification title.`;
      if (s.type === "tts") {
        if (!s.deviceId) return `${where}select the device that should speak.`;
        if (!s.text.trim()) return `${where}enter what should be said.`;
      }
      if (s.type === "command") {
        if (!s.deviceId) return `${where}select a target device for the command.`;
        const fields = commandFieldsFor(deviceById.get(s.deviceId), labelFor);
        if (!fields.find((f) => f.key === s.cmdFieldKey)) return `${where}select a command.`;
      }
      if (s.delayMs < 0 || s.delayMs > MAX_DELAY_MS) {
        return `${where}the wait must be between 0 and ${MAX_DELAY_MS / 1000} seconds.`;
      }
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);

    const trigger: AutomationTrigger =
      triggerType === "time"
        ? // Seven days is the same as no filter; store the shorter form. The day
          // list used to be dropped here, so a weekdays-only rule silently
          // became a daily one the first time it was edited.
          { type: "time", at, ...(days.length === 7 ? {} : { days }) }
        : triggerType === "event"
          ? {
              type: "event",
              deviceId: triggerDeviceId,
              ...(eventType.trim() ? { eventType: eventType.trim() } : {}),
              ...(Object.keys(parsedMatch).length ? { match: parsedMatch } : {}),
            }
          : {
              type: "state",
              deviceId: triggerDeviceId,
              field: triggerField.trim(),
              op: effectiveOp,
              ...(needsValue && triggerValue !== ""
                ? { value: parseValue(triggerValue, fieldKind) }
                : {}),
            };

    const built = steps
      .map((s) => actionFromStep(s, commandFieldsFor(deviceById.get(s.deviceId), labelFor), deviceById.get(s.deviceId)?.type ?? ""))
      .filter((a): a is AutomationAction => a !== null);

    if (built.length === 0) {
      setValidationError("Add at least one complete action.");
      return;
    }

    // Keep a single action stored as an object rather than a one-element array,
    // so rules authored before sequences existed round-trip unchanged.
    const action = built.length === 1 ? built[0] : built;
    const body: AutomationBody = { name: name.trim(), enabled, trigger, action };

    setBusy(true);
    const r = rule
      ? await controlPlane.updateAutomation(rule.id, body)
      : await controlPlane.createAutomation(body);
    setBusy(false);

    if (r.ok) {
      toast.ok(rule ? "Rule updated" : "Rule created");
      onSaved();
    } else {
      toast.err(
        rule ? "Could not update rule" : "Could not create rule",
        r.status === 0 ? "Network error" : `Server error ${r.status}`,
      );
    }
  };

  /* ---------------------------------------------------------------- */
  /* Render                                                            */
  /* ---------------------------------------------------------------- */

  const deviceOptions = devices.map((d) => ({ value: d.id, label: d.name || d.id }));

  return (
    <Modal
      open
      onClose={onClose}
      title={rule ? "Edit rule" : "New automation rule"}
      subtitle="One trigger, then one or more actions in order."
      width="lg"
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" type="submit" busy={busy} onClick={handleSubmit as never}>
            {rule ? "Save changes" : "Create rule"}
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* ---- Name & enabled ---- */}
        <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
          <Field label="Rule name">
            <TextInput value={name} onChange={setName} placeholder="Low tank alert" />
          </Field>
          <div className="pb-px">
            <SwitchRow label="Enabled" checked={enabled} onChange={setEnabled} />
          </div>
        </div>

        {/* ---- Trigger section ---- */}
        <Section title="Trigger — when should this rule fire?">
          <Field label="Trigger type">
            <SelectInput<TriggerType>
              value={triggerType}
              onChange={setTriggerType}
              options={[
                { value: "state", label: "Device state change" },
                { value: "time", label: "Time of day" },
                { value: "event", label: "Device event (access, RFID, doorbell)" },
              ]}
            />
          </Field>

          {triggerType === "state" && (
            <div className="space-y-3">
              <Field label="Device">
                <SelectInput
                  value={triggerDeviceId}
                  onChange={(v) => {
                    setTriggerDeviceId(v);
                    setTriggerField("");
                  }}
                  options={[{ value: "", label: "Select a device…" }, ...deviceOptions]}
                />
              </Field>

              {allTriggerFields.length > 0 ? (
                <Field label="State field" hint="Fields observed in this device's live state">
                  <SelectInput
                    value={triggerField}
                    onChange={setTriggerField}
                    options={[
                      { value: "", label: "Select a field…" },
                      ...allTriggerFields.map((f) => ({
                        value: f,
                        label: `${f}${numericFields.includes(f) ? " (telemetry)" : ""}`,
                      })),
                    ]}
                  />
                </Field>
              ) : (
                triggerDeviceId && (
                  <Field label="State field" hint="Type the field name directly">
                    <TextInput
                      value={triggerField}
                      onChange={setTriggerField}
                      placeholder="e.g. level, power, motion"
                    />
                  </Field>
                )
              )}

              {triggerField && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Condition">
                    <SelectInput<NonNullable<AutomationTrigger["op"]>>
                      value={effectiveOp}
                      onChange={setTriggerOp}
                      options={operators as { value: NonNullable<AutomationTrigger["op"]>; label: string }[]}
                    />
                  </Field>
                  {needsValue && (
                    <Field label="Value">
                      {fieldKind === "number" ? (
                        <NumberInput
                          value={Number(triggerValue) || 0}
                          onChange={(n) => setTriggerValue(String(n))}
                        />
                      ) : fieldKind === "boolean" ? (
                        <SelectInput
                          value={triggerValue || "true"}
                          onChange={setTriggerValue}
                          options={[
                            { value: "true", label: "true" },
                            { value: "false", label: "false" },
                          ]}
                        />
                      ) : (
                        <TextInput value={triggerValue} onChange={setTriggerValue} placeholder="value" />
                      )}
                    </Field>
                  )}
                </div>
              )}

              {triggerDevice && triggerField && (
                <div
                  className="rounded-xl px-3 py-2.5 text-xs"
                  style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)" }}
                >
                  <span className="font-semibold" style={{ color: "var(--cv-text)" }}>
                    Current value:{" "}
                  </span>
                  {triggerDevice.state[triggerField] !== undefined
                    ? String(triggerDevice.state[triggerField])
                    : "field not yet in state"}
                </div>
              )}
            </div>
          )}

          {triggerType === "time" && (
            <>
              <Field
                label="Fire at"
                hint={istOffsetNote() || "India Standard Time (IST) — the control plane's clock."}
              >
                <TextInput type="time" value={at} onChange={setAt} />
              </Field>
              <Field label="Days" hint={daysText(days)}>
                <div className="flex flex-wrap gap-1.5">
                  {WEEK_ORDER.map((d) => {
                    const active = days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() =>
                          setDays((prev) =>
                            prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort()
                          )
                        }
                        aria-pressed={active}
                        className="h-9 w-11 rounded-lg text-xs font-bold transition"
                        style={{
                          background: active
                            ? "color-mix(in srgb, var(--cv-accent) 25%, transparent)"
                            : "var(--cv-card-hi)",
                          color: active ? "var(--cv-accent-hi)" : "var(--cv-muted)",
                          border: `1px solid ${active ? "var(--cv-accent)" : "var(--cv-border)"}`,
                        }}
                      >
                        {WEEKDAY_LABELS[d]}
                      </button>
                    );
                  })}
                </div>
              </Field>
            </>
          )}

          {triggerType === "event" && (
            <div className="space-y-3">
              <Field label="Device">
                <SelectInput
                  value={triggerDeviceId}
                  onChange={setTriggerDeviceId}
                  options={[{ value: "", label: "Select a device…" }, ...deviceOptions]}
                />
              </Field>
              <Field
                label="Event type"
                hint="The event's type field — e.g. access, rfid, bell. Leave blank to match any event."
              >
                <TextInput value={eventType} onChange={setEventType} placeholder="access" />
              </Field>
              <Field
                label="Only when (optional)"
                hint="Comma-separated key=value pairs that must all match, e.g. granted=true, name=Hema"
              >
                <TextInput value={matchText} onChange={setMatchText} placeholder="granted=true" />
              </Field>
            </div>
          )}
        </Section>

        {/* ---- Action steps ---- */}
        <Section
          title={steps.length > 1 ? `Actions — ${steps.length} steps, in order` : "Action — what should happen?"}
        >
          <div className="space-y-3">
            {steps.map((step, i) => (
              <StepCard
                key={step.id}
                step={step}
                index={i}
                total={steps.length}
                deviceOptions={deviceOptions}
                fields={commandFieldsFor(deviceById.get(step.deviceId), labelFor)}
                onPatch={(patch) => patchStep(step.id, patch)}
                onDevice={(id) => setStepDevice(step, id)}
                onRemove={() => removeStep(step.id)}
                onMove={(dir) => moveStep(i, dir)}
              />
            ))}
          </div>

          {steps.length < MAX_STEPS && (
            <button
              type="button"
              onClick={addStep}
              className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl text-sm font-semibold transition"
              style={{
                background: "var(--cv-card-hi)",
                border: "1px dashed var(--cv-border)",
                color: "var(--cv-accent-hi)",
              }}
            >
              <Plus className="h-4 w-4" /> Add another step
            </button>
          )}
        </Section>

        {/* ---- Live preview ---- */}
        {(previewTrigger || previewActions.length > 0) && (
          <Section title="Plain-English preview">
            <div
              className="space-y-2 rounded-xl px-4 py-3"
              style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)" }}
            >
              {previewTrigger && (
                <div className="flex gap-2 text-sm">
                  <span style={{ color: "var(--cv-muted)" }}>When:</span>
                  <span style={{ color: "var(--cv-text)" }}>
                    {triggerText(previewTrigger, deviceName)}
                  </span>
                </div>
              )}
              {previewActions.map((a, i) => (
                <div key={i} className="flex gap-2 text-sm">
                  <span style={{ color: "var(--cv-muted)" }}>{i === 0 ? "Then:" : "And:"}</span>
                  <span style={{ color: "var(--cv-text)" }}>{actionText(a, deviceName)}</span>
                </div>
              ))}
              {previewTrigger && previewActions.length > 0 && (
                <div
                  className="mt-2 border-t pt-2 text-xs"
                  style={{ borderColor: "var(--cv-border)", color: "var(--cv-muted)" }}
                >
                  <Info className="mr-1.5 inline h-3 w-3" style={{ color: "var(--cv-accent-hi)" }} />
                  {previewTrigger.type === "state"
                    ? "This rule fires each time the condition changes from not matching to matching — not on every poll cycle."
                    : "Steps run in order, and each waits for the one before it."}
                </div>
              )}
            </div>
          </Section>
        )}

        {/* ---- Validation error ---- */}
        {validationError && (
          <div
            className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm"
            style={{ background: "rgba(220,38,38,0.12)", color: "#dc2626" }}
          >
            <AlertCircle className="h-4 w-4 shrink-0" />
            {validationError}
          </div>
        )}
      </form>
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* One step of the sequence                                            */
/* ------------------------------------------------------------------ */

function StepCard({
  step,
  index,
  total,
  deviceOptions,
  fields,
  onPatch,
  onDevice,
  onRemove,
  onMove,
}: {
  step: Step;
  index: number;
  total: number;
  deviceOptions: { value: string; label: string }[];
  fields: CommandField[];
  onPatch: (patch: Partial<Step>) => void;
  onDevice: (deviceId: string) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const selected = fields.find((f) => f.key === step.cmdFieldKey);
  const multi = total > 1;

  return (
    <div
      className={multi ? "space-y-3 rounded-xl p-3" : "space-y-3"}
      style={
        multi
          ? { background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)" }
          : undefined
      }
    >
      {multi && (
        <div className="flex items-center gap-2">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold"
            style={{ background: "var(--cv-accent)", color: "#fff" }}
          >
            {index + 1}
          </span>
          <span className="flex-1 text-xs font-semibold" style={{ color: "var(--cv-muted)" }}>
            Step {index + 1} of {total}
          </span>
          <IconBtn label="Move step up" disabled={index === 0} onClick={() => onMove(-1)}>
            <ArrowUp className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn label="Move step down" disabled={index === total - 1} onClick={() => onMove(1)}>
            <ArrowDown className="h-3.5 w-3.5" />
          </IconBtn>
          <IconBtn label="Remove step" onClick={onRemove} danger>
            <Trash2 className="h-3.5 w-3.5" />
          </IconBtn>
        </div>
      )}

      {multi && (
        <Field
          label="Wait before this step (seconds)"
          hint={step.delayMs > 0 ? `${step.delayMs / 1000}s pause` : "Runs immediately"}
        >
          <NumberInput
            value={step.delayMs / 1000}
            onChange={(n) =>
              onPatch({
                delayMs: Math.round(Math.min(Math.max(n, 0), MAX_DELAY_MS / 1000) * 1000),
              })
            }
            min={0}
            max={MAX_DELAY_MS / 1000}
            step={1}
          />
        </Field>
      )}

      <Field label="Action type">
        <SelectInput<ActionType>
          value={step.type}
          onChange={(v) => onPatch({ type: v })}
          options={[
            { value: "notify", label: "Send a browser notification" },
            { value: "command", label: "Send a command to a device" },
            { value: "tts", label: "Speak on a device" },
          ]}
        />
      </Field>

      {step.type === "notify" && (
        <div className="space-y-3">
          <Field label="Title">
            <TextInput
              value={step.title}
              onChange={(v) => onPatch({ title: v })}
              placeholder="Low tank level"
            />
          </Field>
          <Field label="Message (optional)">
            <TextInput
              value={step.body}
              onChange={(v) => onPatch({ body: v })}
              placeholder="Tank dropped below 20 %."
            />
          </Field>
        </div>
      )}

      {step.type === "tts" && (
        <div className="space-y-3">
          <Field label="Speaker device">
            <SelectInput
              value={step.deviceId}
              onChange={(v) => onPatch({ deviceId: v })}
              options={[{ value: "", label: "Select a device…" }, ...deviceOptions]}
            />
          </Field>
          <Field
            label="What to say"
            hint="Writing {name} inserts who triggered the event, when the device knows."
          >
            <TextInput
              value={step.text}
              onChange={(v) => onPatch({ text: v })}
              placeholder="Welcome home, {name}"
            />
          </Field>
        </div>
      )}

      {step.type === "command" && (
        <div className="space-y-3">
          <Field label="Target device">
            <SelectInput
              value={step.deviceId}
              onChange={onDevice}
              options={[{ value: "", label: "Select a device…" }, ...deviceOptions]}
            />
          </Field>

          {step.deviceId && fields.length > 0 && (
            <>
              <Field label="Command">
                <SelectInput
                  value={step.cmdFieldKey}
                  onChange={(v) => onPatch({ cmdFieldKey: v })}
                  options={fields.map((f) => ({ value: f.key, label: f.label }))}
                />
              </Field>

              {selected?.kind === "bool" && (
                <Field label="Value">
                  <SelectInput
                    value={step.boolValue ? "true" : "false"}
                    onChange={(v) => onPatch({ boolValue: v === "true" })}
                    options={[
                      { value: "true", label: "On / true" },
                      { value: "false", label: "Off / false" },
                    ]}
                  />
                </Field>
              )}

              {selected?.kind === "number" && (
                <Field label={`Value${selected.unit ? ` (${selected.unit})` : ""}`}>
                  <NumberInput
                    value={step.numValue}
                    onChange={(n) => onPatch({ numValue: n })}
                    min={selected.min}
                    max={selected.max}
                    step={selected.step ?? 1}
                  />
                </Field>
              )}

              {selected?.kind === "select" && selected.choices && (
                <Field label="Value">
                  <SelectInput
                    value={step.selectValue}
                    onChange={(v) => onPatch({ selectValue: v })}
                    options={selected.choices}
                  />
                </Field>
              )}
            </>
          )}

          {step.deviceId && fields.length === 0 && (
            <div className="text-xs" style={{ color: "var(--cv-muted)" }}>
              This device type exposes no commands the rule builder can set.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  disabled,
  danger,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex h-8 w-8 items-center justify-center rounded-lg transition disabled:opacity-35"
      style={{
        background: "var(--cv-input-bg)",
        border: "1px solid var(--cv-border)",
        color: danger ? "#dc2626" : "var(--cv-muted)",
      }}
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Small layout helper                                                 */
/* ------------------------------------------------------------------ */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="space-y-3 rounded-2xl p-4"
      style={{ background: "var(--cv-input-bg)", border: "1px solid var(--cv-border)" }}
    >
      <div
        className="text-[11px] font-bold uppercase tracking-wider"
        style={{ color: "var(--cv-accent-hi)" }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
