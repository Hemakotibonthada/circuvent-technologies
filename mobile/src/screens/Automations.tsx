import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { api, Automation, AutomationAction, AutomationTrigger, Device } from "../api";

type TriggerType = AutomationTrigger["type"];
type ActionType = AutomationAction["type"];
type StateOp = NonNullable<AutomationTrigger["op"]>;

const OPS: StateOp[] = ["==", "!=", ">", ">=", "<", "<=", "truthy", "falsy"];

export default function Automations({ onBack, embedded }: { onBack: () => void; embedded?: boolean }) {
  const [automations, setAutomations] = useState<Automation[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [msg, setMsg] = useState("");

  const [name, setName] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("state");
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
      return { type: "time", at: trimmedAt };
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
    return {
      type: "command",
      deviceId: actionDeviceId,
      command: { [commandField.trim()]: parseValue(commandValue) },
    };
  };

  return (
    <ScrollView style={[s.wrap, embedded && { backgroundColor: "transparent" }]} contentContainerStyle={{ padding: 16, paddingBottom: 90 }}>
      {!embedded && <Pressable onPress={onBack}><Text style={s.back}>‹ Devices</Text></Pressable>}
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
          <TextInput style={s.input} placeholder="Name" placeholderTextColor="#64748b" value={name} onChangeText={setName} />

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
              <DevicePicker devices={devices} selected={triggerDeviceId} onSelect={setTriggerDeviceId} />
              <TextInput style={s.input} placeholder='Field (e.g. "level")' placeholderTextColor="#64748b" value={field} onChangeText={setField} autoCapitalize="none" />
              <View style={s.ops}>
                {OPS.map((item) => (
                  <Pressable key={item} style={[s.chip, op === item && s.chipOn]} onPress={() => setOp(item)}>
                    <Text style={[s.chipT, op === item && s.chipOnT]}>{item}</Text>
                  </Pressable>
                ))}
              </View>
              {op !== "truthy" && op !== "falsy" && (
                <TextInput style={s.input} placeholder="Value" placeholderTextColor="#64748b" value={value} onChangeText={setValue} autoCapitalize="none" />
              )}
            </>
          ) : (
            <>
              <TextInput style={s.input} placeholder="HH:MM" placeholderTextColor="#64748b" value={at} onChangeText={setAt} autoCapitalize="none" />
              <Text style={s.note}>IST</Text>
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
              <TextInput style={s.input} placeholder="Title" placeholderTextColor="#64748b" value={title} onChangeText={setTitle} />
              <TextInput style={s.input} placeholder="Body" placeholderTextColor="#64748b" value={body} onChangeText={setBody} />
            </>
          ) : (
            <>
              <DevicePicker devices={devices} selected={actionDeviceId} onSelect={setActionDeviceId} />
              <TextInput style={s.input} placeholder='Command field (e.g. "pump")' placeholderTextColor="#64748b" value={commandField} onChangeText={setCommandField} autoCapitalize="none" />
              <TextInput style={s.input} placeholder='Command value (e.g. "true")' placeholderTextColor="#64748b" value={commandValue} onChangeText={setCommandValue} autoCapitalize="none" />
            </>
          )}

          <Pressable style={[s.btn, saving && s.btnOff]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>Save automation</Text>}
          </Pressable>
        </View>
      )}

      {loading ? (
        <ActivityIndicator color="#06b6d4" size="large" style={{ marginTop: 40 }} />
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

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { label: string; value: T }[];
  onChange: (value: T) => void;
}) {
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
  if (trigger.type === "time") return `At ${trigger.at || "--:--"} IST`;
  const name = trigger.deviceId ? deviceName.get(trigger.deviceId) || trigger.deviceId : "device";
  const op = trigger.op || "==";
  const suffix = op === "truthy" || op === "falsy" ? op : `${op} ${String(trigger.value ?? "")}`;
  return `When ${name} ${trigger.field || "field"} ${suffix}`.trim();
}

function actionSummary(action: AutomationAction, deviceName: Map<string, string>): string {
  if (action.type === "notify") return "→ notify";
  const name = action.deviceId ? deviceName.get(action.deviceId) || action.deviceId : "device";
  return `→ command ${name}`;
}

function readError(data: unknown): string | null {
  if (data && typeof data === "object" && "error" in data && typeof data.error === "string") return data.error;
  return null;
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#0b1020" },
  back: { color: "#8b5cf6", marginTop: 8, marginBottom: 6 },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  h1: { color: "#fff", fontSize: 24, fontWeight: "800" },
  sub: { color: "#94a3b8", marginTop: 2 },
  newBtn: { backgroundColor: "#8b5cf6", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  newBtnT: { color: "#fff", fontWeight: "700" },
  msg: { color: "#f59e0b", backgroundColor: "rgba(245,158,11,0.12)", padding: 10, borderRadius: 10, marginBottom: 10 },
  form: { backgroundColor: "#111827", borderRadius: 16, padding: 14, marginBottom: 14 },
  section: { color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: 1, marginTop: 12, marginBottom: 8 },
  input: { backgroundColor: "#0b1020", borderColor: "#334155", borderWidth: 1, borderRadius: 10, color: "#e5e7eb", padding: 12, marginBottom: 10 },
  segment: { flexDirection: "row", gap: 8, marginBottom: 10 },
  segmentItem: { flex: 1, borderColor: "#334155", borderWidth: 1, borderRadius: 10, padding: 12, alignItems: "center" },
  segmentOn: { backgroundColor: "#06b6d4", borderColor: "#06b6d4" },
  segmentT: { color: "#94a3b8", fontWeight: "700" },
  segmentOnT: { color: "#fff" },
  deviceList: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  deviceChip: { borderColor: "#334155", borderWidth: 1, borderRadius: 999, paddingVertical: 9, paddingHorizontal: 12 },
  deviceChipOn: { backgroundColor: "#8b5cf6", borderColor: "#8b5cf6" },
  deviceChipT: { color: "#94a3b8", fontWeight: "700" },
  deviceChipOnT: { color: "#fff" },
  ops: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 },
  chip: { minWidth: 54, borderColor: "#334155", borderWidth: 1, borderRadius: 10, padding: 10, alignItems: "center" },
  chipOn: { backgroundColor: "#06b6d4", borderColor: "#06b6d4" },
  chipT: { color: "#94a3b8", fontWeight: "700" },
  chipOnT: { color: "#fff" },
  note: { color: "#64748b", marginBottom: 10 },
  btn: { backgroundColor: "#06b6d4", borderRadius: 12, padding: 14, alignItems: "center", marginTop: 4 },
  btnOff: { opacity: 0.65 },
  btnT: { color: "#fff", fontWeight: "700" },
  empty: { color: "#64748b", textAlign: "center", marginTop: 60 },
  card: { backgroundColor: "#111827", borderColor: "#1f2937", borderWidth: 1, borderRadius: 14, padding: 16, marginBottom: 10 },
  cardTop: { flexDirection: "row", alignItems: "center" },
  name: { color: "#e5e7eb", fontSize: 16, fontWeight: "700" },
  summary: { color: "#94a3b8", marginTop: 6 },
  action: { color: "#22d3ee", marginTop: 4 },
  deleteBtn: { alignSelf: "flex-start", marginTop: 12, borderColor: "#ef4444", borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 14 },
  deleteT: { color: "#ef4444", fontWeight: "700" },
});
