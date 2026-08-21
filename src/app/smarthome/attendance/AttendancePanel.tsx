"use client";

/**
 * Every attendance view, behind one component.
 *
 * `view` selects which. One component rather than seven files because they all
 * need the same thing first — which site are we looking at — and seven copies
 * of that resolution would be seven chances for two tabs to disagree about it.
 *
 * The wording follows the site's kind. A school has students in classes, an
 * office has employees in departments; the rows underneath are identical, which
 * is why there is one portal and not three.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardCheck, Loader2, RefreshCw, Download, Plus, Trash2, DoorOpen,
  Radio, Search, Upload, AlertTriangle, CheckCircle2, Clock, UserX,
} from "lucide-react";
import {
  controlPlane,
  type AttendanceCredential,
  type AttendanceGroup,
  type AttendanceLive,
  type AttendancePerson,
  type AttendanceSchedule,
  type AttendanceSite,
  type AttendanceSummaryRow,
  type AttendanceAccessRequest,
  type AttendanceTerminal,
  type RegisterRow,
} from "@/lib/control-plane";
import { useFleet } from "../_data/hooks";
import { isAttendanceReader } from "@/lib/attendance-readers";

export type AttendanceView =
  | "live" | "register" | "people" | "cards" | "terminals" | "schedules" | "reports" | "access";

/** The words a site uses for its people. A school does not have "employees". */
function vocab(kind: string) {
  if (kind === "office") {
    return { person: "employee", people: "Employees", group: "department", groups: "Departments" };
  }
  if (kind === "facility") {
    return { person: "holder", people: "Card holders", group: "area", groups: "Areas" };
  }
  return { person: "student", people: "Students", group: "class", groups: "Classes" };
}

const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
  present: { label: "Present", cls: "text-green-300 border-green-500/40 bg-green-500/10" },
  late: { label: "Late", cls: "text-amber-300 border-amber-500/40 bg-amber-500/10" },
  absent: { label: "Absent", cls: "text-red-300 border-red-500/40 bg-red-500/10" },
  half: { label: "Half day", cls: "text-orange-300 border-orange-500/40 bg-orange-500/10" },
  leave: { label: "Leave", cls: "text-sky-300 border-sky-500/40 bg-sky-500/10" },
  holiday: { label: "Closed", cls: "text-slate-400 border-white/10 bg-white/5" },
  weekend: { label: "Non-working", cls: "text-slate-500 border-white/10 bg-white/5" },
  unknown: { label: "Not yet", cls: "text-slate-400 border-white/10 bg-white/5" },
};

