import React from "react";
import { RefreshControl, ScrollView, Text, View, StyleSheet } from "react-native";
import { Screen, EmptyState, ErrorState, useTheme } from "../../../ui";
import { ScreenHeader, LoadingState, MetricRow, Pill, Callout } from "../../../enterprise-ui";
import { Icon, type IconName } from "../../../icons";
import type { Device } from "../../../api";
import type { Severity } from "../../../enterprise";
import type { DeviceFields, ReportedField } from "./fields";
import { fieldText } from "./fields";

export function ModuleScaffold({ title, subtitle, icon, onBack, loading, error, onRetry, refreshing, onRefresh, children }: { title: string; subtitle?: string; icon?: IconName; onBack: () => void; loading?: boolean; error?: string | null; onRetry?: () => void; refreshing?: boolean; onRefresh?: () => void; children: React.ReactNode }) {
  const { c } = useTheme();
  return <Screen><ScreenHeader title={title} subtitle={subtitle} onBack={onBack} actions={onRefresh ? [{ icon: "refresh", label: "Refresh", onPress: onRefresh }] : []} sticky />
    <ScrollView contentContainerStyle={s.content} refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} /> : undefined}>
      {loading ? <LoadingState text="Loading real device readings…" /> : error ? <ErrorState text={error} onRetry={onRetry} /> : children}
    </ScrollView>{icon ? <Icon name={icon} size={1} color={c.bg} /> : null}</Screen>;
}

export function HonestEmpty({ title, subtitle, icon = "empty" }: { title: string; subtitle: string; icon?: IconName }) { return <EmptyState icon={icon} title={title} subtitle={subtitle} />; }

export function DeviceHeader({ device, fields, right }: { device: Device; fields?: DeviceFields; right?: React.ReactNode }) {
  const { c } = useTheme();
  return <View style={s.deviceHead}><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: "900", fontSize: 16 }}>{device.name}</Text><Text style={{ color: c.faint, marginTop: 2 }}>{device.room || "Unassigned"} · {device.online ? "online" : "offline"}{fields ? ` · ${fields.capabilities.join(", ") || "no environmental fields"}` : ""}</Text></View>{right ?? <Pill label={device.online ? "Online" : "Offline"} color={device.online ? c.green : c.faint} icon={device.online ? "online" : "offline"} />}</View>;
}

export function ReadingRow({ field, label, icon, last }: { field?: ReportedField; label?: string; icon?: IconName; last?: boolean }) {
  return <MetricRow icon={icon} label={label ?? field?.label ?? "Reading"} value={fieldText(field, field?.unit === "%" ? 0 : 1)} last={last} />;
}

export function BreachCallout({ severity = "warning", title, text }: { severity?: Severity; title: string; text: string }) { return <Callout kind={severity} title={title} text={text} icon={severity === "critical" ? "alert" : "warning"} />; }

export function kv(label: string, value: React.ReactNode) { return <MetricRow key={label} label={label} value={value} />; }

export function fmt(n: number | undefined, unit = "", digits = 0) { return n == null || !Number.isFinite(n) ? "no reading" : `${n.toLocaleString(undefined, { maximumFractionDigits: digits })}${unit ? ` ${unit}` : ""}`; }

export function lastSeen(ts?: string | null) { return ts ? new Date(ts).toLocaleString() : "not reported"; }

export const s = StyleSheet.create({ content: { padding: 16, paddingBottom: 40 }, deviceHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 } });
