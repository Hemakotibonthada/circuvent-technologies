"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, Loader2, Star } from "lucide-react";
import { controlPlane, type Device, type Room } from "@/lib/control-plane";
import { useConsole } from "../../ConsoleProvider";
import { DeviceControls, deviceMeta } from "../../DeviceControls";

export default function DevicePage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(String(params?.id ?? ""));
  const { subscribe } = useConsole();

  const [device, setDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    const r = await controlPlane.device(id);
    if (r.ok && r.data?.device) {
      setDevice(r.data.device);
      setNotFound(false);
    } else if (r.status === 404) {
      setNotFound(true);
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
    controlPlane.rooms().then((r) => r.ok && setRooms(r.data.rooms ?? []));
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    return subscribe((u) => {
      if (u.deviceId !== id) return;
      setDevice((prev) => {
        if (!prev) return prev;
        if (u.kind === "status") return { ...prev, online: !!(u.payload as { online?: boolean }).online };
        if (u.kind === "state") return { ...prev, online: true, state: { ...prev.state, ...u.payload } };
        return { ...prev, online: true };
      });
    });
  }, [subscribe, id]);

  const send = useCallback(
    async (params: Record<string, unknown>) => {
      setBusy(true);
      setDevice((prev) => (prev ? { ...prev, state: { ...prev.state, ...params } } : prev));
      await controlPlane.command(id, { action: "set", ...params });
      setBusy(false);
    },
    [id]
  );

  const patch = useCallback(
    async (body: { name?: string; room?: string; favorite?: boolean }) => {
      setDevice((prev) => (prev ? { ...prev, ...body } : prev));
      await controlPlane.patchDevice(id, body);
    },
    [id]
  );

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
    <div className="max-w-2xl mx-auto">
      <BackLink />
      <div className="flex items-center gap-4 mt-4 mb-6">
        <div
          className="h-14 w-14 rounded-2xl flex items-center justify-center"
          style={{ background: `${meta.accent}1a`, color: meta.accent }}
        >
          <Icon className="h-7 w-7" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-extrabold text-white leading-tight">{device.name || device.id}</h1>
          <div className="flex items-center gap-2 text-sm mt-0.5">
            <span className="text-slate-400">{meta.label}</span>
            <span className="text-slate-600">·</span>
            <span className="flex items-center gap-1.5" style={{ color: device.online ? "#22c55e" : "#64748b" }}>
              <span className="h-2 w-2 rounded-full" style={{ background: device.online ? "#22c55e" : "#64748b" }} />
              {device.online ? "Online" : "Offline"}
            </span>
          </div>
        </div>
        <button
          onClick={() => patch({ favorite: !device.favorite })}
          className="ml-auto h-10 w-10 rounded-xl border border-white/10 bg-white/5 flex items-center justify-center"
          aria-label="Toggle favorite"
        >
          <Star className={`h-5 w-5 ${device.favorite ? "fill-yellow-300 text-yellow-300" : "text-slate-400"}`} />
        </button>
      </div>

      <div className="rounded-2xl cv-card p-4 mb-5 grid gap-3 sm:grid-cols-[1fr_180px_auto]">
        <input
          className="cv-input"
          value={device.name || ""}
          onChange={(e) => setDevice((prev) => (prev ? { ...prev, name: e.target.value } : prev))}
          onBlur={(e) => patch({ name: e.target.value.trim() || device.id })}
          placeholder="Device name"
        />
        <select className="cv-input" value={device.room || ""} onChange={(e) => patch({ room: e.target.value })}>
          <option value="">Unassigned</option>
          {rooms.map((r) => (
            <option key={`${r.id}-${r.name}`} value={r.name}>{r.icon} {r.name}</option>
          ))}
        </select>
        <button onClick={() => patch({ favorite: !device.favorite })} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-200">
          {device.favorite ? "Unfavorite" : "Favorite"}
        </button>
      </div>

      {!device.online && (
        <div className="rounded-xl border border-slate-500/20 bg-slate-500/10 px-4 py-3 text-slate-400 text-sm mb-4">
          Device is offline. Commands will be delivered when it reconnects.
        </div>
      )}

      <DeviceControls device={device} send={send} busy={busy} />
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/console" className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200">
      <ChevronLeft className="h-4 w-4" /> Devices
    </Link>
  );
}
