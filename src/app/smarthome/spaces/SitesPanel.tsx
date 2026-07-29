"use client";

import { useCallback, useMemo, useState } from "react";
import { Plus, Building2, Pencil, Trash2, Globe, MapPin, Clock } from "lucide-react";
import { useFleet, useRooms } from "../_data/hooks";
import {
  Button,
  IconButton,
  Callout,
  SectionTitle,
  Surface,
  Kpi,
  KpiGrid,
  Badge,
  StatusDot,
  EmptyState,
  LoadingState,
  Field,
  TextInput,
  SelectInput,
} from "../_kit/primitives";
import { Modal, ConfirmDialog, useToast } from "../_kit/overlays";
import { usePersistentState } from "../_kit/primitives";
import type { Site } from "./storage";
import { TIMEZONES } from "./storage";

const STORAGE_KEY = "cv-spaces-sites-v1";

function newId(): string {
  return `site_${Date.now().toString(36)}`;
}

export default function SitesPanel() {
  const fleet = useFleet();
  const roomsApi = useRooms();
  const toast = useToast();

  const [sites, setSites, loaded] = usePersistentState<Site[]>(STORAGE_KEY, []);
  const [selectedSite, setSelectedSite] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [editSite, setEditSite] = useState<Site | null>(null);
  const [deleteSite, setDeleteSite] = useState<Site | null>(null);

  // Form fields
  const [formName, setFormName] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formTimezone, setFormTimezone] = useState<string>(TIMEZONES[0]);
  const [formRooms, setFormRooms] = useState<Set<string>>(new Set());

  const openCreate = useCallback(() => {
    setFormName("");
    setFormAddress("");
    setFormTimezone(TIMEZONES[0]);
    setFormRooms(new Set());
    setCreateOpen(true);
  }, []);

  const openEdit = useCallback((site: Site) => {
    setEditSite(site);
    setFormName(site.name);
    setFormAddress(site.address);
    setFormTimezone(site.timezone || TIMEZONES[0]);
    setFormRooms(new Set(site.roomNames));
  }, []);

  const toggleRoom = useCallback((roomName: string) => {
    setFormRooms((prev) => {
      const next = new Set(prev);
      if (next.has(roomName)) next.delete(roomName);
      else next.add(roomName);
      return next;
    });
  }, []);

  const handleCreate = useCallback(() => {
    const name = formName.trim();
    if (!name) {
      toast.err("Enter a site name.");
      return;
    }
    const site: Site = {
      id: newId(),
      name,
      address: formAddress.trim(),
      timezone: formTimezone,
      roomNames: Array.from(formRooms),
      createdAt: new Date().toISOString(),
    };
    setSites((prev) => [site, ...prev]);
    toast.ok(`Site "${name}" created`, "Stored in this browser.");
    setCreateOpen(false);
  }, [formName, formAddress, formTimezone, formRooms, setSites, toast]);

  const handleEdit = useCallback(() => {
    if (!editSite) return;
    const name = formName.trim();
    if (!name) {
      toast.err("Enter a site name.");
      return;
    }
    setSites((prev) =>
      prev.map((s) =>
        s.id === editSite.id
          ? { ...s, name, address: formAddress.trim(), timezone: formTimezone, roomNames: Array.from(formRooms) }
          : s,
      ),
    );
    toast.ok("Site updated");
    setEditSite(null);
  }, [editSite, formName, formAddress, formTimezone, formRooms, setSites, toast]);

  const handleDelete = useCallback(() => {
    if (!deleteSite) return;
    setSites((prev) => prev.filter((s) => s.id !== deleteSite.id));
    if (selectedSite === deleteSite.id) setSelectedSite(null);
    toast.info(`Site "${deleteSite.name}" deleted`);
    setDeleteSite(null);
  }, [deleteSite, setSites, selectedSite, toast]);

  // Compute per-site device/online counts
  const siteStats = useMemo(() => {
    const map = new Map<string, { devices: number; online: number }>();
    for (const site of sites) {
      const siteDevices = fleet.devices.filter((d) => site.roomNames.includes(d.room ?? ""));
      map.set(site.id, {
        devices: siteDevices.length,
        online: siteDevices.filter((d) => d.online).length,
      });
    }
    return map;
  }, [sites, fleet.devices]);

  const current = useMemo(
    () => sites.find((s) => s.id === selectedSite) ?? null,
    [sites, selectedSite],
  );

  // Devices in the currently viewed site
  const siteDevices = useMemo(() => {
    if (!current) return [];
    return fleet.devices.filter((d) => current.roomNames.includes(d.room ?? ""));
  }, [current, fleet.devices]);

  const tzOptions = useMemo(
    () => TIMEZONES.map((tz) => ({ value: tz as string, label: tz })),
    [],
  );

  if (!loaded) return <LoadingState label="Loading sites" />;

  return (
    <div className="space-y-4">
      <Callout tone="info" title="Stored locally in this browser">
        Site configuration (name, address, timezone, room assignments) is saved only in this browser&apos;s
        localStorage. It is not synced to the server or to other devices.
      </Callout>

      <div className="flex items-center justify-between">
        <span className="text-sm" style={{ color: "var(--cv-muted)" }}>
          {sites.length} site{sites.length !== 1 ? "s" : ""}
        </span>
        <Button variant="primary" icon={Plus} onClick={openCreate}>
          New site
        </Button>
      </div>

      {sites.length === 0 ? (
        <EmptyState
          title="No sites yet"
          body="Create a site to group rooms that belong to the same property — e.g. home, office, or warehouse."
          icon={Building2}
          action={
            <Button variant="primary" icon={Plus} onClick={openCreate}>
              Create first site
            </Button>
          }
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-[280px_1fr]">
          {/* Site list */}
          <div className="space-y-2">
            {sites.map((site) => {
              const stats = siteStats.get(site.id) ?? { devices: 0, online: 0 };
              const isActive = selectedSite === site.id;
              return (
                <button
                  key={site.id}
                  onClick={() => setSelectedSite(site.id)}
                  className="w-full rounded-2xl p-4 text-left transition"
                  style={{
                    background: isActive ? "var(--cv-card-hi)" : "var(--cv-card)",
                    border: `1px solid ${isActive ? "var(--cv-accent)" : "var(--cv-border)"}`,
                  }}
                  aria-pressed={isActive}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: "color-mix(in srgb, var(--cv-accent) 14%, transparent)" }}>
                      <Building2 className="h-5 w-5" style={{ color: "var(--cv-accent-hi)" }} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold" style={{ color: "var(--cv-text)" }}>{site.name}</div>
                      {site.address && (
                        <div className="mt-0.5 truncate text-[11px]" style={{ color: "var(--cv-muted)" }}>{site.address}</div>
                      )}
                      <div className="mt-0.5 text-[11px]" style={{ color: "var(--cv-muted)" }}>
                        {stats.devices} device{stats.devices !== 1 ? "s" : ""} · {stats.online} online · {site.roomNames.length} room{site.roomNames.length !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <IconButton icon={Pencil} label={`Edit site ${site.name}`} onClick={() => openEdit(site)} />
                      <IconButton icon={Trash2} label={`Delete site ${site.name}`} danger onClick={() => setDeleteSite(site)} />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Site detail */}
          {current ? (
            <div className="space-y-4">
              <KpiGrid cols={3}>
                <Kpi label="Rooms" value={current.roomNames.length} icon={Building2} />
                <Kpi label="Devices" value={(siteStats.get(current.id) ?? { devices: 0 }).devices} />
                <Kpi
                  label="Online"
                  value={(siteStats.get(current.id) ?? { online: 0 }).online}
                  unit={`/ ${(siteStats.get(current.id) ?? { devices: 0 }).devices}`}
                  tone={(siteStats.get(current.id) ?? { online: 0, devices: 0 }).online < (siteStats.get(current.id) ?? { devices: 1 }).devices ? "warning" : "ok"}
                />
              </KpiGrid>

              {/* Metadata */}
              <Surface>
                <SectionTitle>Details</SectionTitle>
                <div className="space-y-1" style={{ borderTop: "1px solid var(--cv-border)" }}>
                  <MetaRow icon={MapPin} label="Address">{current.address || "—"}</MetaRow>
                  <MetaRow icon={Clock} label="Timezone">{current.timezone || "—"}</MetaRow>
                  <MetaRow icon={Globe} label="Rooms">
                    {current.roomNames.length > 0
                      ? current.roomNames.join(", ")
                      : "No rooms assigned"}
                  </MetaRow>
                </div>
              </Surface>

              {/* Devices in site */}
              <SectionTitle right={<Badge>{siteDevices.length}</Badge>}>Devices in this site</SectionTitle>
              {siteDevices.length === 0 ? (
                <Surface>
                  <p className="text-sm text-center py-4" style={{ color: "var(--cv-muted)" }}>
                    No devices found in the assigned rooms. Assign rooms to this site that contain devices.
                  </p>
                </Surface>
              ) : (
                <div className="grid gap-2 sm:grid-cols-2">
                  {siteDevices.map((device) => (
                    <Surface key={device.id} className="flex items-center gap-3 !p-3">
                      <StatusDot online={device.online} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold" style={{ color: "var(--cv-text)" }}>{device.name}</div>
                        <div className="text-[11px]" style={{ color: "var(--cv-muted)" }}>
                          {device.type} · {device.room || "unassigned"}
                        </div>
                      </div>
                      <Badge>{device.online ? "online" : "offline"}</Badge>
                    </Surface>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center rounded-2xl py-16" style={{ border: "1px dashed var(--cv-border)" }}>
              <p className="text-sm" style={{ color: "var(--cv-muted)" }}>Select a site to view details.</p>
            </div>
          )}
        </div>
      )}

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="New site"
        subtitle="Stored locally in this browser — not synced to server."
        width="md"
        footer={
          <>
            <Button onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCreate}>Create site</Button>
          </>
        }
      >
        <SiteForm
          name={formName}
          address={formAddress}
          timezone={formTimezone}
          roomsPicked={formRooms}
          allRooms={roomsApi.rooms}
          onName={setFormName}
          onAddress={setFormAddress}
          onTimezone={setFormTimezone}
          onToggleRoom={toggleRoom}
          tzOptions={tzOptions}
        />
      </Modal>

      {/* Edit modal */}
      <Modal
        open={!!editSite}
        onClose={() => setEditSite(null)}
        title="Edit site"
        width="md"
        footer={
          <>
            <Button onClick={() => setEditSite(null)}>Cancel</Button>
            <Button variant="primary" onClick={handleEdit}>Save changes</Button>
          </>
        }
      >
        <SiteForm
          name={formName}
          address={formAddress}
          timezone={formTimezone}
          roomsPicked={formRooms}
          allRooms={roomsApi.rooms}
          onName={setFormName}
          onAddress={setFormAddress}
          onTimezone={setFormTimezone}
          onToggleRoom={toggleRoom}
          tzOptions={tzOptions}
        />
      </Modal>

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteSite}
        onClose={() => setDeleteSite(null)}
        onConfirm={handleDelete}
        title={`Delete site "${deleteSite?.name}"?`}
        body="The site definition will be removed from local storage. Rooms and devices are not affected."
        confirmLabel="Delete site"
        danger
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared form component
// ---------------------------------------------------------------------------
function SiteForm({
  name, address, timezone, roomsPicked, allRooms, onName, onAddress, onTimezone, onToggleRoom, tzOptions,
}: {
  name: string;
  address: string;
  timezone: string;
  roomsPicked: Set<string>;
  allRooms: { name: string; icon?: string }[];
  onName: (v: string) => void;
  onAddress: (v: string) => void;
  onTimezone: (v: string) => void;
  onToggleRoom: (name: string) => void;
  tzOptions: { value: string; label: string }[];
}) {
  return (
    <div className="space-y-4">
      <Field label="Site name">
        <TextInput value={name} onChange={onName} placeholder="Home, Office, Warehouse…" />
      </Field>
      <Field label="Address" hint="Optional — for reference only.">
        <TextInput value={address} onChange={onAddress} placeholder="123 Example St, City" />
      </Field>
      <Field label="Timezone">
        <SelectInput
          value={timezone}
          onChange={onTimezone}
          options={tzOptions}
        />
      </Field>
      <Field label={`Assign rooms (${roomsPicked.size} selected)`} hint="All devices in these rooms appear under this site.">
        {allRooms.length === 0 ? (
          <p className="text-xs py-2" style={{ color: "var(--cv-muted)" }}>No rooms found. Create rooms first in the Rooms tab.</p>
        ) : (
          <div className="mt-1 max-h-48 space-y-1.5 overflow-y-auto">
            {allRooms.map((room) => {
              const on = roomsPicked.has(room.name);
              return (
                <button
                  key={room.name}
                  type="button"
                  onClick={() => onToggleRoom(room.name)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition"
                  style={{
                    background: on ? "color-mix(in srgb, var(--cv-accent) 12%, transparent)" : "var(--cv-card-hi)",
                    border: `1px solid ${on ? "var(--cv-accent)" : "var(--cv-border)"}`,
                  }}
                  aria-pressed={on}
                >
                  <span className="text-lg" aria-hidden>{room.icon || "🏠"}</span>
                  <span className="flex-1 text-sm font-semibold" style={{ color: "var(--cv-text)" }}>{room.name}</span>
                  {on && (
                    <span className="text-xs font-bold" style={{ color: "var(--cv-accent-hi)" }}>✓</span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </Field>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metadata row
// ---------------------------------------------------------------------------
function MetaRow({ icon: Icon, label, children }: { icon: typeof Globe; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2.5 border-b last:border-0" style={{ borderColor: "var(--cv-border)" }}>
      <Icon className="h-4 w-4 shrink-0" style={{ color: "var(--cv-muted)" }} />
      <span className="text-sm" style={{ color: "var(--cv-muted)" }}>{label}</span>
      <span className="ml-auto min-w-0 truncate text-sm font-semibold" style={{ color: "var(--cv-text)" }}>{children}</span>
    </div>
  );
}
