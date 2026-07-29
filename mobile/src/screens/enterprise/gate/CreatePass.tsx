/**
 * Create a guest pass.
 *
 * The form drives a real `api.createGatePass` call with a body the server
 * accepts as-is. No local pass state is invented: on success we jump straight
 * to the newly-created pass (whose QR and code came from the server) so the
 * operator can hand it off.
 *
 * The one thing stored locally is a small set of operator preferences
 * (default validity, remembered labels, last-used gate) via `gateConfigStore`.
 * These are visually labelled as device-only preferences on the screen.
 */
import React, { useEffect, useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { formatDateTime } from "../../../enterprise";
import { ToastHost, useTheme, useToast } from "../../../ui";
import {
  ActionButton,
  Callout,
  MetricRow,
  SearchField,
  SelectField,
  Stepper,
  TabStrip,
  TextField,
} from "../../../enterprise-ui";
import type { GatePass } from "../../../api";
import { PassDetail } from "./PassDetail";
import {
  DeviceOnlyNote,
  GateDevicePicker,
  GateScaffold,
  HonestEmpty,
  Section,
} from "./parts";
import {
  DEFAULT_GATE_CONFIG,
  MAX_USES,
  MAX_VALIDITY_MINUTES,
  MIN_USES,
  MIN_VALIDITY_MINUTES,
  VALIDITY_PRESETS,
  clampMinutes,
  clampUses,
  humanShortDuration,
  isGateDevice,
} from "./types";
import { useGateData } from "./useGate";

interface Props {
  onBack: () => void;
  onCreated?: (pass: GatePass) => void;
}

/**
 * Validity input mode. Presets are what most operators want; custom minutes
 * covers the odd case where an exotic window is needed.
 */
type ValidityMode = "preset" | "minutes";

interface FormState {
  deviceId: string;
  label: string;
  minutes: number;
  uses: number;
  mode: ValidityMode;
  preset: number;
}

const INITIAL_FORM: FormState = {
  deviceId: "",
  label: "",
  minutes: DEFAULT_GATE_CONFIG.defaultMinutes,
  uses: DEFAULT_GATE_CONFIG.defaultUses,
  mode: "preset",
  preset: DEFAULT_GATE_CONFIG.defaultMinutes,
};

export function CreatePass({ onBack, onCreated }: Props) {
  const { c } = useTheme();
  const gate = useGateData();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [errorField, setErrorField] = useState<{ field: keyof FormState | "form"; message: string } | null>(null);
  const [created, setCreated] = useState<GatePass | null>(null);
  const { toast, show, hide } = useToast();

  // Once the config lands, seed defaults. Doing this in an effect (rather
  // than initial state) means the config load is not blocking initial paint.
  useEffect(() => {
    if (!gate.config) return;
    setForm((f) => ({
      ...f,
      deviceId: f.deviceId || gate.config.lastDeviceId || (gate.gateDevices[0]?.id ?? ""),
      minutes: f.minutes || gate.config.defaultMinutes,
      uses: f.uses || gate.config.defaultUses,
      preset: f.preset || gate.config.defaultMinutes,
    }));
  }, [gate.config, gate.gateDevices]);

  const minutes = form.mode === "preset" ? form.preset : form.minutes;
  const validUntil = useMemo(() => new Date(Date.now() + minutes * 60_000), [minutes]);

  const submit = async () => {
    setErrorField(null);
    if (!form.deviceId) {
      setErrorField({ field: "deviceId", message: "Pick a gate device to grant access to." });
      return;
    }
    if (!gate.devices.find((d) => d.id === form.deviceId && isGateDevice(d))) {
      setErrorField({ field: "deviceId", message: "The selected device is not a gate. Pick another." });
      return;
    }
    const label = form.label.trim();
    const clampedMinutes = clampMinutes(minutes);
    const clampedUses = clampUses(form.uses);

    setSubmitting(true);
    const res = await gate.createPass({
      deviceId: form.deviceId,
      label: label || "Guest",
      validToMinutes: clampedMinutes,
      maxUses: clampedUses,
    });
    setSubmitting(false);

    if (!res.ok || !res.pass) {
      setErrorField({ field: "form", message: res.message });
      show(res.message, "error");
      return;
    }

    // Persist as the operator's new defaults — labels get added to the
    // suggestion list, the device is remembered, and validity/uses become
    // the seed values next time.
    const suggestions = label && !gate.config.labelSuggestions.includes(label)
      ? [label, ...gate.config.labelSuggestions].slice(0, 12)
      : gate.config.labelSuggestions;
    await gate.saveConfig({
      ...gate.config,
      lastDeviceId: form.deviceId,
      defaultMinutes: clampedMinutes,
      defaultUses: clampedUses,
      labelSuggestions: suggestions,
    });

    setCreated(res.pass);
    onCreated?.(res.pass);
  };

  if (created) {
    return (
      <PassDetail
        pass={created}
        onBack={() => {
          setCreated(null);
          onBack();
        }}
        onRevoked={() => {
          show("Pass revoked", "success");
          setCreated(null);
          onBack();
        }}
      />
    );
  }

  if (gate.loading) {
    return (
      <GateScaffold title="New guest pass" subtitle="Loading account" onBack={onBack} loading>
        <View />
      </GateScaffold>
    );
  }

  if (gate.error && !gate.lastUpdated) {
    return (
      <GateScaffold title="New guest pass" onBack={onBack} error={gate.error} onRetry={gate.reload}>
        <View />
      </GateScaffold>
    );
  }

  const hasGates = gate.gateDevices.length > 0;

  return (
    <GateScaffold title="New guest pass" subtitle="Sends to /gate/passes" onBack={onBack}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
      >
        {errorField?.field === "form" ? (
          <Callout kind="critical" icon="alert" title="Could not create pass" text={errorField.message} />
        ) : null}

        {!hasGates ? (
          <HonestEmpty
            icon="gate"
            title="No gates to grant access to"
            subtitle="Your account has no gate, barrier or smart-lock devices. Provision one from the Fleet module and it will appear here."
          />
        ) : (
          <>
            <Section icon="gate" title="Which gate" subtitle="Only devices you own can receive commands">
              <GateDevicePicker
                devices={gate.gateDevices}
                value={form.deviceId}
                onChange={(id) => setForm((f) => ({ ...f, deviceId: id }))}
                disabled={submitting}
              />
              {errorField?.field === "deviceId" ? (
                <Text style={{ color: c.red, fontSize: 12, marginTop: 6 }}>{errorField.message}</Text>
              ) : null}
            </Section>

            <Section icon="visitor" title="Who is it for" subtitle="Shown in the notification when the pass is used">
              <TextField
                label="Label"
                value={form.label}
                onChange={(v) => setForm((f) => ({ ...f, label: v }))}
                placeholder="e.g. Cleaner"
                autoCapitalize="words"
                editable={!submitting}
                help="Up to 80 characters. Defaults to 'Guest' when left blank."
              />
              {gate.config.labelSuggestions.length ? (
                <>
                  <Text style={{ color: c.faint, fontSize: 11, fontWeight: "700", marginBottom: 6 }}>
                    RECENTLY USED LABELS (LOCAL)
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                    {gate.config.labelSuggestions.slice(0, 8).map((s) => (
                      <SelectSuggestion
                        key={s}
                        label={s}
                        active={s === form.label}
                        onPress={() => setForm((f) => ({ ...f, label: s }))}
                        disabled={submitting}
                      />
                    ))}
                  </View>
                  <DeviceOnlyNote text="Label suggestions are stored on this device only — never sent to the control plane." />
                </>
              ) : null}
            </Section>

            <Section icon="clock" title="Valid for how long" subtitle="Server rejects anything outside 5 minutes to 30 days">
              <TabStrip
                tabs={[
                  { value: "preset", label: "Preset" },
                  { value: "minutes", label: "Custom" },
                ]}
                value={form.mode}
                onChange={(v) => setForm((f) => ({ ...f, mode: v as ValidityMode }))}
              />

              {form.mode === "preset" ? (
                <SelectField<number>
                  label="Validity preset"
                  value={form.preset}
                  onChange={(v) => setForm((f) => ({ ...f, preset: v, minutes: v }))}
                  options={VALIDITY_PRESETS.map((p) => ({ value: p.minutes, label: p.label, icon: undefined }))}
                  help={validityHint(form.preset)}
                />
              ) : (
                <Stepper
                  label="Custom validity (minutes)"
                  value={form.minutes}
                  onChange={(v) => setForm((f) => ({ ...f, minutes: v }))}
                  min={MIN_VALIDITY_MINUTES}
                  max={MAX_VALIDITY_MINUTES}
                  step={5}
                  unit="min"
                  help={`Roughly ${humanShortDuration(form.minutes * 60)}`}
                />
              )}
            </Section>

            <Section icon="keyVariant" title="How many uses" subtitle="One-shot for a delivery; more for a family visit">
              <Stepper
                label="Maximum uses"
                value={form.uses}
                onChange={(v) => setForm((f) => ({ ...f, uses: v }))}
                min={MIN_USES}
                max={MAX_USES}
                step={1}
                help="Server enforces this atomically. A double-tap by a guest cannot spend more than the limit."
              />
            </Section>

            <Section icon="check" title="Confirm">
              <View style={[styles.summary, { backgroundColor: c.card, borderColor: c.border }]}>
                <MetricRow label="Gate" value={gate.gateDevices.find((d) => d.id === form.deviceId)?.name || form.deviceId || "—"} icon="gate" />
                <MetricRow label="Label" value={form.label.trim() || "Guest"} icon="visitor" />
                <MetricRow label="Valid until" value={formatDateTime(validUntil)} icon="clock" />
                <MetricRow label="Duration" value={humanShortDuration(minutes * 60)} icon="calendar" />
                <MetricRow label="Uses" value={String(clampUses(form.uses))} icon="keyVariant" last />
              </View>
              <ActionButton
                label={submitting ? "Creating…" : "Create pass"}
                icon="add"
                onPress={submit}
                busy={submitting}
                disabled={!form.deviceId || !hasGates}
              />
            </Section>
          </>
        )}
      </ScrollView>
      <ToastHost toast={toast} onHide={hide} />
    </GateScaffold>
  );
}

function validityHint(minutes: number): string {
  const preset = VALIDITY_PRESETS.find((p) => p.minutes === minutes);
  return preset?.hint ? `${preset.hint} · ${humanShortDuration(minutes * 60)}` : humanShortDuration(minutes * 60);
}

function SelectSuggestion({
  label,
  active,
  onPress,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { c } = useTheme();
  return (
    <Text
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={disabled ? undefined : onPress}
      style={[
        styles.chip,
        {
          backgroundColor: active ? c.accent : c.card,
          borderColor: active ? c.accent : c.border,
          color: active ? c.onAccent : c.text,
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {label}
    </Text>
  );
}

const styles = StyleSheet.create({
  summary: {
    borderWidth: 1,
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderRadius: 999,
    fontSize: 12,
    fontWeight: "800",
    overflow: "hidden",
  },
});

/**
 * Standalone wrapper for the registry: opens the form and returns to the hub
 * on both back and successful create-and-close.
 */
export default function CreatePassScreen({ onBack }: { onBack: () => void }) {
  return <CreatePass onBack={onBack} />;
}
