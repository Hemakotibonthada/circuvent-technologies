"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bell, CheckCircle2, Info, Loader2, Trash2, XCircle } from "lucide-react";
import { controlPlane, type AppEvent } from "@/lib/control-plane";

const iconMap = {
  alert: { icon: AlertTriangle, color: "#f59e0b" },
  error: { icon: XCircle, color: "#ef4444" },
  status: { icon: CheckCircle2, color: "#22c55e" },
  info: { icon: Info, color: "#06b6d4" },
};

export default function NotificationsPage() {
  const [events, setEvents] = useState<AppEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await controlPlane.events(100);
    if (r.ok) setEvents(r.data.events ?? []);
    setLoading(false);
    await controlPlane.markEventsRead();
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (id: number) => {
    setEvents((prev) => prev.filter((e) => e.id !== id));
    await controlPlane.deleteEvent(id);
  };

  const clear = async () => {
    if (!confirm("Clear all notifications?")) return;
    setEvents([]);
    await controlPlane.clearEvents();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-white">Notifications</h1>
          <p className="text-slate-400 text-sm mt-1">Control-plane events and device alerts.</p>
        </div>
        {events.length > 0 && (
          <button onClick={clear} className="rounded-xl border border-white/10 px-4 py-2 text-sm text-slate-300 hover:bg-white/5">Clear all</button>
        )}
      </div>
      {loading ? (
        <div className="flex justify-center py-24 text-slate-400"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : events.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] py-16 text-center">
          <Bell className="mx-auto h-8 w-8 text-slate-500" />
          <div className="mt-3 font-bold text-white">All quiet</div>
          <p className="text-sm text-slate-400">New device activity will appear here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {events.map((e) => {
            const conf = iconMap[e.kind as keyof typeof iconMap] ?? iconMap.info;
            const Icon = conf.icon;
            return (
              <div key={e.id} className={`rounded-2xl cv-card p-4 flex gap-4 ${!e.read ? "ring-1 ring-cyan-400/30" : ""}`}>
                <div className="h-10 w-10 rounded-xl flex items-center justify-center bg-white/5" style={{ color: conf.color }}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-white">{e.title}</div>
                  <div className="text-sm text-slate-400">{e.body}</div>
                  <div className="text-xs text-slate-600 mt-1">{new Date(e.ts).toLocaleString()}</div>
                </div>
                <button onClick={() => remove(e.id)} className="h-9 w-9 rounded-lg text-slate-500 hover:text-red-300 hover:bg-red-500/10">
                  <Trash2 className="h-4 w-4 mx-auto" />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
