import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, type Automation, type Device } from "../../../api";
import { Screen, useTheme, ToastHost, useToast } from "../../../ui";
import { ActionButton, Callout, CodeBlock, ScreenHeader, SelectField, Stepper, TextField, ToggleField } from "../../../enterprise-ui";
import { CommandComposer } from "./commandComposer";
import { humanizeBody } from "./humanize";
import { BoolSelector, collectFieldInfo, DevicePicker, ErrorSummary, FieldPicker, ScreenScaffold, SectionCard } from "./parts";
import { OPS, cloneAutomation, deviceById, emptyDraft, inferValue, isValidTime, safeJson, stringifyValue, toAutomationBody, type AutomationOp, type FieldErrors, type FieldInfo, type RuleDraft } from "./types";
import { useRules } from "./useRules";

function errorText(e: unknown): string { return e instanceof Error ? e.message : "Unable to save automation."; }

function validate(draft: RuleDraft, devices: Device[], selectedField?: FieldInfo): FieldErrors {
  const e: FieldErrors = {};
  if (!draft.name.trim()) e.name = "Name is required.";
  if (draft.trigger.type === "time") {
    if (!isValidTime(draft.trigger.at)) e.at = "Use a valid 24-hour time.";
  } else {
    const dev = deviceById(devices, draft.trigger.deviceId);
    if (!draft.trigger.deviceId || !dev) e.triggerDevice = "Choose an existing trigger device.";
    if (!draft.trigger.field) e.field = "Choose a field observed on that device.";
    if (!draft.trigger.op || !OPS.includes(draft.trigger.op as AutomationOp)) e.op = "Choose a supported operator.";
    if (draft.trigger.op !== "truthy" && draft.trigger.op !== "falsy") {
      if (draft.trigger.value === undefined || draft.trigger.value === "") e.value = "Value is required for this operator.";
      const sample = selectedField?.sample;
      if (typeof sample === "number" && typeof draft.trigger.value !== "number") e.value = "Enter a numeric value for this numeric field.";
      if (typeof sample === "boolean" && typeof draft.trigger.value !== "boolean") e.value = "Choose true or false for this boolean field.";
    }
  }
  if (draft.action.type === "notify") {
    if (!draft.action.title?.trim()) e.title = "Notification title is required.";
    if (!draft.action.body?.trim()) e.body = "Notification body is required.";
  } else {
    if (!draft.action.deviceId || !deviceById(devices, draft.action.deviceId)) e.actionDevice = "Choose an existing action device.";
    if (!draft.action.command || !Object.keys(draft.action.command).length) e.command = "Command JSON must contain at least one key.";
  }
  return e;
}

