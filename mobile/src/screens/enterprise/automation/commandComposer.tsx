import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { Device, SceneAction } from "../../../api";
import { Callout, CodeBlock, SelectField, TextField } from "../../../enterprise-ui";
import { useTheme } from "../../../ui";
import { parseJsonObject, safeJson } from "./types";
import { DevicePicker, FieldError } from "./parts";

function presetsFor(device?: Device): { label: string; command: Record<string, unknown> }[] {
  const out: { label: string; command: Record<string, unknown> }[] = [];
  const state = device?.state || {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(state, k);
  if (has("on")) out.push({ label: "Turn on", command: { on: true } }, { label: "Turn off", command: { on: false } });
  if (has("power")) out.push({ label: "Power on", command: { power: true } }, { label: "Power off", command: { power: false } });
  if (has("open")) out.push({ label: "Open", command: { open: true } }, { label: "Close", command: { open: false } });
  if (has("locked")) out.push({ label: "Lock", command: { locked: true } }, { label: "Unlock", command: { locked: false } });
  if (has("brightness")) out.push({ label: "Brightness 50", command: { brightness: 50 } }, { label: "Brightness 100", command: { brightness: 100 } });
  if (has("speed")) out.push({ label: "Speed 1", command: { speed: 1 } }, { label: "Speed 3", command: { speed: 3 } });
  if (has("mode")) out.push({ label: "Mode auto", command: { mode: "auto" } });
  return out;
}

export function CommandComposer({ devices, deviceId, onDevice, command, onCommand, errors, label = "Command target" }: { devices: Device[]; deviceId?: string; onDevice: (id: string) => void; command?: Record<string, unknown>; onCommand: (cmd: Record<string, unknown>) => void; errors?: { deviceId?: string; command?: string }; label?: string }) {
  const { c } = useTheme();
  const device = devices.find((d) => d.id === deviceId);
  const presets = useMemo(() => presetsFor(device), [device]);
  const [raw, setRaw] = useState(safeJson(command || {}));
  const parsed = useMemo(() => parseJsonObject(raw), [raw]);
  useEffect(() => { setRaw(safeJson(command || {})); }, [command]);
  return (
    <View>
      <DevicePicker label={label} devices={devices} value={deviceId} onChange={onDevice} error={errors?.deviceId} />
      {device && presets.length > 0 && <SelectField label="Command presets from real state" value="" options={[{ value: "", label: "Choose preset", icon: "sparkles" }, ...presets.map((p, i) => ({ value: String(i), label: p.label, icon: "action" as const }))]} onChange={(v) => { const p = presets[Number(v)]; if (p) onCommand(p.command); }} help="Presets are offered only for keys present in the selected device state." />}
      {device && !presets.length && <Callout kind="info" text="No safe preset matched this device state. Use raw JSON so the exact command is visible." icon="terminal" />}
      <TextField label="Raw command JSON" value={raw} onChange={(v) => { setRaw(v); const r = parseJsonObject(v); if (r.value) onCommand(r.value); }} multiline autoCapitalize="none" error={parsed.error || errors?.command} help="This object is sent unchanged to the selected device." />
      <CodeBlock label="Command preview" text={parsed.value ? safeJson(parsed.value) : raw} maxHeight={150} />
      {device && <Text style={{ color: c.faint, fontSize: 12, marginBottom: 6 }}>State keys: {Object.keys(device.state || {}).join(", ") || "none reported"}</Text>}
      <FieldError text={errors?.command} />
    </View>
  );
}

export function SceneActionEditor({ action, devices, onChange, onRemove, onUp, onDown, index, canUp, canDown }: { action: SceneAction; devices: Device[]; onChange: (a: SceneAction) => void; onRemove: () => void; onUp: () => void; onDown: () => void; index: number; canUp: boolean; canDown: boolean }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <CommandComposer devices={devices} deviceId={action.deviceId} command={action.command} onDevice={(id) => onChange({ ...action, deviceId: id })} onCommand={(command) => onChange({ ...action, command })} label={`Action ${index + 1} device`} />
      <View style={{ flexDirection: "row", gap: 8 }}>
        <SelectField label="Order" value="keep" options={[{ value: "keep", label: `#${index + 1}`, icon: "drag" }, { value: "up", label: "Move up", icon: "collapse" }, { value: "down", label: "Move down", icon: "expand" }, { value: "remove", label: "Remove", icon: "trash" }]} onChange={(v) => { if (v === "up" && canUp) onUp(); if (v === "down" && canDown) onDown(); if (v === "remove") onRemove(); }} />
      </View>
    </View>
  );
}
