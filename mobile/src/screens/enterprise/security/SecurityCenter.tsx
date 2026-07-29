import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { useTheme } from "../../../ui";
import { Callout, ConfirmDialog, HeroBand, Kpi, KpiGrid, SelectField, Stepper, ActionButton, Pill, MetricRow, severityColor } from "../../../enterprise-ui";
import { formatDateTime, formatRelative } from "../../../enterprise";
import { useSecurityData } from "./useSecurity";
import { ArmModePill, DeviceStatusRow, HonestEmpty, Section, SecurityScaffold, ZoneRow } from "./parts";
import type { ArmMode } from "./zones";
import { zoneSeverity } from "./zones";

const ARM_OPTIONS: { value: ArmMode; label: string }[] = [
  { value: "disarmed", label: "Disarmed" },
  { value: "home", label: "Home" },
  { value: "away", label: "Away" },
  { value: "night", label: "Night" },
];

export function SecurityCenter({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const data = useSecurityData(false);
  const [pendingMode, setPendingMode] = useState<ArmMode>("away");
  const [reason, setReason] = useState("Operator requested from Security Center");
  const [countdown, setCountdown] = useState<{ mode: ArmMode; remaining: number } | null>(null);
  const [busyArm, setBusyArm] = useState(false);
  const [panicOpen, setPanicOpen] = useState(false);
  const [panicBusy, setPanicBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  useEffect(() => {
    if (!countdown) return;
    if (countdown.remaining <= 0) {
      const mode = countdown.mode;
      setCountdown(null);
      void armNow(mode);
      return;
    }
    const t = setTimeout(() => setCountdown((x) => x ? { ...x, remaining: x.remaining - 1 } : x), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const counts = useMemo(() => {
    let critical = 0, warning = 0, clear = 0, bypassed = 0;
    for (const z of data.zones) {
      const by = !!data.config.bypassedZones[z.id];
      if (by) bypassed++;
      const s = zoneSeverity(z, by);
      if (s === "critical") critical++;
      else if (s === "warning") warning++;
      else if (s === "success") clear++;
    }
    return { critical, warning, clear, bypassed };
  }, [data.zones, data.config.bypassedZones]);

  async function armNow(mode: ArmMode) {
    setBusyArm(true);
    const result = await data.publishArm(mode, reason || "Operator requested from Security Center");
    setBusyArm(false);
    const ok = result.acknowledgedBy.length;
    const fail = result.failedBy.length;
    if (ok === 0 && mode !== "disarmed") setLastResult("No security device acknowledged the arming request. Local mode was not changed.");
    else setLastResult(`${ok} device${ok === 1 ? "" : "s"} acknowledged${fail ? `, ${fail} failed` : ""}.`);
  }

  const startArm = () => {
    const delay = pendingMode === "disarmed" ? 0 : data.config.exitDelaySec;
    if (delay > 0) setCountdown({ mode: pendingMode, remaining: delay });
    else void armNow(pendingMode);
  };

  const saveDelays = async (exitDelaySec: number, entryDelaySec = data.config.entryDelaySec) => {
    await data.saveConfig({ ...data.config, exitDelaySec, entryDelaySec });
  };

  const panic = async () => {
    setPanicBusy(true);
    const res = await data.triggerPanic();
    setPanicBusy(false);
    setPanicOpen(false);
    const ok = res.filter((r) => r.ok).length;
    setLastResult(ok ? `SOS sent to ${ok} alarm-capable device${ok === 1 ? "" : "s"}.` : "No alarm-capable device acknowledged SOS.");
  };

  return <SecurityScaffold title="Security Center" subtitle="Local arming intent and live zones" onBack={onBack} loading={data.loading} error={data.error} onRetry={data.reload} onRefresh={data.reload} refreshing={data.refreshing}>
    <HeroBand label="Local arm intent" value={data.config.arm.mode.toUpperCase()} caption={`Last change: ${data.config.arm.changedAt === new Date(0).toISOString() ? "not changed" : formatRelative(data.config.arm.changedAt)}`} right={<ArmModePill mode={data.config.arm.mode} />} />
    <Callout kind="info" title="Local configuration" text="Arming mode and bypasses are operator-entered app configuration. The app publishes arm/disarm commands to security-capable devices and only updates local intent after at least one device acknowledges." icon="shieldLock" />
    {lastResult ? <Callout kind={lastResult.startsWith("No") ? "warning" : "success"} text={lastResult} icon={lastResult.startsWith("No") ? "warning" : "success"} /> : null}
    {countdown ? <Callout kind="warning" title="Exit delay running" text={`${countdown.remaining}s before ${countdown.mode} arm command is published.`} icon="clock" action={{ label: "Abort countdown", onPress: () => setCountdown(null) }} /> : null}

    <KpiGrid>
      <Kpi icon="sensors" label="Zones" value={data.zones.length} footnote={`${counts.bypassed} bypassed`} />
      <Kpi icon="alert" label="Critical" value={counts.critical} tint={c.red} />
      <Kpi icon="warning" label="Warning" value={counts.warning} tint={c.amber} />
      <Kpi icon="success" label="Clear" value={counts.clear} tint={c.green} />
    </KpiGrid>

    <Section title="Arm or disarm" subtitle="Commands are sent to real security-capable devices" icon="armed">
      <SelectField label="Target arm mode" value={pendingMode} options={ARM_OPTIONS.map((o) => ({ ...o, icon: o.value === "disarmed" ? "disarmed" : "armed" }))} onChange={setPendingMode} help="Away, home and night wait for the configured exit delay before publishing." />
      <SelectField label="Reason" value={reason} options={["Operator requested from Security Center", "Scheduled patrol", "Testing device acknowledgement"].map((v) => ({ value: v, label: v }))} onChange={setReason} />
      <View style={{ flexDirection: "row", gap: 10 }}><View style={{ flex: 1 }}><ActionButton label={pendingMode === "disarmed" ? "Disarm now" : "Start arming"} icon={pendingMode === "disarmed" ? "disarmed" : "armed"} onPress={startArm} busy={busyArm} disabled={!!countdown || data.securityDevices.length === 0} /></View><View style={{ flex: 1 }}><ActionButton label="SOS" icon="sos" tone={c.red} onPress={() => setPanicOpen(true)} disabled={data.alarmDevices.length === 0} /></View></View>
      {data.securityDevices.length === 0 ? <Callout kind="warning" text="No security-capable devices were found from the API, so arming is unavailable." icon="warning" /> : null}
      <MetricRow label="Acknowledged by" value={data.config.arm.acknowledgedBy.length ? data.config.arm.acknowledgedBy.join(", ") : "None yet"} icon="check" />
      <MetricRow label="Failed devices" value={data.config.arm.failedBy.length ? String(data.config.arm.failedBy.length) : "None"} icon="warning" last />
    </Section>

    <Section title="Entry and exit delays" subtitle="Local countdowns only; device firmware may enforce its own delays" icon="delay">
      <Stepper label="Exit delay" value={data.config.exitDelaySec} min={0} max={180} step={5} unit="s" onChange={(v) => saveDelays(v)} />
      <Stepper label="Entry delay" value={data.config.entryDelaySec} min={0} max={180} step={5} unit="s" onChange={(v) => saveDelays(data.config.exitDelaySec, v)} />
    </Section>

    <Section title="Security-capable devices" subtitle="Online state and last API timestamp" icon="guardian">
      {data.securityDevices.length ? data.securityDevices.map((d) => <DeviceStatusRow key={d.id} device={d} />) : <HonestEmpty icon="guardian" title="No security devices" subtitle="The API did not return guardian, facedoor or sensor-state devices." />}
    </Section>

    <Section title="Zones" subtitle="Mapped from explicit device state fields; unknown state is shown raw" icon="sensors">
      {data.zones.length ? data.zones.map((z) => <ZoneRow key={z.id} zone={z} bypassed={!!data.config.bypassedZones[z.id]} onToggle={(v) => data.setBypass(z.id, v)} />) : <HonestEmpty icon="sensors" title="No zones discovered" subtitle="No security-relevant state fields are present in the returned devices." />}
    </Section>

    <ConfirmDialog visible={panicOpen} title="Send SOS command?" message="This publishes a real panic command to alarm-capable devices returned by the API." confirmLabel="Send SOS" destructive busy={panicBusy} onConfirm={panic} onCancel={() => setPanicOpen(false)} />
  </SecurityScaffold>;
}
