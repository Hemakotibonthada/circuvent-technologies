"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, Layers, Power, Trash2, Pencil, Check } from "lucide-react";
import { masterPower } from "@/lib/smarthome-command-map";
import { useFleet } from "../_data/hooks";
import {
  Button,
  IconButton,
  Callout,
  SectionTitle,
  Surface,
  Badge,
  StatusDot,
  EmptyState,
  LoadingState,
  Field,
  TextInput,
} from "../_kit/primitives";
import { PowerButton, deviceMetric } from "../_kit/device";
import { Modal, ConfirmDialog, useToast } from "../_kit/overlays";
import { usePersistentState } from "../_kit/primitives";
import type { DeviceGroup } from "./storage";
import { GROUP_ICONS } from "./storage";

const STORAGE_KEY = "cv-spaces-groups-v1";

function newId() {
  return `grp_${Date.now().toString(36)}_${Math.floor(Date.now() % 1000000)}`;
}

export default function GroupsPanel() {
  const fleet = useFleet();
  const toast = useToast();

  const [groups, setGroups, loaded] = usePersistentState<DeviceGroup[]>(STORAGE_KEY, []);

  const [createOpen, setCreateOpen] = useState(false);
  const [editGroup, setEditGroup] = useState<DeviceGroup | null>(null);
  const [deleteGroup, setDeleteGroup] = useState<DeviceGroup | null>(null);

  // Form state (shared by create and edit)
  const [formName, setFormName] = useState("");
  const [formIcon, setFormIcon] = useState<string>(GROUP_ICONS[0]);
  const [formPicked, setFormPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState<string | null>(null);

  const openCreate = useCallback(() => {
    setFormName("");
    setFormIcon(GROUP_ICONS[0]);
    setFormPicked(new Set());
    setCreateOpen(true);
  }, []);

  const openEdit = useCallback((g: DeviceGroup) => {
    setEditGroup(g);
    setFormName(g.name);
    setFormIcon(g.icon);
    setFormPicked(new Set(g.deviceIds));
  }, []);

  const togglePick = useCallback((id: string) => {
    setFormPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleCreate = useCallback(() => {
    const name = formName.trim();
    if (!name || formPicked.size === 0) {
      toast.err("Fill in a name and select at least one device.");
      return;
    }
    const newGroup: DeviceGroup = {
      id: newId(),
      name,
      icon: formIcon,
      deviceIds: Array.from(formPicked),
      createdAt: new Date().toISOString(),
    };
    setGroups((prev) => [newGroup, ...prev]);
    toast.ok(`Group "${name}" created`, "Stored in this browser.");
    setCreateOpen(false);
  }, [formName, formIcon, formPicked, setGroups, toast]);

  const handleEdit = useCallback(() => {
    if (!editGroup) return;
    const name = formName.trim();
    if (!name || formPicked.size === 0) {
      toast.err("Fill in a name and select at least one device.");
      return;
    }
    setGroups((prev) =>
      prev.map((g) =>
        g.id === editGroup.id
          ? { ...g, name, icon: formIcon, deviceIds: Array.from(formPicked) }
          : g,
      ),
    );
    toast.ok("Group updated");
    setEditGroup(null);
  }, [editGroup, formName, formIcon, formPicked, setGroups, toast]);

  const handleDelete = useCallback(() => {
    if (!deleteGroup) return;
    setGroups((prev) => prev.filter((g) => g.id !== deleteGroup.id));
    toast.info(`Group "${deleteGroup.name}" deleted`);
    setDeleteGroup(null);
  }, [deleteGroup, setGroups, toast]);

  const bulkPower = useCallback(
    async (group: DeviceGroup, on: boolean) => {
      setBulkBusy(group.id);
      let skipped = 0;
      await Promise.all(
        group.deviceIds.map((id) => {
          const device = fleet.devices.find((d) => d.id === id);
          if (!device) { skipped++; return Promise.resolve(); }
          if (!device.online) { skipped++; return Promise.resolve(); }
          const mp = masterPower(device);
          if (!mp) { skipped++; return Promise.resolve(); }
          return fleet.cmd.send(device, mp.cmd(on) as Record<string, unknown>);
        }),
      );
      const acted = group.deviceIds.length - skipped;
      if (skipped > 0) {
        toast.info(
          `All ${on ? "on" : "off"}: ${acted} device${acted !== 1 ? "s" : ""}`,
          `${skipped} skipped (offline or no power control).`,
        );
      } else {
        toast.ok(`All ${on ? "on" : "off"} sent to ${acted} device${acted !== 1 ? "s" : ""}.`);
      }
      setBulkBusy(null);
    },
    [fleet, toast],
  );

  if (!loaded) return <LoadingState label="Loading groups" />;

  return (
    <div className="space-y-4">
      <Callout tone="info" title="Stored locally in this browser">
        Groups are not synced to the server. They exist only in this browser&apos;s localStorage and will be
        lost if you clear browser data or switch devices.
      </Callout>

      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: "var(--cv-muted)" }}>
          {groups.length} group{groups.length !== 1 ? "s" : ""}
        </span>
        <Button variant="primary" icon={Plus} onClick={openCreate}>
          New group
        </Button>
      </div>

      {groups.length === 0 ? (
        <EmptyState
          title="No groups yet"
          body='Create a group like "Downstairs lights" or "All outdoor devices" to control several at once.'
          icon={Layers}
          action={
            <Button variant="primary" icon={Plus} onClick={openCreate}>
              Create first group
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {groups.map((g) => (
            <GroupCard
              key={g.id}
              group={g}
              fleet={fleet}
              bulkBusy={bulkBusy === g.id}
              onBulkPower={(on) => bulkPower(g, on)}
              onEdit={() => openEdit(g)}
              onDelete={() => setDeleteGroup(g)}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New group"
        subtitle="Stored locally in this browser — not synced to server."
        width="md"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate}>
              Create group
            </Button>
          </>
        }
      >
        <GroupForm
          name={formName}
          icon={formIcon}
          picked={formPicked}
          onName={setFormName}
          onIcon={setFormIcon}
          onToggle={togglePick}
          fleet={fleet}
        />
      </Modal>

      {/* Edit modal */}
      <Modal
        open={!!editGroup}
        onClose={() => setEditGroup(null)}
        title="Edit group"
        width="md"
        footer={
          <>
            <Button onClick={() => setEditGroup(null)}>Cancel</Button>
            <Button variant="primary" onClick={handleEdit}>
              Save changes
            </Button>
          </>
        }
      >
        <GroupForm
          name={formName}
          icon={formIcon}
          picked={formPicked}
          onName={setFormName}
          onIcon={setFormIcon}
          onToggle={togglePick}
          fleet={fleet}
        />
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteGroup}
        onClose={() => setDeleteGroup(null)}
        onConfirm={handleDelete}
        title={`Delete group "${deleteGroup?.name}"?`}
        body="This group will be removed from local storage. Devices are not affected."
        confirmLabel="Delete group"
        danger
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single group card
// ---------------------------------------------------------------------------
function GroupCard({
  group,
  fleet,
  bulkBusy,
  onBulkPower,
  onEdit,
  onDelete,
}: {
  group: DeviceGroup;
  fleet: ReturnType<typeof useFleet>;
  bulkBusy: boolean;
  onBulkPower: (on: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const devices = useMemo(
    () => group.deviceIds.map((id) => fleet.devices.find((d) => d.id === id)).filter(Boolean) as ReturnType<typeof useFleet>["devices"],
    [group.deviceIds, fleet.devices],
  );
  const online = devices.filter((d) => d.online).length;
  const missing = group.deviceIds.length - devices.length;

  return (
    <Surface>
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-2xl" aria-hidden>{group.icon}</span>
          <div>
            <div className="text-sm font-bold" style={{ color: "var(--cv-text)" }}>{group.name}</div>
            <div className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
              {devices.length} device{devices.length !== 1 ? "s" : ""} · {online} online
              {missing > 0 && ` · ${missing} not found`}
            </div>
          </div>
        </div>
        <div className="flex gap-1 shrink-0">
          <IconButton icon={Pencil} label={`Edit group ${group.name}`} onClick={onEdit} />
          <IconButton icon={Trash2} label={`Delete group ${group.name}`} danger onClick={onDelete} />
        </div>
      </div>

      {/* Device chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {devices.map((d) => {
          const status = fleet.cmd.statusOf(d.id);
          const metric = deviceMetric(d);
          return (
            <div
              key={d.id}
              className="flex items-center gap-1.5 rounded-xl px-2.5 py-1.5"
              style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)" }}
            >
              <StatusDot online={d.online} pulse={false} />
              <span className="text-[11px] font-semibold" style={{ color: "var(--cv-text)" }}>{d.name}</span>
              {metric && <span className="text-[11px] font-bold" style={{ color: "var(--cv-accent-hi)" }}>{metric}</span>}
              <PowerButton device={d} status={status} onSend={(cmd) => fleet.cmd.send(d, cmd)} size="sm" />
            </div>
          );
        })}
      </div>

      {/* Bulk controls */}
      <div className="flex gap-2 border-t pt-3" style={{ borderColor: "var(--cv-border)" }}>
        <button
          onClick={() => onBulkPower(true)}
          disabled={bulkBusy || devices.length === 0}
          aria-label={`Turn on all in ${group.name}`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition disabled:opacity-40"
          style={{ background: "var(--cv-gradient)", color: "#fff" }}
        >
          <Power className="h-3.5 w-3.5" /> All on
        </button>
        <button
          onClick={() => onBulkPower(false)}
          disabled={bulkBusy || devices.length === 0}
          aria-label={`Turn off all in ${group.name}`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-bold transition disabled:opacity-40"
          style={{ background: "var(--cv-card-hi)", border: "1px solid var(--cv-border)", color: "var(--cv-text)" }}
        >
          <Power className="h-3.5 w-3.5" /> All off
        </button>
      </div>
    </Surface>
  );
}

// ---------------------------------------------------------------------------
// Shared form for create and edit
// ---------------------------------------------------------------------------
function GroupForm({
  name,
  icon,
  picked,
  onName,
  onIcon,
  onToggle,
  fleet,
}: {
  name: string;
  icon: string;
  picked: Set<string>;
  onName: (v: string) => void;
  onIcon: (v: string) => void;
  onToggle: (id: string) => void;
  fleet: ReturnType<typeof useFleet>;
}) {
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? fleet.devices.filter((d) => d.name.toLowerCase().includes(q) || d.type.includes(q)) : fleet.devices;
  }, [fleet.devices, search]);

  return (
    <div className="space-y-4">
      <Field label="Group name">
        <TextInput value={name} onChange={onName} placeholder="Downstairs lights" />
      </Field>

      <Field label="Icon">
        <div className="flex flex-wrap gap-2 mt-1">
          {GROUP_ICONS.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={() => onIcon(ic)}
              className="h-10 w-10 rounded-xl text-xl transition"
              style={{
                background: icon === ic ? "var(--cv-accent)" : "var(--cv-card-hi)",
                border: `1px solid ${icon === ic ? "var(--cv-accent)" : "var(--cv-border)"}`,
              }}
              aria-label={`Select icon ${ic}`}
              aria-pressed={icon === ic}
            >
              {ic}
            </button>
          ))}
        </div>
      </Field>

      <Field label={`Devices (${picked.size} selected)`}>
        <div className="mt-1 space-y-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter devices…"
            className="cv-input text-sm w-full"
            aria-label="Filter devices"
          />
          <div className="max-h-52 space-y-1 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-sm py-2" style={{ color: "var(--cv-muted)" }}>No devices found.</p>
            )}
            {filtered.map((d) => {
              const on = picked.has(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onToggle(d.id)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition"
                  style={{
                    background: on ? "color-mix(in srgb, var(--cv-accent) 12%, transparent)" : "var(--cv-card-hi)",
                    border: `1px solid ${on ? "var(--cv-accent)" : "var(--cv-border)"}`,
                  }}
                  aria-pressed={on}
                >
                  {on ? (
                    <Check className="h-4 w-4 shrink-0" style={{ color: "var(--cv-accent-hi)" }} />
                  ) : (
                    <div className="h-4 w-4 shrink-0 rounded border" style={{ borderColor: "var(--cv-border)" }} />
                  )}
                  <StatusDot online={d.online} pulse={false} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold" style={{ color: "var(--cv-text)" }}>
                      {d.name}
                    </div>
                    <div className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
                      {d.type}{d.room ? ` · ${d.room}` : ""}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Field>
    </div>
  );
}
