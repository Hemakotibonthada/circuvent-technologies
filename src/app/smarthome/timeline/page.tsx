"use client";

import { useCallback, useEffect, useState } from "react";
import { History, Loader2, Search } from "lucide-react";
import { controlPlane, type AppEvent, type Device } from "@/lib/control-plane";
import { filterEvents, groupByDay } from "@/lib/smarthome-timeline";
import { Card } from "../ui";

const KINDS = ["all", "alert", "error", "status", "info"];

export default function TimelinePage() {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [deviceId, setDeviceId] = useState("");
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    const [e, d] = await Promise.all([controlPlane.events(300), controlPlane.devices()]);
    if (e.ok) setEvents(e.data.events ?? []);
    if (d.ok) setDevices(d.data.devices ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = filterEvents(events, { deviceId: deviceId || undefined, kind, query });
  const groups = groupByDay(filtered);

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
        <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><History className="h-6 w-6" /> Activity timeline</h1>
        <p className="text-sm text-slate-400 mt-1">Browse your full history — filter by device, kind or keyword.</p>
      </div>

      <Card className="p-3 mb-4 flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 rounded-xl bg-black/20 px-3 py-2 flex-1 min-w-[160px]">
          <Search className="h-4 w-4 text-slate-500" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search…" className="bg-transparent outline-none text-sm text-white flex-1" />
        </div>
        <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="bg-black/20 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none">
          <option value="">All devices</option>
          {devices.map((d) => <option key={d.id} value={d.id}>{d.name || d.id}</option>)}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} className="bg-black/20 rounded-xl px-3 py-2 text-sm text-slate-200 outline-none">
          {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
      </Card>

      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.dateLabel}>
            <div className="text-xs uppercase tracking-wider text-slate-500 mb-2">{g.dateLabel}</div>
            <div className="space-y-2">
              {g.events.map((e) => (
                <div key={e.id} className="rounded-xl bg-black/20 px-4 py-3 flex items-center justify-between">
                  <div>
                    <div className="text-sm text-white">{e.title}</div>
                    <div className="text-xs text-slate-500">{e.body}</div>
                  </div>
                  <span className="text-xs text-slate-600">{new Date(e.ts).toLocaleTimeString()}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {groups.length === 0 && <p className="text-sm text-slate-500 text-center py-16">No matching activity.</p>}
      </div>
    </div>
  );
}
