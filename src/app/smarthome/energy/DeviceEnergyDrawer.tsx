"use client";

import { useState } from "react";
import { BarChart2 } from "lucide-react";
import {
  Badge,
  Callout,
  DetailRow,
  EmptyState,
  FilterChips,
  formatEnergy,
  formatWatts,
  LoadingState,
  SectionTitle,
} from "../_kit/primitives";
import { CHART_COLORS, LineChart, type Series } from "../_kit/charts";
import { Drawer } from "../_kit/overlays";
import { useDeviceEnergy } from "../_data/hooks";
import type { Device } from "@/lib/control-plane";
import { deviceWatts } from "../_kit/device";

type RangeKey = "24h" | "7d" | "30d";

const RANGES: { value: RangeKey; label: string; hours: number }[] = [
  { value: "24h", label: "24 h", hours: 24 },
  { value: "7d", label: "7 days", hours: 168 },
  { value: "30d", label: "30 days", hours: 720 },
];

function DeviceHistoryChart({ deviceId, range }: { deviceId: string; range: RangeKey }) {
  const hours = RANGES.find((r) => r.value === range)!.hours;
  const { points, kwh, loading } = useDeviceEnergy(deviceId, hours, "watts");

  const series: Series[] = [
    {
      name: "Power draw",
      color: CHART_COLORS[0],
      points,
    },
  ];

  if (loading && points.length === 0) return <LoadingState label="Loading device history" />;

  return (
    <div className="space-y-3">
      <LineChart
        series={series}
        title={`Draw — ${RANGES.find((r) => r.value === range)!.label}`}
        unit=" W"
        valueFormat={(v) => formatWatts(v)}
      />
      <p className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
        Total in range:{" "}
        <b style={{ color: "var(--cv-text)" }}>
          {kwh != null ? formatEnergy(kwh) : "—"}
        </b>
      </p>
    </div>
  );
}

export default function DeviceEnergyDrawer({
  device,
  liveWatts,
  onClose,
}: {
  device: Device | null;
  /** Live watts from the energy summary (may differ from state.watts on lag). */
  liveWatts?: number | null;
  onClose: () => void;
}) {
  const [range, setRange] = useState<RangeKey>("24h");
  const open = device !== null;

  const reportedWatts =
    liveWatts != null
      ? liveWatts
      : device
      ? deviceWatts(device)
      : null;

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={device?.name ?? "Device energy"}
      subtitle={device ? `${device.type}${device.room ? ` · ${device.room}` : ""}` : undefined}
      width={480}
    >
      {device && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{device.type}</Badge>
            {device.room && <Badge tone="accent">{device.room}</Badge>}
            <Badge tone={device.online ? "ok" : "warning"}>
              {device.online ? "Online" : "Offline"}
            </Badge>
          </div>

          <FilterChips
            options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
            value={range}
            onChange={setRange}
          />

          <DeviceHistoryChart deviceId={device.id} range={range} />

          {reportedWatts == null && (
            <Callout tone="info">
              This device has not reported instantaneous power yet. Energy history
              reflects server-side rollups when the device was active.
            </Callout>
          )}

          <SectionTitle>Device detail</SectionTitle>
          <div>
            <DetailRow label="Live draw">
              {reportedWatts != null ? formatWatts(reportedWatts) : "—"}
            </DetailRow>
            <DetailRow label="Status">
              {device.online ? "Online" : "Offline"}
            </DetailRow>
            <DetailRow label="Room">{device.room ?? "—"}</DetailRow>
            <DetailRow label="Type">{device.type}</DetailRow>
            {device.fw_version && (
              <DetailRow label="Firmware">{device.fw_version}</DetailRow>
            )}
            {device.last_seen && (
              <DetailRow label="Last seen">{device.last_seen}</DetailRow>
            )}
          </div>
        </div>
      )}

      {!device && (
        <EmptyState
          title="No device selected"
          icon={BarChart2}
          body="Select a device from the grid to view its energy history."
        />
      )}
    </Drawer>
  );
}
