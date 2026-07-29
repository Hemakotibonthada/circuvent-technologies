import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Screen, useAppActive, useTheme } from "../../../ui";
import { HBars, Legend, LineChart } from "../../../charts";
import { Callout, CapacityBar, HeroBand, Kpi, KpiGrid, ScreenHeader } from "../../../enterprise-ui";
import { carbonOf, costOf, formatKwh, formatMoney, formatWatts, pct, projectMonthly } from "../../../enterprise";
import { api } from "../../../api";
import type { EnergyByDevice } from "../../../api";
import DeviceEnergy from "./DeviceEnergy";
import { ESTIMATE_NOTE, HonestEmpty, InlineError, InlineLoading, ScreenBody, SectionCard, DevicePowerRow, LegendText } from "./parts";
import { daysElapsedInMonth, loadEnergyDashboardData, unwrap, useAsyncData } from "./useEnergy";

interface Props { onBack: () => void }

export default function EnergyDashboard({ onBack }: Props) {
  const { c } = useTheme();
  const active = useAppActive();
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const { data, loading, refreshing, error, reload, refresh } = useAsyncData(loadEnergyDashboardData, []);
  const [trace, setTrace] = useState<number[]>([]);

  const poll = useCallback(async () => {
    try {
      const summary = await unwrap(api.energySummary());
      setTrace((prev) => [...prev, Math.max(0, summary.liveWatts || 0)].slice(-120));
    } catch {
      // The explicit error state comes from manual refresh; background polling stays quiet.
    }
  }, []);

  useEffect(() => {
    if (!active) return;
    poll();
    const id = setInterval(poll, 10000);
    return () => clearInterval(id);
  }, [active, poll]);

  if (selectedDevice) return <DeviceEnergy onBack={() => setSelectedDevice(null)} initialDeviceId={selectedDevice} />;
  if (loading && !data) return <Screen><ScreenHeader title="Energy dashboard" subtitle="Live demand and tariff estimates" onBack={onBack} /><InlineLoading /></Screen>;
  if (error && !data) return <Screen><ScreenHeader title="Energy dashboard" subtitle="Live demand and tariff estimates" onBack={onBack} /><InlineError text={error} onRetry={reload} /></Screen>;

  const summary = data?.summary;
  const tariff = data?.tariff;
  const budget = data?.budget;
  const live = summary?.liveWatts ?? 0;
  const today = summary?.todayKwh ?? 0;
  const todayCost = tariff ? costOf(tariff, today) : 0;
  const todayCarbon = tariff ? carbonOf(tariff, today) : 0;
  const projection = tariff ? projectMonthly(tariff, today, daysElapsedInMonth()) : { kwh: 0, cost: 0 };
  const byDevice = summary?.byDevice ?? [];
  const withReading = byDevice.filter((d) => Number.isFinite(d.watts));
  const positive = withReading.filter((d) => d.watts > 0).sort((a, b) => b.watts - a.watts);
  const zeros = withReading.filter((d) => d.watts === 0).sort((a, b) => a.name.localeCompare(b.name));
  const noPower = !positive.length && !zeros.length;
  const topBars = positive.slice(0, 8).map((d, i) => ({ name: d.name, value: Math.round(d.watts), color: [c.accent, c.cyan, c.violet, c.green, c.amber, c.red][i % 6] }));
  const budgetThreshold = budget ? (budget.monthlyKwh * budget.alertAtPct) / 100 : 0;
  const overBudgetAlert = !!budget && budget.enabled && pct(today, budget.monthlyKwh) >= budget.alertAtPct;

  return (
    <Screen>
      <ScreenHeader title="Energy dashboard" subtitle="Measured usage with local tariff estimates" onBack={onBack} actions={[{ icon: "refresh", label: "Refresh energy dashboard", onPress: refresh }]} />
      <ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={c.accent} />} contentContainerStyle={{ paddingBottom: 24 }}>
        <ScreenBody>
          <HeroBand
            label="Live demand"
            value={formatWatts(live)}
            caption={`Today ${formatKwh(today)} · est. ${tariff ? formatMoney(tariff, todayCost) : "—"} from tariff settings`}
            right={<View style={{ alignItems: "flex-end" }}><Text style={{ color: c.onAccent, fontSize: 13, fontWeight: "800" }}>Now</Text><Text style={{ color: c.onAccent, opacity: 0.85 }}>{withReading.length} reporting</Text></View>}
          />

          <KpiGrid>
            <Kpi icon="energy" label="Live demand" value={formatWatts(live)} tint={c.accentHi} />
            <Kpi icon="meter" label="Today" value={formatKwh(today)} tint={c.cyan} invertDelta />
            <Kpi icon="cost" label="Today cost" value={tariff ? formatMoney(tariff, todayCost) : "—"} tint={c.amber} invertDelta footnote={ESTIMATE_NOTE} />
            <Kpi icon="carbon" label="Today CO₂e" value={`${todayCarbon.toFixed(2)} kg`} tint={c.green} invertDelta footnote={ESTIMATE_NOTE} />
            <Kpi icon="budget" label="Projected month" value={formatKwh(projection.kwh)} unit={tariff ? formatMoney(tariff, projection.cost) : undefined} tint={c.violet} invertDelta footnote={ESTIMATE_NOTE} />
          </KpiGrid>

          <SectionCard title="Live rolling demand" subtitle="Session trace starts when this screen opens; it is not stored history." icon="charts">
            <LineChart data={trace} color={c.accentHi} height={170} />
            <Legend items={[{ name: "Live session demand", color: c.accentHi, value: trace.length ? formatWatts(trace[trace.length - 1]) : "waiting" }]} />
          </SectionCard>

          <SectionCard title="Budget progress" subtitle="Month-to-date uses the measured today value; longer history begins when tracking starts." icon="budget">
            {budget?.enabled ? (
              <>
                <CapacityBar value={today} max={budget.monthlyKwh} threshold={budgetThreshold} label="Month-to-date kWh" unit="kWh" tint={overBudgetAlert ? c.red : c.accent} />
                <Text style={{ color: c.faint, fontSize: 12 }}>Alert marker at {budget.alertAtPct}% of {formatKwh(budget.monthlyKwh)}.</Text>
                {overBudgetAlert ? <Callout kind="warning" title="Budget alert" text="Measured usage has crossed your configured alert threshold." icon="warning" /> : null}
              </>
            ) : (
              <Callout kind="info" title="Budget not enabled" text="Set monthly goals in Budget goals to show threshold warnings here." icon="budget" />
            )}
          </SectionCard>

          <SectionCard title="Top consumers right now" subtitle="Only measured device readings from the energy summary endpoint are shown." icon="peak">
            {noPower ? (
              <HonestEmpty title="No power readings yet" subtitle="No device is currently reporting a power value. This screen will not invent consumption history." icon="empty" actionLabel="Refresh" onAction={refresh} />
            ) : (
              <>
                {positive.length ? <HBars items={topBars} unit=" W" /> : <Callout kind="info" text="Devices are reporting power, but all readings are currently 0 W." icon="info" />}
                <LegendText items={topBars.map((b) => ({ name: b.name, value: formatWatts(b.value), color: b.color || c.accent }))} />
                <View style={{ marginTop: 14 }}>
                  {positive.slice(0, 12).map((d) => <DevicePowerRow key={d.id} name={d.name} type={d.type} online={d.online} watts={d.watts} onPress={() => setSelectedDevice(d.id)} />)}
                </View>
                {zeros.length ? (
                  <View style={{ marginTop: 10 }}>
                    <Text style={{ color: c.text, fontWeight: "900", marginBottom: 8 }}>Reporting 0 W</Text>
                    {zeros.slice(0, 8).map((d: EnergyByDevice) => <DevicePowerRow key={d.id} name={d.name} type={d.type} online={d.online} watts={0} onPress={() => setSelectedDevice(d.id)} />)}
                  </View>
                ) : null}
              </>
            )}
          </SectionCard>

          {error ? <Callout kind="warning" title="Last refresh failed" text={error} icon="warning" /> : null}
        </ScreenBody>
      </ScrollView>
    </Screen>
  );
}
