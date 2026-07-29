import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Card, EmptyState, ErrorState, useTheme } from "../../../ui";
import { Icon, type IconName } from "../../../icons";
import { LoadingState, MetricRow, SeverityBadge } from "../../../enterprise-ui";
import { formatKwh, formatMoney, formatWatts, pct, type Tariff } from "../../../enterprise";

export const ESTIMATE_NOTE = "Estimate based on your tariff settings; not a billed amount.";

export function ScreenBody({ children }: { children: React.ReactNode }) {
  return <View style={styles.body}>{children}</View>;
}

export function InlineLoading({ text }: { text?: string }) {
  return (
    <View style={{ padding: 16 }}>
      <LoadingState text={text ?? "Loading energy data…"} />
    </View>
  );
}

export function InlineError({ text, onRetry }: { text: string; onRetry: () => void }) {
  return (
    <View style={{ padding: 16 }}>
      <ErrorState text={text} onRetry={onRetry} />
    </View>
  );
}

export function HonestEmpty({ title, subtitle, icon = "empty", actionLabel, onAction }: { title: string; subtitle: string; icon?: IconName; actionLabel?: string; onAction?: () => void }) {
  return <EmptyState icon={icon} title={title} subtitle={subtitle} actionLabel={actionLabel} onAction={onAction} />;
}

export function SectionCard({ title, subtitle, icon, children, action }: { title: string; subtitle?: string; icon?: IconName; children: React.ReactNode; action?: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Card padded style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
        {icon ? <Icon name={icon} size={18} color={c.accentHi} /> : null}
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.text, fontSize: 16, fontWeight: "900" }}>{title}</Text>
          {subtitle ? <Text style={{ color: c.faint, fontSize: 12, marginTop: 2 }}>{subtitle}</Text> : null}
        </View>
        {action}
      </View>
      {children}
    </Card>
  );
}

export function MiniStat({ label, value, icon, tint }: { label: string; value: string; icon?: IconName; tint?: string }) {
  const { c } = useTheme();
  return (
    <View style={[styles.mini, { backgroundColor: c.surfaceHi, borderColor: c.border }]}> 
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {icon ? <Icon name={icon} size={14} color={tint ?? c.textDim} /> : null}
        <Text style={{ color: c.faint, fontSize: 11, fontWeight: "800" }}>{label.toUpperCase()}</Text>
      </View>
      <Text style={{ color: tint ?? c.text, fontSize: 18, fontWeight: "900", marginTop: 5 }} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export function StatWrap({ children }: { children: React.ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 4 }}>{children}</View>;
}

export function LegendText({ items }: { items: { name: string; value: string; color: string }[] }) {
  const { c } = useTheme();
  if (!items.length) return null;
  return (
    <View style={{ gap: 6, marginTop: 10 }}>
      {items.map((it) => (
        <View key={it.name} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: it.color }} />
          <Text style={{ color: c.textDim, fontSize: 12, flex: 1 }}>{it.name}</Text>
          <Text style={{ color: c.text, fontSize: 12, fontWeight: "800" }}>{it.value}</Text>
        </View>
      ))}
    </View>
  );
}

export function DevicePowerRow({ name, type, watts, online, onPress }: { name: string; type: string; watts: number | null; online: boolean; onPress: () => void }) {
  const { c } = useTheme();
  const label = watts == null ? "No power reading" : formatWatts(watts);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}, ${label}`}
      style={({ pressed }) => [styles.row, { borderColor: c.border, backgroundColor: c.card, opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={[styles.iconBox, { backgroundColor: c.surfaceHi }]}> 
        <Icon name="meter" size={18} color={watts && watts > 0 ? c.accentHi : c.faint} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c.text, fontWeight: "800", fontSize: 14 }} numberOfLines={1}>{name}</Text>
        <Text style={{ color: c.faint, fontSize: 12 }} numberOfLines={1}>{type} · {online ? "online" : "offline"}</Text>
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <Text style={{ color: watts == null ? c.faint : watts > 0 ? c.text : c.textDim, fontWeight: "900" }}>{label}</Text>
        <SeverityBadge severity={online ? "success" : "info"} label={online ? "live" : "offline"} />
      </View>
    </Pressable>
  );
}

export function MoneyEstimateRow({ tariff, kwh, label = "Estimated cost" }: { tariff: Tariff; kwh: number; label?: string }) {
  const { c } = useTheme();
  return (
    <View>
      <MetricRow label={label} value={formatMoney(tariff, kwh)} icon="cost" tint={c.amber} />
      <Text style={{ color: c.faint, fontSize: 11, marginTop: -7, marginBottom: 8 }}>{ESTIMATE_NOTE}</Text>
    </View>
  );
}

export function PercentPill({ value, total }: { value: number; total: number }) {
  const { c } = useTheme();
  return <Text style={{ color: c.textDim, fontWeight: "800" }}>{pct(value, total).toFixed(1)}%</Text>;
}

export function UsageLine({ name, watts, tariff, total }: { name: string; watts: number; tariff: Tariff; total: number }) {
  const { c } = useTheme();
  const hourlyKwh = watts / 1000;
  return (
    <View style={{ paddingVertical: 8, borderBottomColor: c.border, borderBottomWidth: StyleSheet.hairlineWidth }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ color: c.text, fontWeight: "800", flex: 1 }} numberOfLines={1}>{name}</Text>
        <Text style={{ color: c.textDim }}>{formatWatts(watts)}</Text>
      </View>
      <Text style={{ color: c.faint, fontSize: 12, marginTop: 2 }}>
        {pct(watts, total).toFixed(1)}% of current demand · est. {formatMoney(tariff, hourlyKwh)} per hour
      </Text>
    </View>
  );
}

export function formatMaybeKwh(kwh: number): string {
  return Number.isFinite(kwh) && kwh > 0 ? formatKwh(kwh) : "No kWh reported";
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 16, paddingBottom: 28 },
  mini: { flex: 1, minWidth: 145, borderWidth: 1, borderRadius: 16, padding: 12 },
  row: { minHeight: 64, borderWidth: 1, borderRadius: 16, padding: 12, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 8 },
  iconBox: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center" },
});
