import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text } from "react-native";
import type { Automation } from "../../../api";
import { Screen, useTheme, EmptyState } from "../../../ui";
import { Callout, Kpi, KpiGrid, ScreenHeader, TabStrip } from "../../../enterprise-ui";
import RuleBuilder from "./RuleBuilder";
import { humanizeAction } from "./humanize";
import { ScreenScaffold, SectionCard } from "./parts";
import { asHHMM, deviceName, minutesOf } from "./types";
import { useRules } from "./useRules";

type ViewMode = "day" | "week" | "conflicts";
interface Slot { minute: number; rules: Automation[]; conflict: boolean; key: string }

export default function SchedulePlanner({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const state = useRules();
  const [mode, setMode] = useState<ViewMode>("day");
  const [editing, setEditing] = useState<Automation | null>(null);
  const timed = useMemo(() => state.automations.filter((r) => r.trigger.type === "time" && minutesOf(r.trigger.at) >= 0), [state.automations]);
  const slots = useMemo<Slot[]>(() => {
    const map = new Map<number, Automation[]>();
    timed.forEach((r) => { const m = minutesOf(r.trigger.at); map.set(m, [...(map.get(m) || []), r]); });
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([minute, rules]) => {
      const targets = new Map<string, number>();
      rules.forEach((r) => { if (r.action.type === "command" && r.action.deviceId) targets.set(r.action.deviceId, (targets.get(r.action.deviceId) || 0) + 1); });
      return { minute, rules, conflict: [...targets.values()].some((n) => n > 1), key: String(minute) };
    });
  }, [timed]);
  const conflicts = slots.filter((s) => s.conflict);
  if (editing) return <RuleBuilder onBack={() => { setEditing(null); void state.reload(); }} initial={editing} />;
  return <Screen><ScreenHeader title="Schedule Planner" subtitle="Real time automations across 24 hours" onBack={onBack} actions={[{ icon: "refresh", label: "Reload", onPress: state.reload }]} />
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}><ScreenScaffold loading={state.loading} error={state.error} onRetry={state.reload}>
      <KpiGrid><Kpi icon="clock" label="Timed rules" value={timed.length} /><Kpi icon="warning" label="Conflicts" value={conflicts.length} tint={conflicts.length ? c.red : c.green} /><Kpi icon="devices" label="Command targets" value={new Set(timed.map((r) => r.action.type === "command" ? r.action.deviceId : undefined).filter(Boolean)).size} /></KpiGrid>
      <TabStrip value={mode} onChange={setMode} tabs={[{ value: "day", label: "24h", icon: "clock" }, { value: "week", label: "Weekly", icon: "calendar" }, { value: "conflicts", label: "Conflicts", icon: "warning" }]} />
      {mode === "conflicts" && <Callout kind={conflicts.length ? "warning" : "success"} title="Conflict detection" text={conflicts.length ? "Two or more rules command the same device at the same minute. Tap a rule to edit." : "No same-minute command conflicts were found."} icon="warning" />}
      {!slots.length ? <EmptyState title="No time automations" subtitle="Only rules whose trigger.type is time appear here." /> : (mode === "conflicts" ? conflicts : slots).map((slot) => <SectionCard key={slot.key} title={asHHMM(slot.minute)} icon={slot.conflict ? "warning" : "clock"} right={<Text style={{ color: slot.conflict ? c.red : c.faint, fontWeight: "900" }}>{slot.rules.length}</Text>}>
        {slot.rules.map((r) => <Pressable key={r.id} onPress={() => setEditing(r)} accessibilityRole="button" accessibilityLabel={`Edit ${r.name}`} style={({ pressed }) => ({ minHeight: 54, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}><Text style={{ color: c.text, fontWeight: "800" }}>{r.name}</Text><Text style={{ color: c.faint, fontSize: 12, marginTop: 2 }}>{humanizeAction(r.action, state.devices)}{r.action.type === "command" ? ` · ${deviceName(state.devices, r.action.deviceId)}` : ""}</Text></Pressable>)}
      </SectionCard>)}
      {mode === "week" && <Callout kind="info" text="The automation contract has no day-of-week field, so every time rule is treated as daily and repeated across the weekly view." icon="calendar" />}
    </ScreenScaffold></ScrollView></Screen>;
}