function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.unknown;
  return <span className={`rounded-lg border px-2 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

/**
 * A time, on the site's clock rather than the browser's.
 *
 * A head office in one timezone looking at a school in another must not see
 * arrival times shifted by the difference — the register says 08:32 because
 * that is what the bell says, wherever it is read from.
 */
function hhmm(iso: string | null, tz: string): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("en-GB", {
      timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false,
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

const hours = (m: number) => (m > 0 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : "—");
const today = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

export function AttendancePanel({ view }: { view: AttendanceView }) {
  const [sites, setSites] = useState<AttendanceSite[]>([]);
  const [siteId, setSiteId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const r = await controlPlane.attendanceSites();
    if (r.ok) {
      const list = r.data.sites ?? [];
      setSites(list);
      setSiteId((cur) => cur ?? list[0]?.id ?? null);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const site = useMemo(() => sites.find((s) => s.id === siteId) ?? null, [sites, siteId]);

  if (loading) return <Skeleton />;
  if (!site) return <FirstRun onCreated={load} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          {site.name} · {site.people} on the roll · {site.terminals} reader
          {site.terminals === 1 ? "" : "s"} · {site.timezone}
        </p>
        {sites.length > 1 && (
          <select value={site.id} onChange={(e) => setSiteId(Number(e.target.value))}
                  className="min-h-[40px] rounded-xl border border-white/15 bg-black/30 px-3 text-sm text-slate-100">
            {sites.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {view === "live" && <LiveBoard site={site} />}
      {view === "register" && <Register site={site} />}
      {view === "people" && <People site={site} />}
      {view === "cards" && <Cards site={site} />}
      {view === "terminals" && <Terminals site={site} />}
      {view === "access" && <OfficeAccess site={site} />}
      {view === "schedules" && <Schedules site={site} />}
      {view === "reports" && <Reports site={site} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function FirstRun({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState<"school" | "office" | "facility">("school");
  const [busy, setBusy] = useState(false);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "Asia/Kolkata";

  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-white/10 bg-black/20 p-6">
      <ClipboardCheck className="h-8 w-8 text-violet-400" />
      <h2 className="mt-3 text-lg font-bold text-slate-100">Set up attendance</h2>
      <p className="mt-2 text-sm text-slate-400">
        A site is one building with one set of rules — a school, an office, or a floor of rooms
        with card readers on the doors. More can be added later.
      </p>
      <div className="mt-5 space-y-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="St Mary's High School"
               className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/30 px-3 text-slate-100 outline-none focus:border-violet-500" />
        <div className="grid grid-cols-3 gap-2">
          {(["school", "office", "facility"] as const).map((k) => (
            <button key={k} onClick={() => setKind(k)}
              className={`min-h-[44px] rounded-xl border px-3 text-sm font-semibold capitalize transition ${
                kind === k ? "border-violet-500/50 bg-violet-500/15 text-violet-200"
                           : "border-white/15 bg-black/20 text-slate-300 hover:bg-white/5"}`}>
              {k}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">
          Times are recorded in <strong>{tz}</strong>. Lateness, the register and when a day rolls
          over are all measured on that clock rather than the server&apos;s.
        </p>
      </div>
      <button
        disabled={!name.trim() || busy}
        onClick={async () => {
          setBusy(true);
          const r = await controlPlane.createAttendanceSite({ name: name.trim(), kind, timezone: tz });
          setBusy(false);
          if (r.ok) onCreated();
        }}
        className="mt-5 min-h-[44px] w-full rounded-xl border border-violet-500/40 bg-violet-500/10 font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40 transition"
      >
        {busy ? "Creating…" : "Create site"}
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function LiveBoard({ site }: { site: AttendanceSite }) {
  const [live, setLive] = useState<AttendanceLive | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await controlPlane.attendanceLive(site.id);
    if (r.ok) setLive(r.data);
  }, [site.id]);

  useEffect(() => {
    void load();
    /*
     * Polled rather than pushed. The console already holds a websocket for
     * device state, but a punch is a row rather than device state, and
     * plumbing a second channel for a screen watched a few minutes a day is
     * more moving parts than the refresh is worth.
     */
    const t = setInterval(() => void load(), 10_000);
    return () => clearInterval(t);
  }, [load]);

  if (!live) return <Skeleton />;
  const totals = live.totals ?? {};

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Tile label="On site now" value={live.onSite.length} accent="#22c55e" icon={CheckCircle2} />
        <Tile label="Present" value={totals.present ?? 0} />
        <Tile label="Late" value={totals.late ?? 0} accent="#f59e0b" icon={Clock} />
        <Tile label="Absent" value={totals.absent ?? 0} accent="#ef4444" icon={UserX} />
        <Tile label="Not yet in" value={totals.unknown ?? 0} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel title={`In the building (${live.onSite.length})`}
               hint="Everyone whose last scan today was an entry — the roll call for a fire drill.">
          <div className="max-h-[420px] overflow-y-auto">
            {live.onSite.length === 0 && <Muted>Nobody has scanned in yet today.</Muted>}
            {live.onSite.map((p) => (
              <Row key={p.personId}>
                <div>
                  <div className="font-medium text-slate-200">{p.name}</div>
                  <div className="text-xs text-slate-500">
                    {p.code}{p.groupName ? ` · ${p.groupName}` : ""}
                  </div>
                </div>
                <span className="text-xs text-slate-400">since {hhmm(p.since, live.timezone)}</span>
              </Row>
            ))}
          </div>
        </Panel>

        <Panel title="Latest scans" hint="Refusals included — they are the half worth watching.">
          <div className="max-h-[420px] overflow-y-auto">
            {live.recent.length === 0 && <Muted>No scans yet.</Muted>}
            {live.recent.map((p, i) => (
              <Row key={i}>
                <div>
                  <div className="font-medium text-slate-200">
                    {p.personName || (
                      /* The number is shown because reading it off a blank fob
                         is otherwise impossible, and this is how somebody
                         issues a card they are holding. */
                      <span className="text-slate-500">Unknown card {p.cardNumber}</span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500">
                    {p.terminalName ?? "—"} · {p.direction === "out" ? "leaving" : "arriving"}
                    {!p.granted && <span className="text-red-400"> · {p.reason}</span>}
                  </div>
                </div>
                <span className="text-xs text-slate-400">{hhmm(p.at, live.timezone)}</span>
              </Row>
            ))}
          </div>
        </Panel>
      </div>

      <Panel title="Readers">
        {live.terminals.length === 0 && <Muted>No readers yet. Add one under Readers.</Muted>}
        {live.terminals.map((t) => (
          <Row key={t.deviceId}>
            <div className="flex items-center gap-2">
              <Radio className={`h-4 w-4 ${t.online ? "text-green-400" : "text-slate-600"}`} />
              <div>
                <div className="font-medium text-slate-200">{t.name}</div>
                <div className="text-xs text-slate-500">
                  {t.aclCount} cards loaded
                  {t.queued > 0 && (
                    /* A queue is not an error — it is the terminal doing its
                       job through an outage — but it does mean the register is
                       behind, and somebody comparing the two should know why. */
                    <span className="text-amber-400"> · {t.queued} scans waiting to upload</span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">{t.online ? "online" : "offline"}</span>
              <button
                disabled={busy || !t.online}
                onClick={async () => { setBusy(true); await controlPlane.openAttendanceDoor(t.deviceId); setBusy(false); }}
                className="min-h-[36px] rounded-lg border border-white/15 bg-black/20 px-3 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-30 transition flex items-center gap-1.5"
              >
                <DoorOpen className="h-3.5 w-3.5" /> Open
              </button>
            </div>
          </Row>
        ))}
      </Panel>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Register({ site }: { site: AttendanceSite }) {
  const [day, setDay] = useState(today());
  const [rows, setRows] = useState<RegisterRow[]>([]);
  const [totals, setTotals] = useState<Record<string, number>>({});
  const [groups, setGroups] = useState<AttendanceGroup[]>([]);
  const [groupId, setGroupId] = useState<number | undefined>(undefined);
  const [tz, setTz] = useState(site.timezone);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [r, g] = await Promise.all([
      controlPlane.attendanceRegister(site.id, day, groupId),
      controlPlane.attendanceGroups(site.id),
    ]);
    if (r.ok) { setRows(r.data.people ?? []); setTotals(r.data.totals ?? {}); setTz(r.data.timezone); }
    if (g.ok) setGroups(g.data.groups ?? []);
  }, [site.id, day, groupId]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={day} onChange={(e) => setDay(e.target.value)}
               className="min-h-[44px] rounded-xl border border-white/15 bg-black/30 px-3 text-slate-100" />
        <select value={groupId ?? ""} onChange={(e) => setGroupId(e.target.value ? Number(e.target.value) : undefined)}
                className="min-h-[44px] rounded-xl border border-white/15 bg-black/30 px-3 text-slate-100">
          <option value="">All {vocab(site.kind).groups.toLowerCase()}</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <button onClick={async () => { setBusy(true); await controlPlane.recomputeAttendance(site.id, day); await load(); setBusy(false); }}
                disabled={busy}
                className="min-h-[44px] rounded-xl border border-white/15 bg-black/20 px-3 text-sm font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40 transition flex items-center gap-2">
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} /> Recompute
        </button>
        <a href={controlPlane.attendanceExportUrl(site.id, "register", day, day)}
           className="min-h-[44px] rounded-xl border border-white/15 bg-black/20 px-3 text-sm font-semibold text-slate-200 hover:bg-white/10 transition flex items-center gap-2">
          <Download className="h-4 w-4" /> CSV
        </a>
        <div className="ml-auto flex flex-wrap gap-2 text-xs">
          {Object.entries(totals).map(([k, n]) => (
            <span key={k} className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-slate-300">
              {STATUS_STYLE[k]?.label ?? k}: <strong>{n}</strong>
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr className="border-b border-white/10">
              <th className="p-3">Name</th><th className="p-3">Group</th><th className="p-3">Status</th>
              <th className="p-3">In</th><th className="p-3">Out</th><th className="p-3">Hours</th>
              <th className="p-3">Late</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={8} className="p-6 text-center text-slate-500">
                Nobody on the roll for this day.
              </td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.personId} className="border-b border-white/5 hover:bg-white/5">
                <td className="p-3">
                  <div className="font-medium text-slate-200">{r.name}</div>
                  <div className="text-xs text-slate-500">{r.code}</div>
                </td>
                <td className="p-3 text-slate-400">{r.groupName ?? "—"}</td>
                <td className="p-3">
                  <StatusPill status={r.status} />
                  {r.manual && <span className="ml-2 text-xs text-sky-400" title={r.note}>by hand</span>}
                </td>
                <td className="p-3 text-slate-300">{hhmm(r.firstIn, tz)}</td>
                <td className="p-3 text-slate-300">
                  {hhmm(r.lastOut, tz)}
                  {/* An assumed exit is shown as assumed. A timesheet that
                      cannot tell observed hours from inferred ones is one
                      somebody has to check by hand anyway. */}
                  {r.assumedOut && (
                    <span className="ml-1 text-xs text-amber-500" title="Closed automatically at the end of the day">*</span>
                  )}
                </td>
                <td className="p-3 text-slate-300">{hours(r.workedMinutes)}</td>
                <td className="p-3 text-slate-400">{r.lateMinutes > 0 ? `${r.lateMinutes}m` : "—"}</td>
                <td className="p-3 text-right">
                  <select
                    value=""
                    onChange={async (e) => {
                      if (!e.target.value) return;
                      if (e.target.value === "clear") await controlPlane.clearAttendanceOverride(r.personId, day);
                      else await controlPlane.markAttendance(r.personId, day, e.target.value);
                      await load();
                    }}
                    className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-slate-300"
                  >
                    <option value="">Mark…</option>
                    <option value="present">Present</option>
                    <option value="late">Late</option>
                    <option value="absent">Absent</option>
                    <option value="half">Half day</option>
                    <option value="leave">Leave</option>
                    {r.manual && <option value="clear">Undo correction</option>}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-600">
        * Exit assumed — the person never scanned out, so the day was closed at the end of their
        window. Corrections made by hand are kept and are never overwritten by a recompute.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function People({ site }: { site: AttendanceSite }) {
  const v = vocab(site.kind);
  const [people, setPeople] = useState<AttendancePerson[]>([]);
  const [groups, setGroups] = useState<AttendanceGroup[]>([]);
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msg, setMsg] = useState("");
  const [form, setForm] = useState({ code: "", name: "", groupId: "" });

  const load = useCallback(async () => {
    const [p, g] = await Promise.all([
      controlPlane.attendancePeople(site.id, { q }),
      controlPlane.attendanceGroups(site.id),
    ]);
    if (p.ok) setPeople(p.data.people ?? []);
    if (g.ok) setGroups(g.data.groups ?? []);
  }, [site.id, q]);

  useEffect(() => { void load(); }, [load]);

  const importCsv = useCallback(async (file: File) => {
    setImporting(true);
    setMsg("");
    const text = await file.text();
    /*
     * A deliberately tolerant reader. This file comes out of a school MIS or
     * an HR export: it will have a byte-order mark, quoted fields with commas
     * in names, and headers in whatever case somebody typed. Refusing it is
     * not an option, because the alternative for the user is typing eight
     * hundred rows into a form.
     */
    const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
    if (!lines.length) { setImporting(false); return; }

    const split = (l: string) => {
      const out: string[] = [];
      let cur = "", inQ = false;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (c === '"') {
          if (inQ && l[i + 1] === '"') { cur += '"'; i++; } else inQ = !inQ;
        } else if (c === "," && !inQ) { out.push(cur); cur = ""; }
        else cur += c;
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };

    const header = split(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z]/g, ""));
    const rows = lines.slice(1).map((l) => {
      const cells = split(l);
      const get = (...names: string[]) => {
        for (const n of names) {
          const i = header.indexOf(n);
          if (i >= 0 && cells[i]) return cells[i];
        }
        return "";
      };
      return {
        code: get("code", "id", "rollno", "rollnumber", "employeeid", "empid"),
        name: get("name", "fullname", "studentname", "employeename"),
        group: get("group", "class", "section", "department", "team"),
        role: get("role", "type") || (site.kind === "office" ? "employee" : "student"),
        email: get("email"),
        phone: get("phone", "mobile"),
        guardianName: get("guardian", "guardianname", "parent", "parentname"),
        guardianEmail: get("guardianemail", "parentemail"),
        guardianPhone: get("guardianphone", "parentphone"),
      };
    }).filter((r) => r.code && r.name);

    if (!rows.length) {
      setMsg("No rows found. The file needs at least a code and a name column.");
      setImporting(false);
      return;
    }
    const r = await controlPlane.importAttendancePeople(site.id, rows);
    setMsg(r.ok
      ? `${r.data.created} added, ${r.data.updated} updated${r.data.failed ? `, ${r.data.failed} failed` : ""}.`
      : "The import failed.");
    setImporting(false);
    await load();
  }, [site.id, site.kind, load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${v.people.toLowerCase()}`}
                 className="min-h-[44px] w-full rounded-xl border border-white/15 bg-black/30 pl-9 pr-3 text-slate-100 outline-none focus:border-violet-500" />
        </div>
        <button onClick={() => setAdding((a) => !a)}
                className="min-h-[44px] rounded-xl border border-violet-500/40 bg-violet-500/10 px-3 text-sm font-semibold text-violet-200 hover:bg-violet-500/20 transition flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add
        </button>
        <label className="min-h-[44px] cursor-pointer rounded-xl border border-white/15 bg-black/20 px-3 text-sm font-semibold text-slate-200 hover:bg-white/10 transition flex items-center gap-2">
          <Upload className="h-4 w-4" /> {importing ? "Importing…" : "Import CSV"}
          <input type="file" accept=".csv,text/csv" className="hidden"
                 onChange={(e) => { const f = e.target.files?.[0]; if (f) void importCsv(f); e.target.value = ""; }} />
        </label>
      </div>

      {msg && (
        <div className="rounded-xl border border-violet-500/30 bg-violet-950/20 px-4 py-2.5 text-sm text-violet-200">{msg}</div>
      )}

      {adding && (
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="grid gap-2 sm:grid-cols-4">
            <input placeholder={site.kind === "office" ? "Employee ID" : "Roll number"} value={form.code}
                   onChange={(e) => setForm({ ...form, code: e.target.value })}
                   className="min-h-[44px] rounded-lg border border-white/15 bg-black/30 px-3 text-slate-100" />
            <input placeholder="Full name" value={form.name}
                   onChange={(e) => setForm({ ...form, name: e.target.value })}
                   className="min-h-[44px] rounded-lg border border-white/15 bg-black/30 px-3 text-slate-100 sm:col-span-2" />
            <select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })}
                    className="min-h-[44px] rounded-lg border border-white/15 bg-black/30 px-3 text-slate-100">
              <option value="">No {v.group}</option>
              {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <button
            disabled={!form.code.trim() || !form.name.trim()}
            onClick={async () => {
              await controlPlane.createAttendancePerson({
                siteId: site.id, code: form.code.trim(), name: form.name.trim(),
                role: site.kind === "office" ? "employee" : "student",
                groupId: form.groupId ? Number(form.groupId) : null,
              });
              setForm({ code: "", name: "", groupId: "" });
              setAdding(false);
              await load();
            }}
            className="mt-3 min-h-[40px] rounded-lg border border-violet-500/40 bg-violet-500/10 px-4 text-sm font-semibold text-violet-200 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr className="border-b border-white/10">
              <th className="p-3">Code</th><th className="p-3">Name</th>
              <th className="p-3 capitalize">{v.group}</th>
              <th className="p-3">Cards</th><th className="p-3">Status</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {people.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-slate-500">
                Nobody yet. Import a CSV, or add somebody above.
              </td></tr>
            )}
            {people.map((p) => (
              <tr key={p.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="p-3 font-mono text-xs text-slate-400">{p.code}</td>
                <td className="p-3 font-medium text-slate-200">{p.name}</td>
                <td className="p-3 text-slate-400">{p.groupName ?? "—"}</td>
                <td className="p-3">
                  {p.cards === 0
                    ? <span className="text-xs text-amber-400">no card</span>
                    : <span className="text-slate-300">{p.cards}</span>}
                </td>
                <td className="p-3">
                  {p.active ? <span className="text-xs text-green-400">active</span>
                            : <span className="text-xs text-slate-500">inactive</span>}
                </td>
                <td className="p-3 text-right">
                  <button
                    onClick={async () => { await controlPlane.updateAttendancePerson(p.id, { active: !p.active }); await load(); }}
                    className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-slate-300 hover:bg-white/10"
                  >
                    {p.active ? "Deactivate" : "Reactivate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-600">
        Deactivating stops the card working and keeps the history. The record is never deleted
        by it — an attendance history is the part that has to survive.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Cards({ site }: { site: AttendanceSite }) {
  const [creds, setCreds] = useState<AttendanceCredential[]>([]);
  const [people, setPeople] = useState<AttendancePerson[]>([]);
  const [personId, setPersonId] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    const [c, p] = await Promise.all([
      controlPlane.attendanceCredentials(site.id),
      controlPlane.attendancePeople(site.id),
    ]);
    if (c.ok) setCreds(c.data.credentials ?? []);
    if (p.ok) setPeople(p.data.people ?? []);
  }, [site.id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-sm font-semibold text-slate-200">Issue a card</div>
        <p className="mt-1 text-xs text-slate-500">
          Present the card at a reader first. An unrecognised card appears under Live with its
          number on it, which is the only practical way to read the number off a blank fob.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3">
          <select value={personId} onChange={(e) => setPersonId(e.target.value)}
                  className="min-h-[44px] rounded-lg border border-white/15 bg-black/30 px-3 text-slate-100">
            <option value="">Choose a person…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
          <input value={cardNumber} onChange={(e) => setCardNumber(e.target.value.replace(/\D/g, ""))}
                 placeholder="Card number" inputMode="numeric"
                 className="min-h-[44px] rounded-lg border border-white/15 bg-black/30 px-3 text-slate-100" />
          <button
            disabled={!personId || !cardNumber}
            onClick={async () => {
              setErr("");
              const r = await controlPlane.createAttendanceCredential({
                personId: Number(personId), cardNumber: Number(cardNumber),
              });
              if (!r.ok) setErr((r.data as { error?: string })?.error ?? "Could not issue that card.");
              else { setCardNumber(""); setPersonId(""); await load(); }
            }}
            className="min-h-[44px] rounded-lg border border-violet-500/40 bg-violet-500/10 font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40 transition"
          >
            Issue
          </button>
        </div>
        {err && <div className="mt-2 text-sm text-red-400">{err}</div>}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr className="border-b border-white/10">
              <th className="p-3">Card</th><th className="p-3">Holder</th><th className="p-3">Issued</th>
              <th className="p-3">Last used</th><th className="p-3">Status</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {creds.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-slate-500">No cards issued yet.</td></tr>
            )}
            {creds.map((c) => (
              <tr key={c.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="p-3 font-mono text-xs text-slate-300">{c.cardNumber}</td>
                <td className="p-3">
                  <div className="text-slate-200">{c.personName}</div>
                  <div className="text-xs text-slate-500">{c.personCode}</div>
                </td>
                <td className="p-3 text-xs text-slate-500">{new Date(c.issuedAt).toLocaleDateString()}</td>
                <td className="p-3 text-xs text-slate-500">
                  {c.lastSeenAt ? new Date(c.lastSeenAt).toLocaleString() : "never"}
                </td>
                <td className="p-3">
                  {c.active ? <span className="text-xs text-green-400">active</span>
                            : <span className="text-xs text-red-400">revoked</span>}
                </td>
                <td className="p-3 text-right">
                  {c.active && (
                    <button
                      onClick={async () => { await controlPlane.revokeAttendanceCredential(c.id, "lost"); await load(); }}
                      className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20"
                    >
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-600">
        Revoking pushes the change to every reader immediately rather than waiting for the next
        sync — a lost card is the one case where that minute is the whole point.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Office access: who has asked to come in, and what was decided.
 *
 * The table distinguishes a rule from a person in the "Decided by" column, and
 * it matters more than it looks. "auto" means an employee matched the rule and
 * nobody was asked; an email means somebody took responsibility. Collapsing the
 * two into a tick would make the audit trail useless in the only situation it
 * exists for.
 *
 * A failed load is not an empty list. An empty table here reads as "nobody has
 * asked", which is a reassuring thing to see and exactly the wrong conclusion
 * when the truth is that the request could not be fetched.
 */
function OfficeAccess({ site }: { site: AttendanceSite }) {
  const [requests, setRequests] = useState<AttendanceAccessRequest[]>([]);
  const [pending, setPending] = useState(0);
  const [people, setPeople] = useState<AttendancePerson[]>([]);
  const [filter, setFilter] = useState("");
  const [personId, setPersonId] = useState("");
  const [reason, setReason] = useState("");
  const [validTo, setValidTo] = useState("");
  const [err, setErr] = useState("");
  const [loadError, setLoadError] = useState("");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(0);
  const words = vocab(site.kind);

  const load = useCallback(async () => {
    const [r, p] = await Promise.all([
      controlPlane.attendanceAccessRequests(site.id, filter || undefined),
      controlPlane.attendancePeople(site.id),
    ]);
    if (r.ok) {
      setRequests(r.data.requests ?? []);
      setPending(r.data.pending ?? 0);
      setLoadError("");
    } else {
      setLoadError((r.data as { error?: string })?.error ?? "Could not load access requests.");
    }
    if (p.ok) setPeople(p.data.people ?? []);
    setLoading(false);
  }, [site.id, filter]);

  useEffect(() => { void load(); }, [load]);

  const decide = async (id: number, status: string) => {
    setBusy(id);
    const r = await controlPlane.decideAttendanceAccessRequest(id, { status });
    setBusy(0);
    if (!r.ok) setErr((r.data as { error?: string })?.error ?? "Could not record that decision.");
    else { setErr(""); await load(); }
  };

  return (
    <div className="space-y-4">
      {!site.requireAccessRequest && (
        <div className="flex items-start gap-3 rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-sky-400" />
          <div className="text-xs text-slate-300">
            <strong className="text-sky-200">Access requests are not enforced at this site.</strong>{" "}
            Requests are recorded here, but a card that passes the door rules opens the door whether
            or not a request exists. Turn on <em>Require an access request</em> under Readers to
            make an approval a condition of entry.
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <label className="flex cursor-pointer items-start gap-3">
          <input
            type="checkbox"
            checked={site.requireAccessRequest}
            onChange={async (e) => {
              const want = e.target.checked;
              setErr("");
              const r = await controlPlane.updateAttendanceSite(site.id, { requireAccessRequest: want });
              if (!r.ok) setErr((r.data as { error?: string })?.error ?? "Could not change that setting.");
              else window.location.reload();
            }}
            className="mt-0.5 h-4 w-4 shrink-0 accent-violet-500"
          />
          <span className="text-xs text-slate-300">
            <strong className="text-slate-200">Require an access request to open the door.</strong>{" "}
            With this on, a valid card is not enough on its own — the person also needs an approved
            request covering today. Employees are approved automatically, so in practice this stops
            visitors and lapsed cards rather than staff.
          </span>
        </label>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-sm font-semibold text-slate-200">Raise a request to come in</div>
        <p className="mt-1 text-xs text-slate-500">
          An active {words.person} inside their valid dates is approved immediately and the
          approval is recorded as <span className="font-mono">auto</span>. Anybody else — a
          visitor, a contractor, somebody inactive or expired — is left pending for a person to
          answer.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <select value={personId} onChange={(e) => setPersonId(e.target.value)}
                  className="min-h-[44px] rounded-lg border border-white/15 bg-black/30 px-3 text-slate-100">
            <option value="">Choose a {words.person}…</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.code})</option>)}
          </select>
          <input value={reason} onChange={(e) => setReason(e.target.value)}
                 placeholder="Reason (optional)"
                 className="min-h-[44px] rounded-lg border border-white/15 bg-black/30 px-3 text-slate-100" />
          <input type="date" value={validTo} onChange={(e) => setValidTo(e.target.value)}
                 title="Last day this covers. Leave blank for open-ended."
                 className="min-h-[44px] rounded-lg border border-white/15 bg-black/30 px-3 text-slate-100" />
          <button
            disabled={!personId || busy === -1}
            onClick={async () => {
              setBusy(-1);
              setErr(""); setNote("");
              const r = await controlPlane.createAttendanceAccessRequest({
                siteId: site.id, personId: Number(personId),
                reason: reason.trim() || undefined,
                validFrom: validTo ? today() : undefined,
                validTo: validTo || undefined,
              });
              setBusy(0);
              if (!r.ok) { setErr((r.data as { error?: string })?.error ?? "Could not raise that request."); return; }
              if (r.data.existing) setNote("That person already has a live request — showing the existing one.");
              else if (r.data.request.status === "approved") setNote("Approved automatically.");
              else setNote("Raised, and waiting for somebody to decide.");
              setPersonId(""); setReason(""); setValidTo("");
              await load();
            }}
            className="min-h-[44px] rounded-lg border border-violet-500/40 bg-violet-500/10 font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40 transition"
          >
            {busy === -1 ? "Raising…" : "Raise request"}
          </button>
        </div>
        {err && <div className="mt-2 text-sm text-red-400">{err}</div>}
        {note && <div className="mt-2 text-sm text-sky-300">{note}</div>}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {([["", "All"], ["pending", "Pending"], ["approved", "Approved"],
           ["rejected", "Rejected"], ["revoked", "Revoked"]] as const).map(([id, label]) => (
          <button key={id || "all"} onClick={() => setFilter(id)}
            className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
              filter === id ? "border-violet-500/50 bg-violet-500/15 text-violet-200"
                            : "border-white/15 bg-black/20 text-slate-400 hover:bg-white/5"}`}>
            {label}
            {id === "pending" && pending > 0 && (
              <span className="ml-1.5 rounded bg-amber-500/20 px-1.5 text-amber-300">{pending}</span>
            )}
          </button>
        ))}
        <button onClick={() => void load()} title="Reload"
                className="ml-auto rounded-lg border border-white/15 bg-black/20 p-2 text-slate-400 hover:bg-white/5">
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr className="border-b border-white/10">
              <th className="p-3">Person</th><th className="p-3">Status</th>
              <th className="p-3">Decided by</th><th className="p-3">Covers</th>
              <th className="p-3">Reason</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={6} className="p-6 text-center text-slate-500">Loading…</td></tr>
            )}
            {!loading && loadError && (
              <tr><td colSpan={6} className="p-6 text-center">
                <div className="text-red-400">{loadError}</div>
                <div className="mt-1 text-xs text-slate-500">
                  This is a failure to load, not an empty list — there may well be requests waiting.
                </div>
                <button onClick={() => void load()}
                        className="mt-3 rounded-lg border border-white/15 bg-black/20 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/5">
                  Try again
                </button>
              </td></tr>
            )}
            {!loading && !loadError && requests.length === 0 && (
              <tr><td colSpan={6} className="p-6 text-center text-slate-500">
                Nobody has asked for office access{filter ? ` with status “${filter}”` : ""} yet.
              </td></tr>
            )}
            {!loadError && requests.map((r) => (
              <tr key={r.id} className="border-b border-white/5 hover:bg-white/5">
                <td className="p-3">
                  <div className="text-slate-200">{r.personName ?? `Person ${r.personId}`}</div>
                  <div className="text-xs text-slate-500">{r.personCode}</div>
                </td>
                <td className="p-3"><AccessPill status={r.status} /></td>
                <td className="p-3 text-xs">
                  {r.decidedBy === "auto" ? (
                    <span className="rounded border border-white/10 bg-white/5 px-1.5 py-0.5 font-mono text-slate-400">
                      auto
                    </span>
                  ) : r.decidedBy ? (
                    <span className="text-slate-300">{r.decidedBy}</span>
                  ) : (
                    <span className="text-slate-600">not yet decided</span>
                  )}
                </td>
                <td className="p-3 text-xs text-slate-500">
                  {r.validFrom || r.validTo
                    ? `${r.validFrom ?? "any"} → ${r.validTo ?? "open"}`
                    : "open-ended"}
                </td>
                <td className="p-3 text-xs text-slate-500">{r.reason || "—"}</td>
                <td className="p-3 text-right whitespace-nowrap">
                  {r.status === "pending" && (
                    <>
                      <button disabled={busy === r.id} onClick={() => void decide(r.id, "approved")}
                              className="rounded-lg border border-green-500/30 bg-green-500/10 px-2 py-1 text-xs text-green-300 hover:bg-green-500/20 disabled:opacity-40">
                        Approve
                      </button>
                      <button disabled={busy === r.id} onClick={() => void decide(r.id, "rejected")}
                              className="ml-2 rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-40">
                        Reject
                      </button>
                    </>
                  )}
                  {r.status === "approved" && (
                    <button disabled={busy === r.id} onClick={() => void decide(r.id, "revoked")}
                            className="rounded-lg border border-red-500/30 bg-red-500/10 px-2 py-1 text-xs text-red-300 hover:bg-red-500/20 disabled:opacity-40">
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-600">
        An approval is checked against its dates at the door, not only its status. A contractor
        approved for one day keeps an approved row for ever, and reading the status alone would let
        them back in a month later.
      </p>
    </div>
  );
}

const ACCESS_STYLE: Record<string, string> = {
  pending: "text-amber-300 border-amber-500/40 bg-amber-500/10",
  approved: "text-green-300 border-green-500/40 bg-green-500/10",
  rejected: "text-red-300 border-red-500/40 bg-red-500/10",
  revoked: "text-slate-400 border-white/10 bg-white/5",
};

function AccessPill({ status }: { status: string }) {
  return (
    <span className={`rounded-lg border px-2 py-0.5 text-xs font-semibold capitalize ${
      ACCESS_STYLE[status] ?? ACCESS_STYLE.revoked}`}>
      {status}
    </span>
  );
}

/* ------------------------------------------------------------------ */

function Terminals({ site }: { site: AttendanceSite }) {
  const { devices } = useFleet();
  const [terminals, setTerminals] = useState<AttendanceTerminal[]>([]);
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    const r = await controlPlane.attendanceTerminals(site.id);
    if (r.ok) setTerminals(r.data.terminals ?? []);
  }, [site.id]);

  useEffect(() => { void load(); }, [load]);

  const candidates = useMemo(
    () => devices.filter((d) => isAttendanceReader(d.type) && !terminals.some((t) => t.deviceId === d.id)),
    [devices, terminals]
  );

  return (
    <div className="space-y-4">
      {candidates.length > 0 && (
        <Panel title="Readers not yet assigned">
          {candidates.map((d) => (
            <Row key={d.id}>
              <div>
                <div className="font-medium text-slate-200">{d.name || d.id}</div>
                <div className="text-xs text-slate-500">{d.id}</div>
              </div>
              <button
                onClick={async () => {
                  await controlPlane.saveAttendanceTerminal(d.id, {
                    siteId: site.id, name: d.name || "Entrance", mode: "both", direction: "in",
                  });
                  await load();
                }}
                className="min-h-[36px] rounded-lg border border-violet-500/40 bg-violet-500/10 px-3 text-xs font-semibold text-violet-200 hover:bg-violet-500/20"
              >
                Add to {site.name}
              </button>
            </Row>
          ))}
        </Panel>
      )}

      {terminals.length === 0 && candidates.length === 0 && (
        <Muted>
          No readers yet. Flash an ESP32 with the rfid-attend firmware and claim it in the app;
          it will appear here.
        </Muted>
      )}

      {terminals.map((t) => {
        const stale = t.deviceAclVersion !== null && t.deviceAclVersion !== t.aclVersion;
        return (
          <div key={t.deviceId} className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Radio className={`h-5 w-5 ${t.online ? "text-green-400" : "text-slate-600"}`} />
                <div>
                  <div className="font-semibold text-slate-200">{t.name}</div>
                  <div className="text-xs text-slate-500">{t.deviceId} · {t.zoneName ?? "no door"}</div>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  disabled={busy === t.deviceId}
                  onClick={async () => { setBusy(t.deviceId); await controlPlane.syncAttendanceTerminal(t.deviceId); await load(); setBusy(""); }}
                  className="min-h-[36px] rounded-lg border border-white/15 bg-black/20 px-3 text-xs font-semibold text-slate-200 hover:bg-white/10 disabled:opacity-40 flex items-center gap-1.5"
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${busy === t.deviceId ? "animate-spin" : ""}`} /> Push cards
                </button>
                <button
                  onClick={async () => { await controlPlane.deleteAttendanceTerminal(t.deviceId); await load(); }}
                  className="min-h-[36px] rounded-lg border border-white/10 bg-black/20 px-2 text-xs text-slate-400 hover:bg-white/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {t.readerPresent === false && (
              /* The single most common fault on these installs, and one that
                 otherwise presents as "the cards stopped working". */
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-red-500/40 bg-red-950/20 px-3 py-2 text-sm text-red-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>No card reader is answering on this terminal. Check the ribbon cable to the RC522.</span>
              </div>
            )}
            {stale && (
              <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-sm text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  This reader is holding list v{t.deviceAclVersion} ({t.deviceAclCount} cards) but
                  v{t.aclVersion} was sent. A push did not land — press Push cards.
                </span>
              </div>
            )}
            {t.queued > 0 && (
              <div className="mt-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-400">
                {t.queued} scans recorded while offline are still uploading. The register catches
                up on its own.
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Field label="Counts as">
                <select value={t.direction}
                        onChange={async (e) => { await controlPlane.saveAttendanceTerminal(t.deviceId, { siteId: site.id, direction: e.target.value }); await load(); }}
                        className="min-h-[40px] w-full rounded-lg border border-white/15 bg-black/30 px-2 text-sm text-slate-100">
                  <option value="in">Arriving</option>
                  <option value="out">Leaving</option>
                  <option value="auto">Alternate (one reader both ways)</option>
                </select>
              </Field>
              <Field label="Purpose">
                <select value={t.mode}
                        onChange={async (e) => { await controlPlane.saveAttendanceTerminal(t.deviceId, { siteId: site.id, mode: e.target.value }); await load(); }}
                        className="min-h-[40px] w-full rounded-lg border border-white/15 bg-black/30 px-2 text-sm text-slate-100">
                  <option value="both">Register and door</option>
                  <option value="attendance">Register only</option>
                  <option value="access">Door only</option>
                </select>
              </Field>
              <Field label="Cards loaded">
                <div className="flex min-h-[40px] items-center text-sm text-slate-300">
                  {t.aclCount} · v{t.aclVersion}
                </div>
              </Field>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function Schedules({ site }: { site: AttendanceSite }) {
  const [schedules, setSchedules] = useState<AttendanceSchedule[]>([]);
  const [name, setName] = useState("");
  const [start, setStart] = useState("08:30");
  const [end, setEnd] = useState("15:30");
  const [days, setDays] = useState<number[]>([1, 2, 3, 4, 5]);

  const load = useCallback(async () => {
    const r = await controlPlane.attendanceSchedules(site.id);
    if (r.ok) setSchedules(r.data.schedules ?? []);
  }, [site.id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-sm font-semibold text-slate-200">New schedule</div>
        <p className="mt-1 text-xs text-slate-500">
          When people on this schedule are expected. A day with no window is a non-working day
          for them, which is how a four-day week, a Saturday school and a night shift are all
          the same setting rather than three features.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-4">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="School day"
                 className="min-h-[44px] rounded-lg border border-white/15 bg-black/30 px-3 text-slate-100" />
          <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
                 className="min-h-[44px] rounded-lg border border-white/15 bg-black/30 px-3 text-slate-100" />
          <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
                 className="min-h-[44px] rounded-lg border border-white/15 bg-black/30 px-3 text-slate-100" />
          <button
            disabled={!name.trim() || days.length === 0}
            onClick={async () => {
              const windows: Record<string, Array<{ in: string; out: string }>> = {};
              for (const d of days) windows[String(d)] = [{ in: start, out: end }];
              await controlPlane.createAttendanceSchedule({ siteId: site.id, name: name.trim(), windows });
              setName("");
              await load();
            }}
            className="min-h-[44px] rounded-lg border border-violet-500/40 bg-violet-500/10 font-semibold text-violet-200 hover:bg-violet-500/20 disabled:opacity-40"
          >
            Create
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {DAY_NAMES.map((d, i) => (
            <button key={d}
              onClick={() => setDays((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))}
              className={`min-h-[36px] rounded-lg border px-3 text-xs font-semibold transition ${
                days.includes(i) ? "border-violet-500/50 bg-violet-500/15 text-violet-200"
                                 : "border-white/15 bg-black/20 text-slate-400 hover:bg-white/5"}`}>
              {d}
            </button>
          ))}
        </div>
        {end <= start && (
          <p className="mt-2 text-xs text-amber-400">
            The end is before the start, so this is treated as a shift running through midnight.
            That is supported — scans after midnight are filed under the day the shift began.
          </p>
        )}
      </div>

      {schedules.map((s) => (
        <div key={s.id} className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="font-semibold text-slate-200">{s.name}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs">
                {DAY_NAMES.map((d, i) => {
                  const w = s.windows?.[String(i)];
                  return (
                    <span key={d} className={`rounded border px-2 py-0.5 ${
                      w?.length ? "border-white/15 text-slate-300" : "border-white/5 text-slate-600"}`}>
                      {d} {w?.length ? `${w[0].in}–${w[0].out}` : "—"}
                    </span>
                  );
                })}
              </div>
            </div>
            <button onClick={async () => { await controlPlane.deleteAttendanceSchedule(s.id); await load(); }}
                    className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-slate-400 hover:bg-white/10">
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      ))}
      {schedules.length === 0 && (
        <Muted>
          No schedules yet. Without one nobody is ever late — there is nothing to be late for —
          and the register simply records who came and went.
        </Muted>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

function Reports({ site }: { site: AttendanceSite }) {
  const [from, setFrom] = useState(daysAgo(29));
  const [to, setTo] = useState(today());
  const [rows, setRows] = useState<AttendanceSummaryRow[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await controlPlane.attendanceSummary(site.id, from, to);
    if (r.ok) setRows(r.data.people ?? []);
    setLoading(false);
  }, [site.id, from, to]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
               className="min-h-[44px] rounded-xl border border-white/15 bg-black/30 px-3 text-slate-100" />
        <span className="text-slate-500">to</span>
        <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
               className="min-h-[44px] rounded-xl border border-white/15 bg-black/30 px-3 text-slate-100" />
        {(["summary", "register", "punches"] as const).map((w) => (
          <a key={w} href={controlPlane.attendanceExportUrl(site.id, w, from, to)}
             className="min-h-[44px] rounded-xl border border-white/15 bg-black/20 px-3 text-sm font-semibold capitalize text-slate-200 hover:bg-white/10 transition flex items-center gap-2">
            <Download className="h-4 w-4" /> {w}
          </a>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-white/10 bg-black/20">
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-slate-500">
            <tr className="border-b border-white/10">
              <th className="p-3">Name</th><th className="p-3">Group</th><th className="p-3">Present</th>
              <th className="p-3">Late</th><th className="p-3">Absent</th>
              <th className="p-3">Hours</th><th className="p-3">Attendance</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={7} className="p-6 text-center text-slate-500">Loading…</td></tr>}
            {!loading && rows.length === 0 && (
              <tr><td colSpan={7} className="p-6 text-center text-slate-500">Nothing in this range.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.personId} className="border-b border-white/5 hover:bg-white/5">
                <td className="p-3">
                  <div className="font-medium text-slate-200">{r.name}</div>
                  <div className="text-xs text-slate-500">{r.code}</div>
                </td>
                <td className="p-3 text-slate-400">{r.groupName ?? "—"}</td>
                <td className="p-3 text-slate-300">{r.present}</td>
                <td className="p-3 text-amber-300">{r.late || "—"}</td>
                <td className="p-3 text-red-300">{r.absent || "—"}</td>
                <td className="p-3 text-slate-300">{hours(r.workedMinutes)}</td>
                <td className="p-3">
                  {r.percent === null ? <span className="text-slate-600">—</span> : (
                    <span className={r.percent >= 90 ? "text-green-300" : r.percent >= 75 ? "text-amber-300" : "text-red-300"}>
                      {r.percent}%
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-600">
        Attendance is counted against the days somebody was expected. Weekends, closures and
        authorised leave are excluded rather than counted as attended, which would flatter every
        figure here.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                 */
/* ------------------------------------------------------------------ */

function Tile({ label, value, accent, icon: Icon }: {
  label: string; value: number; accent?: string;
  icon?: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="flex items-center gap-2 text-xs text-slate-500">
        {Icon && <Icon className="h-3.5 w-3.5" style={accent ? { color: accent } : undefined} />}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold" style={{ color: accent ?? "#e2e8f0" }}>{value}</div>
    </div>
  );
}

function Panel({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20">
      <div className="border-b border-white/10 px-4 py-3">
        <div className="text-sm font-semibold text-slate-200">{title}</div>
        {hint && <div className="mt-0.5 text-xs text-slate-500">{hint}</div>}
      </div>
      <div className="p-2">{children}</div>
    </div>
  );
}

const Row = ({ children }: { children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 hover:bg-white/5">{children}</div>
);

const Muted = ({ children }: { children: React.ReactNode }) => (
  <div className="rounded-2xl border border-white/10 bg-black/20 p-6 text-center text-sm text-slate-500">{children}</div>
);

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="text-xs">
    <span className="text-slate-500">{label}</span>
    <div className="mt-1">{children}</div>
  </label>
);

const Skeleton = () => (
  <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 p-6 text-sm text-slate-400">
    <Loader2 className="h-4 w-4 animate-spin" /> Loading…
  </div>
);
