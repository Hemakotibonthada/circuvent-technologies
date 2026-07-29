import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../../../icons";
import { useTheme, Screen, EmptyState, ErrorState } from "../../../ui";
import { ScreenHeader, LoadingState, SeverityBadge, StatusDot, MetricRow, Pill, ActionButton, severityColor } from "../../../enterprise-ui";
import { formatDateTime, formatRelative, SEVERITY_LABEL, severityOf, type Severity } from "../../../enterprise";
import { severityIcon } from "../../../enterprise-ui";
import type { Device, AppEvent } from "../../../api";
import type { ArmMode, SecurityZone } from "./zones";
import { eventDeviceName, zoneSeverity, zoneStatusLabel } from "./zones";

export function SecurityScaffold({ title, subtitle, onBack, onRefresh, refreshing, loading, error, onRetry, children }: { title: string; subtitle?: string; onBack?: () => void; onRefresh?: () => void; refreshing?: boolean; loading?: boolean; error?: string | null; onRetry?: () => void; children: React.ReactNode }) {
  return <Screen><ScreenHeader title={title} subtitle={subtitle} onBack={onBack} actions={onRefresh ? [{ icon: "refresh", label: refreshing ? "Refreshing" : "Refresh", onPress: onRefresh }] : []} sticky />{loading ? <LoadingState text="Loading security data…" /> : error ? <View style={{ padding: 16 }}><ErrorState text={error} onRetry={onRetry} /></View> : <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>{children}</ScrollView>}</Screen>;
}

export function Section({ title, subtitle, icon, children, style }: { title: string; subtitle?: string; icon?: IconName; children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ marginBottom: 16 }, style]}><View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>{icon ? <Icon name={icon} size={18} color={c.accentHi} /> : null}<View style={{ flex: 1 }}><Text style={{ color: c.text, fontSize: 16, fontWeight: "900" }}>{title}</Text>{subtitle ? <Text style={{ color: c.faint, fontSize: 12, marginTop: 1 }}>{subtitle}</Text> : null}</View></View>{children}</View>;
}

export function HonestEmpty({ title, subtitle, icon = "empty", onRetry }: { title: string; subtitle: string; icon?: IconName; onRetry?: () => void }) {
  return <EmptyState icon={icon} title={title} subtitle={subtitle} actionLabel={onRetry ? "Retry" : undefined} onAction={onRetry} />;
}

export function ArmModePill({ mode }: { mode: ArmMode }) {
  const { c } = useTheme();
  const map: Record<ArmMode, { label: string; icon: IconName; color: string }> = {
    disarmed: { label: "Disarmed", icon: "disarmed", color: c.faint },
    home: { label: "Home intent", icon: "home", color: c.cyan },
    away: { label: "Away intent", icon: "armed", color: c.red },
    night: { label: "Night intent", icon: "shieldLock", color: c.violet },
  };
  const m = map[mode];
  return <Pill label={m.label} icon={m.icon} color={m.color} filled={mode !== "disarmed"} />;
}

export function DeviceStatusRow({ device, right }: { device: Device; right?: React.ReactNode }) {
  const { c } = useTheme();
  return <View style={[styles.row, { borderBottomColor: c.border }]}><StatusDot ok={device.online} pulse={device.online} /><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: "800" }}>{device.name}</Text><Text style={{ color: c.faint, fontSize: 12 }}>{device.type} · {device.last_seen ? formatRelative(device.last_seen) : "never seen"}</Text></View><Pill label={device.online ? "Online" : "Offline"} color={device.online ? c.green : c.red} icon={device.online ? "online" : "offline"} />{right}</View>;
}

export function ZoneRow({ zone, bypassed, onToggle }: { zone: SecurityZone; bypassed: boolean; onToggle: (v: boolean) => void }) {
  const { c } = useTheme();
  const sev = zoneSeverity(zone, bypassed);
  const label = zoneStatusLabel(zone);
  return <View style={[styles.zone, { backgroundColor: c.card, borderColor: c.border }]}><View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}><Icon name={zone.icon} size={20} color={severityColor(c, sev)} /><View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: "800" }}>{zone.label}</Text><Text style={{ color: c.faint, fontSize: 12 }}>{zone.field}: {String(zone.value)} · {zone.lastChanged ? formatRelative(zone.lastChanged) : "no timestamp"}</Text></View><SeverityBadge severity={sev} label={`${SEVERITY_LABEL[sev]} · ${bypassed ? "Bypassed" : label}`} /></View><ActionButton label={bypassed ? "Remove bypass" : "Bypass zone"} icon={bypassed ? "restore" : "archive"} outline onPress={() => onToggle(!bypassed)} /></View>;
}

export function EventCard({ event, devices, onPress }: { event: AppEvent; devices: Device[]; onPress: () => void }) {
  const { c } = useTheme();
  const severity = severityOf(event.kind);
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open event ${event.title}`} style={({ pressed }) => [styles.event, { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.82 : 1 }]}><View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}><Icon name={severityIcon(severity)} size={18} color={severityColor(c, severity)} /><View style={{ flex: 1 }}><View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}><Text style={{ color: c.text, fontWeight: "800", flex: 1 }}>{event.title}</Text>{!event.read ? <Pill label="Unread" color={c.accentHi} icon="bell" /> : null}</View><Text style={{ color: c.faint, fontSize: 12, marginTop: 3 }}>{eventDeviceName(event, devices)} · {formatRelative(event.ts)} · {event.kind}</Text>{event.body ? <Text style={{ color: c.textDim, fontSize: 13, marginTop: 6 }} numberOfLines={3}>{event.body}</Text> : null}</View></View></Pressable>;
}

export function DetailRows({ rows }: { rows: { label: string; value: React.ReactNode; icon?: IconName }[] }) {
  return <View>{rows.map((r, i) => <MetricRow key={r.label} label={r.label} value={r.value} icon={r.icon} last={i === rows.length - 1} />)}</View>;
}

export function JsonBlockValue({ value }: { value: unknown }) {
  return <Text>{JSON.stringify(value, null, 2)}</Text>;
}

export function dayKey(ts: string): string {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "Invalid date";
  return d.toISOString().slice(0, 10);
}

export function hourLabel(ts: string): string {
  const d = new Date(ts);
  if (!Number.isFinite(d.getTime())) return "?";
  return `${String(d.getHours()).padStart(2, "0")}:00`;
}

export function rawJson(value: unknown): string {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function dateLine(ts?: string | null): string {
  return ts ? `${formatDateTime(ts)} (${formatRelative(ts)})` : "No timestamp";
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, minHeight: 50, borderBottomWidth: 1 },
  zone: { borderWidth: 1, borderRadius: 16, padding: 12, gap: 10, marginBottom: 10 },
  event: { borderWidth: 1, borderRadius: 16, padding: 12, marginBottom: 10, minHeight: 70 },
});
