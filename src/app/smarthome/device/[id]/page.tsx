"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, RefreshCw, Star } from "lucide-react";
import { controlPlane, type Room } from "@/lib/control-plane";
import { useLiveDevice } from "@/lib/smarthome-realtime";
import { useConsole } from "../../ConsoleProvider";
import { DeviceControls, deviceMeta } from "../../DeviceControls";
import { GatePasses } from "../../GatePasses";
import { LatencyBadge } from "../../ui";
import {
  Badge,
  Button,
  Callout,
  EmptyState,
  IconButton,
  LoadingState,
  RelativeTime,
  StatusDot,
} from "../../_kit/primitives";

export default function DevicePage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ""));
  const { subscribe } = useConsole();

  const live = useLiveDevice(id, subscribe);
  const {
    device,
    loading,
    notFound,
    fieldStatus,
    send,
    patch,
    setLocal,
    reload,
    lastRttMs,
    busy,
  } = live;

  const [rooms, setRooms] = useState<Room[]>([]);
  useEffect(() => {
    controlPlane.rooms().then((r) => r.ok && setRooms(r.data.rooms ?? []));
  }, []);

  if (loading) return <LoadingState label="Loading device" />;

  if (notFound || !device) {
    return (
      <div>
        <BackLink />
        <div className="mt-4">
          <EmptyState
            title="Device not found"
            body="This device could not be found or is not linked to your account."
          />
        </div>
      </div>
    );
  }

  const meta = deviceMeta(device.type);
  const Icon = meta.icon;

  return (
    <div className="mx-auto w-full max-w-2xl">
      {/* Navigation row */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <BackLink />
        <div className="flex items-center gap-2">
          <LatencyBadge ms={lastRttMs} />
          <IconButton
            icon={RefreshCw}
            label="Refresh device state"
            onClick={() => reload()}
          />
        </div>
      </div>

      {/* Device identity */}
      <div className="mb-5 flex items-center gap-3 sm:gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:h-14 sm:w-14"
          style={{
            background: `color-mix(in srgb, ${meta.accent} 18%, transparent)`,
          }}
        >
          <Icon className="h-6 w-6 sm:h-7 sm:w-7" style={{ color: meta.accent }} />
        </div>
        <div className="min-w-0 flex-1">
          <h1
            className="truncate text-xl font-extrabold leading-tight sm:text-2xl"
            style={{ color: "var(--cv-text)" }}
          >
            {device.name || device.id}
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <Badge>{meta.label}</Badge>
            <span className="inline-flex items-center gap-1.5">
              <StatusDot online={device.online} />
              <span
                className="text-sm"
                style={{
                  color: device.online ? "#047857" : "var(--cv-muted)",
                }}
              >
                {device.online ? "Online" : "Offline"}
              </span>
            </span>
            {device.last_seen && !device.online && (
              <span className="text-sm" style={{ color: "var(--cv-muted)" }}>
                · Last seen <RelativeTime iso={device.last_seen} />
              </span>
            )}
          </div>
        </div>
        <button
          onClick={() => patch({ favorite: !device.favorite })}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition hover:brightness-125 active:scale-95 focus:outline-none focus-visible:ring-2"
          aria-label={
            device.favorite ? "Remove from favourites" : "Add to favourites"
          }
          style={{
            background: "var(--cv-card-hi)",
            border: "1px solid var(--cv-border)",
          }}
        >
          <Star
            className="h-5 w-5"
            fill={device.favorite ? "#fbbf24" : "none"}
            style={{
              color: device.favorite ? "#fbbf24" : "var(--cv-muted)",
            }}
          />
        </button>
      </div>

      {/* Name + room editors */}
      <div
        className="cv-card mb-5 grid gap-3 rounded-2xl p-4 sm:grid-cols-[1fr_180px]"
      >
        <input
          className="cv-input"
          value={device.name || ""}
          onChange={(e) => setLocal((d) => ({ ...d, name: e.target.value }))}
          onBlur={(e) =>
            patch({ name: e.target.value.trim() || device.id })
          }
          placeholder="Device name"
          aria-label="Device name"
        />
        <select
          className="cv-input"
          value={device.room || ""}
          onChange={(e) => patch({ room: e.target.value })}
          aria-label="Assign room"
        >
          <option value="">Unassigned</option>
          {rooms.map((r) => (
            <option key={`${r.id}-${r.name}`} value={r.name}>
              {r.icon} {r.name}
            </option>
          ))}
        </select>
      </div>

      {/* Offline warning */}
      {!device.online && (
        <div className="mb-4">
          <Callout tone="warning" title="Device offline">
            Commands will be queued and delivered when the device reconnects.
          </Callout>
        </div>
      )}

      {/* Firmware + last-seen strip */}
      <div
        className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl px-4 py-2.5 text-xs"
        style={{
          background: "var(--cv-card-hi)",
          border: "1px solid var(--cv-border)",
          color: "var(--cv-muted)",
        }}
      >
        {device.fw_version && (
          <span>
            Firmware:{" "}
            <code className="font-mono font-semibold" style={{ color: "var(--cv-text)" }}>
              {device.fw_version}
            </code>
          </span>
        )}
        {device.last_seen && (
          <span>
            Last seen: <RelativeTime iso={device.last_seen} />
          </span>
        )}
        <span className="font-mono" style={{ color: "var(--cv-muted)" }}>
          ID: {device.id}
        </span>
      </div>

      {/* Type-specific device controls (unchanged functionality) */}
      <DeviceControls device={device} send={send} st={fieldStatus} />

      {/* RFID gate passes */}
      {device.type === "rfid-gate" && <GatePasses deviceId={device.id} />}
    </div>
  );
}

function BackLink() {
  return (
    <Link
      href="/smarthome/devices"
      className="inline-flex items-center gap-1 text-sm transition hover:brightness-125"
      style={{ color: "var(--cv-muted)" }}
    >
      <ChevronLeft className="h-4 w-4" />
      Devices
    </Link>
  );
}
