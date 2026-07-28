"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Loader2, RefreshCw, Star, WifiOff } from "lucide-react";
import { controlPlane, type Room } from "@/lib/control-plane";
import { useLiveDevice } from "@/lib/smarthome-realtime";
import { useConsole } from "../../ConsoleProvider";
import { DeviceControls, deviceMeta } from "../../DeviceControls";
import { GatePasses } from "../../GatePasses";
import { LatencyBadge } from "../../ui";

export default function DevicePage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ""));
  const { subscribe } = useConsole();

  const live = useLiveDevice(id, subscribe);
  const { device, loading, notFound, fieldStatus, send, patch, setLocal, reload, lastRttMs, busy } = live;

  const [rooms, setRooms] = useState<Room[]>([]);
  useEffect(() => {
    controlPlane.rooms().then((r) => r.ok && setRooms(r.data.rooms ?? []));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (notFound || !device) {
    return (
      <div>
        <BackLink />
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-slate-400 mt-4">
          This device could not be found or is not linked to your account.
        </div>
      </div>
    );
  }

  const meta = deviceMeta(device.type);
  const Icon = meta.icon;

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="flex items-center justify-between gap-3">
        <BackLink />
        <div className="flex items-center gap-2">
          <LatencyBadge ms={lastRttMs} />
          <button
            onClick={() => reload()}
            className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-slate-400 transition hover:text-slate-200 active:scale-95"
            aria-label="Refresh device state"
          >
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      <div className="mt-4 mb-6 flex items-center gap-3 sm:gap-4">
        <div
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl sm:h-14 sm:w-14"
          style={{ background: `${meta.accent}1a`, color: meta.accent }}
        >
          <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-extrabold leading-tight text-white sm:text-2xl">
            {device.name || device.id}
          </h1>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className="text-slate-400">{meta.label}</span>
            <span className="text-slate-600">·</span>
            <span className="flex items-center gap-1.5" style={{ color: device.online ? "#22c55e" : "#64748b" }}>
              <span
                className={`h-2 w-2 rounded-full ${device.online ? "animate-pulse" : ""}`}
                style={{ background: device.online ? "#22c55e" : "#64748b" }}
              />
              {device.online ? "Online" : "Offline"}
            </span>
          </div>
        </div>
        <button
          onClick={() => patch({ favorite: !device.favorite })}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 transition active:scale-95"
          aria-label={device.favorite ? "Remove from favourites" : "Add to favourites"}
        >
          <Star className={`h-5 w-5 ${device.favorite ? "fill-yellow-300 text-yellow-300" : "text-slate-400"}`} />
        </button>
      </div>

      <div className="cv-card mb-5 grid gap-3 rounded-2xl p-4 sm:grid-cols-[1fr_180px]">
        <input
          className="cv-input"
          value={device.name || ""}
          onChange={(e) => setLocal((d) => ({ ...d, name: e.target.value }))}
          onBlur={(e) => patch({ name: e.target.value.trim() || device.id })}
          placeholder="Device name"
        />
        <select className="cv-input" value={device.room || ""} onChange={(e) => patch({ room: e.target.value })}>
          <option value="">Unassigned</option>
          {rooms.map((r) => (
            <option key={`${r.id}-${r.name}`} value={r.name}>
              {r.icon} {r.name}
            </option>
          ))}
        </select>
      </div>

      {!device.online && (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-slate-500/20 bg-slate-500/10 px-4 py-3 text-sm text-slate-400">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Device is offline. Commands are queued and delivered when it reconnects.</span>
        </div>
      )}

      <DeviceControls device={device} send={send} st={fieldStatus} />
      {device.type === "rfid-gate" && <GatePasses deviceId={device.id} />}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/smarthome" className="inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-slate-200">
      <ChevronLeft className="h-4 w-4" /> Devices
    </Link>
  );
}
