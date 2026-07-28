"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, ChevronDown, ChevronUp, CircleAlert, Cpu, Loader2 } from "lucide-react";
import { controlPlane, type Device } from "@/lib/control-plane";
import { getFirmwareInfo, isBehind } from "@/lib/smarthome-firmware";
import { Card } from "../ui";

export default function FirmwarePage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await controlPlane.devices();
    if (r.ok) setDevices(r.data.devices ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><Cpu className="h-6 w-6" /> Firmware & changelog</h1>
        <p className="text-sm text-slate-400 mt-1">See which devices are behind the latest known firmware, and what changed.</p>
      </div>

      <div className="space-y-3">
        {devices.map((d) => {
          const info = getFirmwareInfo(d.type);
          const behind = info ? isBehind(d.fw_version, info.latestVersion) : false;
          return (
            <Card key={d.id} className="p-4">
              <button onClick={() => setExpanded(expanded === d.id ? null : d.id)} className="w-full flex items-center justify-between">
                <div className="text-left">
                  <div className="font-bold text-white">{d.name || d.id}</div>
                  <div className="text-xs text-slate-500">{d.type} · running {d.fw_version || "unknown"}{info ? ` · latest ${info.latestVersion}` : ""}</div>
                </div>
                <div className="flex items-center gap-2">
                  {info ? (
                    behind ? (
                      <span className="flex items-center gap-1 text-xs text-amber-400"><CircleAlert className="h-3.5 w-3.5" /> Update available</span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-emerald-400"><CheckCircle2 className="h-3.5 w-3.5" /> Up to date</span>
                    )
                  ) : (
                    <span className="text-xs text-slate-500">No changelog</span>
                  )}
                  {expanded === d.id ? <ChevronUp className="h-4 w-4 text-slate-500" /> : <ChevronDown className="h-4 w-4 text-slate-500" />}
                </div>
              </button>
              {expanded === d.id && info && (
                <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                  {info.changelog.map((c) => (
                    <div key={c.version} className="text-sm">
                      <div className="font-semibold text-slate-200">v{c.version}</div>
                      <ul className="text-xs text-slate-400 list-disc list-inside">
                        {c.notes.map((n, i) => <li key={i}>{n}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
        {devices.length === 0 && <p className="text-sm text-slate-500">No devices yet.</p>}
      </div>
    </div>
  );
}