export default function RuleBuilder({ onBack, initial }: { onBack: () => void; initial?: Automation }) {
  const { c } = useTheme();
  const toast = useToast();
  const { automations, devices, loading, error, reload, saveRule } = useRules();
  const [draft, setDraft] = useState<RuleDraft>(() => initial ? cloneAutomation(initial) : emptyDraft());
  const [telemetry, setTelemetry] = useState<Record<string, { ts: string; payload: Record<string, unknown> }[]>>({});
  const [busy, setBusy] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  useEffect(() => { if (initial) setDraft(cloneAutomation(initial)); }, [initial]);
  const triggerDevice = devices.find((d) => d.id === draft.trigger.deviceId);
  const fields = useMemo(() => collectFieldInfo(triggerDevice, telemetry[draft.trigger.deviceId || ""] || []), [triggerDevice, telemetry, draft.trigger.deviceId]);
  const selectedField = fields.find((f) => f.key === draft.trigger.field);
  const errors = validate(draft, devices, selectedField);
  const body = toAutomationBody(draft);

  useEffect(() => {
    const id = draft.trigger.type === "state" ? draft.trigger.deviceId : undefined;
    if (!id || telemetry[id]) return;
    api.telemetry(id, 100).then((r) => setTelemetry((prev) => ({ ...prev, [id]: r.ok ? r.data.telemetry : [] }))).catch(() => setTelemetry((prev) => ({ ...prev, [id]: [] })));
  }, [draft.trigger.deviceId, draft.trigger.type, telemetry]);

  const save = async () => {
    const v = validate(draft, devices, selectedField);
    if (Object.values(v).some(Boolean)) { setApiError("Fix the highlighted fields before saving."); return; }
    setBusy(true); setApiError(null);
    try { await saveRule(draft); toast.show("Automation saved"); if (!initial) setDraft(emptyDraft()); }
    catch (e) { setApiError(errorText(e)); }
    finally { setBusy(false); }
  };

  return (
    <Screen>
      <ScreenHeader title="Rule Builder" subtitle="One real server trigger, one real server action" onBack={onBack} actions={[{ icon: "refresh", label: "Reload", onPress: reload }]} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <ScreenScaffold loading={loading} error={error} onRetry={reload}>
          <Callout kind="info" title="Honest automation contract" text="The server evaluates one trigger and one action per rule. To run several device commands from one idea, create sibling rules or use Scene Composer for the platform's supported multi-action primitive." icon="rules" action={{ label: "Open scenes from the Automation menu", onPress: () => toast.show("Scene Composer is registered as its own Automation screen") }} />
          <SectionCard title="Basics" icon="edit">
            <TextField label="Rule name" value={draft.name} onChange={(name) => setDraft({ ...draft, name })} placeholder="High temperature alert" error={errors.name} />
            <ToggleField label="Enabled" help="Disabled rules remain saved but do not execute." value={draft.enabled} onChange={(enabled) => setDraft({ ...draft, enabled })} icon="power" />
          </SectionCard>
          <SectionCard title="Step 1 · Trigger" icon="trigger">
            <SelectField label="Trigger type" value={draft.trigger.type} options={[{ value: "state", label: "Device state", icon: "sensors" }, { value: "time", label: "Time", icon: "clock" }]} onChange={(type) => setDraft({ ...draft, trigger: type === "time" ? { type, at: "07:30" } : { type } })} />
            {draft.trigger.type === "time" ? <TimeEditor at={draft.trigger.at || "07:30"} onChange={(at) => setDraft({ ...draft, trigger: { type: "time", at } })} error={errors.at} /> : (
              <>
                <DevicePicker label="Trigger device" devices={devices} value={draft.trigger.deviceId} error={errors.triggerDevice} onChange={(deviceId) => setDraft({ ...draft, trigger: { type: "state", deviceId } })} />
                <FieldPicker fields={fields} value={draft.trigger.field} error={errors.field} onChange={(f) => setDraft({ ...draft, trigger: { ...draft.trigger, field: f.key, value: f.sample == null ? undefined : typeof f.sample === "boolean" ? f.sample : typeof f.sample === "number" ? f.sample : String(f.sample) } })} />
                <SelectField label="Operator" value={draft.trigger.op || "=="} options={OPS.map((op) => ({ value: op, label: op, icon: op === "truthy" || op === "falsy" ? "condition" : "tune" }))} onChange={(op) => setDraft({ ...draft, trigger: { ...draft.trigger, op, ...(op === "truthy" || op === "falsy" ? { value: undefined } : {}) } })} />
                {errors.op ? <Text style={{ color: c.red, fontSize: 12 }}>{errors.op}</Text> : null}
                {draft.trigger.op !== "truthy" && draft.trigger.op !== "falsy" && <ValueEditor sample={selectedField?.sample} value={draft.trigger.value} onChange={(value) => setDraft({ ...draft, trigger: { ...draft.trigger, value } })} error={errors.value} />}
              </>
            )}
          </SectionCard>
          <SectionCard title="Step 2 · Action" icon="action">
            <SelectField label="Action type" value={draft.action.type} options={[{ value: "command", label: "Device command", icon: "send" }, { value: "notify", label: "Notify", icon: "bell" }]} onChange={(type) => setDraft({ ...draft, action: type === "notify" ? { type, title: "", body: "" } : { type, command: {} } })} />
            {draft.action.type === "notify" ? <NotifyEditor title={draft.action.title || ""} bodyText={draft.action.body || ""} errors={errors} onChange={(patch) => setDraft({ ...draft, action: { ...draft.action, ...patch, type: "notify" } })} /> : <CommandComposer devices={devices} deviceId={draft.action.deviceId} command={draft.action.command} onDevice={(deviceId) => setDraft({ ...draft, action: { ...draft.action, type: "command", deviceId } })} onCommand={(command) => setDraft({ ...draft, action: { ...draft.action, type: "command", command } })} errors={{ deviceId: errors.actionDevice, command: errors.command }} />}
          </SectionCard>
          <SectionCard title="Live preview" icon="eye">
            <Text style={{ color: c.text, fontSize: 15, lineHeight: 21, marginBottom: 12 }}>{humanizeBody(body, devices)}</Text>
            <CodeBlock label="POST body" text={safeJson(body)} />
          </SectionCard>
          <ErrorSummary errors={errors} />
          {apiError && <Callout kind="critical" text={apiError} icon="alert" />}
          <ActionButton label={draft.id ? "Save rule" : "Create rule"} icon="save" onPress={save} busy={busy} disabled={busy} />
          {!!automations.length && <Text style={{ color: c.faint, fontSize: 12, marginTop: 12 }}>{automations.length} existing server rules loaded for validation context.</Text>}
        </ScreenScaffold>
      </ScrollView>
      <ToastHost toast={toast.toast} onHide={toast.hide} />
    </Screen>
  );
}

function TimeEditor({ at, onChange, error }: { at: string; onChange: (v: string) => void; error?: string }) {
  const [h, m] = at.split(":").map((x) => Number(x));
  const hour = Number.isFinite(h) ? h : 7;
  const min = Number.isFinite(m) ? m : 30;
  return <View><Stepper label="Hour" value={hour} min={0} max={23} step={1} unit="h" onChange={(v) => onChange(`${String(v).padStart(2, "0")}:${String(min).padStart(2, "0")}`)} /><Stepper label="Minute" value={min} min={0} max={59} step={5} unit="m" onChange={(v) => onChange(`${String(hour).padStart(2, "0")}:${String(v).padStart(2, "0")}`)} />{error ? <TextField label="Time error" value={error} onChange={() => {}} editable={false} /> : null}</View>;
}

function ValueEditor({ sample, value, onChange, error }: { sample?: unknown; value: unknown; onChange: (v: number | string | boolean) => void; error?: string }) {
  if (typeof sample === "boolean") return <BoolSelector label="Value" value={typeof value === "boolean" ? value : false} onChange={onChange} />;
  return <TextField label="Value" value={stringifyValue(value)} onChange={(raw) => onChange(inferValue(raw, sample))} keyboardType={typeof sample === "number" ? "numeric" : "default"} error={error} />;
}

function NotifyEditor({ title, bodyText, onChange, errors }: { title: string; bodyText: string; onChange: (patch: { title?: string; body?: string }) => void; errors: FieldErrors }) {
  return <View><TextField label="Notification title" value={title} onChange={(v) => onChange({ title: v })} error={errors.title} /><TextField label="Notification body" value={bodyText} onChange={(v) => onChange({ body: v })} multiline error={errors.body} /><CodeBlock label="Notification preview" text={`${title || "Notification"}\n${bodyText || "No body"}`} maxHeight={120} /></View>;
}
