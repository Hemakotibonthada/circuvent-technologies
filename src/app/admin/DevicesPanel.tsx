"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Cpu, Loader2, Search, Power, Trash2, UploadCloud, Shield, ShieldOff, RefreshCw, Activity } from "lucide-react";
import {
  controlPlane,
  getToken,
  setToken,
  type AdminStats,
  type AdminDevice,
  type AdminUser,
  type AdminEvent,
} from "@/lib/control-plane";

type Phase = "loading" | "login" | "denied" | "ready";
type Sub = "devices" | "users" | "activity";

function primaryField(type: string): string {
  if (["aquaguard", "agri-starter"].includes(type)) return "pump";
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

/**
 * Control-plane fleet admin, embedded in the store /admin portal. It talks to
 * the self-hosted control plane (api.circuvent.com/admin/*) using a control-plane
 * admin JWT (shared localStorage key `cv-console-token` with the device console).
 * If no valid admin token is present it shows a small control-plane sign-in.
 */
export default function DevicesPanel() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [meEmail, setMeEmail] = useState("");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [sub, setSub] = useState<Sub>("devices");
  const [q, setQ] = useState("");
  const myUid = useRef<number | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const loadAll = useCallback(async () => {
    const [s, d, u, e] = await Promise.all([
      controlPlane.adminStats(),
      controlPlane.adminDevices(),
      controlPlane.adminUsers(),
      controlPlane.adminEvents(80),
    ]);
    if (s.ok) setStats(s.data);
    if (d.ok) setDevices(d.data.devices);
    if (u.ok) setUsers(u.data.users);
    if (e.ok) setEvents(e.data.events);
  }, []);

  const check = useCallback(async () => {
    if (!getToken()) {
      setPhase("login");
      return;
    }
    const r = await controlPlane.adminMe();
    if (r.ok && r.data?.admin) {
      myUid.current = r.data.uid;
      setMeEmail(r.data.email);
      setPhase("ready");
      loadAll();
    } else if (r.status === 403) {
      setPhase("denied");
    } else {
      setPhase("login");
    }
  }, [loadAll]);

  useEffect(() => {
    check();
  }, [check]);

  useEffect(() => {
    if (phase !== "ready") return;
    const t = setInterval(loadAll, 20000);
    return () => clearInterval(t);
  }, [phase, loadAll]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const r = await controlPlane.login(email.trim(), password);
    setBusy(false);
    if (r.ok && r.data?.token) {
      setToken(r.data.token);
      setPassword("");
      check();
    } else {
      setErr("Invalid control-plane credentials.");
    }
  };

  const forceToggle = async (d: AdminDevice) => {
    const f = primaryField(d.type);
    const next = !d.state[f];
    setDevices((prev) => prev.map((x) => (x.id === d.id ? { ...x, state: { ...x.state, [f]: next } } : x)));
    await controlPlane.adminCommand(d.id, { action: "set", [f]: next });
  };
  const pushOta = async (d: AdminDevice) => {
    const url = window.prompt(`Firmware URL to push to ${d.name || d.id}:`);
    if (!url) return;
    const version = window.prompt("Version (optional):") || undefined;
    const r = await controlPlane.adminOta(d.id, url, version);
    alert(r.ok ? "OTA pushed." : "Failed to push OTA.");
  };
  const delDevice = async (d: AdminDevice) => {
    if (!window.confirm(`Remove ${d.name || d.id} from the fleet?`)) return;
    setDevices((prev) => prev.filter((x) => x.id !== d.id));
    await controlPlane.adminDeleteDevice(d.id);
  };
  const toggleRole = async (u: AdminUser) => {
    if (u.id === myUid.current) return;
    setUsers((prev) => prev.map((x) => (x.id === u.id ? { ...x, is_admin: !x.is_admin } : x)));
    await controlPlane.adminSetRole(u.id, !u.is_admin);
  };
  const delUser = async (u: AdminUser) => {
    if (u.id === myUid.current) return;
    if (!window.confirm(`Delete user ${u.email}? Their devices become unassigned.`)) return;
    setUsers((prev) => prev.filter((x) => x.id !== u.id));
    await controlPlane.adminDeleteUser(u.id);
  };

  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center py-20" style={{ color: "var(--text-tertiary)" }}>
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (phase === "login") {
    return (
      <div className="max-w-md mx-auto rounded-2xl p-6" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
        <div className="flex items-center gap-2 mb-2">
          <Cpu className="w-5 h-5" style={{ color: "var(--accent-cyan)" }} />
          <h3 className="font-bold" style={{ color: "var(--text-primary)" }}>Device fleet — control-plane sign in</h3>
        </div>
        <p className="text-sm mb-4" style={{ color: "var(--text-tertiary)" }}>
          Sign in with a Circuvent control-plane admin account (an <code>is_admin</code> user) to manage the IoT device fleet.
        </p>
        <form onSubmit={login} className="space-y-3">
          <input className="cv-fleet-input" type="email" placeholder="Admin email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="cv-fleet-input" type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {err && <div className="text-sm" style={{ color: "#ef4444" }}>{err}</div>}
          <button type="submit" disabled={busy} className="w-full rounded-xl py-3 font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} Sign in
          </button>
        </form>
        <style jsx global>{`.cv-fleet-input{width:100%;background:var(--bg-secondary,rgba(0,0,0,.25));border:1px solid var(--border-primary);border-radius:12px;padding:12px 14px;color:var(--text-primary);font-size:15px;outline:none}.cv-fleet-input::placeholder{color:var(--text-tertiary)}`}</style>
      </div>
    );
  }

  if (phase === "denied") {
    return (
      <div className="max-w-md mx-auto rounded-2xl p-6 text-center" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
        <ShieldOff className="w-8 h-8 mx-auto mb-3" style={{ color: "#f59e0b" }} />
        <h3 className="font-bold mb-1" style={{ color: "var(--text-primary)" }}>Not a fleet admin</h3>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          {meEmail} is signed in to the control plane but isn&apos;t an admin. Add this email to <code>ADMIN_EMAILS</code> on the control-plane server, then reload.
        </p>
        <button onClick={() => { setToken(null); setPhase("login"); }} className="mt-4 text-sm font-semibold" style={{ color: "var(--accent-cyan)" }}>Sign in as a different account</button>
      </div>
    );
  }

  const filtered = devices.filter((d) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return (d.name || d.id).toLowerCase().includes(s) || d.type.includes(s) || (d.owner_email || "").toLowerCase().includes(s);
  });

  return (
    <div className="space-y-5">
      {/* stat tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Tile label="Users" value={stats?.users ?? 0} />
        <Tile label="Devices" value={stats?.devices ?? 0} />
        <Tile label="Online" value={stats?.online ?? 0} accent="#22c55e" />
        <Tile label="Events 7d" value={stats?.events7d ?? 0} />
        <Tile label="Pending" value={stats?.pendingSignups ?? 0} />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 rounded-xl p-1" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
          {(["devices", "users", "activity"] as Sub[]).map((s) => (
            <button key={s} onClick={() => setSub(s)} className="rounded-lg px-4 py-2 text-sm font-medium capitalize" style={sub === s ? { background: "linear-gradient(135deg,#06b6d4,#8b5cf6)", color: "#fff" } : { color: "var(--text-tertiary)" }}>{s}</button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{meEmail}</span>
          <button onClick={loadAll} className="rounded-lg p-2" style={{ border: "1px solid var(--border-primary)", color: "var(--text-tertiary)" }}><RefreshCw className="w-4 h-4" /></button>
        </div>
      </div>

      {sub === "devices" && (
        <div className="rounded-2xl overflow-hidden" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
          <div className="p-3 flex items-center gap-2" style={{ borderBottom: "1px solid var(--border-primary)" }}>
            <Search className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search devices, owners…" className="bg-transparent outline-none text-sm flex-1" style={{ color: "var(--text-primary)" }} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr style={{ color: "var(--text-tertiary)" }}>
                <Th>Device</Th><Th>Type</Th><Th>Owner</Th><Th>Status</Th><Th>FW</Th><Th>Seen</Th><Th>Actions</Th>
              </tr></thead>
              <tbody>
                {filtered.map((d) => (
                  <tr key={d.id} style={{ borderTop: "1px solid var(--border-primary)" }}>
                    <td className="px-3 py-2" style={{ color: "var(--text-primary)" }}>{d.name || d.id}</td>
                    <td className="px-3 py-2" style={{ color: "var(--text-tertiary)" }}>{d.type}</td>
                    <td className="px-3 py-2" style={{ color: "var(--text-tertiary)" }}>{d.owner_email || "—"}</td>
                    <td className="px-3 py-2"><span style={{ color: d.online ? "#22c55e" : "var(--text-tertiary)" }}>● {d.online ? "online" : "offline"}</span></td>
                    <td className="px-3 py-2" style={{ color: "var(--text-tertiary)" }}>{d.fw_version || "—"}</td>
                    <td className="px-3 py-2" style={{ color: "var(--text-tertiary)" }}>{timeAgo(d.last_seen)}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button title="Toggle power" onClick={() => forceToggle(d)} style={{ color: "var(--accent-cyan)" }}><Power className="w-4 h-4" /></button>
                        <button title="Push OTA" onClick={() => pushOta(d)} style={{ color: "#8b5cf6" }}><UploadCloud className="w-4 h-4" /></button>
                        <button title="Delete" onClick={() => delDevice(d)} style={{ color: "#ef4444" }}><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center" style={{ color: "var(--text-tertiary)" }}>No devices.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {sub === "users" && (
        <div className="rounded-2xl overflow-x-auto" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
          <table className="w-full text-sm">
            <thead><tr style={{ color: "var(--text-tertiary)" }}><Th>Email</Th><Th>Name</Th><Th>Devices</Th><Th>Admin</Th><Th>Actions</Th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} style={{ borderTop: "1px solid var(--border-primary)" }}>
                  <td className="px-3 py-2" style={{ color: "var(--text-primary)" }}>{u.email}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-tertiary)" }}>{u.name || "—"}</td>
                  <td className="px-3 py-2" style={{ color: "var(--text-tertiary)" }}>{u.devices}</td>
                  <td className="px-3 py-2">{u.is_admin ? <Shield className="w-4 h-4" style={{ color: "#22c55e" }} /> : <span style={{ color: "var(--text-tertiary)" }}>—</span>}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3">
                      <button disabled={u.id === myUid.current} onClick={() => toggleRole(u)} className="text-xs font-semibold disabled:opacity-40" style={{ color: "var(--accent-cyan)" }}>{u.is_admin ? "Revoke admin" : "Make admin"}</button>
                      <button disabled={u.id === myUid.current} onClick={() => delUser(u)} className="disabled:opacity-40" style={{ color: "#ef4444" }}><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {sub === "activity" && (
        <div className="rounded-2xl p-2" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
          {events.length === 0 && <div className="px-3 py-8 text-center" style={{ color: "var(--text-tertiary)" }}>No recent activity.</div>}
          {events.map((e) => (
            <div key={e.id} className="flex items-center gap-3 px-3 py-2" style={{ borderBottom: "1px solid var(--border-primary)" }}>
              <Activity className="w-4 h-4" style={{ color: e.kind === "alert" ? "#f59e0b" : e.kind === "security" ? "#ef4444" : "var(--accent-cyan)" }} />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{e.title}</div>
                <div className="text-xs truncate" style={{ color: "var(--text-tertiary)" }}>{e.owner_email || "—"}{e.body ? ` · ${e.body}` : ""}</div>
              </div>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{timeAgo(e.ts)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Tile({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="rounded-2xl p-4" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
      <div className="text-2xl font-extrabold" style={{ color: accent || "var(--text-primary)" }}>{value.toLocaleString()}</div>
      <div className="text-xs uppercase tracking-wide mt-1" style={{ color: "var(--text-tertiary)" }}>{label}</div>
    </div>
  );
}
function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">{children}</th>;
}
