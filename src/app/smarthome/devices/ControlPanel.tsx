"use client";

import { useState } from "react";
import { LayoutGrid, List } from "lucide-react";
import { useFleet } from "../_data/hooks";
import { DeviceTile } from "../_kit/device";
import {
  EmptyState,
  ErrorState,
  FilterChips,
  IconButton,
  LoadingState,
  SectionTitle,
} from "../_kit/primitives";
import type { Device } from "@/lib/control-plane";

type GroupBy = "room" | "type";

/** Deterministic sort: online devices first, then alphabetically by name. */
function sortDevices(devices: Device[]): Device[] {
  return [...devices].sort((a, b) => {
    if (a.online !== b.online) return a.online ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function ControlPanel() {
  const fleet = useFleet();
  const [groupBy, setGroupBy] = useState<GroupBy>("room");

  if (fleet.loading) return <LoadingState label="Loading control wall" />;
  if (fleet.error) return <ErrorState message={fleet.error} onRetry={fleet.refresh} />;
  if (fleet.devices.length === 0) {
    return (
      <EmptyState
        title="No devices"
        body="Claim your first device from the Onboarding tab to start controlling it here."
      />
    );
  }

  // Group devices by selected axis.
  const groups = new Map<string, Device[]>();
  for (const d of fleet.devices) {
    const key =
      groupBy === "room"
        ? (d.room ?? "Unassigned")
        : d.type;
    const arr = groups.get(key) ?? [];
    arr.push(d);
    groups.set(key, arr);
  }

  // Sort group names: named groups alphabetically, special "Unassigned" last.
  const groupKeys = Array.from(groups.keys()).sort((a, b) => {
    if (a === "Unassigned") return 1;
    if (b === "Unassigned") return -1;
    return a.localeCompare(b);
  });

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <FilterChips<GroupBy>
          value={groupBy}
          onChange={setGroupBy}
          options={[
            { value: "room", label: "By room" },
            { value: "type", label: "By type" },
          ]}
        />
        <div className="ml-auto flex items-center gap-1.5 text-[11px]" style={{ color: "var(--cv-muted)" }}>
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ background: "#22c55e" }}
          />
          {fleet.online} online
          <span className="ml-2 inline-block h-2 w-2 rounded-full" style={{ background: "#94a3b8" }} />
          {fleet.offline} offline
        </div>
      </div>

      {groupKeys.map((group) => {
        const devices = sortDevices(groups.get(group)!);
        const onlineCount = devices.filter((d) => d.online).length;

        return (
          <section key={group} aria-label={group}>
            <SectionTitle
              right={
                <span className="text-[11px] tabular-nums" style={{ color: "var(--cv-muted)" }}>
                  {onlineCount}/{devices.length} online
                </span>
              }
            >
              {group}
            </SectionTitle>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {devices.map((d) => (
                <DeviceTile
                  key={d.id}
                  device={d}
                  status={fleet.cmd.statusOf(d.id)}
                  onSend={(cmd) => fleet.cmd.send(d, cmd)}
                  onFavorite={() => fleet.toggleFavorite(d)}
                  href={`/smarthome/device/${encodeURIComponent(d.id)}`}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
