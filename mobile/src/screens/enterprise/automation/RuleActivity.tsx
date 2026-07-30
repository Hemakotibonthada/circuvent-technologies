import React, { useEffect, useMemo, useState } from "react";
import { actionList, type Automation } from "../../../api";
import { ScrollView, Text } from "react-native";
import { BarChart } from "../../../charts";
import { formatRelative, severityOf } from "../../../enterprise";
import { Screen, useTheme } from "../../../ui";
import { Callout, EventTimeline, Kpi, KpiGrid, ScreenHeader } from "../../../enterprise-ui";
import { loadActivity, type LocalActivityEntry } from "./activityLog";
import { ScreenScaffold, SectionCard } from "./parts";
import { useEvents, useRules } from "./useRules";

function dayBuckets(items: { ts: string }[]): number[] {
  const out = Array.from({ length: 14 }, () => 0);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - 13 * 86400000;
  items.forEach((x) => { const t = new Date(x.ts).getTime(); const i = Math.floor((t - start) / 86400000); if (i >= 0 && i < out.length) out[i] += 1; });
  return out;
}

export default function RuleActivity({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const events = useEvents(200);
  const rules = useRules();
  const [local, setLocal] = useState<LocalActivityEntry[]>([]);
  const reloadLocal = () => loadActivity().then(setLocal).catch(() => setLocal([]));
  useEffect(() => { reloadLocal(); }, []);
  // A rule may notify from any step of a sequence, not just its first action,
  // so attribution has to consider every notify step it contains.
  const notifiesFor = (r: { action: Automation["action"] }, e: { title: string; body: string }) =>
    actionList(r.action).some((s) => s.type === "notify" && ((s.title && e.title.includes(s.title)) || (s.body && e.body.includes(s.body))));
  const hasNotifyStep = (r: { action: Automation["action"] }) => actionList(r.action).some((s) => s.type === "notify");
  const notifyEvents = useMemo(() => events.events.filter((e) => rules.automations.some((r) => notifiesFor(r, e))), [events.events, rules.automations]);
  const attributed = useMemo(() => notifyEvents.map((e) => ({ event: e, rule: rules.automations.find((r) => notifiesFor(r, e)) })), [notifyEvents, rules.automations]);
  const loading = events.loading || rules.loading;
  const error = events.error || rules.error;
  return <Screen><ScreenHeader title="Rule Activity" subtitle="Observable notifications plus local edit history" onBack={onBack} actions={[{ icon: "refresh", label: "Reload", onPress: () => { void events.reload(); void rules.reload(); reloadLocal(); } }]} />
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}><ScreenScaffold loading={loading} error={error} onRetry={() => { void events.reload(); void rules.reload(); }}>
      <Callout kind="info" title="What is real here" text="The platform does not expose server-side rule firing history. Notification events are the observable proxy for notify actions; create/update/delete/enable/disable entries are recorded locally by this app." icon="info" />
      <KpiGrid><Kpi icon="bell" label="Matched notifications" value={notifyEvents.length} /><Kpi icon="history" label="Local changes" value={local.length} /><Kpi icon="rules" label="Notify rules" value={rules.automations.filter(hasNotifyStep).length} /></KpiGrid>
      <SectionCard title="14-day observable activity" icon="charts"><BarChart data={dayBuckets([...notifyEvents, ...local])} color={c.accentHi} /><Text style={{ color: c.faint, fontSize: 12 }}>Buckets use real event timestamps and local edit timestamps.</Text></SectionCard>
      <SectionCard title="Notification stream attribution" icon="bell"><EventTimeline items={attributed.map(({ event, rule }) => ({ id: String(event.id), title: rule ? `${rule.name}: ${event.title}` : event.title, body: event.body, time: formatRelative(event.ts), severity: severityOf(event.kind), icon: "bell" }))} /></SectionCard>
      <SectionCard title="Local automation edits" icon="audit"><EventTimeline items={local.map((x) => ({ id: x.id, title: `${x.name} · ${x.kind}`, body: x.detail, time: formatRelative(x.ts), severity: x.kind.includes("delete") ? "warning" : x.kind.includes("create") ? "success" : "info", icon: x.kind.includes("scene") ? "scenes" : "rules" }))} /></SectionCard>
    </ScreenScaffold></ScrollView></Screen>;
}
