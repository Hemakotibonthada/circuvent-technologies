import React from "react";
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { api } from "../../../api";
import type { AdminDevice, Device, TelemetryRow } from "../../../api";
import { formatDateTime, formatRelative, statsOf } from "../../../enterprise";
import { BarChart } from "../../../charts";
import { Card, EmptyState, ErrorState, useTheme } from "../../../ui";
import { ActionButton, MetricRow, LoadingState, Pill, StatusDot } from "../../../enterprise-ui";
import { Icon, type IconName } from "../../../icons";

export type ApiResponse<T> = { ok: boolean; status: number; data: T };
export type LoadState = "loading" | "ready" | "error";

export function unwrap<T>(res: ApiResponse<T>, label = "Request"): T {
  if (!res.ok) {
    const data = res.data as Record<string, unknown> | undefined;
    const msg = typeof data?.error === "string" ? data.error : `${label} failed (${res.status || "network"})`;
    throw new Error(msg);
  }
  return res.data;
}

export async function safeAdmin(): Promise<boolean> {
  const res = await api.adminMe();
  return !!(res.ok && res.data.admin);
}

export function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

export async function timeCall<T>(fn: () => Promise<ApiResponse<T>>): Promise<{ ok: boolean; ms: number; status: number; data?: T; error?: string }> {
  const started = nowMs();
  try {
    const res = await fn();
    const ms = nowMs() - started;
    return { ok: res.ok, ms, status: res.status, data: res.data, error: res.ok ? undefined : String((res.data as any)?.error ?? `HTTP ${res.status}`) };
  } catch (e) {
    return { ok: false, ms: nowMs() - started, status: 0, error: e instanceof Error ? e.message : "Network error" };
  }
}

export function fmtMs(v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v < 1000 ? `${Math.round(v)} ms` : `${(v / 1000).toFixed(2)} s`;
}

export function fmtNum(v: number | undefined, digits = 0): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function latencyStats(values: number[]) {
  const s = statsOf(values.map((v) => ({ v })));
  const jitter = values.length < 2 ? 0 : values.slice(1).reduce((sum, v, i) => sum + Math.abs(v - values[i]), 0) / (values.length - 1);
  return { ...s, p95: percentile(values, 95), jitter };
}

export function payloadSummary(payload: unknown): string {
  if (!payload || typeof payload !== "object") return String(payload ?? "empty");
  const entries = Object.entries(payload as Record<string, unknown>).slice(0, 4);
  if (!entries.length) return "empty object";
  return entries.map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ");
}

export function pretty(value: unknown): string {
  try { return JSON.stringify(value, null, 2); } catch { return String(value); }
}

export function deviceRoom(d: Pick<Device, "room">): string {
  return d.room?.trim() || "Unassigned";
}

export function normalizeAdminDevice(d: AdminDevice): Device {
  return { id: d.id, type: d.type, name: d.name, room: d.room, online: d.online, last_seen: d.last_seen, state: d.state as Record<string, any>, fw_version: d.fw_version };
}

export function statusOfDevice(d: Pick<Device, "online" | "last_seen">, staleAfterMs = 15 * 60_000): "online" | "stale" | "offline" {
  if (!d.online) return "offline";
  const seen = d.last_seen ? new Date(d.last_seen).getTime() : NaN;
  return Number.isFinite(seen) && Date.now() - seen > staleAfterMs ? "stale" : "online";
}

export function Page({ children, pad = true }: { children: React.ReactNode; pad?: boolean }) {
  return <ScrollView contentContainerStyle={{ padding: pad ? 16 : 0, paddingBottom: 40 }}>{children}</ScrollView>;
}

export function StateBox({ state, error, onRetry, empty, children }: { state: LoadState; error?: string; onRetry: () => void; empty?: boolean; children: React.ReactNode }) {
  if (state === "loading") return <LoadingState text="Loading diagnostics…" />;
  if (state === "error") return <ErrorState text={error || "Unable to load diagnostics."} onRetry={onRetry} />;
  if (empty) return <EmptyState icon="debug" title="No diagnostic data" subtitle="Refresh after devices have reported telemetry." actionLabel="Refresh" onAction={onRetry} />;
  return <>{children}</>;
}

export function RowButton({ title, subtitle, icon = "device", right, onPress, style }: { title: string; subtitle?: string; icon?: IconName; right?: React.ReactNode; onPress: () => void; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={title} style={({ pressed }) => [{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, opacity: pressed ? 0.75 : 1 }, style]}>
    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: c.surfaceHi, alignItems: "center", justifyContent: "center" }}><Icon name={icon} size={18} color={c.accentHi} /></View>
    <View style={{ flex: 1 }}><Text style={{ color: c.text, fontWeight: "800" }} numberOfLines={1}>{title}</Text>{subtitle ? <Text style={{ color: c.faint, fontSize: 12, marginTop: 2 }} numberOfLines={1}>{subtitle}</Text> : null}</View>
    {right ?? <Icon name="chevron" size={18} color={c.faint} />}
  </Pressable>;
}

export function DeviceList({ devices, onPick, selectedId }: { devices: Device[]; onPick: (d: Device) => void; selectedId?: string }) {
  const { c } = useTheme();
  if (!devices.length) return <EmptyState icon="devices" title="No devices" subtitle="Diagnostics need real devices from the control plane." />;
  return <Card padded>{devices.map((d, i) => <View key={d.id} style={i ? { borderTopWidth: 1, borderTopColor: c.border } : undefined}>
    <RowButton title={d.name || d.id} subtitle={`${d.type} · ${deviceRoom(d)} · last seen ${formatRelative(d.last_seen)}`} icon="device" onPress={() => onPick(d)} right={<View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><StatusDot ok={d.online} />{selectedId === d.id ? <Icon name="check" size={18} color={c.green} /> : <Icon name="chevron" size={18} color={c.faint} />}</View>} />
  </View>)}</Card>;
}

export function StatsGrid({ values }: { values: { label: string; value: string; icon?: IconName }[] }) {
  return <Card padded style={{ marginBottom: 12 }}>{values.map((x, i) => <MetricRow key={x.label} label={x.label} value={x.value} icon={x.icon} last={i === values.length - 1} />)}</Card>;
}

export function Histogram({ values, bins = 8 }: { values: number[]; bins?: number }) {
  const { c } = useTheme();
  if (!values.length) return <EmptyState icon="charts" title="No gaps yet" subtitle="At least two timestamped frames are required." />;
  const max = Math.max(...values); const min = Math.min(...values); const width = Math.max(1, (max - min) / bins); const counts = Array.from({ length: bins }, () => 0);
  values.forEach((v) => counts[Math.min(bins - 1, Math.floor((v - min) / width))]++);
  return <View><BarChart data={counts} color={c.cyan} height={130} /><Text style={{ color: c.faint, fontSize: 12 }}>Histogram of real inter-arrival gaps from telemetry timestamps, {fmtMs(min)} to {fmtMs(max)}.</Text></View>;
}

export function telemetryGaps(rows: TelemetryRow[]): number[] {
  const times = rows.map((r) => new Date(r.ts).getTime()).filter(Number.isFinite).sort((a, b) => a - b);
  const gaps: number[] = [];
  for (let i = 1; i < times.length; i++) gaps.push(times[i] - times[i - 1]);
  return gaps;
}

export function AdminNote({ admin }: { admin: boolean }) {
  return <Pill label={admin ? "Admin endpoints" : "User endpoints"} icon={admin ? "admin" : "profile"} filled={admin} />;
}

export { ActionButton, MetricRow, formatDateTime };
