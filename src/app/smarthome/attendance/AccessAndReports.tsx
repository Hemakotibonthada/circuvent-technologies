"use client";

/**
 * Office Access + Reports for Circuvent Attendance.
 * Zones, access rules, leaves/closures, requests, and real summary metrics
 * (no fabricated KPIs).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2, Download, Plus, Trash2, DoorOpen, CalendarDays, Shield,
  Sparkles, CheckCircle2, Clock, UserX, Settings2,
} from "lucide-react";
import {
  controlPlane,
  type AttendanceAccessRequest,
  type AttendanceGroup,
  type AttendanceLeave,
  type AttendancePerson,
  type AttendanceRule,
  type AttendanceSchedule,
  type AttendanceSite,
  type AttendanceSummaryRow,
  type AttendanceZone,
} from "@/lib/control-plane";
import { syncAttendanceToPaystub } from "@/lib/attendance-service";

function today() {
  return new Date().toISOString().slice(0, 10);
}
function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function fmtHours(minutes: number) {
  const m = Math.max(0, Math.round(minutes));
  const h = Math.floor(m / 60);
  const r = m % 60;
  return `${h}h ${String(r).padStart(2, "0")}m`;
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 shadow-xl overflow-hidden">
      <div className="border-b border-white/10 px-4 py-3 flex items-baseline justify-between gap-3">
        <h4 className="text-sm font-bold text-slate-100">{title}</h4>
        {hint ? <span className="text-[11px] text-slate-500">{hint}</span> : null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center justify-between gap-3 py-2.5">{children}</div>;
}
function Muted({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-slate-500 py-2">{children}</p>;
}
function Tile({
  label, value, accent, icon: Icon,
}: { label: string; value: string; accent: string; icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }> }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</span>
        <Icon className="h-4 w-4" style={{ color: accent }} />
      </div>
      <div className="mt-2 text-2xl font-bold text-slate-100 tabular-nums">{value}</div>
    </div>
  );
}


function apiErr(res: { ok: boolean; data?: unknown }, fallback: string): string {
  const d = res.data;
  if (d && typeof d === "object" && "error" in d) {
    const e = (d as { error?: unknown }).error;
    if (typeof e === "string" && e.trim()) return e;
  }
  return fallback;
}

type AccessSub = "requests" | "groups" | "zones" | "rules" | "leaves" | "policy";

export function OfficeAccess({ site }: { site: AttendanceSite }) {
  const [sub, setSub] = useState<AccessSub>("requests");
  const [msg, setMsg] = useState("");
  const [err, setErr] = useState("");

    const tabs: { id: AccessSub; label: string }[] = [
    { id: "requests", label: "Requests" },
    { id: "groups", label: "Groups" },
    { id: "zones", label: "Zones" },
    { id: "rules", label: "Rules" },
    { id: "leaves", label: "Leave" },
    { id: "policy", label: "Policy" },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => { setSub(t.id); setMsg(""); setErr(""); }}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold border transition ${
              sub === t.id
                ? "border-violet-500/50 bg-violet-500/20 text-violet-100"
                : "border-white/10 bg-white/5 text-slate-400 hover:bg-white/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      {msg ? <p className="text-xs text-emerald-300">{msg}</p> : null}
      {err ? <p role="alert" className="text-xs text-rose-300">{err}</p> : null}
      {sub === "requests" && <RequestsPanel site={site} onMsg={setMsg} onErr={setErr} />}
      {sub === "groups" && <GroupsPanel site={site} onMsg={setMsg} onErr={setErr} />}
      {sub === "zones" && <ZonesPanel site={site} onMsg={setMsg} onErr={setErr} />}
      {sub === "rules" && <RulesPanel site={site} onMsg={setMsg} onErr={setErr} />}
      {sub === "leaves" && <LeavesPanel site={site} onMsg={setMsg} onErr={setErr} />}
      {sub === "policy" && <PolicyPanel site={site} onMsg={setMsg} onErr={setErr} />}
    </div>
  );
}

function RequestsPanel({
  site, onMsg, onErr,
}: { site: AttendanceSite; onMsg: (s: string) => void; onErr: (s: string) => void }) {
  const [requests, setRequests] = useState<AttendanceAccessRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await controlPlane.attendanceAccessRequests(site.id).catch(() => null);
    setRequests(r?.ok && r.data?.requests ? r.data.requests : []);
    setLoading(false);
  }, [site.id]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (id: number, decision: "approved" | "denied") => {
    setBusy(id);
    onErr("");
    const res = await controlPlane.decideAttendanceAccessRequest(id, { decision });
    if (!res.ok) onErr(apiErr(res, "Could not update request."));
    else {
      onMsg(decision === "approved" ? "Request approved." : "Request denied.");
      await load();
    }
    setBusy(null);
  };

  return (
    <Panel title="Access requests" hint="Card replacements, visitor passes, and entry asks">
      {loading ? <Muted>Loading…</Muted> : null}
      {!loading && requests.length === 0 ? <Muted>No pending access requests.</Muted> : null}
      <div className="divide-y divide-white/5">
        {requests.map((req) => (
          <Row key={req.id}>
            <div>
              <div className="font-semibold text-slate-200">{req.personName || "Unknown"}</div>
              <div className="text-xs text-slate-400">
                {req.kind} — {req.reason || "No reason given"}
                {req.status ? ` · ${req.status}` : ""}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={busy === req.id}
                onClick={() => void decide(req.id, "approved")}
                className="rounded-lg border border-emerald-500/40 bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-200 disabled:opacity-40"
              >
                Approve
              </button>
              <button
                type="button"
                disabled={busy === req.id}
                onClick={() => void decide(req.id, "denied")}
                className="rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1 text-xs font-semibold text-rose-200 disabled:opacity-40"
              >
                Deny
              </button>
            </div>
          </Row>
        ))}
      </div>
    </Panel>
  );
}


function GroupsPanel({
  site, onMsg, onErr,
}: { site: AttendanceSite; onMsg: (s: string) => void; onErr: (s: string) => void }) {
  const [groups, setGroups] = useState<AttendanceGroup[]>([]);
  const [schedules, setSchedules] = useState<AttendanceSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("department");
  const [scheduleId, setScheduleId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [g, sch] = await Promise.all([
      controlPlane.attendanceGroups(site.id).catch(() => null),
      controlPlane.attendanceSchedules(site.id).catch(() => null),
    ]);
    setGroups(g?.ok && g.data?.groups ? g.data.groups : []);
    setSchedules(sch?.ok && sch.data?.schedules ? sch.data.schedules : []);
    setLoading(false);
  }, [site.id]);

  useEffect(() => { void load(); }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); onErr("");
    const res = await controlPlane.createAttendanceGroup({
      siteId: site.id,
      name: name.trim(),
      kind,
      ...(scheduleId ? { scheduleId: Number(scheduleId) } : {}),
    });
    if (!res.ok) onErr(apiErr(res, "Could not create group."));
    else {
      onMsg(`Created ${name.trim()}.`);
      setName("");
      await load();
    }
    setBusy(false);
  };

  const remove = async (id: number, label: string) => {
    if (!window.confirm(`Delete ${label}? People stay enrolled; they just lose this group.`)) return;
    setBusy(true); onErr("");
    const res = await controlPlane.deleteAttendanceGroup(id);
    if (!res.ok) onErr(apiErr(res, "Could not delete group."));
    else { onMsg(`Deleted ${label}.`); await load(); }
    setBusy(false);
  };

  return (
    <Panel title="Groups & departments" hint="Organise people; optional default schedule per group">
      <form onSubmit={(e) => void create(e)} className="mb-4 grid gap-2 sm:grid-cols-4">
        <input
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Engineering)"
          className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-slate-100 sm:col-span-2"
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-slate-100"
        >
          <option value="department">Department</option>
          <option value="class">Class</option>
          <option value="area">Area</option>
          <option value="team">Team</option>
        </select>
        <select
          value={scheduleId}
          onChange={(e) => setScheduleId(e.target.value)}
          className="rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm text-slate-100"
        >
          <option value="">No default schedule</option>
          {schedules.map((sch) => (
            <option key={sch.id} value={sch.id}>{sch.name}</option>
          ))}
        </select>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-500 disabled:opacity-50 sm:col-span-4 sm:w-fit"
        >
          <Plus className="h-4 w-4" /> Add group
        </button>
      </form>
      {loading ? <Muted>Loading…</Muted> : null}
      {!loading && groups.length === 0 ? <Muted>No groups yet. Add one, or sync roster from HRMS.</Muted> : null}
      <div className="divide-y divide-white/5">
        {groups.map((g) => (
          <Row key={g.id}>
            <div>
              <p className="text-sm font-semibold text-slate-100">{g.name}</p>
              <p className="text-xs text-slate-500 capitalize">
                {g.kind}{typeof g.people === "number" ? ` · ${g.people} people` : ""}
                {g.leadName ? ` · lead ${g.leadName}` : ""}
              </p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(g.id, g.name)}
              className="rounded-lg border border-rose-500/30 px-2.5 py-1 text-xs font-semibold text-rose-300 hover:bg-rose-500/10 disabled:opacity-50"
            >
              <Trash2 className="inline h-3.5 w-3.5" /> Delete
            </button>
          </Row>
        ))}
      </div>
    </Panel>
  );
}

function ZonesPanel({
  site, onMsg, onErr,
}: { site: AttendanceSite; onMsg: (s: string) => void; onErr: (s: string) => void }) {
  const [zones, setZones] = useState<AttendanceZone[]>([]);
  const [name, setName] = useState("");
  const [kind, setKind] = useState("door");
  const [counts, setCounts] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await controlPlane.attendanceZones(site.id).catch(() => null);
    setZones(r?.ok && r.data?.zones ? r.data.zones : []);
  }, [site.id]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (!name.trim()) return;
    setBusy(true);
    onErr("");
    const res = await controlPlane.createAttendanceZone({
      siteId: site.id,
      name: name.trim(),
      kind,
      countsForAttendance: counts,
    });
    if (!res.ok) onErr(apiErr(res, "Could not create zone."));
    else {
      onMsg(`Zone “${name.trim()}” created.`);
      setName("");
      await load();
    }
    setBusy(false);
  };

  const remove = async (id: number) => {
    setBusy(true);
    const res = await controlPlane.deleteAttendanceZone(id);
    if (!res.ok) onErr(apiErr(res, "Could not delete zone."));
    else {
      onMsg("Zone removed.");
      await load();
    }
    setBusy(false);
  };

  return (
    <Panel title="Doors & zones" hint="Readers attach to a zone; rules decide who may pass">
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div>
          <label className="text-[11px] font-semibold text-slate-500">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Main entrance"
            className="mt-1 block min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
          />
        </div>
        <div>
          <label className="text-[11px] font-semibold text-slate-500">Kind</label>
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="mt-1 block min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
          >
            <option value="door">Door</option>
            <option value="gate">Gate</option>
            <option value="turnstile">Turnstile</option>
            <option value="room">Room</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300 pb-2">
          <input type="checkbox" checked={counts} onChange={(e) => setCounts(e.target.checked)} />
          Counts for attendance
        </label>
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() => void add()}
          className="min-h-[40px] rounded-xl border border-violet-500/40 bg-violet-600 px-4 text-xs font-semibold text-white disabled:opacity-40 flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" /> Add zone
        </button>
      </div>
      <div className="divide-y divide-white/5">
        {zones.length === 0 ? <Muted>No zones yet. Add the doors this site should manage.</Muted> : null}
        {zones.map((z) => (
          <Row key={z.id}>
            <div className="flex items-center gap-2">
              <DoorOpen className="h-4 w-4 text-violet-300" />
              <div>
                <div className="font-semibold text-slate-200">{z.name}</div>
                <div className="text-xs text-slate-500">
                  {z.kind}
                  {z.countsForAttendance ? " · attendance" : " · access only"}
                </div>
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(z.id)}
              className="rounded-lg border border-rose-500/30 px-2.5 py-1 text-xs text-rose-300 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </Row>
        ))}
      </div>
    </Panel>
  );
}

function RulesPanel({
  site, onMsg, onErr,
}: { site: AttendanceSite; onMsg: (s: string) => void; onErr: (s: string) => void }) {
  const [rules, setRules] = useState<AttendanceRule[]>([]);
  const [zones, setZones] = useState<AttendanceZone[]>([]);
  const [groups, setGroups] = useState<AttendanceGroup[]>([]);
  const [schedules, setSchedules] = useState<AttendanceSchedule[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    zoneId: "",
    groupId: "",
    scheduleId: "",
    allow: true,
    priority: "0",
    note: "",
  });

  const load = useCallback(async () => {
    const [r, z, g, s] = await Promise.all([
      controlPlane.attendanceRules(site.id).catch(() => null),
      controlPlane.attendanceZones(site.id).catch(() => null),
      controlPlane.attendanceGroups(site.id).catch(() => null),
      controlPlane.attendanceSchedules(site.id).catch(() => null),
    ]);
    setRules(r?.ok && r.data?.rules ? r.data.rules : []);
    setZones(z?.ok && z.data?.zones ? z.data.zones : []);
    setGroups(g?.ok && g.data?.groups ? g.data.groups : []);
    setSchedules(s?.ok && s.data?.schedules ? s.data.schedules : []);
  }, [site.id]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    setBusy(true);
    onErr("");
    const res = await controlPlane.createAttendanceRule({
      siteId: site.id,
      zoneId: form.zoneId ? Number(form.zoneId) : null,
      groupId: form.groupId ? Number(form.groupId) : null,
      scheduleId: form.scheduleId ? Number(form.scheduleId) : null,
      allow: form.allow,
      priority: Number(form.priority) || 0,
      note: form.note.trim(),
    });
    if (!res.ok) onErr(apiErr(res, "Could not create rule."));
    else {
      onMsg("Access rule saved. Readers will receive an updated card list.");
      setForm({ zoneId: "", groupId: "", scheduleId: "", allow: true, priority: "0", note: "" });
      await load();
    }
    setBusy(false);
  };

  const remove = async (id: number) => {
    setBusy(true);
    const res = await controlPlane.deleteAttendanceRule(id);
    if (!res.ok) onErr(apiErr(res, "Could not delete rule."));
    else {
      onMsg("Rule removed and ACL refresh queued.");
      await load();
    }
    setBusy(false);
  };

  return (
    <Panel title="Access rules" hint="Who may pass which door, optionally limited to a schedule">
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-[11px] font-semibold text-slate-500">
          Zone (optional = all)
          <select
            value={form.zoneId}
            onChange={(e) => setForm({ ...form, zoneId: e.target.value })}
            className="mt-1 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
          >
            <option value="">All zones</option>
            {zones.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          Group (optional = everyone)
          <select
            value={form.groupId}
            onChange={(e) => setForm({ ...form, groupId: e.target.value })}
            className="mt-1 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
          >
            <option value="">Everyone</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          Schedule (optional)
          <select
            value={form.scheduleId}
            onChange={(e) => setForm({ ...form, scheduleId: e.target.value })}
            className="mt-1 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
          >
            <option value="">Any time (ACL still refreshes each minute)</option>
            {schedules.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          Effect
          <select
            value={form.allow ? "allow" : "deny"}
            onChange={(e) => setForm({ ...form, allow: e.target.value === "allow" })}
            className="mt-1 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
          >
            <option value="allow">Allow</option>
            <option value="deny">Deny</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          Priority (higher wins)
          <input
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
            className="mt-1 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
          />
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          Note
          <input
            value={form.note}
            onChange={(e) => setForm({ ...form, note: e.target.value })}
            placeholder="Optional"
            className="mt-1 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
          />
        </label>
      </div>
      <button
        type="button"
        disabled={busy}
        onClick={() => void add()}
        className="mb-4 min-h-[40px] rounded-xl border border-violet-500/40 bg-violet-600 px-4 text-xs font-semibold text-white disabled:opacity-40 inline-flex items-center gap-1.5"
      >
        <Shield className="h-3.5 w-3.5" /> Save rule
      </button>
      <div className="divide-y divide-white/5">
        {rules.length === 0 ? <Muted>No rules yet. Without rules, ACL behaviour follows site defaults and credentials alone.</Muted> : null}
        {rules.map((r) => (
          <Row key={r.id}>
            <div>
              <div className="font-semibold text-slate-200">
                {r.allow ? "Allow" : "Deny"}
                {r.groupName ? ` · ${r.groupName}` : " · everyone"}
                {r.zoneName ? ` @ ${r.zoneName}` : " @ all zones"}
              </div>
              <div className="text-xs text-slate-500">
                priority {r.priority}
                {r.scheduleName ? ` · ${r.scheduleName}` : ""}
                {r.note ? ` · ${r.note}` : ""}
              </div>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void remove(r.id)}
              className="rounded-lg border border-rose-500/30 px-2.5 py-1 text-xs text-rose-300 disabled:opacity-40"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </Row>
        ))}
      </div>
    </Panel>
  );
}

function LeavesPanel({
  site, onMsg, onErr,
}: { site: AttendanceSite; onMsg: (s: string) => void; onErr: (s: string) => void }) {
  const [leaves, setLeaves] = useState<AttendanceLeave[]>([]);
  const [people, setPeople] = useState<AttendancePerson[]>([]);
  const [groups, setGroups] = useState<AttendanceGroup[]>([]);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    personId: "",
    groupId: "",
    kind: "leave",
    fromDay: today(),
    toDay: today(),
    countsAsPresent: false,
    note: "",
  });

  const load = useCallback(async () => {
    const [l, p, g] = await Promise.all([
      controlPlane.attendanceLeaves(site.id).catch(() => null),
      controlPlane.attendancePeople(site.id).catch(() => null),
      controlPlane.attendanceGroups(site.id).catch(() => null),
    ]);
    setLeaves(l?.ok && l.data?.leaves ? l.data.leaves : []);
    setPeople(p?.ok && p.data?.people ? p.data.people : []);
    setGroups(g?.ok && g.data?.groups ? g.data.groups : []);
  }, [site.id]);

  useEffect(() => { void load(); }, [load]);

  const add = async () => {
    if (form.toDay < form.fromDay) {
      onErr("End date is before start date.");
      return;
    }
    setBusy(true);
    onErr("");
    const res = await controlPlane.createAttendanceLeave({
      siteId: site.id,
      personId: form.personId ? Number(form.personId) : null,
      groupId: form.groupId ? Number(form.groupId) : null,
      kind: form.kind,
      fromDay: form.fromDay,
      toDay: form.toDay,
      countsAsPresent: form.countsAsPresent,
      note: form.note.trim(),
    });
    if (!res.ok) onErr(apiErr(res, "Could not save leave."));
    else {
      onMsg("Leave/closure saved. Register will recompute for those days.");
      await load();
    }
    setBusy(false);
  };

  const remove = async (id: number) => {
    setBusy(true);
    const res = await controlPlane.deleteAttendanceLeave(id);
    if (!res.ok) onErr(apiErr(res, "Could not delete."));
    else {
      onMsg("Removed.");
      await load();
    }
    setBusy(false);
  };

  return (
    <Panel title="Leave & site closures" hint="Authorised absence outranks lateness on the register">
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <label className="text-[11px] font-semibold text-slate-500">
          Kind
          <select
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value })}
            className="mt-1 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
          >
            <option value="leave">Personal leave</option>
            <option value="holiday">Site closure / holiday</option>
            <option value="sick">Sick</option>
            <option value="wfh">Work from home</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          Person (optional)
          <select
            value={form.personId}
            onChange={(e) => setForm({ ...form, personId: e.target.value, groupId: "" })}
            className="mt-1 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
          >
            <option value="">Whole site / group</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          Group (optional)
          <select
            value={form.groupId}
            onChange={(e) => setForm({ ...form, groupId: e.target.value, personId: "" })}
            className="mt-1 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
          >
            <option value="">—</option>
            {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          From
          <input type="date" value={form.fromDay} onChange={(e) => setForm({ ...form, fromDay: e.target.value })}
            className="mt-1 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100" />
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          To
          <input type="date" value={form.toDay} onChange={(e) => setForm({ ...form, toDay: e.target.value })}
            className="mt-1 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100" />
        </label>
        <label className="flex items-center gap-2 text-xs text-slate-300 self-end pb-2">
          <input type="checkbox" checked={form.countsAsPresent} onChange={(e) => setForm({ ...form, countsAsPresent: e.target.checked })} />
          Counts as present
        </label>
      </div>
      <input
        value={form.note}
        onChange={(e) => setForm({ ...form, note: e.target.value })}
        placeholder="Note (optional)"
        className="mb-3 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100"
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => void add()}
        className="mb-4 min-h-[40px] rounded-xl border border-violet-500/40 bg-violet-600 px-4 text-xs font-semibold text-white disabled:opacity-40 inline-flex items-center gap-1.5"
      >
        <CalendarDays className="h-3.5 w-3.5" /> Save leave / closure
      </button>
      <div className="divide-y divide-white/5">
        {leaves.length === 0 ? <Muted>No leave or closures recorded.</Muted> : null}
        {leaves.map((l) => (
          <Row key={l.id}>
            <div>
              <div className="font-semibold text-slate-200">
                {l.kind} · {l.personName || l.groupName || "Whole site"}
              </div>
              <div className="text-xs text-slate-500">
                {l.fromDay} → {l.toDay}
                {l.countsAsPresent ? " · counts as present" : ""}
                {l.note ? ` · ${l.note}` : ""}
              </div>
            </div>
            <button type="button" disabled={busy} onClick={() => void remove(l.id)}
              className="rounded-lg border border-rose-500/30 px-2.5 py-1 text-xs text-rose-300 disabled:opacity-40">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </Row>
        ))}
      </div>
    </Panel>
  );
}

function PolicyPanel({
  site, onMsg, onErr,
}: { site: AttendanceSite; onMsg: (s: string) => void; onErr: (s: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    graceMinutes: String(site.graceMinutes ?? 15),
    absentAfterMinutes: String(site.absentAfterMinutes ?? 120),
    halfDayAfterMinutes: String(site.halfDayAfterMinutes ?? 240),
    timezone: site.timezone || "Asia/Kolkata",
    autoOut: Boolean(site.autoOut),
    requireAccessRequest: Boolean(site.requireAccessRequest),
    notifyAbsence: Boolean(site.notifyAbsence),
    kind: site.kind || "office",
  });

  const save = async () => {
    setBusy(true);
    onErr("");
    const res = await controlPlane.updateAttendanceSite(site.id, {
      graceMinutes: Number(form.graceMinutes) || 0,
      absentAfterMinutes: Number(form.absentAfterMinutes) || 0,
      halfDayAfterMinutes: Number(form.halfDayAfterMinutes) || 0,
      timezone: form.timezone,
      autoOut: form.autoOut,
      requireAccessRequest: form.requireAccessRequest,
      notifyAbsence: form.notifyAbsence,
      kind: form.kind,
    });
    if (!res.ok) onErr(apiErr(res, "Could not save site policy."));
    else onMsg("Site policy updated.");
    setBusy(false);
  };

  return (
    <Panel title="Site policy" hint="Wall-clock rules for late / absent / half-day">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-[11px] font-semibold text-slate-500">
          Site kind
          <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as AttendanceSite["kind"] })}
            className="mt-1 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100">
            <option value="office">Office</option>
            <option value="school">School</option>
            <option value="facility">Facility</option>
          </select>
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          Timezone
          <input value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}
            className="mt-1 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100" />
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          Grace minutes (late after)
          <input value={form.graceMinutes} onChange={(e) => setForm({ ...form, graceMinutes: e.target.value })}
            className="mt-1 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100" />
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          Mark absent after (minutes)
          <input value={form.absentAfterMinutes} onChange={(e) => setForm({ ...form, absentAfterMinutes: e.target.value })}
            className="mt-1 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100" />
        </label>
        <label className="text-[11px] font-semibold text-slate-500">
          Half-day after (minutes worked)
          <input value={form.halfDayAfterMinutes} onChange={(e) => setForm({ ...form, halfDayAfterMinutes: e.target.value })}
            className="mt-1 block w-full min-h-[40px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100" />
        </label>
      </div>
      <div className="mt-3 flex flex-col gap-2 text-xs text-slate-300">
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.autoOut} onChange={(e) => setForm({ ...form, autoOut: e.target.checked })} /> Auto clock-out at end of window</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.requireAccessRequest} onChange={(e) => setForm({ ...form, requireAccessRequest: e.target.checked })} /> Require approved access request before door opens</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={form.notifyAbsence} onChange={(e) => setForm({ ...form, notifyAbsence: e.target.checked })} /> Notify on confirmed absence</label>
      </div>
      <button type="button" disabled={busy} onClick={() => void save()}
        className="mt-4 min-h-[40px] rounded-xl border border-violet-500/40 bg-violet-600 px-4 text-xs font-semibold text-white disabled:opacity-40 inline-flex items-center gap-1.5">
        <Settings2 className="h-3.5 w-3.5" /> Save policy
      </button>
    </Panel>
  );
}

export function Reports({ site }: { site: AttendanceSite }) {
  const [range, setRange] = useState({ from: daysAgo(30), to: today() });
  const [rows, setRows] = useState<AttendanceSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [pushingPayroll, setPushingPayroll] = useState(false);
  const [exportError, setExportError] = useState("");
  const [payrollNotice, setPayrollNotice] = useState("");

  const load = useCallback(async () => {
    if (!range.from || !range.to || range.from > range.to) return;
    setLoading(true);
    setExportError("");
    const res = await controlPlane.attendanceSummary(site.id, range.from, range.to).catch(() => null);
    if (res?.ok && res.data?.people) setRows(res.data.people);
    else {
      setRows([]);
      if (res && !res.ok) setExportError(apiErr(res, "Could not load summary."));
    }
    setLoading(false);
  }, [site.id, range.from, range.to]);

  useEffect(() => { void load(); }, [load]);

  const totals = useMemo(() => {
    const people = rows.length;
    const expected = rows.reduce((s, r) => s + r.expected, 0);
    const present = rows.reduce((s, r) => s + r.present, 0);
    const absent = rows.reduce((s, r) => s + r.absent, 0);
    const late = rows.reduce((s, r) => s + r.late, 0);
    const worked = rows.reduce((s, r) => s + r.workedMinutes, 0);
    const punctuality = expected > 0 ? Math.round(((present - late) / expected) * 1000) / 10 : null;
    const absenteeism = expected > 0 ? Math.round((absent / expected) * 1000) / 10 : null;
    return { people, expected, present, absent, late, worked, punctuality, absenteeism };
  }, [rows]);

  const handlePushPayroll = async () => {
    setPushingPayroll(true);
    setPayrollNotice("");
    setExportError("");
    try {
      const res = await syncAttendanceToPaystub({
        siteId: site.id,
        from: range.from,
        to: range.to,
        orgId: site.orgId ?? undefined,
      });
      if (res.ok) {
        const n = typeof res.recordsPushed === "number" ? res.recordsPushed : null;
        setPayrollNotice(
          n != null
            ? `Pushed ${n} timesheet record(s) to Paystub for ${range.from} → ${range.to}.`
            : `Paystub sync completed for ${range.from} → ${range.to}.`
        );
      } else {
        setExportError(apiErr(res, "Could not push timesheets to Paystub."));
      }
    } catch {
      setExportError("Could not reach payroll sync.");
    } finally {
      setPushingPayroll(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="People in range"
          value={loading ? "…" : String(totals.people)}
          accent="#a855f7"
          icon={Clock}
        />
        <Tile
          label="On-time rate"
          value={loading ? "…" : totals.punctuality == null ? "—" : `${totals.punctuality}%`}
          accent="#22c55e"
          icon={CheckCircle2}
        />
        <Tile
          label="Hours logged"
          value={loading ? "…" : fmtHours(totals.worked)}
          accent="#38bdf8"
          icon={Clock}
        />
        <Tile
          label="Absenteeism"
          value={loading ? "…" : totals.absenteeism == null ? "—" : `${totals.absenteeism}%`}
          accent="#f59e0b"
          icon={UserX}
        />
      </div>

      <div className="rounded-2xl border border-white/15 bg-black/30 p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h4 className="text-base font-bold text-slate-100">Export &amp; payroll sync</h4>
            <p className="text-xs text-slate-400 mt-1">
              Summary figures come from the live register. Push only after you have verified the period.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-400">From</label>
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })}
              className="mt-1 block min-h-[44px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-400">To</label>
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })}
              className="mt-1 block min-h-[44px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-slate-100" />
          </div>
          <button type="button" onClick={() => void load()} disabled={loading}
            className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-slate-200 disabled:opacity-40">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Refresh"}
          </button>
          <button
            type="button"
            disabled={downloading || !range.from || !range.to || range.from > range.to}
            onClick={async () => {
              setDownloading(true);
              setExportError("");
              const result = await controlPlane.downloadAttendanceExport(site.id, "summary", range.from, range.to);
              if (!result.ok) setExportError(apiErr(result, "Could not export."));
              setDownloading(false);
            }}
            className="min-h-[44px] rounded-xl border border-white/15 bg-white/5 px-4 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40 inline-flex items-center gap-2"
          >
            {downloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Export CSV
          </button>
          <button
            type="button"
            disabled={pushingPayroll || !range.from || !range.to || range.from > range.to}
            onClick={() => void handlePushPayroll()}
            className="min-h-[44px] rounded-xl border border-emerald-500/40 bg-emerald-600 px-5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40 inline-flex items-center gap-2"
          >
            {pushingPayroll ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Push to Paystub
          </button>
        </div>

        {payrollNotice ? (
          <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-3.5 text-xs text-emerald-200">{payrollNotice}</div>
        ) : null}
        {exportError ? <p role="alert" className="mt-3 text-sm text-rose-300">{exportError}</p> : null}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20 shadow-xl">
        <div className="p-4 border-b border-white/10 flex items-center justify-between">
          <h5 className="font-semibold text-sm text-slate-200">
            Timesheet summary ({range.from} → {range.to})
          </h5>
          <span className="text-xs text-slate-400 font-mono">{rows.length} people</span>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr className="border-b border-white/10 bg-white/[0.02]">
              <th className="p-3.5">Code</th>
              <th className="p-3.5">Name</th>
              <th className="p-3.5">Group</th>
              <th className="p-3.5">Present</th>
              <th className="p-3.5">Late</th>
              <th className="p-3.5">Absent</th>
              <th className="p-3.5">Leave</th>
              <th className="p-3.5">Hours</th>
              <th className="p-3.5 text-right">Attendance %</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {!loading && rows.length === 0 ? (
              <tr><td colSpan={9} className="p-6 text-center text-slate-500">No register data for this range yet.</td></tr>
            ) : null}
            {rows.map((p) => (
              <tr key={p.personId} className="hover:bg-white/5 transition">
                <td className="p-3.5 font-mono text-xs text-violet-400 font-semibold">{p.code}</td>
                <td className="p-3.5 font-semibold text-slate-200">{p.name}</td>
                <td className="p-3.5 text-slate-400">{p.groupName || "—"}</td>
                <td className="p-3.5 font-mono text-slate-300">{p.present}</td>
                <td className="p-3.5 font-mono text-amber-300">{p.late}</td>
                <td className="p-3.5 font-mono text-rose-300">{p.absent}</td>
                <td className="p-3.5 font-mono text-sky-300">{p.leave}</td>
                <td className="p-3.5 font-mono text-slate-200">{fmtHours(p.workedMinutes)}</td>
                <td className="p-3.5 text-right font-mono text-emerald-300">
                  {p.percent == null ? "—" : `${p.percent}%`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
