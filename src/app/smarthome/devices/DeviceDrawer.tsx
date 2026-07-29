"use client";

import Link from "next/link";
import { ExternalLink, Star } from "lucide-react";
import { Drawer } from "../_kit/overlays";
import {
  Badge,
  Button,
  CopyField,
  DetailRow,
  RelativeTime,
  SectionTitle,
  StatusDot,
} from "../_kit/primitives";
import { PowerButton, deviceMetric } from "../_kit/device";
import { deviceMeta } from "../DeviceControls";
import type { Device } from "@/lib/control-plane";
import type { FleetApi } from "../_data/hooks";

export function DeviceDrawer({
  device,
  fleet,
  onClose,
}: {
  device: Device | null;
  fleet: FleetApi;
  onClose: () => void;
}) {
  // Always read from the live fleet map so real-time updates are reflected
  // even while the drawer is open.
  const d = device ? (fleet.byId.get(device.id) ?? device) : null;

  if (!d) return null;

  const meta = deviceMeta(d.type);
  const Icon = meta.icon;
  const cmdStatus = fleet.cmd.statusOf(d.id);
  const metric = deviceMetric(d);
  const stateEntries = Object.entries(d.state ?? {});

  return (
    <Drawer
      open={device !== null}
      onClose={onClose}
      title={d.name}
      subtitle={
        <span className="inline-flex items-center gap-1.5">
          <StatusDot online={d.online} pulse={false} />
          {d.online
            ? "Online"
            : d.last_seen
              ? <>Last seen <RelativeTime iso={d.last_seen} /></>
              : "Never seen"}
        </span>
      }
      footer={
        <div className="flex w-full gap-2">
          <Button
            variant="ghost"
            icon={Star}
            onClick={() => fleet.toggleFavorite(d)}
            title={d.favorite ? "Remove from favourites" : "Add to favourites"}
          >
            {d.favorite ? "Unfavourite" : "Favourite"}
          </Button>
          <Link
            href={`/smarthome/device/${encodeURIComponent(d.id)}`}
            className="ml-auto"
          >
            <Button variant="primary" icon={ExternalLink}>
              Open detail
            </Button>
          </Link>
        </div>
      }
    >
      {/* Identity block */}
      <div className="mb-5 flex items-center gap-3">
        <span
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
          style={{ background: `color-mix(in srgb, ${meta.accent} 18%, transparent)` }}
        >
          <Icon className="h-6 w-6" style={{ color: meta.accent }} />
        </span>
        <div className="min-w-0 flex-1">
          <div
            className="truncate text-lg font-extrabold"
            style={{ color: "var(--cv-text)" }}
          >
            {d.name}
          </div>
          <div className="flex items-center gap-1.5">
            <Badge>{meta.label}</Badge>
            {d.room && (
              <span className="text-xs" style={{ color: "var(--cv-muted)" }}>
                · {d.room}
              </span>
            )}
          </div>
        </div>
        <PowerButton
          device={d}
          status={cmdStatus}
          onSend={(cmd) => fleet.cmd.send(d, cmd)}
        />
      </div>

      {/* Live reading */}
      {metric && (
        <div
          className="mb-5 rounded-xl p-3.5 text-center cv-card"
          style={{ border: "1px solid var(--cv-border)" }}
        >
          <div
            className="mb-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: "var(--cv-muted)" }}
          >
            Current reading
          </div>
          <div
            className="text-2xl font-extrabold tabular-nums"
            style={{ color: "var(--cv-accent-hi)" }}
          >
            {metric}
          </div>
        </div>
      )}

      {/* Key/value metadata */}
      <div className="cv-card mb-4 rounded-2xl p-4">
        <DetailRow label="Type">{meta.label}</DetailRow>
        <DetailRow label="Room">{d.room ?? "—"}</DetailRow>
        <DetailRow label="Status">
          <span
            className="font-semibold"
            style={{ color: d.online ? "#047857" : "var(--cv-muted)" }}
          >
            {d.online ? "Online" : "Offline"}
          </span>
        </DetailRow>
        <DetailRow label="Last seen">
          <RelativeTime iso={d.last_seen} />
        </DetailRow>
        <DetailRow label="Firmware">{d.fw_version ?? "—"}</DetailRow>
        <DetailRow label="Favourite">{d.favorite ? "Yes" : "No"}</DetailRow>
      </div>

      <CopyField value={d.id} label="Device ID" />

      {/* Live state snapshot — only shown when device has published state */}
      {stateEntries.length > 0 && (
        <>
          <SectionTitle>Live state</SectionTitle>
          <div className="cv-card rounded-2xl p-4">
            {stateEntries.map(([k, v]) => (
              <DetailRow key={k} label={k}>
                {String(v)}
              </DetailRow>
            ))}
          </div>
        </>
      )}
    </Drawer>
  );
}
