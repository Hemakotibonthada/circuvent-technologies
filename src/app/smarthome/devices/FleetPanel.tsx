"use client";

import { useState } from "react";
import { Power, PowerOff } from "lucide-react";
import { masterPower } from "@/lib/smarthome-command-map";
import type { Device } from "@/lib/control-plane";
import { useFleet } from "../_data/hooks";
import { DataGrid, type BulkAction, type Column } from "../_kit/data-grid";
import { deviceMetric, PowerButton } from "../_kit/device";
import { deviceMeta } from "../DeviceControls";
import {
  Badge,
  ErrorState,
  FilterChips,
  RelativeTime,
  SectionTitle,
  StatusDot,
} from "../_kit/primitives";
import { DeviceDrawer } from "./DeviceDrawer";

type FleetFilter = "all" | "online" | "offline" | "favorites";

export function FleetPanel() {
  const fleet = useFleet();
  const [filter, setFilter] = useState<FleetFilter>("all");
  const [drawerDevice, setDrawerDevice] = useState<Device | null>(null);

  const filtered = fleet.devices.filter((d) => {
    if (filter === "online") return d.online;
    if (filter === "offline") return !d.online;
    if (filter === "favorites") return !!d.favorite;
    return true;
  });

  const columns: Column<Device>[] = [
    {
      key: "name",
      header: "Device",
      value: (d) => d.name,
      render: (d) => {
        const meta = deviceMeta(d.type);
        const Icon = meta.icon;
        return (
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
              style={{
                background: `color-mix(in srgb, ${meta.accent} 18%, transparent)`,
              }}
            >
              <Icon className="h-4 w-4" style={{ color: meta.accent }} />
            </span>
            <span className="font-semibold" style={{ color: "var(--cv-text)" }}>
              {d.name}
            </span>
          </div>
        );
      },
    },
    {
      key: "type",
      header: "Type",
      value: (d) => deviceMeta(d.type).label,
      render: (d) => <Badge>{deviceMeta(d.type).label}</Badge>,
    },
    {
      key: "status",
      header: "Status",
      value: (d) => (d.online ? "online" : "offline"),
      render: (d) => (
        <span className="inline-flex items-center gap-1.5">
          <StatusDot online={d.online} />
          <span style={{ color: "var(--cv-muted)" }} className="text-xs">
            {d.online ? "Online" : "Offline"}
          </span>
        </span>
      ),
    },
    {
      key: "room",
      header: "Room",
      value: (d) => d.room ?? "",
      render: (d) => (
        <span style={{ color: "var(--cv-muted)" }}>{d.room ?? "—"}</span>
      ),
    },
    {
      key: "last_seen",
      header: "Last seen",
      value: (d) => d.last_seen ?? "",
      render: (d) => (
        <span style={{ color: "var(--cv-muted)" }}>
          <RelativeTime iso={d.last_seen} />
        </span>
      ),
      hideOnCard: true,
    },
    {
      key: "metric",
      header: "Reading",
      render: (d) => {
        const m = deviceMetric(d);
        return (
          <span
            className="tabular-nums font-semibold"
            style={{ color: m ? "var(--cv-accent-hi)" : "var(--cv-muted)" }}
          >
            {m ?? "—"}
          </span>
        );
      },
    },
    {
      key: "fw",
      header: "Firmware",
      value: (d) => d.fw_version ?? "",
      render: (d) => (
        <span className="font-mono text-xs" style={{ color: "var(--cv-muted)" }}>
          {d.fw_version ?? "—"}
        </span>
      ),
      optional: true,
      hideOnCard: true,
    },
    {
      key: "power",
      header: "Power",
      // Clicks inside the power cell must not bubble to the row click handler.
      render: (d) => (
        <span onClick={(e) => e.stopPropagation()}>
          <PowerButton
            device={d}
            status={fleet.cmd.statusOf(d.id)}
            onSend={(cmd) => fleet.cmd.send(d, cmd)}
            size="sm"
          />
        </span>
      ),
    },
  ];

  const bulkActions: BulkAction<Device>[] = [
    {
      id: "power-on",
      label: "Power on",
      icon: Power,
      run: (rows) => {
        for (const d of rows) {
          const mp = masterPower(d);
          if (mp && !mp.on)
            void fleet.cmd.send(d, mp.cmd(true) as Record<string, unknown>);
        }
      },
    },
    {
      id: "power-off",
      label: "Power off",
      icon: PowerOff,
      danger: true,
      run: (rows) => {
        for (const d of rows) {
          const mp = masterPower(d);
          if (mp && mp.on)
            void fleet.cmd.send(d, mp.cmd(false) as Record<string, unknown>);
        }
      },
    },
  ];

  if (fleet.error) {
    return <ErrorState message={fleet.error} onRetry={fleet.refresh} />;
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <FilterChips<FleetFilter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: "All", count: fleet.devices.length },
            { value: "online", label: "Online", count: fleet.online },
            { value: "offline", label: "Offline", count: fleet.offline },
            { value: "favorites", label: "Favourites" },
          ]}
        />
        {fleet.lastSync != null && (
          <span className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
            Synced <RelativeTime iso={new Date(fleet.lastSync).toISOString()} />
          </span>
        )}
      </div>

      <DataGrid<Device>
        rows={filtered}
        columns={columns}
        rowKey={(d) => d.id}
        loading={fleet.loading}
        searchable
        searchPlaceholder="Search devices, rooms, types…"
        searchOn={(d) => `${d.type} ${d.room ?? ""} ${d.id}`}
        onRowClick={(d) => setDrawerDevice(d)}
        bulkActions={bulkActions}
        exportName="fleet"
        storageKey="devices-fleet"
        emptyTitle="No devices"
        emptyBody="No devices match the current filter."
        dense={false}
      />

      {fleet.poweredOn > 0 && (
        <>
          <SectionTitle>Quick stats</SectionTitle>
          <div
            className="rounded-xl px-4 py-3 text-sm"
            style={{
              background: "color-mix(in srgb, var(--cv-accent) 10%, transparent)",
              border: "1px solid var(--cv-border)",
              color: "var(--cv-text)",
            }}
          >
            <span style={{ color: "var(--cv-accent-hi)" }} className="font-bold">
              {fleet.poweredOn}
            </span>{" "}
            device{fleet.poweredOn !== 1 ? "s" : ""} currently powered on ·{" "}
            <span style={{ color: "var(--cv-accent-hi)" }} className="font-bold">
              {fleet.online}
            </span>{" "}
            online ·{" "}
            <span className="font-bold" style={{ color: fleet.offline > 0 ? "#b45309" : "var(--cv-muted)" }}>
              {fleet.offline}
            </span>{" "}
            offline
          </div>
        </>
      )}

      <DeviceDrawer
        device={drawerDevice}
        fleet={fleet}
        onClose={() => setDrawerDevice(null)}
      />
    </div>
  );
}
