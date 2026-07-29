"use client";

import { useCallback, useMemo, useState } from "react";
import { Power, Zap, CheckCircle, Circle } from "lucide-react";
import type { Room } from "@/lib/control-plane";
import { masterPower } from "@/lib/smarthome-command-map";
import type { useFleet } from "../_data/hooks";
import {
  SectionTitle,
  Surface,
  StatusDot,
  formatWatts,
  Badge,
} from "../_kit/primitives";
import { PowerButton, deviceMetric } from "../_kit/device";
import { Drawer, useToast } from "../_kit/overlays";

type Fleet = ReturnType<typeof useFleet>;

interface Props {
  room: Room;
  fleet: Fleet;
  onClose: () => void;
  onRefresh: () => Promise<void>;
}

export default function RoomDrawer({ room, fleet, onClose, onRefresh }: Props) {
  const toast = useToast();
  const [bulkBusy, setBulkBusy] = useState(false);
  const [assignBusy, setAssignBusy] = useState<string | null>(null);
  const [removeBusy, setRemoveBusy] = useState<string | null>(null);

  const roomDevices = useMemo(
    () => fleet.devices.filter((d) => (d.room || "") === room.name),
    [fleet.devices, room.name],
  );

  const otherDevices = useMemo(
    () => fleet.devices.filter((d) => (d.room || "") !== room.name),
    [fleet.devices, room.name],
  );

  const liveWatts = useMemo(() => {
    let total = 0;
    let hasData = false;
    for (const d of roomDevices) {
      const w = (d.state ?? {}).watts;
      if (typeof w === "number" && Number.isFinite(w)) {
        total += w;
        hasData = true;
      }
    }
    return hasData ? total : null;
  }, [roomDevices]);

  const bulkPower = useCallback(
    async (on: boolean) => {
      setBulkBusy(true);
      let skipped = 0;
      await Promise.all(
        roomDevices.map((d) => {
          if (!d.online) { skipped++; return Promise.resolve(); }
          const mp = masterPower(d);
          if (!mp) { skipped++; return Promise.resolve(); }
          return fleet.cmd.send(d, mp.cmd(on) as Record<string, unknown>);
        }),
      );
      const acted = roomDevices.length - skipped;
      toast.ok(`All ${on ? "on" : "off"}: ${acted} device${acted !== 1 ? "s" : ""}${skipped ? ` (${skipped} skipped)` : ""}`);
      setBulkBusy(false);
    },
    [roomDevices, fleet.cmd, toast],
  );

  const assign = useCallback(
    async (id: string) => {
      setAssignBusy(id);
      const ok = await fleet.assignRoom(id, room.name);
      if (ok) {
        toast.ok("Device assigned");
        await onRefresh();
      } else {
        toast.err("Assignment failed");
      }
      setAssignBusy(null);
    },
    [fleet, room.name, onRefresh, toast],
  );

  const remove = useCallback(
    async (id: string) => {
      setRemoveBusy(id);
      const ok = await fleet.assignRoom(id, "");
      if (ok) {
        toast.info("Device unassigned from room");
        await onRefresh();
      } else {
        toast.err("Unassign failed");
      }
      setRemoveBusy(null);
    },
    [fleet, onRefresh, toast],
  );

  return (
    <Drawer
      open
      onClose={onClose}
      title={`${room.icon || "🏠"} ${room.name}`}
      subtitle={`${roomDevices.length} devices · ${liveWatts != null ? formatWatts(liveWatts) : "— W"} live draw`}
      footer={
        <div className="flex gap-2">
          <button
            onClick={() => bulkPower(true)}
            disabled={bulkBusy || roomDevices.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition disabled:opacity-40"
            style={{ background: "var(--cv-gradient)", color: "#fff" }}
          >
            <Power className="h-4 w-4" /> All on
          </button>
          <button
            onClick={() => bulkPower(false)}
            disabled={bulkBusy || roomDevices.length === 0}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition disabled:opacity-40"
            style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)", color: "var(--cv-text)" }}
          >
            <Power className="h-4 w-4" /> All off
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Devices in room */}
        <section>
          <SectionTitle>In this room</SectionTitle>
          {roomDevices.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--cv-muted)" }}>
              No devices assigned yet.
            </p>
          ) : (
            <div className="space-y-2">
              {roomDevices.map((device) => {
                const status = fleet.cmd.statusOf(device.id);
                const metric = deviceMetric(device);
                return (
                  <Surface key={device.id} className="flex items-center gap-3 !p-3">
                    <StatusDot online={device.online} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
                        {device.name}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--cv-muted)" }}>
                        <Badge>{device.type}</Badge>
                        {metric && <span className="font-bold" style={{ color: "var(--cv-accent-hi)" }}>{metric}</span>}
                      </div>
                    </div>
                    <PowerButton device={device} status={status} onSend={(cmd) => fleet.cmd.send(device, cmd)} size="sm" />
                    <button
                      onClick={() => remove(device.id)}
                      disabled={removeBusy === device.id}
                      aria-label={`Remove ${device.name} from room`}
                      className="rounded-lg p-1.5 text-[11px] font-bold transition hover:brightness-110 disabled:opacity-40"
                      style={{ color: "var(--cv-muted)", background: "var(--cv-card-hi)" }}
                    >
                      {removeBusy === device.id ? "…" : "✕"}
                    </button>
                  </Surface>
                );
              })}
            </div>
          )}
        </section>

        {/* Devices not in this room */}
        <section>
          <SectionTitle>Add devices</SectionTitle>
          {otherDevices.length === 0 ? (
            <p className="text-sm" style={{ color: "var(--cv-muted)" }}>
              Every device is already in this room.
            </p>
          ) : (
            <div className="space-y-2">
              {otherDevices.map((device) => (
                <Surface key={device.id} className="flex items-center gap-3 !p-3">
                  <StatusDot online={device.online} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
                      {device.name}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
                      {device.room ? `In: ${device.room}` : "Unassigned"} · {device.type}
                    </div>
                  </div>
                  <button
                    onClick={() => assign(device.id)}
                    disabled={assignBusy === device.id}
                    aria-label={`Assign ${device.name} to ${room.name}`}
                    className="flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition disabled:opacity-40"
                    style={{ background: "var(--cv-gradient)", color: "#fff" }}
                  >
                    {assignBusy === device.id ? "…" : "Add"}
                  </button>
                </Surface>
              ))}
            </div>
          )}
        </section>
      </div>
    </Drawer>
  );
}
