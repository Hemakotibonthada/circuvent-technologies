"use client";

import { useEffect, useMemo, useState } from "react";
import { Cpu } from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import type { Device } from "@/lib/control-plane";
import {
  Badge,
  EmptyState,
  ErrorState,
  FilterChips,
  formatEnergy,
  formatWatts,
  LoadingState,
  StatusDot,
} from "../_kit/primitives";
import { CHART_COLORS } from "../_kit/charts";
import { DataGrid, type Column } from "../_kit/data-grid";
import { deviceWatts } from "../_kit/device";
import { useEnergy, useFleet } from "../_data/hooks";
import { masterPower } from "@/lib/smarthome-command-map";
import DeviceEnergyDrawer from "./DeviceEnergyDrawer";

const STANDBY_THRESHOLD_W = 2;

type RangeKey = "24h" | "7d" | "30d";
const RANGES: { value: RangeKey; label: string; hours: number }[] = [
  { value: "24h", label: "24 h", hours: 24 },
  { value: "7d", label: "7 days", hours: 168 },
  { value: "30d", label: "30 days", hours: 720 },
];

interface MeterRow {
  id: string;
  device: Device;
  name: string;
  type: string;
  room: string | undefined;
  online: boolean;
  liveWatts: number | null;
  kwh: number | null;
  standby: boolean;
}

export default function DevicesPanel() {
  const [range, setRange] = useState<RangeKey>("24h");
  const hours = RANGES.find((r) => r.value === range)!.hours;

  const { byDevice, loading: energyLoading, error, refresh } = useEnergy();
  const { devices, byId } = useFleet();

  // Per-device historical kWh — fetched fresh when range changes.
  const [kwhMap, setKwhMap] = useState<Map<string, number | null>>(new Map());
  const [kwhLoading, setKwhLoading] = useState(false);

  const idKey = byDevice.map((d) => d.id).join(",");
  useEffect(() => {
    if (byDevice.length === 0) {
      setKwhMap(new Map());
      return;
    }
    let cancelled = false;
    setKwhLoading(true);
    Promise.all(
      byDevice.map(async (d) => {
        const r = await controlPlane.deviceEnergy(d.id, hours, "watts");
        return [d.id, r.ok ? (r.data.kwh ?? null) : null] as const;
      })
    ).then((pairs) => {
      if (cancelled) return;
      setKwhMap(new Map(pairs));
      setKwhLoading(false);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey, hours]);

  // Merge energy-summary devices with fleet device data.
  const rows: MeterRow[] = useMemo(() => {
    return byDevice.map((ed) => {
      const fleetDev = byId.get(ed.id);
      const mp = fleetDev ? masterPower(fleetDev) : null;
      const stateWatts = fleetDev ? deviceWatts(fleetDev) : null;
      // Use energy-summary watts as the primary live reading; fall back to state.watts.
      const liveW = ed.watts > 0 ? ed.watts : stateWatts;
      const standby =
        mp !== null && !mp?.on && liveW !== null && liveW! > STANDBY_THRESHOLD_W;
      return {
        id: ed.id,
        device: fleetDev ?? ({
          id: ed.id,
          name: ed.name,
          type: ed.type,
          online: ed.online,
          state: {},
        } as Device),
        name: ed.name || ed.id,
        type: ed.type,
        room: fleetDev?.room,
        online: ed.online,
        liveWatts: liveW,
        kwh: kwhMap.get(ed.id) ?? null,
        standby,
      };
    });
  }, [byDevice, byId, kwhMap]);

  // Drawer state
  const [selected, setSelected] = useState<MeterRow | null>(null);

  const columns: Column<MeterRow>[] = [
    {
      key: "name",
      header: "Device",
      render: (r) => (
        <span className="font-semibold" style={{ color: "var(--cv-text)" }}>
          {r.name}
        </span>
      ),
      value: (r) => r.name,
    },
    {
      key: "type",
      header: "Type",
      render: (r) => (
        <Badge>{r.type}</Badge>
      ),
      value: (r) => r.type,
      hideOnCard: true,
    },
    {
      key: "room",
      header: "Room",
      render: (r) => (
        <span style={{ color: "var(--cv-muted)" }}>{r.room ?? "—"}</span>
      ),
      value: (r) => r.room ?? "",
      hideOnCard: true,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => (
        <span className="inline-flex items-center gap-1.5">
          <StatusDot online={r.online} pulse={false} />
          <span className="text-xs" style={{ color: "var(--cv-muted)" }}>
            {r.online ? "Online" : "Offline"}
          </span>
        </span>
      ),
      value: (r) => (r.online ? "Online" : "Offline"),
    },
    {
      key: "watts",
      header: "Live W",
      align: "right",
      render: (r) => (
        <span
          className="font-bold tabular-nums"
          style={{
            color:
              r.liveWatts != null && r.liveWatts > 0
                ? "var(--cv-accent-hi)"
                : "var(--cv-muted)",
          }}
        >
          {r.liveWatts != null ? formatWatts(r.liveWatts) : "—"}
        </span>
      ),
      value: (r) => r.liveWatts ?? 0,
    },
    {
      key: "kwh",
      header: `kWh (${RANGES.find((rr) => rr.value === range)?.label ?? range})`,
      align: "right",
      render: (r) => (
        <span className="tabular-nums" style={{ color: "var(--cv-muted)" }}>
          {kwhLoading
            ? "…"
            : r.kwh != null
            ? formatEnergy(r.kwh)
            : "—"}
        </span>
      ),
      value: (r) => r.kwh ?? 0,
    },
    {
      key: "standby",
      header: "Standby",
      align: "center",
      render: (r) =>
        r.standby ? (
          <Badge tone="warning">Standby</Badge>
        ) : (
          <span style={{ color: "var(--cv-muted)" }}>—</span>
        ),
      value: (r) => (r.standby ? "Yes" : "No"),
      optional: true,
    },
  ];

  if (energyLoading && byDevice.length === 0)
    return <LoadingState label="Loading device list" />;
  if (error) return <ErrorState message={error} onRetry={refresh} />;
  if (byDevice.length === 0)
    return (
      <EmptyState
        title="No metering devices"
        body="No device in your fleet has reported energy data yet. Smart plugs and energy monitors will appear here."
        icon={Cpu}
      />
    );

  return (
    <>
      <div className="mb-4">
        <FilterChips
          options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
          value={range}
          onChange={setRange}
        />
      </div>

      <DataGrid
        rows={rows}
        columns={columns}
        rowKey={(r) => r.id}
        loading={energyLoading}
        onRowClick={(r) => setSelected(r)}
        searchable
        searchPlaceholder="Filter devices…"
        searchOn={(r) => `${r.name} ${r.type} ${r.room ?? ""}`}
        exportName={`energy-devices-${range}`}
        emptyTitle="No metering devices"
        emptyBody="No device has reported energy for this range."
        storageKey="energy:devices:grid"
        pageSize={30}
      />

      <DeviceEnergyDrawer
        device={selected?.device ?? null}
        liveWatts={selected?.liveWatts}
        onClose={() => setSelected(null)}
      />
    </>
  );
}
