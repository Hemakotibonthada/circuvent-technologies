import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Screen, useTheme } from "../../../ui";
import { ActionButton, Callout, CapacityBar, Kpi, KpiGrid, ScreenHeader, SelectField, Stepper, ToggleField } from "../../../enterprise-ui";
import { api } from "../../../api";
import type { AutomationBody } from "../../../api";
import { budgetStore, costOf, formatKwh, formatMoney, pct, type EnergyBudget } from "../../../enterprise";
import { ESTIMATE_NOTE, InlineError, InlineLoading, ScreenBody, SectionCard } from "./parts";
import { daysElapsedInMonth, daysInMonth, daysRemainingInMonth, loadBudgetData, monthToDateFromRollups, unwrap, useAsyncData } from "./useEnergy";

interface Props { onBack: () => void }

export default function BudgetGoals({ onBack }: Props) {
  const { c } = useTheme();
  const state = useAsyncData(loadBudgetData, []);
  const [saving, setSaving] = useState(false);
  const [automationBusy, setAutomationBusy] = useState(false);
  const [automationMsg, setAutomationMsg] = useState<string | null>(null);
  const data = state.data;
  const [selectedDevice, setSelectedDevice] = useState("");
  const [thresholdWatts, setThresholdWatts] = useState(1500);

  React.useEffect(() => {
    if (!selectedDevice && data?.summary.byDevice.length) setSelectedDevice(data.summary.byDevice[0].id);
  }, [data?.summary.byDevice, selectedDevice]);

  const monthToDate = data ? monthToDateFromRollups(data.rollups, data.summary.todayKwh) : 0;
  const elapsed = daysElapsedInMonth();
  const remaining = daysRemainingInMonth();
  const currentDaily = monthToDate / elapsed;
  const requiredDaily = data ? Math.max(0, (data.budget.monthlyKwh - monthToDate) / Math.max(1, remaining)) : 0;
  const projectedCost = data ? costOf(data.tariff, monthToDate) : 0;
  const targetCost = data?.budget.monthlyCost ?? 0;
  const deviceOptions = useMemo(() => (data?.summary.byDevice ?? []).map((d) => ({ value: d.id, label: d.name })), [data?.summary.byDevice]);

  const updateBudget = async (patch: Partial<EnergyBudget>) => {
    if (!data) return;
    setSaving(true);
    const next = { ...data.budget, ...patch };
    await budgetStore.save(next);
    setSaving(false);
    state.reload();
  };

  const createAutomation = async () => {
    if (!selectedDevice) return;
    setAutomationBusy(true);
    setAutomationMsg(null);
    const body: AutomationBody = {
      name: `Energy alert above ${thresholdWatts} W`,
      enabled: true,
      trigger: { type: "state", deviceId: selectedDevice, field: "watts", op: ">=", value: thresholdWatts },
      action: { type: "notify", title: "Energy threshold", body: `Device power is at or above ${thresholdWatts} W.` },
    };
    try {
      await unwrap(api.createAutomation(body));
      setAutomationMsg("Notify automation created from the real automations endpoint.");
    } catch (e) {
      setAutomationMsg(e instanceof Error ? e.message : "Could not create automation.");
    } finally {
      setAutomationBusy(false);
    }
  };

  if (state.loading && !data) return <Screen><ScreenHeader title="Budget goals" subtitle="Targets and local rollup tracking" onBack={onBack} /><InlineLoading /></Screen>;
  if (state.error && !data) return <Screen><ScreenHeader title="Budget goals" subtitle="Targets and local rollup tracking" onBack={onBack} /><InlineError text={state.error} onRetry={state.reload} /></Screen>;
  if (!data) return null;

  const overKwh = pct(monthToDate, data.budget.monthlyKwh) >= data.budget.alertAtPct;
  const overCost = targetCost > 0 && pct(projectedCost, targetCost) >= data.budget.alertAtPct;

  return (
    <Screen>
      <ScreenHeader title="Budget goals" subtitle="Measured use, local budget history" onBack={onBack} actions={[{ icon: "refresh", label: "Refresh budget", onPress: state.refresh }]} />
      <ScrollView refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} tintColor={c.accent} />} contentContainerStyle={{ paddingBottom: 28 }}>
        <ScreenBody>
          <Callout kind="info" title="History starts here" text={`The server provides today's measured kWh but no historical budget endpoint. Local daily rollups started ${data.rollups.startedAt ? new Date(data.rollups.startedAt).toLocaleDateString() : "today"}; older days are unknown and are not backfilled.`} icon="history" />

          <SectionCard title="Goals" subtitle="Stored locally on this device." icon="budget">
            <ToggleField label="Enable budget alerts" value={data.budget.enabled} onChange={(enabled) => updateBudget({ enabled })} icon="bell" />
            <Stepper label="Monthly kWh target" value={data.budget.monthlyKwh} onChange={(monthlyKwh) => updateBudget({ monthlyKwh })} min={1} max={100000} step={10} unit="kWh" />
            <Stepper label="Monthly cost target" value={data.budget.monthlyCost} onChange={(monthlyCost) => updateBudget({ monthlyCost })} min={1} max={10000000} step={100} unit={data.tariff.currency} help={ESTIMATE_NOTE} />
            <Stepper label="Alert threshold" value={data.budget.alertAtPct} onChange={(alertAtPct) => updateBudget({ alertAtPct })} min={1} max={100} step={1} unit="%" />
            {saving ? <Text style={{ color: c.faint }}>Saving…</Text> : null}
          </SectionCard>

          <KpiGrid>
            <Kpi icon="meter" label="Tracked MTD" value={formatKwh(monthToDate)} tint={c.cyan} invertDelta />
            <Kpi icon="calendar" label="Days remaining" value={remaining} tint={c.violet} />
            <Kpi icon="activity" label="Current daily avg" value={formatKwh(currentDaily)} tint={c.accentHi} invertDelta />
            <Kpi icon="condition" label="Needed daily avg" value={formatKwh(requiredDaily)} tint={requiredDaily < currentDaily ? c.red : c.green} />
          </KpiGrid>

          <SectionCard title="Progress" subtitle={`${elapsed} of ${daysInMonth()} days elapsed.`} icon="dashboard">
            <CapacityBar value={monthToDate} max={data.budget.monthlyKwh} threshold={(data.budget.monthlyKwh * data.budget.alertAtPct) / 100} label="kWh target" unit="kWh" tint={overKwh ? c.red : c.accent} />
            <CapacityBar value={projectedCost} max={data.budget.monthlyCost} threshold={(data.budget.monthlyCost * data.budget.alertAtPct) / 100} label="Estimated cost target" unit={data.tariff.currency} tint={overCost ? c.red : c.amber} />
            <Text style={{ color: c.faint, fontSize: 12 }}>{ESTIMATE_NOTE}</Text>
            {data.budget.enabled && (overKwh || overCost) ? <Callout kind="warning" title="Budget threshold reached" text="Your configured alert threshold has been crossed using measured kWh and local tariff estimates." icon="warning" /> : null}
          </SectionCard>

          <SectionCard title="Optional notify rule" subtitle="Create a real automation tied to a device power threshold." icon="rules">
            {deviceOptions.length ? <SelectField<string> label="Device" value={selectedDevice} options={deviceOptions} onChange={setSelectedDevice} /> : <Text style={{ color: c.faint }}>No devices with power readings are available for an automation trigger.</Text>}
            <Stepper label="Power threshold" value={thresholdWatts} onChange={setThresholdWatts} min={1} max={50000} step={50} unit="W" />
            <ActionButton label="Create notify automation" icon="bell" onPress={createAutomation} busy={automationBusy} disabled={!selectedDevice} />
            {automationMsg ? <Text style={{ color: automationMsg.includes("created") ? c.green : c.red, marginTop: 10 }}>{automationMsg}</Text> : null}
          </SectionCard>

          {state.error ? <Callout kind="warning" title="Last refresh failed" text={state.error} icon="warning" /> : null}
        </ScreenBody>
      </ScrollView>
    </Screen>
  );
}
