"use client";

/**
 * Site & room distribution.
 *
 * The control plane does not store device coordinates, so a geographic map would
 * be fabrication. Instead we group the real fleet by each device's `room` field
 * and show a per-room breakdown (count, online, health mix) derived entirely
 * from `useAdminDevices()`. Clicking a room filters the fleet.
 */

import { useMemo } from "react";
import { Building2, Wifi, WifiOff } from "lucide-react";
import type { AdminDevice } from "@/lib/control-plane";
import { healthBreakdown, type DeviceHealth } from "../_lib/api";
import { num } from "../_lib/format";
import { EmptyState, TONE, type Tone } from "../_ui";

const HEALTH_TONE: Record<DeviceHealth, Tone> = { healthy: "green", warning: "amber", critical: "red", offline: "slate" };
const HEALTH_ORDER: DeviceHealth[] = ["healthy", "warning", "critical", "offline"];

interface RoomGroup {
  room: string;
  total: number;
  online: number;
  health: Record<DeviceHealth, number>;
}

const roomLabel = (d: AdminDevice) => (d.room && d.room.trim()) || "Unassigned";

export default function FleetSites({
  devices,
  selectedRoom,
  onSelectRoom,
}: {
  devices: AdminDevice[];
  selectedRoom?: string | null;
  onSelectRoom?: (room: string | null) => void;
}) {
  const rooms = useMemo<RoomGroup[]>(() => {
    const groups = new Map<string, AdminDevice[]>();
    for (const d of devices) {
      const key = roomLabel(d);
      const list = groups.get(key);
      if (list) list.push(d);
      else groups.set(key, [d]);
    }
    return [...groups.entries()]
      .map(([room, list]) => ({
        room,
        total: list.length,
        online: list.filter((d) => d.online).length,
        health: healthBreakdown(list),
      }))
      .sort((a, b) => b.total - a.total || a.room.localeCompare(b.room));
  }, [devices]);

  if (rooms.length === 0) {
    return (
      <EmptyState
        icon={<Building2 className="h-6 w-6" />}
        title="No rooms to show"
        hint="Devices are grouped by room here once the fleet reports them."
      />
    );
  }

  return (
    <div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {rooms.map((r) => {
          const selected = selectedRoom === r.room;
          const offline = r.total - r.online;
          return (
            <button
              key={r.room}
              onClick={() => onSelectRoom?.(selected ? null : r.room)}
              className={`ad-card rounded-2xl p-4 text-left transition hover:border-cyan-500/30 ${selected ? "border-cyan-500/50 ring-1 ring-cyan-500/30" : ""}`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg" style={{ background: TONE.brand.bg, color: TONE.brand.fg }}>
                    <Building2 className="h-4 w-4" />
                  </span>
                  <span className="truncate font-semibold text-white">{r.room}</span>
                </div>
                <span className="shrink-0 text-2xl font-extrabold tabular-nums text-white">{num(r.total)}</span>
              </div>

              <div className="mt-3 flex items-center gap-3 text-xs">
                <span className="inline-flex items-center gap-1.5 text-emerald-400"><Wifi className="h-3.5 w-3.5" /> {num(r.online)} online</span>
                <span className="inline-flex items-center gap-1.5 text-slate-500"><WifiOff className="h-3.5 w-3.5" /> {num(offline)} offline</span>
              </div>

              <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-white/10">
                {HEALTH_ORDER.map((h) => (r.health[h] > 0 ? <span key={h} style={{ flexGrow: r.health[h], background: TONE[HEALTH_TONE[h]].fg }} /> : null))}
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] ad-muted">
                {HEALTH_ORDER.filter((h) => r.health[h] > 0).map((h) => (
                  <span key={h} className="inline-flex items-center gap-1 capitalize">
                    <span className="h-2 w-2 rounded-full" style={{ background: TONE[HEALTH_TONE[h]].fg }} /> {h} {r.health[h]}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
      <div className="mt-3 text-xs ad-muted">
        {num(rooms.length)} room{rooms.length === 1 ? "" : "s"} · {num(devices.length)} device{devices.length === 1 ? "" : "s"} · click a room to filter the fleet
      </div>
    </div>
  );
}
