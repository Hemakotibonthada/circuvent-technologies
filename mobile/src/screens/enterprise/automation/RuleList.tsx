import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import type { Automation } from "../../../api";
import { Icon } from "../../../icons";
import { Screen, ToastHost, useTheme, useToast, EmptyState } from "../../../ui";
import { ActionButton, ConfirmDialog, FilterBar, Kpi, KpiGrid, ScreenHeader, SearchField, SeverityBadge, TabStrip } from "../../../enterprise-ui";
import RuleBuilder from "./RuleBuilder";
import { humanizeAutomation } from "./humanize";
import { ScreenScaffold, SectionCard, SmallButton } from "./parts";
import { duplicateAutomation, safeJson } from "./types";
import { useRules } from "./useRules";

type Filter = "all" | "enabled" | "disabled" | "state" | "time";

export default function RuleList({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const state = useRules();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<Automation | "new" | null>(null);
  const [confirm, setConfirm] = useState<Automation | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const rows = useMemo(() => state.automations.filter((r) => {
    const text = `${r.name} ${humanizeAutomation(r, state.devices)} ${safeJson(r)}`.toLowerCase();
    if (q && !text.includes(q.toLowerCase())) return false;
    if (filter === "enabled") return r.enabled;
    if (filter === "disabled") return !r.enabled;
    if (filter === "state" || filter === "time") return r.trigger.type === filter;
    return true;
  }), [state.automations, state.devices, q, filter]);

  const counts = useMemo(() => ({ all: state.automations.length, enabled: state.automations.filter((r) => r.enabled).length, disabled: state.automations.filter((r) => !r.enabled).length, state: state.automations.filter((r) => r.trigger.type === "state").length, time: state.automations.filter((r) => r.trigger.type === "time").length }), [state.automations]);

  if (editing) return <RuleBuilder onBack={() => { setEditing(null); void state.reload(); }} initial={editing === "new" ? undefined : editing} />;

  const toggle = async (r: Automation) => {
    setBusyId(r.id);
    try { await state.setEnabled(r, !r.enabled); toast.show(!r.enabled ? "Rule enabled" : "Rule disabled"); }
    catch (e) { toast.show(e instanceof Error ? e.message : "Could not update rule"); }
    finally { setBusyId(null); }
  };

  const duplicate = async (r: Automation) => {
    setBusyId(r.id);
    try { await state.saveRule(duplicateAutomation(r)); toast.show("Rule duplicated"); }
    catch (e) { toast.show(e instanceof Error ? e.message : "Could not duplicate rule"); }
    finally { setBusyId(null); }
  };

  return (
    <Screen>
      <ScreenHeader title="Automation Rules" subtitle="Search, audit and maintain server rules" onBack={onBack} actions={[{ icon: "add", label: "Create rule", onPress: () => setEditing("new") }, { icon: "refresh", label: "Reload", onPress: state.reload }]} />
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <ScreenScaffold loading={state.loading} error={state.error} onRetry={state.reload}>
          <View style={{ paddingHorizontal: 16 }}>
            <KpiGrid><Kpi icon="rules" label="Total" value={counts.all} /><Kpi icon="power" label="Enabled" value={counts.enabled} tint={c.green} /><Kpi icon="pause" label="Disabled" value={counts.disabled} tint={c.amber} /><Kpi icon="trigger" label="State / Time" value={`${counts.state}/${counts.time}`} /></KpiGrid>
            <SearchField value={q} onChange={setQ} placeholder="Search rules, devices, fields or raw payload" />
          </View>
          <FilterBar value={filter} onChange={setFilter} counts={counts} options={[{ value: "all", label: "All", icon: "list" }, { value: "enabled", label: "Enabled", icon: "check", color: c.green }, { value: "disabled", label: "Disabled", icon: "pause", color: c.amber }, { value: "state", label: "State", icon: "sensors" }, { value: "time", label: "Time", icon: "clock" }]} />
          <View style={{ paddingHorizontal: 16 }}>
            {!rows.length ? <EmptyState title="No rules match" subtitle="Create a rule or clear the filters. No sample automations are invented here." actionLabel="Create rule" onAction={() => setEditing("new")} /> : rows.map((r) => <RuleRow key={r.id} rule={r} sentence={humanizeAutomation(r, state.devices)} busy={busyId === r.id} onToggle={() => void toggle(r)} onEdit={() => setEditing(r)} onDuplicate={() => void duplicate(r)} onDelete={() => setConfirm(r)} />)}
            <ActionButton label="Create automation" icon="add" onPress={() => setEditing("new")} />
          </View>
        </ScreenScaffold>
      </ScrollView>
      <ConfirmDialog visible={!!confirm} title="Delete automation?" message={confirm ? `Delete “${confirm.name}”? This cannot be undone.` : ""} destructive confirmLabel="Delete" busy={busyId === confirm?.id} onCancel={() => setConfirm(null)} onConfirm={async () => { if (!confirm) return; setBusyId(confirm.id); try { await state.removeRule(confirm); toast.show("Rule deleted"); setConfirm(null); } catch (e) { toast.show(e instanceof Error ? e.message : "Delete failed"); } finally { setBusyId(null); } }} />
      <ToastHost toast={toast.toast} onHide={toast.hide} />
    </Screen>
  );
}

function RuleRow({ rule, sentence, busy, onToggle, onEdit, onDuplicate, onDelete }: { rule: Automation; sentence: string; busy: boolean; onToggle: () => void; onEdit: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const { c } = useTheme();
  return <SectionCard title={rule.name || `Rule ${rule.id}`} icon={rule.trigger.type === "time" ? "clock" : "trigger"} right={<SeverityBadge severity={rule.enabled ? "success" : "warning"} label={rule.enabled ? "Enabled" : "Disabled"} />}>
    <Text style={{ color: c.text, fontSize: 14, lineHeight: 21, marginBottom: 12 }}>{sentence}</Text>
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      <SmallButton label={rule.enabled ? "Disable" : "Enable"} icon={rule.enabled ? "pause" : "play"} onPress={onToggle} disabled={busy} />
      <SmallButton label="Edit" icon="edit" onPress={onEdit} />
      <SmallButton label="Duplicate" icon="copy" onPress={onDuplicate} disabled={busy} />
      <SmallButton label="Delete" icon="trash" danger onPress={onDelete} />
    </View>
  </SectionCard>;
}
