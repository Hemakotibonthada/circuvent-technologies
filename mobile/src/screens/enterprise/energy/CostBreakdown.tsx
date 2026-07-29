import React, { useMemo } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { Screen, useTheme } from "../../../ui";
import { Donut, Legend } from "../../../charts";
import { Callout, DataGrid, type GridColumn, Kpi, KpiGrid, ScreenHeader } from "../../../enterprise-ui";
import { costOf, formatMoney, formatWatts, groupBy, pct, rateAtHour, windowAtHour } from "../../../enterprise";
import type { Device } from "../../../api";
import { HonestEmpty, InlineError, InlineLoading, ScreenBody, SectionCard, UsageLine } from "./parts";
import { isOffLikeState, loadCostBreakdownData, useAsyncData } from "./useEnergy";

interface Props { onBack: () => void }

interface DeviceRow { id: string; name: string; room: string; type: string; online: boolean; watts: number; share: number; hourlyCost: number; offLike: boolean }
interface RoomRow { room: string; watts: number; devices: number; share: number; hourlyCost: number }

export default function CostBreakdown({ onBack }: Props) {
  const { c } = useTheme();
  const state = useAsyncData(loadCostBreakdownData, []);
  const data = state.data;

  const rows = useMemo<DeviceRow[]>(() => {
    if (!data) return [];
    const devices = new Map(data.devices.map((d: Device) => [d.id, d]));
    const total = Math.max(0, data.summary.liveWatts || data.summary.byDevice.reduce((s, d) => s + Math.max(0, d.watts || 0), 0));
    return data.summary.byDevice
      .filter((d) => Number.isFinite(d.watts))
      .map((d) => {
        const dev = devices.get(d.id);
        const watts = Math.max(0, d.watts || 0);
        return {
          id: d.id,
          name: d.name,
          room: dev?.room || "Unassigned",
          type: d.type,
          online: d.online,
          watts,
          share: pct(watts, total),
          hourlyCost: costOf(data.tariff, watts / 1000),
          offLike: dev ? isOffLikeState(dev) && watts > 0 : false,
        };
      })
      .sort((a, b) => b.watts - a.watts);
  }, [data]);

  const roomRows = useMemo<RoomRow[]>(() => {
    if (!data) return [];
    const total = Math.max(1, rows.reduce((s, r) => s + r.watts, 0));
    const grouped = groupBy(rows, (r) => r.room);
    return Object.entries(grouped).map(([room, items]) => {
      const watts = items.reduce((s, r) => s + r.watts, 0);
      return { room, watts, devices: items.length, share: pct(watts, total), hourlyCost: costOf(data.tariff, watts / 1000) };
    }).sort((a, b) => b.watts - a.watts);
  }, [data, rows]);

  const totalWatts = rows.reduce((s, r) => s + r.watts, 0);
  const deviceSegments = rows.filter((r) => r.watts > 0).slice(0, 6).map((r, i) => ({ label: r.name, value: r.watts, color: [c.accent, c.cyan, c.violet, c.green, c.amber, c.red][i % 6] }));
  const roomSegments = roomRows.filter((r) => r.watts > 0).slice(0, 6).map((r, i) => ({ label: r.room, value: r.watts, color: [c.cyan, c.violet, c.green, c.amber, c.red, c.accent][i % 6] }));
  const standby = rows.filter((r) => r.offLike);
  const now = new Date();
  const activeWindow = data ? windowAtHour(data.tariff, now.getHours()) : null;
  const nextChange = data ? findNextTouChange(data.tariff, now.getHours()) : null;

  const deviceColumns = useMemo<GridColumn<DeviceRow>[]>(() => [
    { key: "device", header: "Device", width: 170, render: (r) => <View><Text style={{ color: c.text, fontWeight: "800" }}>{r.name}</Text><Text style={{ color: c.faint, fontSize: 11 }}>{r.type}</Text></View>, sortValue: (r) => r.name },
    { key: "room", header: "Room", width: 120, render: (r) => <Text style={{ color: c.textDim }}>{r.room}</Text>, sortValue: (r) => r.room },
    { key: "watts", header: "W", width: 90, align: "right", render: (r) => <Text style={{ color: c.text, fontWeight: "900" }}>{formatWatts(r.watts)}</Text>, sortValue: (r) => r.watts },
    { key: "share", header: "Share", width: 80, align: "right", render: (r) => <Text style={{ color: c.textDim }}>{r.share.toFixed(1)}%</Text>, sortValue: (r) => r.share },
    { key: "cost", header: "Est/hr", width: 110, align: "right", render: (r) => <Text style={{ color: c.amber, fontWeight: "800" }}>{data ? formatMoney(data.tariff, r.hourlyCost) : "—"}</Text>, sortValue: (r) => r.hourlyCost },
  ], [c, data]);

  if (state.loading && !data) return <Screen><ScreenHeader title="Cost breakdown" subtitle="Attribution from measured current demand" onBack={onBack} /><InlineLoading /></Screen>;
  if (state.error && !data) return <Screen><ScreenHeader title="Cost breakdown" subtitle="Attribution from measured current demand" onBack={onBack} /><InlineError text={state.error} onRetry={state.reload} /></Screen>;
  if (!data) return null;

  return (
    <Screen>
      <ScreenHeader title="Cost breakdown" subtitle="Current demand, room share and TOU insight" onBack={onBack} actions={[{ icon: "refresh", label: "Refresh cost breakdown", onPress: state.refresh }]} />
      <ScrollView refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} tintColor={c.accent} />} contentContainerStyle={{ paddingBottom: 28 }}>
        <ScreenBody>
          <KpiGrid>
            <Kpi icon="energy" label="Current demand" value={formatWatts(totalWatts)} tint={c.accentHi} />
            <Kpi icon="devices" label="Reporting devices" value={rows.length} tint={c.cyan} />
            <Kpi icon="cost" label="Estimated hourly" value={formatMoney(data.tariff, costOf(data.tariff, totalWatts / 1000))} tint={c.amber} footnote="Estimate based on tariff settings." invertDelta />
          </KpiGrid>

          <SectionCard title="Per-device attribution" subtitle="Current watts joined with device room metadata." icon="meter">
            {deviceSegments.length ? <><Donut segments={deviceSegments} size={150} /><Legend items={deviceSegments.map((s) => ({ name: s.label, color: s.color, value: formatWatts(s.value) }))} /></> : <HonestEmpty title="No current demand" subtitle="Devices are not reporting non-zero watts right now." icon="empty" />}
            <View style={{ marginTop: 14 }}><DataGrid columns={deviceColumns} rows={rows} keyOf={(r) => r.id} emptyText="No device power readings." maxHeight={320} /></View>
          </SectionCard>

          <SectionCard title="Room attribution" subtitle="Room totals are aggregates of current measured device watts." icon="rooms">
            {roomSegments.length ? <><Donut segments={roomSegments} size={150} /><Legend items={roomSegments.map((s) => ({ name: s.label, color: s.color, value: formatWatts(s.value) }))} /></> : <HonestEmpty title="No room demand" subtitle="No room has non-zero measured demand right now." icon="rooms" />}
            <View style={{ marginTop: 12 }}>
              {roomRows.map((r) => <UsageLine key={r.room} name={`${r.room} (${r.devices})`} watts={r.watts} tariff={data.tariff} total={totalWatts} />)}
            </View>
          </SectionCard>

          <SectionCard title="Time-of-use insight" subtitle="Derived only from your local tariff card." icon="peak">
            {data.tariff.kind === "tou" ? (
              <>
                <Callout kind="info" title={activeWindow ? `Active: ${activeWindow.label}` : "Fallback rate active"} text={`Current rate is ${data.tariff.currency}${rateAtHour(data.tariff, now.getHours()).toFixed(2)}/kWh. ${nextChange ? `Next rate change at ${nextChange}:00.` : "No rate change found in the next day."}`} icon="clock" />
                <Text style={{ color: c.faint, fontSize: 12 }}>This is tariff-card guidance for load shifting, not a measurement.</Text>
              </>
            ) : <Callout kind="info" text="Switch tariff settings to time-of-use to see the active window and next rate change." icon="tariff" />}
          </SectionCard>

          <SectionCard title="Standby candidates" subtitle="Devices drawing non-zero watts while their state looks off-like." icon="leaf">
            {standby.length ? standby.map((r) => <UsageLine key={r.id} name={r.name} watts={r.watts} tariff={data.tariff} total={totalWatts} />) : <Callout kind="success" text="No standby candidates found in the current readings. This is not a verdict; device state fields vary by type." icon="success" />}
            <Text style={{ color: c.faint, fontSize: 12, marginTop: 8 }}>Candidates are worth checking, not faults. The app uses real state fields but cannot know every vendor's naming.</Text>
          </SectionCard>

          {state.error ? <Callout kind="warning" title="Last refresh failed" text={state.error} icon="warning" /> : null}
        </ScreenBody>
      </ScrollView>
    </Screen>
  );
}

function findNextTouChange(tariff: { kind: string }, hour: number): number | null {
  if (tariff.kind !== "tou") return null;
  const anyTariff = tariff as Parameters<typeof rateAtHour>[0];
  const current = rateAtHour(anyTariff, hour);
  for (let i = 1; i <= 24; i++) {
    const h = (hour + i) % 24;
    if (rateAtHour(anyTariff, h) !== current) return h;
  }
  return null;
}
