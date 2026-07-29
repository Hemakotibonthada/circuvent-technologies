import React, { useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api } from "../../../api";
import type { Automation, AutomationBody, Device } from "../../../api";
import { useTheme } from "../../../ui";
import { ActionButton, BottomSheet, Callout, CodeBlock, ConfirmDialog, DataGrid, SelectField, TextField, ToggleField, Kpi, KpiGrid, Pill } from "../../../enterprise-ui";
import { formatRelative } from "../../../enterprise";
import { useSecurityData } from "./useSecurity";
import { DetailRows, HonestEmpty, rawJson, SecurityScaffold, Section } from "./parts";
import { automationDeviceNames, deriveZones, isSecurityAutomation, type ArmMode } from "./zones";

type Template = "motion-away" | "door-after-dark" | "contact-armed";

function firstDevice(devices: Device[], predicate: (d: Device) => boolean): Device | undefined { return devices.find(predicate) ?? devices[0]; }

export function SecurityRules({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const data = useSecurityData(true);
  const [template, setTemplate] = useState<Template>("motion-away");
  const [name, setName] = useState("Security notification");
  const [selected, setSelected] = useState<Automation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Automation | null>(null);
  const [busy, setBusy] = useState(false);
  const securityRules = useMemo(() => data.automations.filter((a) => isSecurityAutomation(a, data.devices)), [data.automations, data.devices]);
  const zones = useMemo(() => deriveZones(data.devices), [data.devices]);
  const motion = firstDevice(data.securityDevices, (d) => zones.some((z) => z.deviceId === d.id && z.kind === "motion"));
  const contact = firstDevice(data.securityDevices, (d) => zones.some((z) => z.deviceId === d.id && z.kind === "contact"));
  const light = data.devices.find((d) => /light|touchboard|hub/i.test(`${d.type} ${d.name}`));

  const localArmHits = useMemo(() => {
    if (!["away", "home", "night"].includes(data.config.arm.mode)) return [];
    return zones.filter((z) => !data.config.bypassedZones[z.id] && (z.status === "active" || z.status === "unlocked"));
  }, [data.config.arm.mode, data.config.bypassedZones, zones]);

  function bodyFor(t: Template): AutomationBody | null {
    if (t === "motion-away") {
      if (!motion) return null;
      const z = zones.find((x) => x.deviceId === motion.id && x.kind === "motion");
      return { name: name || "Notify when motion while armed away", enabled: true, trigger: { type: "state", deviceId: motion.id, field: z?.field ?? "motion", op: "truthy" }, action: { type: "notify", title: "Motion while armed away", body: "Client-side arm mode must be away; app evaluates the local arm state before treating this as an incident." } };
    }
    if (t === "door-after-dark") {
      if (!contact || !light) return null;
      const z = zones.find((x) => x.deviceId === contact.id && x.kind === "contact");
      return { name: name || "Turn on lights when door unlocks after dark", enabled: true, trigger: { type: "state", deviceId: contact.id, field: z?.field ?? "doorOpen", op: "truthy" }, action: { type: "command", deviceId: light.id, command: { action: "set", on: true } } };
    }
    if (!contact) return null;
    const z = zones.find((x) => x.deviceId === contact.id && x.kind === "contact");
    return { name: name || "Alert if contact opens while armed", enabled: true, trigger: { type: "state", deviceId: contact.id, field: z?.field ?? "contact", op: "truthy" }, action: { type: "notify", title: "Contact opened while armed", body: `Client-side arm mode is ${data.config.arm.mode}; app evaluates this local arm state.` } };
  }

  async function create() {
    const body = bodyFor(template);
    if (!body) return;
    setBusy(true); await api.createAutomation(body); setBusy(false); data.reload();
  }
  async function toggle(a: Automation, enabled: boolean) { setBusy(true); await api.updateAutomation(a.id, { enabled }); setBusy(false); data.reload(); }
  async function remove() { if (!deleteTarget) return; setBusy(true); await api.deleteAutomation(deleteTarget.id); setBusy(false); setDeleteTarget(null); data.reload(); }

  const columns = [
    { key: "name", header: "Rule", width: 220, render: (a: Automation) => <Text style={{ color: c.text, fontWeight: "800" }} numberOfLines={2}>{a.name}</Text>, sortValue: (a: Automation) => a.name },
    { key: "enabled", header: "State", width: 110, render: (a: Automation) => <Pill label={a.enabled ? "Enabled" : "Paused"} color={a.enabled ? c.green : c.faint} icon={a.enabled ? "play" : "pause"} /> },
    { key: "devices", header: "Devices", width: 180, render: (a: Automation) => <Text style={{ color: c.textDim }} numberOfLines={2}>{automationDeviceNames(a, data.devices)}</Text> },
  ];

  return <SecurityScaffold title="Security Rules" subtitle="Real automations with security context" onBack={onBack} loading={data.loading} error={data.error} onRetry={data.reload} onRefresh={data.reload} refreshing={data.refreshing}>
    <Callout kind="info" title="Arm state is local" text="Server automations cannot read the app's local arm intent. Templates that mention arming create real trigger/action payloads and this app evaluates the arm-state condition locally when showing incidents." icon="rules" />
    <KpiGrid><Kpi icon="rules" label="Security rules" value={securityRules.length} /><Kpi icon="play" label="Enabled" value={securityRules.filter((a) => a.enabled).length} tint={c.green} /><Kpi icon="shieldLock" label="Local arm" value={data.config.arm.mode} /></KpiGrid>
    <Section title="Local arm-state evaluation" subtitle="Live zones that would qualify under the current local arm intent" icon="condition">
      {localArmHits.length ? localArmHits.map((z) => <Callout key={z.id} kind="warning" title={z.label} text={`${z.field} is ${String(z.value)} while local arm intent is ${data.config.arm.mode}.`} icon={z.icon} />) : <HonestEmpty icon="condition" title="No local arm hits" subtitle="No active unbypassed security zones currently match the local arm-state evaluation." />}
    </Section>
    <Section title="Guided creator" subtitle="Creates genuine AutomationBody payloads" icon="add">
      <SelectField label="Template" value={template} onChange={setTemplate} options={[{ value: "motion-away", label: "Notify on motion while away", icon: "motion" }, { value: "door-after-dark", label: "Lights on after door opens", icon: "doorOpen" }, { value: "contact-armed", label: "Alert contact while armed", icon: "alert" }]} />
      <TextField label="Rule name" value={name} onChange={setName} placeholder="Visible automation name" />
      {bodyFor(template) ? <CodeBlock label="AutomationBody preview" text={rawJson(bodyFor(template))} /> : <Callout kind="warning" text="Required real devices or fields were not found, so this template cannot be created." icon="warning" />}
      <ActionButton label="Create automation" icon="save" onPress={create} busy={busy} disabled={!bodyFor(template)} />
    </Section>
    <Section title="Existing security automations" icon="rules">
      {securityRules.length ? <DataGrid columns={columns} rows={securityRules} keyOf={(a) => String(a.id)} onRowPress={setSelected} emptyText="No security rules" /> : <HonestEmpty icon="rules" title="No security automations" subtitle="api.automations() returned no security-relevant rules." />}
    </Section>
    <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.name ?? "Rule"}>
      {selected ? <><DetailRows rows={[{ label: "Enabled", value: selected.enabled ? "Enabled" : "Paused", icon: selected.enabled ? "play" : "pause" }, { label: "Devices", value: automationDeviceNames(selected, data.devices), icon: "devices" }, { label: "Created", value: selected.created_at ? formatRelative(selected.created_at) : "Unknown", icon: "clock" }]} /><ToggleField label="Enabled" value={selected.enabled} onChange={(v) => toggle(selected, v)} icon="power" disabled={busy} /><CodeBlock label="Trigger" text={rawJson(selected.trigger)} /><CodeBlock label="Action" text={rawJson(selected.action)} /><View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><ActionButton label="Close" icon="close" outline onPress={() => setSelected(null)} /></View><View style={{ flex: 1 }}><ActionButton label="Delete" icon="trash" tone={c.red} onPress={() => setDeleteTarget(selected)} /></View></View></> : null}
    </BottomSheet>
    <ConfirmDialog visible={!!deleteTarget} title="Delete rule?" message="This deletes the real server automation." confirmLabel="Delete" destructive busy={busy} onConfirm={remove} onCancel={() => setDeleteTarget(null)} />
  </SecurityScaffold>;
}
