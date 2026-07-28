"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Loader2, Power, PowerOff } from "lucide-react";
import { controlPlane, type Scene } from "@/lib/control-plane";
import { getSchedule, setCell, saveSchedule, WEEKDAYS, type SceneSchedule, type Weekday } from "@/lib/smarthome-scene-scheduler";
import { Card } from "../ui";

const HOURS = Array.from({ length: 24 }, (_, h) => `${String(h).padStart(2, "0")}:00`);
const DAY_LABEL: Record<Weekday, string> = { mon: "Mon", tue: "Tue", wed: "Wed", thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun" };

export default function SceneSchedulerPage() {
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [schedule, setSchedule] = useState<SceneSchedule>({ enabled: false, cells: [], automationIds: [] });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await controlPlane.scenes();
    if (r.ok) setScenes(r.data.scenes ?? []);
    setSchedule(getSchedule());
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pick = (day: Weekday, time: string, sceneId: string) => {
    const scene = scenes.find((s) => String(s.id) === sceneId);
    const next = setCell(schedule, day, time, scene ? scene.id : null, scene?.name);
    setSchedule(next);
  };

  const enable = async () => {
    setBusy(true);
    const ids: number[] = [];
    for (const cell of schedule.cells) {
      const r = await controlPlane.createAutomation({
        name: `Scene schedule — ${DAY_LABEL[cell.day]} ${cell.time}`,
        enabled: true,
        trigger: { type: "time", at: cell.time },
        action: { type: "command", command: { scene: cell.sceneId } },
      });
      if (r.ok && r.data.automation) ids.push(r.data.automation.id);
    }
    const next = { ...schedule, enabled: true, automationIds: ids };
    saveSchedule(next);
    setSchedule(next);
    setBusy(false);
  };

  const disable = async () => {
    setBusy(true);
    await Promise.all(schedule.automationIds.map((id) => controlPlane.deleteAutomation(id)));
    const next = { ...schedule, enabled: false, automationIds: [] };
    saveSchedule(next);
    setSchedule(next);
    setBusy(false);
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const cellAt = (day: Weekday, time: string) => schedule.cells.find((c) => c.day === day && c.time === time);

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-white flex items-center gap-2"><CalendarDays className="h-6 w-6" /> Scene scheduler</h1>
          <p className="text-sm text-slate-400 mt-1">Map scenes onto a weekly calendar — enabling creates real, editable automations.</p>
        </div>
        {schedule.enabled ? (
          <button onClick={disable} disabled={busy} className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-red-300 bg-red-500/10">
            <PowerOff className="h-4 w-4" /> Disable schedule
          </button>
        ) : (
          <button onClick={enable} disabled={busy || schedule.cells.length === 0} className="flex items-center gap-2 rounded-xl px-4 py-2.5 font-semibold text-white disabled:opacity-50" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
            <Power className="h-4 w-4" /> Enable schedule
          </button>
        )}
      </div>

      <Card className="p-3 overflow-x-auto">
        <table className="w-full text-xs border-collapse">
          <thead>
            <tr>
              <th className="p-2 text-slate-500 text-left">Time</th>
              {WEEKDAYS.map((d) => <th key={d} className="p-2 text-slate-300">{DAY_LABEL[d]}</th>)}
            </tr>
          </thead>
          <tbody>
            {HOURS.filter((_, i) => i % 2 === 0).map((time) => (
              <tr key={time}>
                <td className="p-1.5 text-slate-500 whitespace-nowrap">{time}</td>
                {WEEKDAYS.map((d) => {
                  const cell = cellAt(d, time);
                  return (
                    <td key={d} className="p-1">
                      <select
                        disabled={schedule.enabled}
                        value={cell?.sceneId ?? ""}
                        onChange={(e) => pick(d, time, e.target.value)}
                        className="w-full bg-black/20 border border-white/10 rounded-md px-1 py-1 text-[11px] text-slate-200 outline-none disabled:opacity-50"
                      >
                        <option value="">—</option>
                        {scenes.map((s) => <option key={s.id} value={s.id}>{s.icon} {s.name}</option>)}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
