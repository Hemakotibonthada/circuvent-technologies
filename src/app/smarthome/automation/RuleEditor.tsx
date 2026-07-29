"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Info } from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import type { Automation, AutomationBody, AutomationTrigger, AutomationAction } from "@/lib/control-plane";
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
} from "./describe";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type TriggerType = "state" | "time";
type ActionType = "command" | "notify";

interface Props {
  rule: Automation | null;
  onClose: () => void;
  onSaved: () => void;
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function parseValue(raw: string, kind: "boolean" | "number" | "string"): number | boolean | string {
  if (kind === "boolean") return raw === "true";
  if (kind === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  return raw;
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

  // ---- action ----
  const [actionType, setActionType] = useState<ActionType>(rule?.action.type ?? "notify");
  const [actionDeviceId, setActionDeviceId] = useState(rule?.action.deviceId ?? "");
  const [cmdFieldKey, setCmdFieldKey] = useState<string>(() => {
    if (!rule?.action.command) return "";
    const cmd = rule.action.command as Record<string, unknown>;
    if (cmd.action) return "action"; // rfid-gate style
    const k = Object.keys(cmd).filter((k) => k !== "action")[0];
    return k ?? "";
  });
  const [cmdBoolValue, setCmdBoolValue] = useState<boolean>(() => {
    if (!rule?.action.command) return true;
    const cmd = rule.action.command as Record<string, unknown>;
    const k = Object.keys(cmd)[0];
    return k ? Boolean(cmd[k]) : true;
  });
  const [cmdNumValue, setCmdNumValue] = useState<number>(() => {
    if (!rule?.action.command) return 0;
    const cmd = rule.action.command as Record<string, unknown>;
    const k = Object.keys(cmd).filter((k) => k !== "action")[0];
    return k && typeof cmd[k] === "number" ? (cmd[k] as number) : 0;
  });
  const [cmdSelectValue, setCmdSelectValue] = useState<string>(() => {
    if (!rule?.action.command) return "";
    const cmd = rule.action.command as Record<string, unknown>;
    if (typeof cmd.action === "string") return cmd.action;
    const k = Object.keys(cmd).filter((k) => k !== "action")[0];
    return k && typeof cmd[k] === "string" ? (cmd[k] as string) : "";
  });
  const [notifyTitle, setNotifyTitle] = useState(rule?.action.title ?? "");
  const [notifyBody, setNotifyBody] = useState(rule?.action.body ?? "");

  const [busy, setBusy] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // ---- derived state ----
  const triggerDevice = triggerDeviceId ? deviceById.get(triggerDeviceId) : undefined;
  const actionDevice = actionDeviceId ? deviceById.get(actionDeviceId) : undefined;

  // Real state fields from the selected trigger device
  const stateFields = useMemo(
    () => Object.keys(triggerDevice?.state ?? {}).sort(),
    [triggerDevice],
  );

  // Telemetry-based numeric fields — only triggered when a device is selected
  const { numericFields } = useTelemetry(triggerDeviceId || null, 50);

  // All available trigger fields (state + telemetry, deduplicated, sorted)
  const allTriggerFields = useMemo(() => {
    const combined = new Set([...stateFields, ...numericFields]);
    return Array.from(combined).sort();
  }, [stateFields, numericFields]);

  // Infer field type from current state value, falling back to "string"
  const fieldKind = useMemo(() => {
    if (!triggerField || !triggerDevice) return "string" as const;
    const val = triggerDevice.state[triggerField];
    if (val === undefined) {
      // If it's a numeric telemetry field, treat as number
      return numericFields.includes(triggerField) ? "number" : "string";
    }
    return inferFieldKind(val);
  }, [triggerField, triggerDevice, numericFields]);

  const operators = useMemo(() => operatorsFor(fieldKind), [fieldKind]);
  const needsValue = triggerOp !== "truthy" && triggerOp !== "falsy";

  // Reset operator when field kind changes to avoid invalid combinations
  useEffect(() => {
    const validOps = operators.map((o) => o.value);
    if (!validOps.includes(triggerOp)) {
      setTriggerOp(validOps[0] as NonNullable<AutomationTrigger["op"]>);
    }
  }, [operators, triggerOp]);

  // Command fields for the selected action device.
  // Relay channels are relabelled with the name the user gave that switch —
  // "Geyser" rather than "Channel 2" — so the rule builder speaks the same
  // language as the device page and the switch timers.
  const cmdFields = useMemo(
    () =>
      actionDevice
        ? getCommandFields(actionDevice.type).map((f) =>
            f.kind === "bool" ? { ...f, label: labelFor(actionDevice.id, f.key, f.label) } : f
          )
        : [],
    [actionDevice, labelFor],
  );

  // When the action device changes, pick the first available command field
  useEffect(() => {
    if (cmdFields.length > 0 && !cmdFields.find((f) => f.key === cmdFieldKey)) {
      const first = cmdFields[0];
      setCmdFieldKey(first.key);
      if (first.kind === "bool") setCmdBoolValue(true);
      if (first.kind === "number") setCmdNumValue(first.min ?? 0);
      if (first.kind === "select" && first.choices?.length)
        setCmdSelectValue(first.choices[0].value);
    }
  }, [cmdFields, cmdFieldKey]);

  const selectedCmdField = cmdFields.find((f) => f.key === cmdFieldKey);

  const deviceName = (id?: string) =>
    id ? (deviceById.get(id)?.name ?? id) : "any device";

  // ---- live preview ----
  const previewTrigger = useMemo((): AutomationTrigger | null => {
    if (triggerType === "time") {
      // Seven days selected is the same as no filter; store the shorter form.
      return { type: "time", at, days: days.length === 7 ? undefined : days };
    }
    if (!triggerDeviceId || !triggerField) return null;
    const base: AutomationTrigger = {
      type: "state",
      deviceId: triggerDeviceId,
      field: triggerField,
      op: triggerOp,
    };
    if (needsValue && triggerValue !== "") {
      base.value = parseValue(triggerValue, fieldKind);
    }
    return base;
  }, [triggerType, at, days, triggerDeviceId, triggerField, triggerOp, triggerValue, needsValue, fieldKind]);

  const previewAction = useMemo((): AutomationAction | null => {
    if (actionType === "notify") {
      if (!notifyTitle.trim()) return null;
      return { type: "notify", title: notifyTitle.trim(), body: notifyBody.trim() || undefined };
    }
    if (!actionDeviceId || !selectedCmdField) return null;
    let value: boolean | number | string;
    if (selectedCmdField.kind === "bool") value = cmdBoolValue;
    else if (selectedCmdField.kind === "number") value = cmdNumValue;
    else value = cmdSelectValue;
    return {
      type: "command",
      deviceId: actionDeviceId,
      command: buildCommand(selectedCmdField, value),
    };
  }, [
    actionType,
    notifyTitle,
    notifyBody,
    actionDeviceId,
    selectedCmdField,
    cmdBoolValue,
    cmdNumValue,
    cmdSelectValue,
  ]);

  // ---- validation & submit ----
  const validate = (): string | null => {
    if (!name.trim()) return "Please enter a rule name.";
    if (triggerType === "state") {
      if (!triggerDeviceId) return "Select a trigger device.";
      if (!triggerField.trim()) return "Enter or pick a trigger field.";
    }
    if (triggerType === "time" && !/^\d{2}:\d{2}$/.test(at)) {
      return "Enter a valid time as HH:MM.";
    }
    if (triggerType === "time" && days.length === 0) {
      return "Select at least one day — a rule with no days would never run.";
    }
    if (actionType === "notify" && !notifyTitle.trim()) {
      return "Enter a notification title.";
    }
    if (actionType === "command") {
      if (!actionDeviceId) return "Select a target device for the command.";
      if (!selectedCmdField) return "Select a command field.";
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
        ? { type: "time", at }
        : {
            type: "state",
            deviceId: triggerDeviceId,
            field: triggerField.trim(),
            op: triggerOp,
            ...(needsValue && triggerValue !== ""
              ? { value: parseValue(triggerValue, fieldKind) }
              : {}),
          };

    const action: AutomationAction =
      actionType === "notify"
        ? { type: "notify", title: notifyTitle.trim(), body: notifyBody.trim() || undefined }
        : (() => {
            let value: boolean | number | string;
            if (selectedCmdField!.kind === "bool") value = cmdBoolValue;
            else if (selectedCmdField!.kind === "number") value = cmdNumValue;
            else value = cmdSelectValue;
            return {
              type: "command" as const,
              deviceId: actionDeviceId,
              command: buildCommand(selectedCmdField!, value),
            };
          })();

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
      subtitle="A rule has exactly one trigger and one action."
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
            <TextInput
              value={name}
              onChange={setName}
              placeholder="Low tank alert"
            />
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
                { value: "time", label: "Time of day (daily)" },
              ]}
            />
          </Field>

          {triggerType === "state" ? (
            <div className="space-y-3">
              <Field label="Device">
                <SelectInput
                  value={triggerDeviceId}
                  onChange={(v) => {
                    setTriggerDeviceId(v);
                    setTriggerField(""); // reset field when device changes
                  }}
                  options={[
                    { value: "", label: "Select a device…" },
                    ...deviceOptions,
                  ]}
                />
              </Field>

              {allTriggerFields.length > 0 ? (
                <Field
                  label="State field"
                  hint="Fields observed in this device's live state"
                >
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
                      value={triggerOp}
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
                        <TextInput
                          value={triggerValue}
                          onChange={setTriggerValue}
                          placeholder="value"
                        />
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
          ) : (
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
        </Section>

        {/* ---- Action section ---- */}
        <Section title="Action — what should happen?">
          <Field label="Action type">
            <SelectInput<ActionType>
              value={actionType}
              onChange={setActionType}
              options={[
                { value: "notify", label: "Send a browser notification" },
                { value: "command", label: "Send a command to a device" },
              ]}
            />
          </Field>

          {actionType === "notify" ? (
            <div className="space-y-3">
              <Field label="Title" error={!notifyTitle.trim() ? null : null}>
                <TextInput value={notifyTitle} onChange={setNotifyTitle} placeholder="Low tank level" />
              </Field>
              <Field label="Message (optional)">
                <TextInput
                  value={notifyBody}
                  onChange={setNotifyBody}
                  placeholder="Tank dropped below 20 %."
                />
              </Field>
            </div>
          ) : (
            <div className="space-y-3">
              <Field label="Target device">
                <SelectInput
                  value={actionDeviceId}
                  onChange={setActionDeviceId}
                  options={[
                    { value: "", label: "Select a device…" },
                    ...deviceOptions,
                  ]}
                />
              </Field>

              {actionDevice && cmdFields.length > 0 && (
                <>
                  <Field label="Command">
                    <SelectInput
                      value={cmdFieldKey}
                      onChange={setCmdFieldKey}
                      options={cmdFields.map((f) => ({ value: f.key, label: f.label }))}
                    />
                  </Field>

                  {selectedCmdField?.kind === "bool" && (
                    <Field label="Value">
                      <SelectInput
                        value={cmdBoolValue ? "true" : "false"}
                        onChange={(v) => setCmdBoolValue(v === "true")}
                        options={[
                          { value: "true", label: "On / true" },
                          { value: "false", label: "Off / false" },
                        ]}
                      />
                    </Field>
                  )}

                  {selectedCmdField?.kind === "number" && (
                    <Field
                      label={`Value${selectedCmdField.unit ? ` (${selectedCmdField.unit})` : ""}`}
                    >
                      <NumberInput
                        value={cmdNumValue}
                        onChange={setCmdNumValue}
                        min={selectedCmdField.min}
                        max={selectedCmdField.max}
                        step={selectedCmdField.step ?? 1}
                      />
                    </Field>
                  )}

                  {selectedCmdField?.kind === "select" && selectedCmdField.choices && (
                    <Field label="Value">
                      <SelectInput
                        value={cmdSelectValue}
                        onChange={setCmdSelectValue}
                        options={selectedCmdField.choices}
                      />
                    </Field>
                  )}
                </>
              )}
            </div>
          )}
        </Section>

        {/* ---- Live preview ---- */}
        {(previewTrigger || previewAction) && (
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
              {previewAction && (
                <div className="flex gap-2 text-sm">
                  <span style={{ color: "var(--cv-muted)" }}>Then:</span>
                  <span style={{ color: "var(--cv-text)" }}>
                    {actionText(previewAction, deviceName)}
                  </span>
                </div>
              )}
              {previewTrigger && previewAction && (
                <div
                  className="mt-2 border-t pt-2 text-xs"
                  style={{ borderColor: "var(--cv-border)", color: "var(--cv-muted)" }}
                >
                  <Info
                    className="mr-1.5 inline h-3 w-3"
                    style={{ color: "var(--cv-accent-hi)" }}
                  />
                  This rule will fire every time the trigger condition changes from{" "}
                  <em>not matching</em> to <em>matching</em> — not on every poll cycle.
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
