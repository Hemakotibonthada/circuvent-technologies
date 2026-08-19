"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, RefreshCw, Star } from "lucide-react";
import { controlPlane, type Room } from "@/lib/control-plane";
import { useLiveDevice } from "@/lib/smarthome-realtime";
import { useConsole } from "../../ConsoleProvider";
import { DeviceControls, deviceMeta } from "../../DeviceControls";
import { effectiveDeviceType } from "../../_data/device-type";
import { GatePasses } from "../../GatePasses";
import DeviceReportCard from "./DeviceReportCard";
import { HomeNetworkPanel } from "./HomeNetworkPanel";
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

  // Effective, not stored: a board registered as a camera that reports no
  // camera should not wear a camera icon and a "Camera" chip while showing
  // sentinel controls. See _data/device-type.ts.
  const meta = deviceMeta(effectiveDeviceType(device));
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
          className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-xl transition hover:brightness-125 active:scale-95 focus:outline-none focus-visible:ring-2"
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

      {/* Boards that carry the local bus can bind their pads to other boards. */}
      {device.type === "touchboard-8" && (
        <HomeNetworkPanel device={device} gangs={8} onChanged={reload} />
      )}

      {/* RFID gate passes */}
      {device.type === "rfid-gate" && <GatePasses deviceId={device.id} />}

      <SetupModeCard device={device} />

      {/* Full record — identity, activity, control history, exportable */}
      <div className="mt-6">
        <DeviceReportCard deviceId={device.id} />
      </div>
    </div>
  );
}

/**
 * Puts a device back into setup mode without anyone walking to it.
 *
 * The firmware used to raise its own setup hotspot whenever Wi-Fi was
 * unreachable, which is why devices vanished into AP mode after a power cut —
 * it now waits for the network however long that takes. That fix removes the
 * only way a device ever offered its setup link on its own, so this replaces
 * it deliberately: while the device is still reachable, ask it to open the
 * hotspot for a few minutes.
 *
 * Offline devices cannot be asked, which is the honest limitation of doing
 * this over the network: for those the reset button is still the way in, and
 * the card says so rather than showing a button that cannot work.
 */
function SetupModeCard({ device }: { device: { id: string; online: boolean } }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const request = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await controlPlane.setupMode(device.id, 10);
      /*
       * The envelope's `ok` is the HTTP result; the device's own refusal comes
       * back inside `data`. Reading only one of them reports success for a
       * request the control plane accepted and the device rejected.
       */
      const ok = r.ok && r.data?.success !== false;
      if (!ok) {
        setMsg({ ok: false, text: r.data?.error || "The device did not accept the request." });
        setBusy(false);
        return;
      }

      /*
       * WAIT FOR THE DEVICE TO SAY IT IS DOING IT.
       *
       * `success` here means the control plane published to MQTT — nothing
       * more. A device on firmware older than the `setup` action drops the
       * command silently: `_dispatch` has no branch for it and every sketch's
       * handler begins `if (action != "set") return;`. That is not a
       * hypothetical, it is what a unit running home-hub 2.3.0 does, and the
       * old copy here told its owner to go and join a network that was never
       * going to appear.
       *
       * So the device now publishes `setupMode` immediately before it drops
       * the Wi-Fi link, and this waits for that echo. Silence is reported as
       * silence, with the actual reason — because "no hotspot appeared" sends
       * somebody to power-cycle a device that is working perfectly.
       */
      const deadline = Date.now() + 15_000;
      let confirmed = false;
      while (Date.now() < deadline && !confirmed) {
        await new Promise((res) => setTimeout(res, 1500));
        const d = await controlPlane.device(device.id);
        if (d.ok && (d.data as { device?: { state?: Record<string, unknown> } })?.device?.state?.setupMode === true) {
          confirmed = true;
        }
      }

      setMsg(
        confirmed
          ? {
              ok: true,
              text: "The device confirmed it is opening setup mode. Join the Circuvent-Setup network from your phone — it closes again after 10 minutes.",
            }
          : {
              ok: false,
              text:
                "The request was delivered but the device never confirmed it, so no hotspot is expected. " +
                "This is what firmware older than the setup feature does — update it from Admin → Firmware, " +
                "or hold the device's button for 3 seconds to open setup by hand.",
            }
      );
    } catch {
      setMsg({ ok: false, text: "Could not reach the device." });
    }
    setBusy(false);
  };

  return (
    <div className="mt-6 rounded-2xl border p-5" style={{ background: "var(--cv-card)", borderColor: "var(--cv-border)" }}>
      <h2 className="text-[15px] font-semibold" style={{ color: "var(--cv-text)" }}>
        Change Wi-Fi
      </h2>
      <p className="mt-1 text-[13px]" style={{ color: "var(--cv-muted)" }}>
        {device.online
          ? "Opens the device's setup hotspot for 10 minutes so you can move it to another network. It keeps its name, room and history."
          : "The device has to be online to be asked. If it cannot reach Wi-Fi it is still trying — hold its button for 3 seconds to open setup instead."}
      </p>
      <button
        type="button"
        onClick={request}
        disabled={busy || !device.online}
        className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
        style={{ background: "var(--cv-card-hi)", color: "var(--cv-text)" }}
      >
        <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} aria-hidden="true" />
        {busy ? "Asking the device…" : "Open setup mode"}
      </button>
      {busy && (
        <p className="mt-2 text-[12px]" style={{ color: "var(--cv-muted)" }}>
          Waiting for the device to confirm — it reports setup mode before it drops off Wi-Fi.
        </p>
      )}
      {msg && (
        <p
          className="mt-3 text-[13px]"
          role="status"
          style={{ color: msg.ok ? "var(--cv-text)" : "var(--cv-danger, #ef4444)" }}
        >
          {msg.text}
        </p>
      )}
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
