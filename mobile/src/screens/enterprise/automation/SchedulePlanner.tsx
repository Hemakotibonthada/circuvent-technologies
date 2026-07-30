import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text } from "react-native";
import { actionList, type Automation } from "../../../api";
import { Screen, useTheme, EmptyState } from "../../../ui";
import { Callout, Kpi, KpiGrid, ScreenHeader, TabStrip } from "../../../enterprise-ui";
import RuleBuilder from "./RuleBuilder";
import { humanizeActions, daysText, runsOnDay } from "./humanize";
import { ScreenScaffold, SectionCard } from "./parts";
import { asHHMM, deviceName, minutesOf } from "./types";
import { useRules } from "./useRules";

type ViewMode = "day" | "week" | "conflicts";
interface Slot { minute: number; rules: Automation[]; conflict: boolean; key: string }

const WEEKDAYS = [
  { value: 1, label: "Mon" }, { value: 2, label: "Tue" }, { value: 3, label: "Wed" },
  { value: 4, label: "Thu" }, { value: 5, label: "Fri" }, { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
];

export default function SchedulePlanner({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const state = useRules();
  const [mode, setMode] = useState<ViewMode>("day");
  const [weekday, setWeekday] = useState<number>(() => new Date().getDay());
  const [editing, setEditing] = useState<Automation | null>(null);
  const timed = useMemo(() => state.automations.filter((r) => r.trigger.type === "time" && minutesOf(r.trigger.at) >= 0), [state.automations]);

  // In the weekly view only the rules that actually run on the chosen day are
  // listed. This screen used to say the contract had no day-of-week field and
  // show every rule on every day, which stopped being true once schedules grew
  // a day filter.
  const visible = useMemo(
    () => (mode === "week" ? timed.filter((r) => runsOnDay(r.trigger, weekday)) : timed),
    [timed, mode, weekday],
  );

  const slots = useMemo<Slot[]>(() => {
    const map = new Map<number, Automation[]>();
    visible.forEach((r) => { const m = minutesOf(r.trigger.at); map.set(m, [...(map.get(m) || []), r]); });
    return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([minute, rules]) => {
      const targets = new Map<string, number>();
      // A sequence can command several devices, so every command step counts
      // towards a same-minute conflict, not just the first action.
      rules.forEach((r) => actionList(r.action).forEach((s) => { if (s.type === "command" && s.deviceId) targets.set(s.deviceId, (targets.get(s.deviceId) || 0) + 1); }));
      return { minute, rules, conflict: [...targets.values()].some((n) => n > 1), key: String(minute) };
    });
  }, [visible]);
  const conflicts = slots.filter((s) => s.conflict);
  if (editing) return <RuleBuilder onBack={() => { setEditing(null); void state.reload(); }} initial={editing} />;
  return <Screen><ScreenHeader title="Schedule Planner" subtitle="Real time automations across 24 hours" onBack={onBack} actions={[{ icon: "refresh", label: "Reload", onPress: state.reload }]} />
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}><ScreenScaffold loading={state.loading} error={state.error} onRetry={state.reload}>
      <KpiGrid><Kpi icon="clock" label="Timed rules" value={timed.length} /><Kpi icon="warning" label="Conflicts" value={conflicts.length} tint={conflicts.length ? c.red : c.green} /><Kpi icon="devices" label="Command targets" value={new Set(timed.flatMap((r) => actionList(r.action).filter((s) => s.type === "command").map((s) => s.deviceId)).filter(Boolean)).size} /></KpiGrid>
      <TabStrip value={mode} onChange={setMode} tabs={[{ value: "day", label: "24h", icon: "clock" }, { value: "week", label: "Weekly", icon: "calendar" }, { value: "conflicts", label: "Conflicts", icon: "warning" }]} />
      {mode === "week" && <TabStrip value={String(weekday)} onChange={(v) => setWeekday(Number(v))} tabs={WEEKDAYS.map((d) => ({ value: String(d.value), label: d.label, icon: "calendar" }))} />}
      {mode === "conflicts" && <Callout kind={conflicts.length ? "warning" : "success"} title="Conflict detection" text={conflicts.length ? "Two or more rules command the same device at the same minute. Tap a rule to edit." : "No same-minute command conflicts were found."} icon="warning" />}
      {!slots.length ? <EmptyState title={mode === "week" ? "Nothing scheduled on this day" : "No time automations"} subtitle={mode === "week" ? "No rule runs on the selected weekday." : "Only rules whose trigger.type is time appear here."} /> : (mode === "conflicts" ? conflicts : slots).map((slot) => <SectionCard key={slot.key} title={asHHMM(slot.minute)} icon={slot.conflict ? "warning" : "clock"} right={<Text style={{ color: slot.conflict ? c.red : c.faint, fontWeight: "900" }}>{slot.rules.length}</Text>}>
        {slot.rules.map((r) => <Pressable key={r.id} onPress={() => setEditing(r)} accessibilityRole="button" accessibilityLabel={`Edit ${r.name}`} style={({ pressed }) => ({ minHeight: 54, paddingVertical: 8, opacity: pressed ? 0.7 : 1 })}><Text style={{ color: c.text, fontWeight: "800" }}>{r.name}</Text><Text style={{ color: c.faint, fontSize: 12, marginTop: 2 }}>{daysText(r.trigger.days)} · {humanizeActions(r.action, state.devices)}</Text></Pressable>)}
      </SectionCard>)}
      {mode === "week" && <Callout kind="info" text="Only rules that run on the selected day are listed. Rules without a day filter run daily. Times are IST, the control plane's clock." icon="calendar" />}
    </ScreenScaffold></ScrollView></Screen>;
}
