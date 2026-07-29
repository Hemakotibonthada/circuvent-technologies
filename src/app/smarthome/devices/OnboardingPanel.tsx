"use client";

import { useState } from "react";
import { CheckCircle2, Circle, PackagePlus, Server, Wifi } from "lucide-react";
import { controlPlane } from "@/lib/control-plane";
import { useFleet, useIsAdmin } from "../_data/hooks";
import { useToast } from "../_kit/overlays";
import {
  Badge,
  Button,
  Callout,
  CopyField,
  Field,
  Kpi,
  KpiGrid,
  RelativeTime,
  SectionTitle,
  SeverityBadge,
  StatusDot,
  TextInput,
} from "../_kit/primitives";
import { deviceMeta } from "../DeviceControls";

interface ClaimedResult {
  id: string;
  name: string;
}

interface ProvisionResult {
  id: string;
  key: string;
  mqttUsername: string;
  mqttPassword: string;
}

export function OnboardingPanel() {
  const fleet = useFleet();
  const { isAdmin, checked } = useIsAdmin();
  const toast = useToast();

  // ── Claim form (any user) ──────────────────────────────────────────────────
  const [claimId, setClaimId] = useState("");
  const [claimKey, setClaimKey] = useState("");
  const [claimName, setClaimName] = useState("");
  const [claimBusy, setClaimBusy] = useState(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [claimedDevice, setClaimedDevice] = useState<ClaimedResult | null>(null);

  // ── Admin provision form ───────────────────────────────────────────────────
  const [provisionType, setProvisionType] = useState("");
  const [provisionName, setProvisionName] = useState("");
  const [provisionBusy, setProvisionBusy] = useState(false);
  const [provisionResult, setProvisionResult] = useState<ProvisionResult | null>(null);
  const [provisionError, setProvisionError] = useState<string | null>(null);

  const handleClaim = async () => {
    if (!claimId.trim() || !claimKey.trim() || !claimName.trim()) return;
    setClaimBusy(true);
    setClaimError(null);
    const r = await controlPlane.claim(
      claimId.trim(),
      claimKey.trim(),
      claimName.trim()
    );
    setClaimBusy(false);
    if (r.ok && r.data.success) {
      const confirmedId = r.data.id ?? claimId.trim();
      setClaimedDevice({ id: confirmedId, name: claimName.trim() });
      setClaimId("");
      setClaimKey("");
      setClaimName("");
      await fleet.refresh();
      toast.ok(`"${claimName.trim()}" claimed successfully`);
    } else {
      const msg =
        r.data.error ??
        (r.status === 0
          ? "Network error — check your connection"
          : `Server error (${r.status})`);
      setClaimError(msg);
      toast.err(`Claim failed: ${msg}`);
    }
  };

  const handleProvision = async () => {
    if (!provisionType.trim()) return;
    setProvisionBusy(true);
    setProvisionError(null);
    const r = await controlPlane.adminProvision({
      type: provisionType.trim(),
      name: provisionName.trim() || undefined,
    });
    setProvisionBusy(false);
    if (r.ok && r.data.id) {
      setProvisionResult({
        id: r.data.id,
        key: r.data.key,
        mqttUsername: r.data.mqttUsername,
        mqttPassword: r.data.mqttPassword,
      });
      setProvisionType("");
      setProvisionName("");
      toast.ok("Device provisioned — flash the credentials onto the hardware");
    } else {
      const msg = r.data.error ?? `Server error (${r.status})`;
      setProvisionError(msg);
      toast.err(`Provision failed: ${msg}`);
    }
  };

  // Check whether the just-claimed device has come online yet
  const claimedLive = claimedDevice
    ? fleet.byId.get(claimedDevice.id)
    : null;

  const checklist = claimedDevice
    ? [
        { label: "Device claimed on control plane", done: true },
        {
          label: "Device online",
          done: claimedLive?.online ?? false,
          pending: !claimedLive,
        },
        {
          label: "Room assigned",
          done: !!(claimedLive?.room),
          pending: !claimedLive,
        },
        {
          label: "Firmware version reported",
          done: !!(claimedLive?.fw_version),
          pending: !claimedLive,
        },
        {
          label: "Telemetry received",
          done: Object.keys(claimedLive?.state ?? {}).length > 0,
          pending: !claimedLive,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      {/* Claim a device */}
      <div className="cv-card rounded-2xl p-5">
        <h2 className="mb-1 text-base font-extrabold" style={{ color: "var(--cv-text)" }}>
          Claim a device
        </h2>
        <p className="mb-5 text-sm" style={{ color: "var(--cv-muted)" }}>
          Enter the device ID and pairing key printed on the label. The device
          must be powered on and connected to Wi-Fi before claiming.
        </p>
        <div className="space-y-3">
          <Field
            label="Device ID"
            hint="Printed on the device label, e.g. ESP-A1B2C3"
          >
            <TextInput
              value={claimId}
              onChange={setClaimId}
              placeholder="ESP-A1B2C3"
            />
          </Field>
          <Field
            label="Pairing key"
            hint="8-character key from the device provisioning screen"
          >
            <TextInput
              value={claimKey}
              onChange={setClaimKey}
              placeholder="XXXX-XXXX"
            />
          </Field>
          <Field label="Display name">
            <TextInput
              value={claimName}
              onChange={setClaimName}
              placeholder="Living room plug"
            />
          </Field>
          {claimError && (
            <Callout tone="critical" title="Claim failed">
              {claimError}
            </Callout>
          )}
          <Button
            variant="primary"
            icon={PackagePlus}
            onClick={handleClaim}
            busy={claimBusy}
            disabled={!claimId.trim() || !claimKey.trim() || !claimName.trim()}
            full
          >
            Claim device
          </Button>
        </div>
      </div>

      {/* Post-claim checklist */}
      {claimedDevice && (
        <div className="cv-card rounded-2xl p-5">
          <h3
            className="mb-4 font-extrabold"
            style={{ color: "var(--cv-text)" }}
          >
            Setup checklist — {claimedLive?.name ?? claimedDevice.name}
          </h3>
          <ul className="space-y-2.5">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-2.5 text-sm">
                {item.done ? (
                  <CheckCircle2
                    className="h-4 w-4 shrink-0"
                    style={{ color: "#047857" }}
                  />
                ) : (
                  <Circle
                    className="h-4 w-4 shrink-0"
                    style={{ color: "var(--cv-muted)" }}
                  />
                )}
                <span
                  style={{
                    color: item.done ? "var(--cv-text)" : "var(--cv-muted)",
                  }}
                >
                  {item.label}
                </span>
                {item.pending && !item.done && (
                  <Badge>Waiting…</Badge>
                )}
              </li>
            ))}
          </ul>
          <div className="mt-4">
            <CopyField value={claimedDevice.id} label="Device ID" />
          </div>
          {claimedLive && !claimedLive.room && (
            <div className="mt-3">
              <Callout tone="info" title="Next step">
                Assign a room to this device from the Fleet tab or the device
                detail page.
              </Callout>
            </div>
          )}
        </div>
      )}

      {/* Admin: provision a new device (generates credentials for flashing) */}
      {isAdmin && checked && (
        <div className="cv-card rounded-2xl p-5">
          <div className="mb-1 flex items-center gap-2">
            <Server className="h-4 w-4" style={{ color: "var(--cv-accent-hi)" }} />
            <h2
              className="text-base font-extrabold"
              style={{ color: "var(--cv-text)" }}
            >
              Provision new device (admin)
            </h2>
          </div>
          <p className="mb-5 text-sm" style={{ color: "var(--cv-muted)" }}>
            Generate MQTT credentials and a pairing key for a device that has
            not yet been flashed. Flash the output onto the hardware, then claim
            it above.
          </p>
          <div className="space-y-3">
            <Field
              label="Device type"
              hint="Must match the firmware image (e.g. smart-plug, home-hub, aquaguard)"
            >
              <TextInput
                value={provisionType}
                onChange={setProvisionType}
                placeholder="smart-plug"
              />
            </Field>
            <Field label="Display name (optional)">
              <TextInput
                value={provisionName}
                onChange={setProvisionName}
                placeholder="Office plug"
              />
            </Field>
            {provisionError && (
              <Callout tone="critical" title="Provision failed">
                {provisionError}
              </Callout>
            )}
            <Button
              variant="primary"
              icon={Server}
              onClick={handleProvision}
              busy={provisionBusy}
              disabled={!provisionType.trim()}
            >
              Provision
            </Button>
          </div>

          {provisionResult && (
            <div className="mt-5 space-y-3 border-t pt-5" style={{ borderColor: "var(--cv-border)" }}>
              <SeverityBadge severity="ok">
                Provisioned — flash these credentials onto the hardware
              </SeverityBadge>
              <CopyField value={provisionResult.id} label="Device ID" />
              <CopyField value={provisionResult.key} label="Pairing key" />
              <CopyField value={provisionResult.mqttUsername} label="MQTT username" />
              <CopyField value={provisionResult.mqttPassword} label="MQTT password" />
              <Callout tone="warning" title="Store these credentials securely">
                These values are shown once. If lost, the device must be
                re-provisioned.
              </Callout>
            </div>
          )}
        </div>
      )}

      {/* Fleet overview */}
      <SectionTitle>Fleet overview</SectionTitle>
      <KpiGrid cols={3}>
        <Kpi label="Total devices" value={fleet.devices.length} />
        <Kpi label="Online now" value={fleet.online} tone="ok" />
        <Kpi
          label="Offline"
          value={fleet.offline}
          tone={fleet.offline > 0 ? "warning" : "ok"}
        />
      </KpiGrid>

      {fleet.devices.length > 0 && (
        <div className="cv-card rounded-2xl p-4">
          <h3
            className="mb-3 text-[11px] font-bold uppercase tracking-[0.16em]"
            style={{ color: "var(--cv-muted)" }}
          >
            All devices
          </h3>
          <ul
            className="divide-y"
            style={{ borderColor: "var(--cv-border)" }}
          >
            {fleet.devices.map((d) => {
              const meta = deviceMeta(d.type);
              const Icon = meta.icon;
              return (
                <li
                  key={d.id}
                  className="flex items-center gap-3 py-2.5"
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg"
                    style={{
                      background: `color-mix(in srgb, ${meta.accent} 18%, transparent)`,
                    }}
                  >
                    <Icon className="h-3.5 w-3.5" style={{ color: meta.accent }} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span
                      className="text-sm font-medium"
                      style={{ color: "var(--cv-text)" }}
                    >
                      {d.name}
                    </span>
                    {d.room && (
                      <span className="ml-2 text-xs" style={{ color: "var(--cv-muted)" }}>
                        {d.room}
                      </span>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusDot online={d.online} pulse={false} />
                    {!d.online && d.last_seen && (
                      <span className="text-xs" style={{ color: "var(--cv-muted)" }}>
                        <RelativeTime iso={d.last_seen} />
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
