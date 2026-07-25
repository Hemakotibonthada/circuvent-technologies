"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cpu, Loader2, Search, Power, Trash2, UploadCloud, Shield, ShieldOff, RefreshCw, Activity,
  Plus, Download, X, Send, Wifi, WifiOff, Database, Server, CheckSquare, Square,
} from "lucide-react";
import {
  controlPlane, getToken, setToken,
  type AdminStats, type AdminDevice, type AdminUser, type AdminEvent, type AdminHealth,
} from "@/lib/control-plane";

type Phase = "loading" | "login" | "denied" | "ready";
type Sub = "devices" | "users" | "activity";
type SortCol = "name" | "type" | "owner" | "online" | "last";

const ALL_TYPES = ["smart-plug", "smart-switch", "smart-light", "smart-fan", "smart-lock", "curtain", "home-hub", "aquaguard", "agri-starter", "energy-monitor", "guardian", "motion-sensor"];
const PER_PAGE = 12;

function primaryField(type: string): string {
  if (["aquaguard", "agri-starter"].includes(type)) return "pump";
  if (type === "smart-lock") return "locked";
  return "power";
}
function timeAgo(ts: string | null): string {
  if (!ts) return "—";
  const d = Date.now() - new Date(ts).getTime();
  const m = Math.floor(d / 60000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}
function download(name: string, text: string) {
  const blob = new Blob([text], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

/**
 * Full control-plane fleet admin embedded in the store /admin portal. Talks to
 * api.circuvent.com/admin/* with a control-plane admin JWT (shared cv-console-token).
 */
export default function DevicesPanel() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [meEmail, setMeEmail] = useState("");
  const myUid = useRef<number | null>(null);

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [health, setHealth] = useState<AdminHealth | null>(null);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);

  const [sub, setSub] = useState<Sub>("devices");
  const [q, setQ] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "online" | "offline">("all");
  const [sort, setSort] = useState<{ col: SortCol; dir: 1 | -1 }>({ col: "online", dir: -1 });
  const [page, setPage] = useState(0);
  const [sel, setSel] = useState<Set<string>>(new Set());

  const [detail, setDetail] = useState<AdminDevice | null>(null);
  const [provisionOpen, setProvisionOpen] = useState(false);
  const [otaOpen, setOtaOpen] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const loadAll = useCallback(async () => {
    const [s, h, d, u, e] = await Promise.all([
      controlPlane.adminStats(), controlPlane.adminHealth(), controlPlane.adminDevices(),
      controlPlane.adminUsers(), controlPlane.adminEvents(100),
    ]);
    if (s.ok) setStats(s.data);
    if (h.ok) setHealth(h.data);
    if (d.ok) setDevices(d.data.devices);
    if (u.ok) setUsers(u.data.users);
    if (e.ok) setEvents(e.data.events);
  }, []);

  const check = useCallback(async () => {
    if (!getToken()) { setPhase("login"); return; }
    const r = await controlPlane.adminMe();
    if (r.ok && r.data?.admin) { myUid.current = r.data.uid; setMeEmail(r.data.email); setPhase("ready"); loadAll(); }
    else if (r.status === 403) setPhase("denied");
    else setPhase("login");
  }, [loadAll]);

  useEffect(() => { check(); }, [check]);
  useEffect(() => { if (phase !== "ready") return; const t = setInterval(loadAll, 20000); return () => clearInterval(t); }, [phase, loadAll]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    const r = await controlPlane.login(email.trim(), password);
    setBusy(false);
    if (r.ok && r.data?.token) { setToken(r.data.token); setPassword(""); check(); }
    else setErr("Invalid control-plane credentials.");
  };

  const forceToggle = async (d: AdminDevice) => {
    const f = primaryField(d.type); const next = !d.state[f];
    setDevices((p) => p.map((x) => (x.id === d.id ? { ...x, state: { ...x.state, [f]: next } } : x)));
    await controlPlane.adminCommand(d.id, { action: "set", [f]: next });
  };
  const delDevice = async (id: string, name?: string) => {
    if (!window.confirm(`Remove ${name || id} from the fleet?`)) return;
    setDevices((p) => p.filter((x) => x.id !== id)); setDetail(null);
    await controlPlane.adminDeleteDevice(id);
  };
  const pushOta = async (id: string) => {
    const url = window.prompt("Firmware URL:"); if (!url) return;
    const version = window.prompt("Version (optional):") || undefined;
    const r = await controlPlane.adminOta(id, url, version);
    alert(r.ok ? "OTA pushed." : "Failed.");
  };
  const toggleRole = async (u: AdminUser) => {
    if (u.id === myUid.current) return;
    setUsers((p) => p.map((x) => (x.id === u.id ? { ...x, is_admin: !x.is_admin } : x)));
    await controlPlane.adminSetRole(u.id, !u.is_admin);
  };
  const delUser = async (u: AdminUser) => {
    if (u.id === myUid.current || !window.confirm(`Delete ${u.email}?`)) return;
    setUsers((p) => p.filter((x) => x.id !== u.id));
    await controlPlane.adminDeleteUser(u.id);
  };

  // bulk
  const bulkToggle = async (on: boolean) => {
    const ids = [...sel];
    for (const id of ids) { const d = devices.find((x) => x.id === id); if (d) await controlPlane.adminCommand(id, { action: "set", [primaryField(d.type)]: on }); }
    setSel(new Set()); loadAll();
  };
  const bulkDelete = async () => {
    if (!window.confirm(`Delete ${sel.size} device(s)?`)) return;
    for (const id of sel) await controlPlane.adminDeleteDevice(id);
    setSel(new Set()); loadAll();
  };

  if (phase === "loading") return <div className="flex justify-center py-20" style={{ color: "var(--text-tertiary)" }}><Loader2 className="w-6 h-6 animate-spin" /></div>;

  if (phase === "login") return (
    <div className="max-w-md mx-auto rounded-2xl p-6" style={panel}>
      <div className="flex items-center gap-2 mb-2"><Cpu className="w-5 h-5" style={{ color: "var(--accent-cyan)" }} /><h3 className="font-bold" style={{ color: "var(--text-primary)" }}>Device fleet — control-plane sign in</h3></div>
      <p className="text-sm mb-4" style={{ color: "var(--text-tertiary)" }}>Sign in with a Circuvent control-plane admin account (an <code>is_admin</code> user).</p>
      <form onSubmit={login} className="space-y-3">
        <input className="cv-fleet-input" type="email" placeholder="Admin email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="cv-fleet-input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {err && <div className="text-sm" style={{ color: "#ef4444" }}>{err}</div>}
        <button type="submit" disabled={busy} className="w-full rounded-xl py-3 font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60" style={grad}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Sign in</button>
      </form>
      <style jsx global>{cssInput}</style>
    </div>
  );

  if (phase === "denied") return (
    <div className="max-w-md mx-auto rounded-2xl p-6 text-center" style={panel}>
      <ShieldOff className="w-8 h-8 mx-auto mb-3" style={{ color: "#f59e0b" }} />
      <h3 className="font-bold mb-1" style={{ color: "var(--text-primary)" }}>Not a fleet admin</h3>
      <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{meEmail} isn&apos;t an admin. Add this email to <code>ADMIN_EMAILS</code> on the control plane, then reload.</p>
      <button onClick={() => { setToken(null); setPhase("login"); }} className="mt-4 text-sm font-semibold" style={{ color: "var(--accent-cyan)" }}>Use a different account</button>
    </div>
  );

  // derived device list
  let list = devices.filter((d) => {
    if (typeFilter && d.type !== typeFilter) return false;
    if (statusFilter === "online" && !d.online) return false;
    if (statusFilter === "offline" && d.online) return false;
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (d.name || d.id).toLowerCase().includes(s) || d.type.includes(s) || (d.owner_email || "").toLowerCase().includes(s);
  });
  list = [...list].sort((a, b) => {
    const g = (x: AdminDevice) => sort.col === "name" ? (x.name || x.id) : sort.col === "type" ? x.type : sort.col === "owner" ? (x.owner_email || "") : sort.col === "online" ? (x.online ? 1 : 0) : (x.last_seen || "");
    return g(a) < g(b) ? -sort.dir : g(a) > g(b) ? sort.dir : 0;
  });
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  const pageList = list.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE);
  const typeCounts = stats?.byType ?? [];
  const maxType = Math.max(1, ...typeCounts.map((t) => t.count));

  const setSortCol = (col: SortCol) => setSort((s) => ({ col, dir: s.col === col ? (s.dir === 1 ? -1 : 1) : 1 }));
  const toggleSel = (id: string) => setSel((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <div className="space-y-5">
      {/* health + stats */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        <Tile label="Users" value={stats?.users ?? 0} />
        <Tile label="Devices" value={stats?.devices ?? 0} />
        <Tile label="Online" value={stats?.online ?? 0} accent="#22c55e" />
        <Tile label="Events 7d" value={stats?.events7d ?? 0} />
        <Tile label="Pending" value={stats?.pendingSignups ?? 0} />
        <div className="rounded-2xl p-4" style={panel}>
          <div className="flex items-center gap-2 text-xs" style={{ color: health?.mqtt ? "#22c55e" : "#ef4444" }}>{health?.mqtt ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />} Broker</div>
          <div className="flex items-center gap-2 text-xs mt-1" style={{ color: health?.db ? "#22c55e" : "#ef4444" }}><Database className="w-3.5 h-3.5" /> DB</div>
          <div className="flex items-center gap-2 text-xs mt-1" style={{ color: "var(--text-tertiary)" }}><Server className="w-3.5 h-3.5" /> {health ? `${Math.floor(health.uptimeSec / 3600)}h up` : "—"}</div>
        </div>
      </div>

      {/* type distribution */}
      {typeCounts.length > 0 && (
        <div className="rounded-2xl p-4" style={panel}>
          <div className="text-xs uppercase tracking-wide mb-3" style={{ color: "var(--text-tertiary)" }}>Devices by type</div>
          <div className="space-y-2">
            {typeCounts.map((t) => (
              <div key={t.type} className="flex items-center gap-3">
                <div className="w-28 text-xs truncate" style={{ color: "var(--text-secondary)" }}>{t.type}</div>
                <div className="flex-1 h-2 rounded-full" style={{ background: "var(--border-primary)" }}><div className="h-2 rounded-full" style={{ width: `${(t.count / maxType) * 100}%`, background: "linear-gradient(90deg,#06b6d4,#8b5cf6)" }} /></div>
                <div className="w-8 text-right text-xs font-semibold" style={{ color: "var(--text-primary)" }}>{t.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* sub tabs + toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 rounded-xl p-1" style={panel}>
          {(["devices", "users", "activity"] as Sub[]).map((s) => (
            <button key={s} onClick={() => setSub(s)} className="rounded-lg px-4 py-2 text-sm font-medium capitalize" style={sub === s ? { ...grad, color: "#fff" } : { color: "var(--text-tertiary)" }}>{s}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {sub === "devices" && <>
            <button onClick={() => setProvisionOpen(true)} className="rounded-lg px-3 py-2 text-sm font-semibold text-white flex items-center gap-1.5" style={grad}><Plus className="w-4 h-4" /> Provision</button>
            <button onClick={() => setOtaOpen(true)} className="rounded-lg px-3 py-2 text-sm font-medium flex items-center gap-1.5" style={{ border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}><UploadCloud className="w-4 h-4" /> OTA fleet</button>
            <button onClick={() => download("devices.csv", toCsv(devices.map((d) => ({ id: d.id, name: d.name, type: d.type, owner: d.owner_email, online: d.online, fw: d.fw_version, last_seen: d.last_seen }))))} className="rounded-lg p-2" style={{ border: "1px solid var(--border-primary)", color: "var(--text-tertiary)" }} title="Export CSV"><Download className="w-4 h-4" /></button>
          </>}
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{meEmail}</span>
          <button onClick={loadAll} className="rounded-lg p-2" style={{ border: "1px solid var(--border-primary)", color: "var(--text-tertiary)" }}><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {sub === "devices" && (
        <div className="rounded-2xl overflow-hidden" style={panel}>
          <div className="p-3 flex items-center gap-2 flex-wrap" style={{ borderBottom: "1px solid var(--border-primary)" }}>
            <div className="flex items-center gap-2 flex-1 min-w-[180px]"><Search className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} /><input value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} placeholder="Search…" className="bg-transparent outline-none text-sm w-full" style={{ color: "var(--text-primary)" }} /></div>
            <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(0); }} className="cv-fleet-select"><option value="">All types</option>{ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as "all" | "online" | "offline"); setPage(0); }} className="cv-fleet-select"><option value="all">All</option><option value="online">Online</option><option value="offline">Offline</option></select>
          </div>

          {sel.size > 0 && (
            <div className="px-3 py-2 flex items-center gap-3 text-sm" style={{ borderBottom: "1px solid var(--border-primary)", background: "rgba(6,182,212,0.06)" }}>
              <span style={{ color: "var(--text-secondary)" }}>{sel.size} selected</span>
              <button onClick={() => bulkToggle(true)} className="font-semibold" style={{ color: "#22c55e" }}>Turn on</button>
              <button onClick={() => bulkToggle(false)} className="font-semibold" style={{ color: "#f59e0b" }}>Turn off</button>
              <button onClick={bulkDelete} className="font-semibold" style={{ color: "#ef4444" }}>Delete</button>
              <button onClick={() => setSel(new Set())} style={{ color: "var(--text-tertiary)" }}>Clear</button>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ color: "var(--text-tertiary)" }}>
                <Th><button onClick={() => setSel((p) => p.size === pageList.length ? new Set() : new Set(pageList.map((d) => d.id)))}>{sel.size === pageList.length && pageList.length ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}</button></Th>
                <Th onClick={() => setSortCol("name")}>Device</Th><Th onClick={() => setSortCol("type")}>Type</Th><Th onClick={() => setSortCol("owner")}>Owner</Th><Th onClick={() => setSortCol("online")}>Status</Th><Th>FW</Th><Th onClick={() => setSortCol("last")}>Seen</Th><Th>Actions</Th>
              </tr></thead>
              <tbody>
                {pageList.map((d) => (
                  <tr key={d.id} style={{ borderTop: "1px solid var(--border-primary)" }}>
                    <td className="px-3 py-2"><button onClick={() => toggleSel(d.id)} style={{ color: "var(--text-tertiary)" }}>{sel.has(d.id) ? <CheckSquare className="w-4 h-4" style={{ color: "var(--accent-cyan)" }} /> : <Square className="w-4 h-4" />}</button></td>
                    <td className="px-3 py-2"><button onClick={() => setDetail(d)} className="font-medium hover:underline" style={{ color: "var(--text-primary)" }}>{d.name || d.id}</button></td>
                    <td className="px-3 py-2" style={{ color: "var(--text-tertiary)" }}>{d.type}</td>
                    <td className="px-3 py-2" style={{ color: "var(--text-tertiary)" }}>{d.owner_email || "—"}</td>
                    <td className="px-3 py-2"><span style={{ color: d.online ? "#22c55e" : "var(--text-tertiary)" }}>● {d.online ? "online" : "offline"}</span></td>
                    <td className="px-3 py-2" style={{ color: "var(--text-tertiary)" }}>{d.fw_version || "—"}</td>
                    <td className="px-3 py-2" style={{ color: "var(--text-tertiary)" }}>{timeAgo(d.last_seen)}</td>
                    <td className="px-3 py-2"><div className="flex items-center gap-2">
                      <button title="Toggle" onClick={() => forceToggle(d)} style={{ color: "var(--accent-cyan)" }}><Power className="w-4 h-4" /></button>
                      <button title="OTA" onClick={() => pushOta(d.id)} style={{ color: "#8b5cf6" }}><UploadCloud className="w-4 h-4" /></button>
                      <button title="Delete" onClick={() => delDevice(d.id, d.name)} style={{ color: "#ef4444" }}><Trash2 className="w-4 h-4" /></button>
                    </div></td>
                  </tr>
                ))}
                {pageList.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center" style={{ color: "var(--text-tertiary)" }}>No devices match.</td></tr>}
              </tbody>
            </table>
          </div>
          {pages > 1 && (
            <div className="p-3 flex items-center justify-between text-sm" style={{ borderTop: "1px solid var(--border-primary)", color: "var(--text-tertiary)" }}>
              <span>{list.length} devices · page {page + 1}/{pages}</span>
              <div className="flex gap-2">
                <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="px-3 py-1 rounded-lg disabled:opacity-40" style={{ border: "1px solid var(--border-primary)" }}>Prev</button>
                <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="px-3 py-1 rounded-lg disabled:opacity-40" style={{ border: "1px solid var(--border-primary)" }}>Next</button>
              </div>
            </div>
          )}
        </div>
      )}

      {sub === "users" && (
        <div className="rounded-2xl overflow-x-auto" style={panel}>
          <table className="w-full text-sm">
            <thead><tr style={{ color: "var(--text-tertiary)" }}><Th>Email</Th><Th>Name</Th><Th>Devices</Th><Th>Admin</Th><Th>Actions</Th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid var(--border-primary)" }}>
                  <td className="px-3 py-2" style={{ color: "var(--text-primary)" }}>{u.email}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-tertiary)" }}>{u.name || "—"}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-tertiary)" }}>{u.devices}</td>
                  <td className="px-3 py-2">{u.is_admin ? <Shield className="w-4 h-4" style={{ color: "#22c55e" }} /> : <span style={{ color: "var(--text-tertiary)" }}>—</span>}</td>
                  <td className="px-3 py-2"><div className="flex items-center gap-3">
                    <button disabled={u.id === myUid.current} onClick={() => toggleRole(u)} className="text-xs font-semibold disabled:opacity-40" style={{ color: "var(--accent-cyan)" }}>{u.is_admin ? "Revoke admin" : "Make admin"}</button>
                    <button disabled={u.id === myUid.current} onClick={() => delUser(u)} className="disabled:opacity-40" style={{ color: "#ef4444" }}><Trash2 className="w-4 h-4" /></button>
                  </div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sub === "activity" && (
        <div className="rounded-2xl p-2" style={panel}>
          {events.length === 0 && <div className="px-3 py-8 text-center" style={{ color: "var(--text-tertiary)" }}>No recent activity.</div>}
          {events.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-3 py-2" style={{ borderBottom: "1px solid var(--border-primary)" }}>
              <Activity className="w-4 h-4" style={{ color: e.kind === "alert" ? "#f59e0b" : e.kind === "security" ? "#ef4444" : "var(--accent-cyan)" }} />
              <div className="flex-1 min-w-0"><div className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{e.title}</div><div className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>{e.owner_email || "—"}{e.body ? ` · ${e.body}` : ""}</div></div>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{timeAgo(e.ts)}</span>
            </div>
          ))}
        </div>
      )}

      {detail && <DeviceModal device={detail} users={users} onClose={() => setDetail(null)} onChanged={loadAll} onDelete={() => delDevice(detail.id, detail.name)} onOta={() => pushOta(detail.id)} />}
      {provisionOpen && <ProvisionModal users={users} onClose={() => setProvisionOpen(false)} onDone={loadAll} />}
      {otaOpen && <OtaBroadcastModal onClose={() => setOtaOpen(false)} />}
      <style jsx global>{cssInput}</style>
    </div>
  );
}

function DeviceModal({ device, users, onClose, onChanged, onDelete, onOta }: { device: AdminDevice; users: AdminUser[]; onClose: () => void; onChanged: () => void; onDelete: () => void; onOta: () => void }) {
  const [name, setName] = useState(device.name);
  const [room, setRoom] = useState(device.room || "");
  const [owner, setOwner] = useState<number | "">(device.owner_id ?? "");
  const [cmd, setCmd] = useState('{"action":"set","power":true}');
  const [tele, setTele] = useState<{ ts: string; payload: Record<string, unknown> }[]>([]);
  const [saved, setSaved] = useState("");

  useEffect(() => { controlPlane.adminDeviceTelemetry(device.id, 60).then((r) => { if (r.ok) setTele(r.data.telemetry); }); }, [device.id]);

  const save = async () => {
    await controlPlane.adminPatchDevice(device.id, { name, room, owner_id: owner === "" ? null : Number(owner) });
    setSaved("Saved"); setTimeout(() => setSaved(""), 1500); onChanged();
  };
  const sendCmd = async () => {
    try { const c = JSON.parse(cmd); await controlPlane.adminCommand(device.id, c); setSaved("Sent"); setTimeout(() => setSaved(""), 1500); }
    catch { alert("Invalid JSON"); }
  };
  const watts = tele.map((t) => Number(t.payload.watts)).filter((n) => Number.isFinite(n)).reverse();

  return (
    <Modal onClose={onClose} title={device.name || device.id}>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-3">
          <Label t="Name"><input className="cv-fleet-input" value={name} onChange={(e) => setName(e.target.value)} /></Label>
          <Label t="Room"><input className="cv-fleet-input" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="—" /></Label>
          <Label t="Owner"><select className="cv-fleet-select w-full" value={owner} onChange={(e) => setOwner(e.target.value === "" ? "" : Number(e.target.value))}><option value="">Unassigned</option>{users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}</select></Label>
          <div className="flex items-center gap-2">
            <button onClick={save} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={grad}>Save</button>
            <button onClick={onOta} className="rounded-lg px-3 py-2 text-sm" style={{ border: "1px solid var(--border-primary)", color: "var(--text-secondary)" }}>Push OTA</button>
            <button onClick={onDelete} className="rounded-lg px-3 py-2 text-sm" style={{ color: "#ef4444", border: "1px solid rgba(239,68,68,0.4)" }}>Delete</button>
            {saved && <span className="text-xs" style={{ color: "#22c55e" }}>{saved}</span>}
          </div>
          <div className="text-xs grid grid-cols-2 gap-1 pt-2" style={{ color: "var(--text-tertiary)" }}>
            <span>Type: {device.type}</span><span>FW: {device.fw_version || "—"}</span>
            <span>Status: {device.online ? "online" : "offline"}</span><span>Seen: {timeAgo(device.last_seen)}</span>
          </div>
        </div>
        <div className="space-y-3">
          {watts.length > 1 && <div><div className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>Power (last {watts.length} samples)</div><Spark data={watts} /></div>}
          <Label t="State"><pre className="text-xs p-3 rounded-lg overflow-auto max-h-40" style={{ background: "rgba(0,0,0,0.25)", color: "var(--text-secondary)" }}>{JSON.stringify(device.state, null, 2)}</pre></Label>
          <Label t="Raw command (JSON)">
            <textarea className="cv-fleet-input" rows={2} value={cmd} onChange={(e) => setCmd(e.target.value)} />
            <button onClick={sendCmd} className="mt-2 rounded-lg px-3 py-2 text-sm font-semibold text-white flex items-center gap-1.5" style={grad}><Send className="w-3.5 h-3.5" /> Send</button>
          </Label>
        </div>
      </div>
    </Modal>
  );
}

function ProvisionModal({ users, onClose, onDone }: { users: AdminUser[]; onClose: () => void; onDone: () => void }) {
  const [type, setType] = useState("smart-plug");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState<number | "">("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; key: string } | null>(null);

  const go = async () => {
    setBusy(true);
    const r = await controlPlane.adminProvision({ type, name: name || undefined, owner_id: owner === "" ? undefined : Number(owner) });
    setBusy(false);
    if (r.ok && r.data?.id) { setResult({ id: r.data.id, key: r.data.key }); onDone(); }
    else alert("Provision failed.");
  };

  return (
    <Modal onClose={onClose} title="Provision a device">
      {result ? (
        <div className="space-y-3">
          <p className="text-sm" style={{ color: "#22c55e" }}>Device created. Save these — the key is shown once:</p>
          <pre className="text-xs p-3 rounded-lg" style={{ background: "rgba(0,0,0,0.25)", color: "var(--text-secondary)" }}>{`id:  ${result.id}\nkey: ${result.key}`}</pre>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-semibold text-white" style={grad}>Done</button>
        </div>
      ) : (
        <div className="space-y-3">
          <Label t="Type"><select className="cv-fleet-select w-full" value={type} onChange={(e) => setType(e.target.value)}>{ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Label>
          <Label t="Name"><input className="cv-fleet-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Optional" /></Label>
          <Label t="Assign to"><select className="cv-fleet-select w-full" value={owner} onChange={(e) => setOwner(e.target.value === "" ? "" : Number(e.target.value))}><option value="">Me (admin)</option>{users.map((u) => <option key={u.id} value={u.id}>{u.email}</option>)}</select></Label>
          <button onClick={go} disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-60" style={grad}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Mint device</button>
        </div>
      )}
    </Modal>
  );
}

function OtaBroadcastModal({ onClose }: { onClose: () => void }) {
  const [type, setType] = useState("");
  const [url, setUrl] = useState("");
  const [version, setVersion] = useState("");
  const [busy, setBusy] = useState(false);

  const go = async () => {
    if (!url) return;
    setBusy(true);
    const r = await controlPlane.adminOtaBroadcast({ type: type || undefined, url, version: version || undefined });
    setBusy(false);
    alert(r.ok ? `OTA pushed to ${r.data.sent} device(s).` : "Failed.");
    if (r.ok) onClose();
  };

  return (
    <Modal onClose={onClose} title="Push OTA to the fleet">
      <div className="space-y-3">
        <Label t="Device type (blank = all)"><select className="cv-fleet-select w-full" value={type} onChange={(e) => setType(e.target.value)}><option value="">All types</option>{ALL_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select></Label>
        <Label t="Firmware URL"><input className="cv-fleet-input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…/firmware.bin" /></Label>
        <Label t="Version"><input className="cv-fleet-input" value={version} onChange={(e) => setVersion(e.target.value)} placeholder="Optional" /></Label>
        <button onClick={go} disabled={busy || !url} className="rounded-lg px-4 py-2 text-sm font-semibold text-white flex items-center gap-2 disabled:opacity-60" style={grad}>{busy && <Loader2 className="w-4 h-4 animate-spin" />} Push OTA</button>
      </div>
    </Modal>
  );
}

// ---- small shared UI ----
const grad = { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" } as const;
const panel = { background: "var(--bg-glass)", border: "1px solid var(--border-primary)" } as const;
const cssInput = `.cv-fleet-input{width:100%;background:var(--bg-secondary,rgba(0,0,0,.25));border:1px solid var(--border-primary);border-radius:12px;padding:10px 12px;color:var(--text-primary);font-size:14px;outline:none}.cv-fleet-input::placeholder{color:var(--text-tertiary)}.cv-fleet-select{background:var(--bg-secondary,rgba(0,0,0,.25));border:1px solid var(--border-primary);border-radius:10px;padding:8px 10px;color:var(--text-primary);font-size:13px;outline:none}`;

function Tile({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return <div className="rounded-2xl p-4" style={panel}><div className="text-2xl font-extrabold" style={{ color: accent || "var(--text-primary)" }}>{value.toLocaleString()}</div><div className="text-xs uppercase tracking-wide mt-1" style={{ color: "var(--text-tertiary)" }}>{label}</div></div>;
}
function Th({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return <th onClick={onClick} className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide ${onClick ? "cursor-pointer select-none" : ""}`}>{children}</th>;
}
function Label({ t, children }: { t: string; children: React.ReactNode }) {
  return <label className="block"><span className="text-xs mb-1 block" style={{ color: "var(--text-tertiary)" }}>{t}</span>{children}</label>;
}
function Modal({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={onClose}>
      <div className="w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-auto" style={{ background: "var(--bg-secondary,#0f1629)", border: "1px solid var(--border-primary)" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4"><h3 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>{title}</h3><button onClick={onClose} style={{ color: "var(--text-tertiary)" }}><X className="w-5 h-5" /></button></div>
        {children}
      </div>
    </div>
  );
}
function Spark({ data }: { data: number[] }) {
  const w = 260, h = 44, max = Math.max(...data, 1), min = Math.min(...data, 0), r = max - min || 1;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / r) * (h - 4) - 2}`).join(" ");
  return <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"><polyline points={pts} fill="none" stroke="#06b6d4" strokeWidth={2} /></svg>;
}
