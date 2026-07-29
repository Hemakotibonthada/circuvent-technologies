import React from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View, Pressable } from "react-native";
import { Screen, useTheme, EmptyState, ErrorState, Card } from "../../../ui";
import { Icon, type IconName } from "../../../icons";
import { ScreenHeader, ActionButton, Callout, MetricRow, Pill } from "../../../enterprise-ui";
import { formatDateTime, formatRelative, type Severity } from "../../../enterprise";
import type { AdminIdentity } from "./useAdmin";

export function AdminScreenFrame({
  title,
  subtitle,
  onBack,
  children,
  refreshing,
  onRefresh,
  actions,
}: {
  title: string;
  subtitle?: string;
  onBack: () => void;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  actions?: { icon: IconName; label: string; onPress: () => void }[];
}) {
  const { c } = useTheme();
  return (
    <Screen>
      <ScreenHeader title={title} subtitle={subtitle} onBack={onBack} actions={actions} sticky />
      <ScrollView
        refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={c.accent} /> : undefined}
        contentContainerStyle={styles.content}
      >
        {children}
      </ScrollView>
    </Screen>
  );
}

export function GateState({ kind, onBack, onRetry }: { kind: "loading" | "denied" | "error"; onBack: () => void; onRetry?: () => void }) {
  return (
    <Screen>
      <ScreenHeader title="Administration" subtitle="Governance controls" onBack={onBack} sticky />
      <View style={styles.stateWrap}>
        {kind === "loading" ? (
          <EmptyState icon="admin" title="Checking administrator access" subtitle="Verifying the signed-in account before loading control-plane data." />
        ) : kind === "denied" ? (
          <EmptyState icon="shieldLock" title="Administrator access required" subtitle="The server rejected this request. Sign in with an account whose real is_admin flag is enabled." />
        ) : (
          <ErrorState text="Unable to load administration data from the control plane." onRetry={onRetry} />
        )}
      </View>
    </Screen>
  );
}

export function ScreenGate<T>({ state, onBack, onRetry, children }: { state: { status: string; data: T | null; error: string | null }; onBack: () => void; onRetry: () => void; children: (data: T) => React.ReactNode }) {
  if (state.status === "loading") return <GateState kind="loading" onBack={onBack} />;
  if (state.status === "denied") return <GateState kind="denied" onBack={onBack} />;
  if (state.status === "error" || !state.data) return <GateState kind="error" onBack={onBack} onRetry={onRetry} />;
  return <>{children(state.data)}</>;
}

export function SourceNote({ text }: { text: string }) {
  const { c } = useTheme();
  return <Text style={{ color: c.faint, fontSize: 12, lineHeight: 17, marginBottom: 10 }}>{text}</Text>;
}

export function SectionTitle({ icon, title, subtitle }: { icon?: IconName; title: string; subtitle?: string }) {
  const { c } = useTheme();
  return (
    <View style={styles.sectionTitle}>
      {icon ? <Icon name={icon} size={17} color={c.accentHi} /> : null}
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontSize: 16, fontWeight: "900" }}>{title}</Text>
        {subtitle ? <Text style={{ color: c.faint, fontSize: 12, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
    </View>
  );
}

export function QuickLink({ icon, title, subtitle, onPress }: { icon: IconName; title: string; subtitle: string; onPress?: () => void }) {
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={title}
      style={({ pressed }) => [styles.quick, { backgroundColor: c.card, borderColor: c.border, opacity: pressed ? 0.82 : onPress ? 1 : 0.55 }]}
    >
      <Icon name={icon} size={20} color={c.accentHi} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: c.text, fontWeight: "800" }}>{title}</Text>
        <Text style={{ color: c.faint, fontSize: 12, marginTop: 1 }}>{subtitle}</Text>
      </View>
      <Icon name="chevron" size={16} color={c.faint} />
    </Pressable>
  );
}

export function IdentityCard({ me }: { me: AdminIdentity }) {
  return (
    <Card style={{ marginBottom: 12 }}>
      <MetricRow label="Signed-in administrator" value={me.email} icon="profile" />
      <MetricRow label="User id" value={String(me.uid)} icon="keyVariant" mono last />
    </Card>
  );
}

export function JsonSheetBody({ value }: { value: unknown }) {
  return <Text selectable>{JSON.stringify(value, null, 2)}</Text>;
}

export function HonestRbacCallout({ onUserManagement }: { onUserManagement?: () => void }) {
  return (
    <Callout
      kind="warning"
      icon="shieldLock"
      title="Server enforcement is admin vs standard only"
      text="Circuvent currently enforces one real authorisation bit on the server: is_admin. The richer labels below are stored on this device and shape app presentation; do not treat them as permission grants or a security boundary."
      action={onUserManagement ? { label: "Change the real admin flag in User Management", onPress: onUserManagement } : undefined}
    />
  );
}

export function EventSourcePill({ label, severity }: { label: string; severity: Severity }) {
  return <Pill label={label} icon={severity === "critical" ? "alert" : severity === "warning" ? "warning" : severity === "success" ? "success" : "info"} />;
}

export function timestampLine(source: string, window: string) {
  return `${source}. Generated ${formatDateTime(new Date())}. Window: ${window}.`;
}

export function ownerLabel(email: string | null, id: number | null) {
  if (email) return email;
  if (id != null) return `User ${id}`;
  return "Unassigned";
}

export function shortDate(ts: string | null | undefined) {
  return ts ? `${formatRelative(ts)} (${formatDateTime(ts)})` : "never";
}

export const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  stateWrap: { flex: 1, justifyContent: "center", padding: 16 },
  sectionTitle: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, marginBottom: 10 },
  quick: { minHeight: 64, borderRadius: 16, borderWidth: 1, padding: 12, flexDirection: "row", gap: 12, alignItems: "center", marginBottom: 10 },
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
});
