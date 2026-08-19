import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { api, actionList, Automation, AutomationAction, AutomationActions, AutomationTrigger, Device } from "../api";
import { DAY_NAMES, normaliseDays, timeTriggerSummary, toggleDay } from "../schedule";
import { buildFieldCommand } from "../command-map";
import { useTheme } from "../ui";
import type { Palette } from "../theme";
import { TAP_SLOP } from "../theme";

type TriggerType = AutomationTrigger["type"];
type ActionType = AutomationAction["type"];
type StateOp = NonNullable<AutomationTrigger["op"]>;

const OPS: StateOp[] = ["==", "!=", ">", ">=", "<", "<=", "truthy", "falsy"];

export default function Automations({ onBack, embedded }: { onBack: () => void; embedded?: boolean }) {
  const { c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("state");
  // Undefined means every day, which is how the trigger expresses it.
  const [days, setDays] = useState<number[] | undefined>(undefined);
  const [triggerDeviceId, setTriggerDeviceId] = useState("");
  const [field, setField] = useState("");
  const [op, setOp] = useState<StateOp>("==");
  const [value, setValue] = useState("");
  const [at, setAt] = useState("");
  const [actionType, setActionType] = useState<ActionType>("notify");
  const [actionDeviceId, setActionDeviceId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [commandField, setCommandField] = useState("");
  const [commandValue, setCommandValue] = useState("");

  const deviceName = useMemo(
    () => new Map(devices.map((d) => [d.id, d.name])),
    [devices]
  );

  const triggerDevice = useMemo(() => devices.find((d) => d.id === triggerDeviceId), [devices, triggerDeviceId]);
  const actionDevice = useMemo(() => devices.find((d) => d.id === actionDeviceId), [devices, actionDeviceId]);

  const load = useCallback(async () => {
    setMsg("");
    const [automationRes, deviceRes] = await Promise.all([api.automations(), api.devices()]);
    if (automationRes.ok) setAutomations(automationRes.data.automations || []);
    else setMsg(readError(automationRes.data) || "Could not load automations.");
    if (deviceRes.ok) {
      const list = deviceRes.data.devices || [];
      setDevices(list);
      setTriggerDeviceId((prev) => prev || list[0]?.id || "");
      setActionDeviceId((prev) => prev || list[0]?.id || "");
    } else if (automationRes.ok) {
      /*
       * Only when the automations call succeeded, so this does not overwrite
       * the more important message above. The device failure is the more
       * confusing of the two on its own: with no devices the trigger and
       * action pickers are empty, so the form looks like it works right up to
       * the point where there is nothing to choose.
       */
      setMsg(readError(deviceRes.data) || "Could not load your devices, so the pickers below are empty.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const resetForm = () => {
    setName("");
    setTriggerType("state");
    setTriggerDeviceId(devices[0]?.id || "");
    setField("");
    setOp("==");
    setValue("");
    setAt("");
    setDays(undefined);
    setActionType("notify");
    setActionDeviceId(devices[0]?.id || "");
    setTitle("");
    setBody("");
    setCommandField("");
    setCommandValue("");
  };

  const toggleEnabled = async (automation: Automation, enabled: boolean) => {
    setMsg("");
    setAutomations((prev) => prev.map((a) => (a.id === automation.id ? { ...a, enabled } : a)));
    const r = await api.updateAutomation(automation.id, { enabled });
    if (!r.ok) {
      setAutomations((prev) => prev.map((a) => (a.id === automation.id ? { ...a, enabled: automation.enabled } : a)));
      setMsg(readError(r.data) || "Could not update automation.");
    }
  };

  const confirmDelete = (automation: Automation) => {
    Alert.alert("Delete automation?", `Delete “${automation.name}”?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          void deleteAutomation(automation);
        },
      },
    ]);
  };

  const deleteAutomation = async (automation: Automation) => {
    setMsg("");
    const previous = automations;
    setAutomations((prev) => prev.filter((a) => a.id !== automation.id));
    const r = await api.deleteAutomation(automation.id);
    if (!r.ok) {
      setAutomations(previous);
      setMsg(readError(r.data) || "Could not delete automation.");
    }
  };

  const save = async () => {
    setMsg("");
    const trimmedName = name.trim();
    if (!trimmedName) return setMsg("Enter a name.");

    const trigger = buildTrigger();
    const action = buildAction();
    if (!trigger || !action) return;

    setSaving(true);
    const r = await api.createAutomation({ name: trimmedName, enabled: true, trigger, action });
    setSaving(false);
    if (r.ok) {
      resetForm();
      setShowForm(false);
      await load();
    } else {
      setMsg(readError(r.data) || "Could not create automation.");
    }
  };

  const buildTrigger = (): AutomationTrigger | null => {
    if (triggerType === "time") {
      const trimmedAt = at.trim();
      if (!trimmedAt) {
        setMsg("Enter a time in HH:MM.");
        return null;
      }
      return { type: "time", at: trimmedAt, days: normaliseDays(days) };
    }

    if (!triggerDeviceId || !field.trim()) {
      setMsg("Choose a device and field.");
      return null;
    }

    const trigger: AutomationTrigger = { type: "state", deviceId: triggerDeviceId, field: field.trim(), op };
    if (op !== "truthy" && op !== "falsy") trigger.value = parseValue(value);
    return trigger;
  };

  const buildAction = (): AutomationAction | null => {
    if (actionType === "notify") {
      if (!title.trim() || !body.trim()) {
        setMsg("Enter notification title and body.");
        return null;
      }
      return { type: "notify", title: title.trim(), body: body.trim() };
    }

    if (!actionDeviceId || !commandField.trim()) {
      setMsg("Choose a command device and field.");
      return null;
    }
    /*
     * The device drops any payload with no `action` before the sketch runs, so
     * a hand-typed field alone produces a rule that saves and never fires.
     * Built against the target's type, which also remaps keys the sketch does
     * not accept as commands.
     */
    const target = devices.find((d) => d.id === actionDeviceId);
    const command = buildFieldCommand(
      target?.type ?? "",
      commandField.trim(),
      parseValue(commandValue) as boolean | number | string
    );
    if (!command) {
      setMsg(`That device cannot be commanded with “${commandField.trim()}”.`);
      return null;
    }
    return {
      type: "command",
      deviceId: actionDeviceId,
      command,
    };
  };

  return (
    <ScrollView style={[s.wrap, embedded && { backgroundColor: "transparent" }]} contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
      {!embedded && <Pressable hitSlop={TAP_SLOP} onPress={onBack}><Text style={s.back}>‹ Devices</Text></Pressable>}
      <View style={s.top}>
        <View>
          <Text style={s.h1}>Automations</Text>
          <Text style={s.sub}>Rules for devices and alerts</Text>
        </View>
        <Pressable style={s.newBtn} onPress={() => setShowForm((v) => !v)}>
          <Text style={s.newBtnT}>{showForm ? "Close" : "＋ New automation"}</Text>
        </Pressable>
      </View>

      {!!msg && <Text style={s.msg}>{msg}</Text>}

      {showForm && (
        <View style={s.form}>
          <Text style={s.section}>Details</Text>
          <TextInput style={s.input} placeholder="Name" placeholderTextColor={c.faint} value={name} onChangeText={setName} />

          <Text style={s.section}>Trigger</Text>
          <Segmented
            value={triggerType}
            options={[
              { label: "State", value: "state" },
              { label: "Time", value: "time" },
            ]}
            onChange={setTriggerType}
          />

          {triggerType === "state" ? (
            <>
              <DevicePicker devices={devices} selected={triggerDeviceId} onSelect={(id) => { setTriggerDeviceId(id); setField(""); }} />
              <Text style={s.hint}>Field (read from the device)</Text>
              <FieldPicker device={triggerDevice} selected={field} onSelect={setField} />
              {field ? (
                <>
                  <View style={s.ops}>
                    {OPS.map((item) => (
                      <Pressable key={item} style={[s.chip, op === item && s.chipOn]} onPress={() => setOp(item)}>
                        <Text style={[s.chipT, op === item && s.chipOnT]}>{opLabel(item)}</Text>
                      </Pressable>
                    ))}
                  </View>
                  {op !== "truthy" && op !== "falsy" && (
                    <SmartValue device={triggerDevice} field={field} value={value} onChange={setValue} />
                  )}
                </>
              ) : (
                <Text style={s.note}>Pick a field above to set a condition.</Text>
              )}
            </>
          ) : (
            <>
              <TextInput style={s.input} placeholder="HH:MM" placeholderTextColor={c.faint} value={at} onChangeText={setAt} autoCapitalize="none" keyboardType="numbers-and-punctuation" />
              <Text style={s.note}>IST</Text>
              {/*
                Which days it runs. The control plane has always accepted this
                and the console has always offered it; the app could neither set
                it nor show it, so a weekday timer made on the web appeared here
                as if it ran every day.

                All seven selected is the same as no filter, so unticking the
                first day from an unfiltered timer removes one rather than
                leaving a timer that runs on one day.
              */}
              <Text style={[s.note, { marginTop: 10 }]}>Repeats</Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {DAY_NAMES.map((name, i) => {
                  const on = !days || days.includes(i);
                  return (
                    <Pressable
                      key={name}
                      onPress={() => setDays(normaliseDays(toggleDay(days, i)))}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={name}
                      style={{
                        minWidth: 44,
                        minHeight: 36,
                        alignItems: "center",
                        justifyContent: "center",
                        paddingHorizontal: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        backgroundColor: on ? c.accent : c.card,
                        borderColor: on ? c.accent : c.border,
                      }}
                    >
                      <Text style={{ color: on ? c.onAccent : c.textDim, fontWeight: "700", fontSize: 12 }}>{name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          <Text style={s.section}>Action</Text>
          <Segmented
            value={actionType}
            options={[
              { label: "Notify", value: "notify" },
              { label: "Command", value: "command" },
            ]}
            onChange={setActionType}
          />

          {actionType === "notify" ? (
            <>
              <TextInput style={s.input} placeholder="Title" placeholderTextColor={c.faint} value={title} onChangeText={setTitle} />
              <TextInput style={s.input} placeholder="Body" placeholderTextColor={c.faint} value={body} onChangeText={setBody} />
            </>
          ) : (
            <>
              <DevicePicker devices={devices} selected={actionDeviceId} onSelect={(id) => { setActionDeviceId(id); setCommandField(""); }} />
              <Text style={s.hint}>Set which control (read from the device)</Text>
              <FieldPicker device={actionDevice} selected={commandField} onSelect={setCommandField} settable />
              {commandField ? (
                <SmartValue device={actionDevice} field={commandField} value={commandValue} onChange={setCommandValue} />
              ) : (
                <Text style={s.note}>Pick a control above to set its value.</Text>
              )}
            </>
          )}

          <Pressable style={[s.btn, saving && s.btnOff]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color={c.onAccent} /> : <Text style={s.btnT}>Save automation</Text>}
          </Pressable>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color={c.accent} size="large" style={{ marginTop: 40 }} />
      ) : automations.length === 0 ? (
        <Text style={s.empty}>No automations yet.</Text>
      ) : (
        automations.map((automation) => (
          <View key={automation.id} style={s.card}>
            <View style={s.cardTop}>
              <View style={{ flex: 1 }}>
                <Text style={s.name}>{automation.name}</Text>
                <Text style={s.summary}>{triggerSummary(automation.trigger, deviceName)}</Text>
                <Text style={s.action}>{actionSummary(automation.action, deviceName)}</Text>
              </View>
              <Switch value={automation.enabled} onValueChange={(enabled) => toggleEnabled(automation, enabled)} />
            </View>
            <Pressable style={s.deleteBtn} onPress={() => confirmDelete(automation)}>
              <Text style={s.deleteT}>Delete</Text>
            </Pressable>
          </View>
        ))
      )}
    </ScrollView>
  );
}

function DevicePicker({ devices, selected, onSelect }: { devices: Device[]; selected: string; onSelect: (id: string) => void }) {
  const { c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  if (devices.length === 0) return <Text style={s.note}>No devices available.</Text>;
  return (
    <View style={s.deviceList}>
      {devices.map((device) => (
        <Pressable key={device.id} style={[s.deviceChip, selected === device.id && s.deviceChipOn]} onPress={() => onSelect(device.id)}>
          <Text style={[s.deviceChipT, selected === device.id && s.deviceChipOnT]}>{device.name}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// Hide noisy/read-only telemetry keys when the user is picking a CONTROL to set.
const SETTABLE = new Set(["power", "power2", "power3", "power4", "pump", "auto", "locked", "armed", "g1", "g2", "g3", "backlight", "scene", "brightness", "target", "speed", "position", "color"]);
/*
 * Fields that are noise in a trigger picker. `rfRejected` is a diagnostic
 * counter, and `pairing` is a transient setup state — a rule keyed on either
 * would fire on things the user did not mean. `rfLinkUp` and `tankBattPct` are
 * deliberately NOT hidden: "tell me when the tank sensor stops reporting" is
 * one of the most useful rules this product can offer.
 *
 * `sumpFault` and `ohFault` were hidden here for no better reason than sitting
 * beside the diagnostics. They are the same kind of thing as `rfLinkUp` — a
 * sensor has stopped answering — and from watertank 2.2.0 a faulted sump holds
 * the pump off entirely, so "tell me when the sump sensor fails" is a rule
 * somebody would very much like to have before they run out of water.
 */
const HIDDEN_FIELDS = new Set([
  "fw", "rssi", "uptime", "sensorFault",
  "rfRejected", "pairing", "radioReady", "ohLive",
]);

function humanField(f: string): string {
  const map: Record<string, string> = {
    power: "Power", power2: "Power 2", pump: "Pump", auto: "Auto mode", locked: "Lock", armed: "Armed",
    level: "Level", ohPct: "Overhead %", sumpPct: "Sump %", watts: "Power (W)", volts: "Voltage", amps: "Current",
    temperature: "Temperature", humidity: "Humidity", motion: "Motion", dryRun: "Dry-run", overflow: "Overflow",
    ohFault: "Overhead sensor faulty", sumpFault: "Sump sensor faulty",
    g1: "Gang 1", g2: "Gang 2", g3: "Gang 3", backlight: "Backlight", battery: "Battery", barrier: "Barrier",
    rfLinkUp: "Tank sensor reporting", rfAgeS: "Tank sensor last heard (s)",
    tankBattPct: "Tank sensor battery %", tankBattLow: "Tank sensor battery low",
    sensorPaired: "Tank sensor paired",
  };
  return map[f] || f.replace(/([A-Z])/g, " $1").replace(/^./, (m) => m.toUpperCase());
}

// Device-driven field picker: reads the fields straight off the device's live
// state so the user never types a variable name.
function FieldPicker({ device, selected, onSelect, settable }: { device: Device | undefined; selected: string; onSelect: (f: string) => void; settable?: boolean }) {
  const { c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  if (!device) return <Text style={s.note}>Choose a device first.</Text>;
  let keys = Object.keys(device.state || {}).filter((k) => !HIDDEN_FIELDS.has(k));
  if (settable) {
    const s2 = keys.filter((k) => SETTABLE.has(k) || typeof device.state[k] === "boolean");
    keys = s2.length ? s2 : keys;
  }
  if (keys.length === 0) return <Text style={s.note}>This device isn’t reporting any fields yet.</Text>;
  return (
    <View style={s.deviceList}>
      {keys.map((k) => (
        <Pressable key={k} style={[s.deviceChip, selected === k && s.fieldChipOn]} onPress={() => onSelect(k)}>
          <Text style={[s.deviceChipT, selected === k && s.deviceChipOnT]}>{humanField(k)}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// Value input whose type is inferred from the device's CURRENT value for the
// field: booleans get an On/Off toggle, numbers get a numeric keypad.
function SmartValue({ device, field, value, onChange }: { device: Device | undefined; field: string; value: string; onChange: (v: string) => void }) {
  const { c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  const cur = device?.state?.[field];
  const kind = typeof cur;
  if (kind === "boolean") {
    return (
      <Segmented
        value={value === "true" || value === "false" ? (value as "true" | "false") : (cur ? "false" : "true")}
        options={[{ label: "On", value: "true" }, { label: "Off", value: "false" }]}
        onChange={(v) => onChange(v)}
      />
    );
  }
  const numeric = kind === "number";
  return (
    <TextInput
      style={s.input}
      placeholder={numeric ? `Value${cur != null ? ` (now ${String(cur)})` : ""}` : "Value"}
      placeholderTextColor={c.faint}
      value={value}
      onChangeText={onChange}
      autoCapitalize="none"
      keyboardType={numeric ? "numeric" : "default"}
    />
  );
}

function opLabel(op: StateOp): string {
  const map: Record<StateOp, string> = { "==": "equals", "!=": "not", ">": ">", ">=": "≥", "<": "<", "<=": "≤", truthy: "is on", falsy: "is off" };
  return map[op] || op;
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
}) {
  const { c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);
  return (
    <View style={s.segment}>
      {options.map((option) => (
        <Pressable key={option.value} style={[s.segmentItem, value === option.value && s.segmentOn]} onPress={() => onChange(option.value)}>
          <Text style={[s.segmentT, value === option.value && s.segmentOnT]}>{option.label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function parseValue(raw: string): number | string | boolean {
  const trimmed = raw.trim();
  if (/^(true|false)$/i.test(trimmed)) return trimmed.toLowerCase() === "true";
  if (trimmed !== "" && !Number.isNaN(Number(trimmed))) return Number(trimmed);
  return trimmed;
}

function triggerSummary(trigger: AutomationTrigger, deviceName: Map<string, string>): string {
  if (trigger.type === "time") return timeTriggerSummary(trigger.at, trigger.days);
  const name = trigger.deviceId ? deviceName.get(trigger.deviceId) || trigger.deviceId : "device";
  const op = trigger.op || "==";
  const suffix = op === "truthy" || op === "falsy" ? op : `${op} ${String(trigger.value ?? "")}`;
  return `When ${name} ${trigger.field || "field"} ${suffix}`.trim();
}

function actionSummary(action: AutomationActions, deviceName: Map<string, string>): string {
  const steps = actionList(action);
  if (steps.length === 0) return "→ no action";
  const one = (s: AutomationAction) => {
    if (s.type === "notify") return "notify";
    const name = s.deviceId ? deviceName.get(s.deviceId) || s.deviceId : "device";
    return s.type === "tts" ? `speak on ${name}` : `command ${name}`;
  };
  return steps.length === 1
    ? `→ ${one(steps[0])}`
    : `→ ${one(steps[0])} +${steps.length - 1} more`;
}

function readError(data: unknown): string | null {
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") return data.error;
  return null;
}

/**
 * Styles derived from the active palette.
 *
 * These were a module-level StyleSheet.create with every colour written in by
 * hand — a #0b1020 background, #fff headings, #e5e7eb inputs. That is a whole
 * screen that ignores the theme, and it was not merely inconsistent: this
 * component renders with `embedded`, which drops its own background to
 * transparent so it can sit inside Automate. Light text then lands on whatever
 * surface the theme provides, and on any light scheme — including the neo light
 * the app now offers — the entire form is white on near-white.
 *
 * Semantic colours (amber warning, red destructive, the cyan/violet accents)
 * keep their meaning across themes and stay literal on purpose; only the
 * surface and text roles come from the palette.
 */
const makeStyles = (c: Palette) =>
  StyleSheet.create({
    wrap: { flex: 1, backgroundColor: c.bg },
    back: { color: c.accent, marginTop: 8, marginBottom: 6 },
    top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
    h1: { color: c.text, fontSize: 24, fontWeight: "800" },
    sub: { color: c.textDim, marginTop: 2 },
    newBtn: { backgroundColor: c.accent, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, minHeight: 44, justifyContent: "center" },
    newBtnT: { color: c.onAccent, fontWeight: "700" },
    msg: { color: c.amber, backgroundColor: "rgba(245,158,11,0.12)", padding: 10, borderRadius: 10, marginBottom: 10 },
    form: { backgroundColor: c.card, borderRadius: 16, padding: 14, marginBottom: 14 },
    section: { color: c.textDim, fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginTop: 12, marginBottom: 8 },
    input: { backgroundColor: c.surface, borderColor: c.border, borderWidth: 1, borderRadius: 10, color: c.text, padding: 12, marginBottom: 10 },
    segment: { flexDirection: "row", gap: 8, marginBottom: 10 },
    segmentItem: { flex: 1, borderColor: c.border, borderWidth: 1, borderRadius: 10, padding: 12, alignItems: "center", minHeight: 44, justifyContent: "center" },
    segmentOn: { backgroundColor: c.accent, borderColor: c.accent },
    segmentT: { color: c.textDim, fontWeight: "700" },
    segmentOnT: { color: c.onAccent },
    deviceList: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    deviceChip: { borderColor: c.border, borderWidth: 1, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 12, minHeight: 44, justifyContent: "center" },
    deviceChipOn: { backgroundColor: c.accent, borderColor: c.accent },
    deviceChipT: { color: c.textDim, fontWeight: "700" },
    deviceChipOnT: { color: c.onAccent },
    ops: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
    chip: { minWidth: 54, borderColor: c.border, borderWidth: 1, borderRadius: 10, padding: 10, alignItems: "center", minHeight: 44, justifyContent: "center" },
    chipOn: { backgroundColor: c.accent, borderColor: c.accent },
    chipT: { color: c.textDim, fontWeight: "700" },
    chipOnT: { color: c.onAccent },
    note: { color: c.faint, marginBottom: 10 },
    hint: { color: c.textDim, fontSize: 12, marginBottom: 8 },
    fieldChipOn: { backgroundColor: c.accent, borderColor: c.accent },
    btn: { backgroundColor: c.accent, borderRadius: 12, padding: 14, alignItems: "center", marginTop: 4 },
    btnOff: { opacity: 0.65 },
    btnT: { color: c.onAccent, fontWeight: "700" },
    empty: { color: c.faint, textAlign: "center", marginTop: 60 },
    card: { backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 10 },
    cardTop: { flexDirection: "row", alignItems: "center" },
    name: { color: c.text, fontSize: 16, fontWeight: "700" },
    summary: { color: c.textDim, marginTop: 6 },
    action: { color: c.accent, marginTop: 4 },
    deleteBtn: { alignSelf: "flex-start", marginTop: 12, borderColor: c.red, borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14, minHeight: 44, justifyContent: "center" },
    deleteT: { color: c.red, fontWeight: "700" },
  });
