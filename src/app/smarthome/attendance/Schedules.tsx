"use client";
import { useCallback, useEffect, useState } from "react";
import { controlPlane, type AttendanceSchedule, type AttendanceSite } from "@/lib/control-plane";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const input = "mt-1 block w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white";
export function Schedules({ site }: { site: AttendanceSite }) {
  const [rows, setRows] = useState<AttendanceSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"fixed" | "flexible">("fixed");
  const [windows, setWindows] = useState<AttendanceSchedule["windows"]>({});
  const [grace, setGrace] = useState(5);
  const [minimum, setMinimum] = useState(0);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await controlPlane.attendanceSchedules(site.id);
      if (!r.ok) throw new Error("Could not load schedules. Please retry.");
      setRows(r.data.schedules ?? []);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load schedules."); }
    finally { setLoading(false); }
  }, [site.id]);
  useEffect(() => { void load(); }, [load]);
  const reset = () => { setEditing(null); setName(""); setKind("fixed"); setWindows({}); setGrace(5); setMinimum(0); };
  const changeWindow = (day: string, index: number, field: "in" | "out", value: string) => setWindows(prev => ({ ...prev, [day]: prev[day].map((w, i) => i === index ? { ...w, [field]: value } : w) }));
  return <div className="space-y-6">
    {error && <div role="alert" className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">{error}<button onClick={() => { setError(""); void load(); }} className="ml-3 underline">Retry loading</button></div>}
    <section className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <h2 className="text-lg font-semibold">Site schedules</h2><p className="mt-1 text-sm text-slate-400">Times use {site.timezone}. An end time before the start time represents an overnight shift.</p>
      {loading ? <p role="status" className="py-5 text-sm">Loading schedules…</p> : !rows.length ? <p className="py-5 text-sm text-slate-400">No schedules yet. Create your first shift below.</p> : <div className="mt-4 grid gap-3 lg:grid-cols-2">{rows.map(row => <article key={row.id} className="rounded-xl border border-slate-700 p-4">
        <h3 className="font-semibold">{row.name}</h3><p className="text-xs text-slate-400">{row.kind} · Grace: {row.graceMinutes ?? site.graceMinutes} min · Minimum: {row.minMinutes} min</p>
        <dl className="my-3 space-y-1 text-sm">{weekdays.map((day, i) => row.windows[String(i)]?.length ? <div className="flex justify-between gap-4" key={day}><dt className="text-slate-400">{day}</dt><dd>{row.windows[String(i)].map(w => `${w.in}–${w.out}`).join(", ")}</dd></div> : null)}</dl>
        <div className="flex gap-4 text-sm"><button disabled={busy} className="text-cyan-300" onClick={() => { setEditing(row.id); setName(row.name); setKind(row.kind); setWindows(row.windows); setGrace(row.graceMinutes ?? site.graceMinutes); setMinimum(row.minMinutes); }}>Edit schedule</button>
          <button disabled={busy} className="text-rose-300" onClick={async () => {
            if (!window.confirm(`Delete “${row.name}”? Check assignments before removing a schedule.`)) return;
            setBusy(true); setError("");
            try { const r = await controlPlane.deleteAttendanceSchedule(row.id); if (!r.ok) throw new Error("Could not delete this schedule. It may still be in use."); if (editing === row.id) reset(); await load(); }
            catch (e) { setError(e instanceof Error ? e.message : "Delete failed."); } finally { setBusy(false); }
          }}>Delete</button></div>
      </article>)}</div>}
    </section>
    <form className="rounded-2xl border border-slate-800 bg-slate-900 p-5" onSubmit={async event => {
      event.preventDefault(); setBusy(true); setError("");
      try {
        const body = { siteId: site.id, name: name.trim(), kind, windows, graceMinutes: grace, minMinutes: minimum };
        const r = editing === null ? await controlPlane.createAttendanceSchedule(body) : await controlPlane.updateAttendanceSchedule(editing, body);
        if (!r.ok) throw new Error("Could not save the schedule. Check the times and your site permissions.");
        reset(); await load();
      } catch(e) { setError(e instanceof Error ? e.message : "Save failed."); } finally { setBusy(false); }
    }}>
      <h2 className="text-lg font-semibold">{editing === null ? "Create a schedule" : "Edit schedule"}</h2>
      <fieldset disabled={busy} className="mt-4 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm">Schedule name<input required maxLength={80} value={name} onChange={e => setName(e.target.value)} className={input} /></label><label className="text-sm">Type<select value={kind} onChange={e => setKind(e.target.value as "fixed" | "flexible")} className={input}><option value="fixed">Fixed shift</option><option value="flexible">Flexible shift</option></select></label>
          <label className="text-sm">Grace period (minutes)<input type="number" min={0} max={240} required value={grace} onChange={e => setGrace(Number(e.target.value))} className={input} /></label><label className="text-sm">Minimum work time (minutes)<input type="number" min={0} max={1440} required value={minimum} onChange={e => setMinimum(Number(e.target.value))} className={input} /></label></div>
        <div className="space-y-3">{weekdays.map((day, i) => <div key={day} className="rounded-lg border border-slate-800 p-3"><div className="flex items-center justify-between"><span className="text-sm font-medium">{day}</span><button type="button" className="text-xs text-cyan-300" onClick={() => setWindows(prev => ({ ...prev, [i]: [...(prev[i] ?? []), { in: "09:00", out: "17:00" }] }))}>Add time window</button></div>
          {!windows[i]?.length && <p className="mt-1 text-xs text-slate-500">Non-working day</p>}
          {windows[i]?.map((w, index) => <div className="mt-2 flex flex-wrap items-center gap-2" key={index}><input type="time" aria-label={`${day} start ${index + 1}`} required value={w.in} onChange={e => changeWindow(String(i), index, "in", e.target.value)} className="rounded bg-slate-950 p-2 text-sm" /><span>to</span><input type="time" aria-label={`${day} end ${index + 1}`} required value={w.out} onChange={e => changeWindow(String(i), index, "out", e.target.value)} className="rounded bg-slate-950 p-2 text-sm" /><button type="button" aria-label={`Remove ${day} window ${index + 1}`} className="text-xs text-rose-300" onClick={() => setWindows(prev => ({ ...prev, [i]: prev[i].filter((_, n) => n !== index) }))}>Remove</button></div>)}
        </div>)}</div>
        <div className="flex gap-3"><button className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950" disabled={!name.trim() || busy}>{busy ? "Saving…" : "Save schedule"}</button>{editing !== null && <button type="button" onClick={reset} className="px-3 text-sm">Cancel edit</button>}</div>
      </fieldset>
    </form>
  </div>;
}
