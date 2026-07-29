"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Power, Zap, DoorOpen, AlertCircle } from "lucide-react";
import { controlPlane, type Room } from "@/lib/control-plane";
import { masterPower } from "@/lib/smarthome-command-map";
import { useFleet, useRooms, useEnergy } from "../_data/hooks";
import {
  Button,
  IconButton,
  SectionTitle,
  Surface,
  Kpi,
  KpiGrid,
  LoadingState,
  ErrorState,
  EmptyState,
  StatusDot,
  Badge,
  formatWatts,
  Field,
  TextInput,
} from "../_kit/primitives";
import { PowerButton, deviceMetric } from "../_kit/device";
import { ConfirmDialog, Modal, useToast } from "../_kit/overlays";
import RoomDrawer from "./RoomDrawer";
import { ROOM_ICONS } from "./storage";

// Pre-selects a room when the URL carries ?room=<name> (linked from Overview).
function useRoomParam(): string | null {
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("room");
    if (q) setName(decodeURIComponent(q));
  }, []);
  return name;
}

export default function RoomsPanel() {
  const fleet = useFleet();
  const roomsApi = useRooms();
  const energy = useEnergy();
  const toast = useToast();

  const preselected = useRoomParam();
  const [selectedRoom, setSelectedRoom] = useState<string | null>(null);
  const [drawerRoom, setDrawerRoom] = useState<Room | null>(null);

  // Name to create
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState<string>(ROOM_ICONS[0]);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Edit room name
  const [editRoom, setEditRoom] = useState<Room | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState<string>(ROOM_ICONS[0]);
  const [editBusy, setEditBusy] = useState(false);

  // Delete room
  const [deleteRoom, setDeleteRoom] = useState<Room | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // Bulk power state per room
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  // Apply URL pre-selection once rooms load
  useEffect(() => {
    if (preselected && roomsApi.rooms.length > 0) {
      const match = roomsApi.rooms.find((r) => r.name === preselected);
      if (match) setSelectedRoom(match.name);
    }
  }, [preselected, roomsApi.rooms]);

  // Default to first room once loaded
  useEffect(() => {
    if (!selectedRoom && roomsApi.rooms.length > 0) {
      setSelectedRoom(roomsApi.rooms[0].name);
    }
  }, [selectedRoom, roomsApi.rooms]);

  const current = useMemo(
    () => roomsApi.rooms.find((r) => r.name === selectedRoom) ?? roomsApi.rooms[0] ?? null,
    [roomsApi.rooms, selectedRoom],
  );

  // Devices in the currently selected room (live state from fleet)
  const roomDevices = useMemo(() => {
    if (!current) return [];
    return fleet.devices.filter((d) => (d.room || "") === current.name);
  }, [fleet.devices, current]);

  // Per-room watt draw from energy summary
  const roomWatts = useMemo(() => {
    if (!current) return null;
    const ids = new Set(roomDevices.map((d) => d.id));
    let total = 0;
    let hasData = false;
    for (const row of energy.byDevice) {
      if (ids.has(row.id) && typeof row.watts === "number" && Number.isFinite(row.watts)) {
        total += row.watts;
        hasData = true;
      }
    }
    return hasData ? total : null;
  }, [roomDevices, energy.byDevice, current]);

  const onlineInRoom = useMemo(() => roomDevices.filter((d) => d.online).length, [roomDevices]);

  const handleCreate = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const name = newName.trim();
      if (!name) return;
      setCreating(true);
      setCreateError(null);
      const r = await controlPlane.createRoom(name, newIcon);
      if (r.ok) {
        toast.ok(`Room "${name}" created`);
        setNewName("");
        setNewIcon(ROOM_ICONS[0]);
        setCreateOpen(false);
        setSelectedRoom(name);
        await roomsApi.refresh();
      } else {
        setCreateError(r.status === 0 ? "Network error — check your connection." : `Server returned ${r.status}.`);
      }
      setCreating(false);
    },
    [newName, newIcon, toast, roomsApi],
  );

  const openEdit = useCallback((room: Room) => {
    setEditRoom(room);
    setEditName(room.name);
    setEditIcon(room.icon || ROOM_ICONS[0]);
  }, []);

  const handleEdit = useCallback(async () => {
    if (!editRoom || editRoom.id == null) return;
    const name = editName.trim();
    if (!name) return;
    setEditBusy(true);
    const r = await controlPlane.updateRoom(editRoom.id, { name, icon: editIcon, sort: editRoom.sort });
    if (r.ok) {
      toast.ok(`Room renamed to "${name}"`);
      // Renaming a room does NOT re-point devices — their room string is unchanged.
      // If the name changed, warn so the operator can reassign them.
      if (name !== editRoom.name) {
        toast.info(
          "Device room strings not updated",
          `Devices still reference "${editRoom.name}". Re-assign them in the drawer if needed.`,
        );
      }
      if (selectedRoom === editRoom.name) setSelectedRoom(name);
      setEditRoom(null);
      await roomsApi.refresh();
    } else {
      toast.err("Update failed", r.status === 0 ? "Network error." : `Status ${r.status}.`);
    }
    setEditBusy(false);
  }, [editRoom, editName, editIcon, toast, roomsApi, selectedRoom]);

  const handleDelete = useCallback(async () => {
    if (!deleteRoom || deleteRoom.id == null) return;
    setDeleteBusy(true);
    const r = await controlPlane.deleteRoom(deleteRoom.id);
    if (r.ok) {
      toast.ok(`Room "${deleteRoom.name}" deleted`);
      if (selectedRoom === deleteRoom.name) setSelectedRoom(null);
      setDeleteRoom(null);
      await roomsApi.refresh();
      await fleet.refresh();
    } else {
      toast.err("Delete failed", r.status === 0 ? "Network error." : `Status ${r.status}.`);
    }
    setDeleteBusy(false);
  }, [deleteRoom, toast, roomsApi, fleet, selectedRoom]);

  const handleBulkPower = useCallback(
    async (roomName: string, on: boolean) => {
      setBulkBusy(roomName);
      const devices = fleet.devices.filter((d) => (d.room || "") === roomName);
      let skipped = 0;
      await Promise.all(
        devices.map((d) => {
          if (!d.online) { skipped++; return Promise.resolve(); }
          const mp = masterPower(d);
          if (!mp) { skipped++; return Promise.resolve(); }
          return fleet.cmd.send(d, mp.cmd(on) as Record<string, unknown>);
        }),
      );
      const label = on ? "on" : "off";
      const acted = devices.length - skipped;
      if (skipped > 0) {
        toast.info(
          `All ${label}: ${acted} device${acted !== 1 ? "s" : ""}`,
          `${skipped} skipped (offline or no power control).`,
        );
      } else {
        toast.ok(`All ${label} sent to ${acted} device${acted !== 1 ? "s" : ""}`);
      }
      setBulkBusy(null);
    },
    [fleet, toast],
  );

  if (roomsApi.loading && roomsApi.rooms.length === 0) {
    return <LoadingState label="Loading rooms" />;
  }

  if (roomsApi.error && roomsApi.rooms.length === 0) {
    return <ErrorState message={roomsApi.error} onRetry={roomsApi.refresh} />;
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-sm" style={{ color: "var(--cv-muted)" }}>
          {roomsApi.rooms.length} room{roomsApi.rooms.length !== 1 ? "s" : ""} · {fleet.devices.length} devices
        </span>
        <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
          New room
        </Button>
      </div>

      {roomsApi.rooms.length === 0 ? (
        <EmptyState
          title="No rooms yet"
          body="Create a room to start organising your devices by location."
          icon={DoorOpen}
          action={
            <Button variant="primary" icon={Plus} onClick={() => setCreateOpen(true)}>
              Create first room
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          {/* Room list */}
          <div className="space-y-2">
            {roomsApi.rooms.map((room) => {
              const devCount = fleet.devices.filter((d) => (d.room || "") === room.name).length;
              const isActive = current?.name === room.name;
              return (
                <button
                  key={`${room.id}-${room.name}`}
                  onClick={() => setSelectedRoom(room.name)}
                  className="w-full rounded-2xl p-4 text-left transition"
                  style={{
                    background: isActive ? "var(--cv-card-hi)" : "var(--cv-card)",
                    border: `1px solid ${isActive ? "var(--cv-accent)" : "var(--cv-border)"}`,
                  }}
                  aria-pressed={isActive}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl" aria-hidden>
                      {room.icon || "🏠"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold" style={{ color: "var(--cv-text)" }}>
                        {room.name || "Unassigned"}
                      </div>
                      <div className="mt-0.5 text-[11px]" style={{ color: "var(--cv-muted)" }}>
                        {devCount} device{devCount !== 1 ? "s" : ""}
                      </div>
                    </div>
                    {room.id != null && (
                      <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                        <IconButton
                          icon={Pencil}
                          label={`Edit room ${room.name}`}
                          onClick={() => openEdit(room)}
                        />
                        <IconButton
                          icon={Trash2}
                          label={`Delete room ${room.name}`}
                          danger
                          onClick={() => setDeleteRoom(room)}
                        />
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Room detail */}
          {current && (
            <div className="space-y-4">
              {/* Room KPIs */}
              <KpiGrid cols={3}>
                <Kpi
                  label="Devices"
                  value={roomDevices.length}
                  hint={`${onlineInRoom} online`}
                  icon={DoorOpen}
                />
                <Kpi
                  label="Online"
                  value={onlineInRoom}
                  unit={`/ ${roomDevices.length}`}
                  tone={onlineInRoom < roomDevices.length ? "warning" : "ok"}
                />
                <Kpi
                  label="Live draw"
                  value={roomWatts != null ? formatWatts(roomWatts) : "—"}
                  icon={Zap}
                  hint={roomWatts == null ? "no energy data" : undefined}
                />
              </KpiGrid>

              {/* Bulk controls */}
              <div className="flex gap-2">
                <Button
                  variant="primary"
                  icon={Power}
                  busy={bulkBusy === current.name}
                  disabled={roomDevices.length === 0}
                  onClick={() => handleBulkPower(current.name, true)}
                >
                  All on
                </Button>
                <Button
                  variant="secondary"
                  icon={Power}
                  busy={bulkBusy === current.name}
                  disabled={roomDevices.length === 0}
                  onClick={() => handleBulkPower(current.name, false)}
                >
                  All off
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => setDrawerRoom(current)}
                >
                  Manage devices →
                </Button>
              </div>

              {/* Device list */}
              <SectionTitle>Devices in {current.name}</SectionTitle>
              {roomDevices.length === 0 ? (
                <Surface>
                  <div className="flex flex-col items-center gap-2 py-6 text-center">
                    <DoorOpen className="h-8 w-8" style={{ color: "var(--cv-muted)" }} />
                    <p className="text-sm" style={{ color: "var(--cv-muted)" }}>
                      No devices assigned to this room yet.
                    </p>
                    <Button variant="ghost" onClick={() => setDrawerRoom(current)}>
                      Assign devices →
                    </Button>
                  </div>
                </Surface>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {roomDevices.map((device) => {
                    const status = fleet.cmd.statusOf(device.id);
                    const metric = deviceMetric(device);
                    return (
                      <Surface key={device.id} className="flex items-center gap-3">
                        <StatusDot online={device.online} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
                            {device.name}
                          </div>
                          <div className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
                            {device.type}
                            {metric ? ` · ${metric}` : ""}
                          </div>
                        </div>
                        <PowerButton
                          device={device}
                          status={status}
                          onSend={(cmd) => fleet.cmd.send(device, cmd)}
                          size="sm"
                        />
                      </Surface>
                    );
                  })}
                </div>
              )}

              {/* Unassigned device picker */}
              <SectionTitle right={
                <span className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
                  {fleet.devices.filter((d) => !(d.room || "")).length} unassigned
                </span>
              }>
                Assign more devices
              </SectionTitle>
              <UnassignedDevicePicker
                roomName={current.name}
                fleet={fleet}
                onAssigned={roomsApi.refresh}
                toast={toast}
              />
            </div>
          )}
        </div>
      )}

      {/* Create room modal */}
      <Modal
        open={createOpen}
        onClose={() => { setCreateOpen(false); setCreateError(null); }}
        title="New room"
        subtitle="Rooms are stored on the server."
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" busy={creating} onClick={() => {
              const form = document.getElementById("create-room-form") as HTMLFormElement | null;
              form?.requestSubmit();
            }}>
              Create
            </Button>
          </>
        }
      >
        <form id="create-room-form" onSubmit={handleCreate} className="space-y-4">
          <Field label="Icon">
            <div className="flex flex-wrap gap-2 mt-1">
              {ROOM_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setNewIcon(ic)}
                  className="h-10 w-10 rounded-xl text-xl transition"
                  style={{
                    background: newIcon === ic ? "var(--cv-accent)" : "var(--cv-card-hi)",
                    border: `1px solid ${newIcon === ic ? "var(--cv-accent)" : "var(--cv-border)"}`,
                  }}
                  aria-label={`Select icon ${ic}`}
                  aria-pressed={newIcon === ic}
                >
                  {ic}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Room name" error={createError}>
            <TextInput
              value={newName}
              onChange={setNewName}
              placeholder="Living room"
            />
          </Field>
        </form>
      </Modal>

      {/* Edit room modal */}
      <Modal
        open={!!editRoom}
        onClose={() => setEditRoom(null)}
        title="Edit room"
        footer={
          <>
            <Button onClick={() => setEditRoom(null)}>Cancel</Button>
            <Button variant="primary" busy={editBusy} onClick={handleEdit}>
              Save
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Icon">
            <div className="flex flex-wrap gap-2 mt-1">
              {ROOM_ICONS.map((ic) => (
                <button
                  key={ic}
                  type="button"
                  onClick={() => setEditIcon(ic)}
                  className="h-10 w-10 rounded-xl text-xl transition"
                  style={{
                    background: editIcon === ic ? "var(--cv-accent)" : "var(--cv-card-hi)",
                    border: `1px solid ${editIcon === ic ? "var(--cv-accent)" : "var(--cv-border)"}`,
                  }}
                  aria-label={`Select icon ${ic}`}
                  aria-pressed={editIcon === ic}
                >
                  {ic}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Name">
            <TextInput value={editName} onChange={setEditName} placeholder="Room name" />
          </Field>
          {editRoom && editName.trim() !== editRoom.name && (
            <div
              className="flex items-start gap-2 rounded-xl p-3 text-xs"
              style={{ background: "rgba(217,119,6,0.1)", border: "1px solid rgba(217,119,6,0.3)" }}
              role="alert"
            >
              <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "#b45309" }} />
              <span style={{ color: "#b45309" }}>
                Renaming a room does not update device room strings. Re-assign devices if needed.
              </span>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteRoom}
        onClose={() => setDeleteRoom(null)}
        onConfirm={handleDelete}
        busy={deleteBusy}
        title={`Delete "${deleteRoom?.name}"?`}
        body={
          <>
            <p>
              This room will be removed from the server. Devices assigned to it will be left unassigned — their room
              string is not cleared automatically.
            </p>
          </>
        }
        confirmLabel="Delete room"
        requirePhrase={deleteRoom?.name}
      />

      {/* Room device drawer */}
      {drawerRoom && (
        <RoomDrawer
          room={drawerRoom}
          fleet={fleet}
          onClose={() => setDrawerRoom(null)}
          onRefresh={async () => {
            await fleet.refresh();
            await roomsApi.refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Unassigned device picker — shows devices with no room and lets the operator
// assign them to the currently selected room.
// ---------------------------------------------------------------------------
function UnassignedDevicePicker({
  roomName,
  fleet,
  onAssigned,
  toast,
}: {
  roomName: string;
  fleet: ReturnType<typeof useFleet>;
  onAssigned: () => Promise<void>;
  toast: ReturnType<typeof useToast>;
}) {
  const unassigned = useMemo(
    () => fleet.devices.filter((d) => !(d.room || "").trim()),
    [fleet.devices],
  );

  const [busy, setBusy] = useState<string | null>(null);

  const assign = useCallback(
    async (id: string) => {
      setBusy(id);
      const ok = await fleet.assignRoom(id, roomName);
      if (ok) {
        toast.ok("Device assigned", `Added to "${roomName}".`);
        await onAssigned();
      } else {
        toast.err("Assignment failed");
      }
      setBusy(null);
    },
    [fleet, roomName, onAssigned, toast],
  );

  if (unassigned.length === 0) {
    return (
      <p className="text-sm py-2" style={{ color: "var(--cv-muted)" }}>
        All devices are already assigned to a room.
      </p>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {unassigned.map((d) => (
        <Surface key={d.id} className="flex items-center gap-3">
          <StatusDot online={d.online} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
              {d.name}
            </div>
            <div className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
              {d.type}
            </div>
          </div>
          <Button
            variant="primary"
            busy={busy === d.id}
            onClick={() => assign(d.id)}
          >
            Assign
          </Button>
        </Surface>
      ))}
    </div>
  );
}
