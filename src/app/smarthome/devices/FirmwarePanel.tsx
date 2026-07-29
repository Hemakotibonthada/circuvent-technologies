"use client";

import { useState } from "react";
import { CheckCircle2, CircleAlert, Upload, Wifi } from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import { getFirmwareInfo, isBehind } from "@/lib/smarthome-firmware";
import type { Device } from "@/lib/control-plane";
import { useFleet, useIsAdmin } from "../_data/hooks";
import { DataGrid, type Column } from "../_kit/data-grid";
import { deviceMeta } from "../DeviceControls";
import { ConfirmDialog, Modal, useToast } from "../_kit/overlays";
import {
  Badge,
  Button,
  Callout,
  Disclosure,
  ErrorState,
  Field,
  Kpi,
  KpiGrid,
  LoadingState,
  SectionTitle,
  SeverityBadge,
  TextInput,
} from "../_kit/primitives";

export function FirmwarePanel() {
  const fleet = useFleet();
  const { isAdmin, checked } = useIsAdmin();
  const toast = useToast();

  const [otaDevice, setOtaDevice] = useState<Device | null>(null);
  const [otaUrl, setOtaUrl] = useState("");
  const [otaVersion, setOtaVersion] = useState("");
  const [otaBusy, setOtaBusy] = useState(false);

  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastUrl, setBroadcastUrl] = useState("");
  const [broadcastVersion, setBroadcastVersion] = useState("");
  const [broadcastType, setBroadcastType] = useState("");
  const [broadcastBusy, setBroadcastBusy] = useState(false);
  const [confirmBroadcast, setConfirmBroadcast] = useState(false);

  if (fleet.loading || !checked) return <LoadingState label="Loading firmware data" />;
  if (fleet.error) return <ErrorState message={fleet.error} onRetry={fleet.refresh} />;

  const behind = fleet.devices.filter((d) => {
    const info = getFirmwareInfo(d.type);
    return info ? isBehind(d.fw_version, info.latestVersion) : false;
  });
  const upToDate = fleet.devices.filter((d) => {
    const info = getFirmwareInfo(d.type);
    return info ? !isBehind(d.fw_version, info.latestVersion) : false;
  });
  const unknownFw = fleet.devices.filter((d) => !d.fw_version);

  // Unique device types present in the fleet that have catalog entries
  const typesWithCatalog = Array.from(
    new Set(fleet.devices.map((d) => d.type))
  ).filter((t) => getFirmwareInfo(t) != null);

  const sendOta = async () => {
    if (!otaDevice || !otaUrl.trim()) return;
    setOtaBusy(true);
    const r = await controlPlane.adminOta(
      otaDevice.id,
      otaUrl.trim(),
      otaVersion.trim() || undefined
    );
    setOtaBusy(false);
    if (r.ok) {
      toast.ok(`OTA queued for ${otaDevice.name}`);
      setOtaDevice(null);
      setOtaUrl("");
      setOtaVersion("");
    } else {
      toast.err("Failed to queue OTA — check the URL and try again");
    }
  };

  const sendBroadcast = async () => {
    setBroadcastBusy(true);
    const r = await controlPlane.adminOtaBroadcast({
      url: broadcastUrl.trim(),
      version: broadcastVersion.trim() || undefined,
      type: broadcastType.trim() || undefined,
    });
    setBroadcastBusy(false);
    setConfirmBroadcast(false);
    if (r.ok) {
      const sent = (r.data as { sent?: number }).sent ?? 0;
      toast.ok(`Broadcast OTA sent to ${sent} device${sent !== 1 ? "s" : ""}`);
      setBroadcastOpen(false);
      setBroadcastUrl("");
      setBroadcastVersion("");
      setBroadcastType("");
    } else {
      toast.err("Broadcast OTA failed");
    }
  };

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
      key: "current",
      header: "Installed",
      value: (d) => d.fw_version ?? "",
      render: (d) => (
        <span
          className="font-mono text-xs"
          style={{ color: d.fw_version ? "var(--cv-text)" : "var(--cv-muted)" }}
        >
          {d.fw_version ?? "—"}
        </span>
      ),
    },
    {
      key: "latest",
      header: "Latest known",
      render: (d) => {
        const info = getFirmwareInfo(d.type);
        return info ? (
          <span className="font-mono text-xs" style={{ color: "var(--cv-muted)" }}>
            {info.latestVersion}
          </span>
        ) : (
          <span style={{ color: "var(--cv-muted)" }}>—</span>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      value: (d) => {
        const info = getFirmwareInfo(d.type);
        if (!info) return "unknown";
        return isBehind(d.fw_version, info.latestVersion) ? "behind" : "current";
      },
      render: (d) => {
        const info = getFirmwareInfo(d.type);
        if (!info) return <Badge>No catalog</Badge>;
        return isBehind(d.fw_version, info.latestVersion) ? (
          <span className="inline-flex items-center gap-1.5">
            <CircleAlert className="h-3.5 w-3.5" style={{ color: "#b45309" }} />
            <SeverityBadge severity="warning">Update available</SeverityBadge>
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5" style={{ color: "#047857" }} />
            <SeverityBadge severity="ok">Current</SeverityBadge>
          </span>
        );
      },
    },
    ...(isAdmin
      ? [
          {
            key: "ota",
            header: "OTA",
            render: (d: Device) => (
              <Button
                icon={Upload}
                variant="secondary"
                onClick={() => {
                  setOtaDevice(d);
                  setOtaUrl("");
                  setOtaVersion("");
                }}
              >
                Push
              </Button>
            ),
          } as Column<Device>,
        ]
      : []),
  ];

  return (
    <div className="space-y-5">
      {/* Summary KPIs */}
      <KpiGrid cols={4}>
        <Kpi label="Total devices" value={fleet.devices.length} />
        <Kpi
          label="Need update"
          value={behind.length}
          tone={behind.length > 0 ? "warning" : "ok"}
        />
        <Kpi label="Up to date" value={upToDate.length} tone="ok" />
        <Kpi
          label="FW unknown"
          value={unknownFw.length}
          tone={unknownFw.length > 0 ? "info" : "ok"}
          hint="Device has not reported version"
        />
      </KpiGrid>

      {/* Admin-only notice for non-admins */}
      {!isAdmin && (
        <Callout tone="info" title="OTA rollouts">
          Firmware updates are pushed by an administrator via the OTA endpoint.
          This view shows the firmware inventory for your fleet compared to the
          known catalog.
        </Callout>
      )}

      {/* Admin broadcast OTA */}
      {isAdmin && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl px-4 py-3"
          style={{ background: "color-mix(in srgb, var(--cv-accent) 8%, transparent)", border: "1px solid var(--cv-border)" }}>
          <div>
            <div className="text-sm font-bold" style={{ color: "var(--cv-text)" }}>
              Broadcast OTA
            </div>
            <div className="text-xs" style={{ color: "var(--cv-muted)" }}>
              Push a firmware update to multiple devices at once (admin only)
            </div>
          </div>
          <Button icon={Upload} onClick={() => setBroadcastOpen(true)}>
            Broadcast update
          </Button>
        </div>
      )}

      {/* Firmware table */}
      <DataGrid<Device>
        rows={fleet.devices}
        columns={columns}
        rowKey={(d) => d.id}
        loading={fleet.loading}
        searchable
        searchPlaceholder="Filter by name, type or version…"
        searchOn={(d) => `${d.fw_version ?? ""} ${deviceMeta(d.type).label} ${d.type}`}
        exportName="firmware"
        storageKey="devices-firmware"
        emptyTitle="No devices"
        dense
      />

      {/* Firmware changelog per type — shows what changed between versions */}
      {typesWithCatalog.length > 0 && (
        <>
          <SectionTitle>Firmware changelog</SectionTitle>
          <div className="space-y-3">
            {typesWithCatalog.map((type) => {
              const info = getFirmwareInfo(type)!;
              const meta = deviceMeta(type);
              const fleetCount = fleet.devices.filter((d) => d.type === type).length;
              return (
                <Disclosure
                  key={type}
                  title={`${meta.label} — latest ${info.latestVersion}`}
                  count={fleetCount}
                >
                  <div className="space-y-3">
                    {info.changelog.map((entry) => (
                      <div key={entry.version}>
                        <div
                          className="mb-1 text-sm font-bold"
                          style={{ color: "var(--cv-accent-hi)" }}
                        >
                          v{entry.version}
                        </div>
                        <ul className="space-y-0.5 pl-4">
                          {entry.notes.map((note, i) => (
                            <li
                              key={i}
                              className="text-sm"
                              style={{ color: "var(--cv-muted)" }}
                            >
                              · {note}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </Disclosure>
              );
            })}
          </div>
        </>
      )}

      {/* Per-device OTA modal (admin only) */}
      <Modal
        open={otaDevice !== null}
        onClose={() => setOtaDevice(null)}
        title={`Push OTA to ${otaDevice?.name ?? ""}`}
        subtitle="The device will download and flash the firmware after restarting."
        width="md"
        footer={
          <>
            <Button onClick={() => setOtaDevice(null)}>Cancel</Button>
            <Button
              variant="primary"
              icon={Upload}
              onClick={sendOta}
              busy={otaBusy}
              disabled={!otaUrl.trim()}
            >
              Push update
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Firmware URL"
            hint="HTTPS URL to the binary (.bin) file the device will download"
          >
            <TextInput
              value={otaUrl}
              onChange={setOtaUrl}
              placeholder="https://firmware.example.com/v2.1.0.bin"
            />
          </Field>
          <Field label="Version tag (optional)" hint="Stored on the device after flash">
            <TextInput
              value={otaVersion}
              onChange={setOtaVersion}
              placeholder="2.1.0"
            />
          </Field>
          {otaDevice && (
            <div
              className="rounded-xl px-4 py-3 text-sm"
              style={{ background: "var(--cv-card-hi)", color: "var(--cv-muted)" }}
            >
              Current firmware:{" "}
              <span className="font-mono font-semibold" style={{ color: "var(--cv-text)" }}>
                {otaDevice.fw_version ?? "—"}
              </span>
            </div>
          )}
        </div>
      </Modal>

      {/* Broadcast OTA modal (admin only) */}
      <Modal
        open={broadcastOpen}
        onClose={() => setBroadcastOpen(false)}
        title="Broadcast OTA"
        subtitle="Push firmware to all matching devices simultaneously. Cannot be undone."
        width="md"
        footer={
          <>
            <Button onClick={() => setBroadcastOpen(false)}>Cancel</Button>
            <Button
              variant="danger"
              icon={Upload}
              onClick={() => setConfirmBroadcast(true)}
              disabled={!broadcastUrl.trim()}
            >
              Review &amp; confirm
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field
            label="Firmware URL"
            hint="HTTPS URL to the binary — all targeted devices will download this"
          >
            <TextInput
              value={broadcastUrl}
              onChange={setBroadcastUrl}
              placeholder="https://firmware.example.com/v2.1.0.bin"
            />
          </Field>
          <Field label="Version tag (optional)">
            <TextInput
              value={broadcastVersion}
              onChange={setBroadcastVersion}
              placeholder="2.1.0"
            />
          </Field>
          <Field
            label="Limit to type (optional)"
            hint="Leave blank to target every online device"
          >
            <TextInput
              value={broadcastType}
              onChange={setBroadcastType}
              placeholder="smart-plug"
            />
          </Field>
          <Callout tone="warning" title="Fleet-wide action">
            All online devices matching the type filter will immediately begin
            downloading and flashing this firmware.
          </Callout>
        </div>
      </Modal>

      <ConfirmDialog
        open={confirmBroadcast}
        onClose={() => setConfirmBroadcast(false)}
        onConfirm={sendBroadcast}
        title="Confirm broadcast OTA"
        body={
          <span>
            Push firmware from{" "}
            <code className="font-mono text-xs">{broadcastUrl}</code> to all
            matching online devices?
            {broadcastType && (
              <span>
                {" "}
                (type: <code className="font-mono text-xs">{broadcastType}</code>)
              </span>
            )}
          </span>
        }
        confirmLabel="Push broadcast"
        danger
        busy={broadcastBusy}
        requirePhrase="BROADCAST"
      />
    </div>
  );
}
