import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { AdminDevice } from "../../../api";
import { formatRelative, isOutdated } from "../../../enterprise";
import { Card, EmptyState, ErrorState, Skeleton, useTheme } from "../../../ui";
import { ActionButton, Callout, CodeBlock, DataGrid, type GridColumn, LoadingState, MetricRow, Pill, ScreenHeader, SeverityBadge, StatusDot } from "../../../enterprise-ui";
import { Icon, type IconName } from "../../../icons";

export function FleetScaffold({ title, subtitle, onBack, onRefresh, children, actions }: { title: string; subtitle?: string; onBack?: () => void; onRefresh?: () => void; children: React.ReactNode; actions?: { icon: IconName; label: string; onPress: () => void; badge?: number; tint?: string }[] }) {
  return (
    <View style={{ flex: 1 }}>
      <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} actions={[...(onRefresh ? [{ icon: "refresh" as IconName, label: "Refresh", onPress: onRefresh }] : []), ...(actions || [])]} />
      {children}
    </View>
  );
}

export function AccessRequired({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={{ padding: 16 }}>
      <Callout kind="warning" icon="shieldLock" title="Administrator access required" text="Fleet operations use admin-only control-plane endpoints. Sign in as an administrator to view devices, issue firmware rollouts or broadcast commands." action={{ label: "Check again", onPress: onRetry }} />
    </View>
  );
}

export function FleetLoading({ text = "Loading fleet…" }: { text?: string }) {
  return (
    <View style={{ padding: 16, gap: 12 }}>
      <LoadingState text={text} />
      <Skeleton height={90} />
      <Skeleton height={180} />
      <Skeleton height={140} />
    </View>
  );
}

export function FleetError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <ErrorState text={message} onRetry={onRetry} />;
}

export function EmptyFleet({ text = "No devices were returned by the control plane." }: { text?: string }) {
  return <EmptyState icon="fleet" title="No fleet devices" subtitle={text} />;
}

export function SmallText({ children, dim, mono, right }: { children: React.ReactNode; dim?: boolean; mono?: boolean; right?: boolean }) {
  const { c } = useTheme();
  return <Text style={{ color: dim ? c.faint : c.text, fontSize: 12, fontFamily: mono ? "monospace" : undefined, textAlign: right ? "right" : "left" }} numberOfLines={2}>{children}</Text>;
}

export function DeviceNameCell({ device, selected }: { device: AdminDevice; selected?: boolean }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, minWidth: 0 }}>
      {selected ? <Icon name="check" size={16} color={c.accentHi} /> : <StatusDot ok={device.online} pulse={device.online} />}
      <View style={{ minWidth: 0, flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>{device.name || device.id}</Text>
        <Text style={{ color: c.faint, fontSize: 11 }} numberOfLines={1}>{device.online ? "Online" : "Offline"}</Text>
      </View>
    </View>
  );
}

export function firmwarePill(device: AdminDevice, targetVersion: string) {
  const outdated = !!targetVersion && isOutdated(device.fw_version || "", targetVersion);
  return <Pill label={device.fw_version || "unknown"} color={outdated ? undefined : undefined} icon={outdated ? "warning" : "version"} filled={outdated} />;
}

export function inventoryColumns(targetVersion: string, selected: Set<string>): GridColumn<AdminDevice>[] {
  return [
    { key: "name", header: "Device", width: 190, render: (d) => <DeviceNameCell device={d} selected={selected.has(d.id)} />, sortValue: (d) => d.name || d.id },
    { key: "id", header: "Id", width: 170, render: (d) => <SmallText mono>{d.id}</SmallText>, sortValue: (d) => d.id },
    { key: "type", header: "Type", width: 120, render: (d) => <SmallText>{d.type}</SmallText>, sortValue: (d) => d.type },
    { key: "fw", header: "Firmware", width: 135, render: (d) => firmwarePill(d, targetVersion), sortValue: (d) => d.fw_version || "" },
    { key: "room", header: "Room", width: 130, render: (d) => <SmallText dim>{d.room || "—"}</SmallText>, sortValue: (d) => d.room || "" },
    { key: "owner", header: "Owner", width: 190, render: (d) => <SmallText dim>{d.owner_email || "Unassigned"}</SmallText>, sortValue: (d) => d.owner_email || "" },
    { key: "seen", header: "Last seen", width: 120, render: (d) => <SmallText dim>{formatRelative(d.last_seen)}</SmallText>, sortValue: (d) => d.last_seen ? new Date(d.last_seen).getTime() : 0 },
  ];
}

export function DeviceTable({ rows, targetVersion, selected, onRowPress }: { rows: AdminDevice[]; targetVersion: string; selected: Set<string>; onRowPress: (d: AdminDevice) => void }) {
  return <DataGrid columns={inventoryColumns(targetVersion, selected)} rows={rows} keyOf={(d) => d.id} onRowPress={onRowPress} emptyText="No devices match the current filters." maxHeight={520} />;
}

export function DeviceList({ devices, selected, onToggle }: { devices: AdminDevice[]; selected?: Set<string>; onToggle?: (id: string) => void }) {
  const { c } = useTheme();
  if (!devices.length) return <EmptyFleet text="No devices match the current audience." />;
  return (
    <Card padded={false} style={{ overflow: "hidden" }}>
      <ScrollView style={{ maxHeight: 280 }} nestedScrollEnabled>
        {devices.map((d, i) => {
          const checked = !!selected?.has(d.id);
          return (
            <Pressable key={d.id} onPress={() => onToggle?.(d.id)} disabled={!onToggle} accessibilityRole={onToggle ? "checkbox" : "text"} accessibilityLabel={`${d.name || d.id}, ${d.type}`} accessibilityState={onToggle ? { checked } : undefined} style={{ minHeight: 56, padding: 12, borderBottomWidth: i === devices.length - 1 ? 0 : 1, borderBottomColor: c.border, flexDirection: "row", alignItems: "center", gap: 10 }}>
              {onToggle ? <Icon name={checked ? "check" : "device"} size={18} color={checked ? c.accentHi : c.textDim} /> : <StatusDot ok={d.online} />}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: c.text, fontWeight: "800" }} numberOfLines={1}>{d.name || d.id}</Text>
                <Text style={{ color: c.faint, fontSize: 12 }} numberOfLines={1}>{d.id} · {d.type} · {d.fw_version || "unknown firmware"}</Text>
              </View>
              <Text style={{ color: d.online ? c.green : c.faint, fontWeight: "800", fontSize: 12 }}>{d.online ? "online" : "offline"}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Card>
  );
}

export function JsonPreview({ value, label }: { value: unknown; label?: string }) {
  return <CodeBlock label={label} text={typeof value === "string" ? value : JSON.stringify(value, null, 2)} maxHeight={240} />;
}

export function ResultList({ results }: { results: { id: string; ok: boolean; message: string }[] }) {
  if (!results.length) return null;
  return (
    <Card padded style={{ gap: 8 }}>
      {results.map((r) => <MetricRow key={r.id} label={r.id} value={r.message} icon={r.ok ? "success" : "alert"} last={r === results[results.length - 1]} />)}
    </Card>
  );
}

export function DangerBadge({ label }: { label: string }) {
  return <SeverityBadge severity="critical" label={label} />;
}

export function FooterBar({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  return <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.bg, gap: 8 }}>{children}</View>;
}

export function InlineActions({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>;
}

export function TinyAction({ label, icon, onPress, disabled }: { label: string; icon: IconName; onPress: () => void; disabled?: boolean }) {
  return <ActionButton label={label} icon={icon} onPress={onPress} outline disabled={disabled} />;
}

