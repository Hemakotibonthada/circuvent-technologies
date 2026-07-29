import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Icon, type IconName } from "../../../icons";
import { Card, EmptyState, ErrorState, useTheme } from "../../../ui";
import { LoadingState, SearchField, SelectField, TextField } from "../../../enterprise-ui";
import type { Device } from "../../../api";
import type { FieldErrors, FieldInfo } from "./types";

export function ScreenScaffold({ loading, error, onRetry, children }: { loading: boolean; error: string | null; onRetry: () => void; children: React.ReactNode }) {
  if (loading) return <LoadingState text="Loading automation data…" />;
  if (error) return <ErrorState text={error} onRetry={onRetry} />;
  return <>{children}</>;
}

export function SectionCard({ title, icon, children, right }: { title: string; icon?: IconName; children: React.ReactNode; right?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Card style={{ marginBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
        {icon && <Icon name={icon} size={17} color={c.accentHi} />}
        <Text style={{ color: c.text, fontSize: 16, fontWeight: "900", flex: 1 }}>{title}</Text>
        {right}
      </View>
      {children}
    </Card>
  );
}

export function SmallButton({ label, icon, onPress, danger, disabled }: { label: string; icon?: IconName; onPress: () => void; danger?: boolean; disabled?: boolean }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [s.small, { borderColor: danger ? c.red : c.border, backgroundColor: c.card, opacity: disabled ? 0.45 : pressed ? 0.75 : 1 }]}
    >
      {icon && <Icon name={icon} size={15} color={danger ? c.red : c.textDim} />}
      <Text style={{ color: danger ? c.red : c.text, fontWeight: "800", fontSize: 12 }}>{label}</Text>
    </Pressable>
  );
}

export function DevicePicker({ label, devices, value, onChange, error, onlyOnline }: { label: string; devices: Device[]; value?: string; onChange: (id: string) => void; error?: string; onlyOnline?: boolean }) {
  const { c } = useTheme();
  const [q, setQ] = useState("");
  const filtered = useMemo(() => devices.filter((d) => (!onlyOnline || d.online) && `${d.name} ${d.type} ${d.room || ""}`.toLowerCase().includes(q.toLowerCase())), [devices, onlyOnline, q]);
  const grouped = useMemo(() => {
    const m = new Map<string, Device[]>();
    filtered.forEach((d) => { const k = d.room || "Unassigned"; m.set(k, [...(m.get(k) || []), d]); });
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ color: c.textDim, fontSize: 12, fontWeight: "800", marginBottom: 6 }}>{label}</Text>
      <SearchField value={q} onChange={setQ} placeholder="Search device, room or type" />
      {error && <Text style={{ color: c.red, fontSize: 12, marginBottom: 8 }}>{error}</Text>}
      {!filtered.length ? <EmptyState title="No matching devices" subtitle="The picker only uses devices returned by the API." /> : grouped.map(([room, list]) => (
        <View key={room} style={{ marginBottom: 8 }}>
          <Text style={{ color: c.faint, fontSize: 11, fontWeight: "800", marginBottom: 6 }}>{room.toUpperCase()}</Text>
          <View style={{ gap: 8 }}>
            {list.map((d) => {
              const active = d.id === value;
              return (
                <Pressable key={d.id} onPress={() => onChange(d.id)} accessibilityRole="radio" accessibilityLabel={`${d.name}, ${d.type}`} accessibilityState={{ selected: active }} style={({ pressed }) => [s.device, { borderColor: active ? c.accent : c.border, backgroundColor: active ? c.accent + "18" : c.card, opacity: pressed ? 0.8 : 1 }]}>
                  <Icon name={d.online ? "online" : "offline"} size={17} color={d.online ? c.green : c.faint} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontWeight: "800" }}>{d.name}</Text>
                    <Text style={{ color: c.faint, fontSize: 12 }}>{d.type} · {d.id}</Text>
                  </View>
                  {active && <Icon name="check" size={18} color={c.accentHi} />}
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}

export function collectFieldInfo(device?: Device, telemetryRows: { payload: Record<string, unknown> }[] = []): FieldInfo[] {
  const map = new Map<string, { types: Set<string>; sample?: unknown; state: boolean; telemetry: boolean }>();
  const add = (k: string, v: unknown, source: "state" | "telemetry") => {
    const cur = map.get(k) || { types: new Set<string>(), sample: undefined, state: false, telemetry: false };
    cur.types.add(v == null ? "null" : Array.isArray(v) ? "array" : typeof v);
    if (cur.sample === undefined && v !== undefined) cur.sample = v;
    if (source === "state") cur.state = true; else cur.telemetry = true;
    map.set(k, cur);
  };
  Object.entries(device?.state || {}).forEach(([k, v]) => add(k, v, "state"));
  telemetryRows.forEach((r) => Object.entries(r.payload || {}).forEach(([k, v]) => add(k, v, "telemetry")));
  return [...map.entries()].map(([key, v]) => {
    const source: FieldInfo["source"] = v.state && v.telemetry ? "both" : v.state ? "state" : "telemetry";
    return { key, types: [...v.types].sort(), sample: v.sample, source };
  }).sort((a, b) => a.key.localeCompare(b.key));
}

export function FieldPicker({ fields, value, onChange, error }: { fields: FieldInfo[]; value?: string; onChange: (field: FieldInfo) => void; error?: string }) {
  const opts = fields.map((f) => ({ value: f.key, label: `${f.key} (${f.types.join("/")})`, icon: f.source === "telemetry" ? "history" as IconName : "sensors" as IconName }));
  return (
    <View>
      <SelectField label="Field" value={value || ""} options={opts.length ? opts : [{ value: "", label: "No fields observed", icon: "empty" }]} onChange={(v) => { const f = fields.find((x) => x.key === v); if (f) onChange(f); }} help="Fields come from this device state plus recent telemetry." />
      {error && <FieldError text={error} />}
    </View>
  );
}

export function FieldError({ text }: { text?: string }) {
  const { c } = useTheme();
  return text ? <Text style={{ color: c.red, fontSize: 12, marginTop: -8, marginBottom: 10 }}>{text}</Text> : null;
}

export function BoolSelector({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <SelectField label={label} value={value ? "true" : "false"} options={[{ value: "true", label: "True", icon: "check" }, { value: "false", label: "False", icon: "close" }]} onChange={(v) => onChange(v === "true")} />;
}

export function ErrorSummary({ errors }: { errors: FieldErrors }) {
  const list = Object.values(errors).filter(Boolean) as string[];
  if (!list.length) return null;
  return <TextField label="Fix before saving" value={list.join("\n")} onChange={() => {}} multiline editable={false} />;
}

const s = StyleSheet.create({
  small: { minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  device: { minHeight: 56, borderRadius: 14, borderWidth: 1, padding: 10, flexDirection: "row", alignItems: "center", gap: 10 },
});
