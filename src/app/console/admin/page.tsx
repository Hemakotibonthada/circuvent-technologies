"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Cpu,
  DownloadCloud,
  Loader2,
  Power,
  Search,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  UserCog,
  Users,
  Zap,
} from "lucide-react";
import {
  controlPlane,
  type AdminDevice,
  type AdminEvent,
  type AdminStats,
  type AdminUser,
} from "@/lib/control-plane";
import { Donut, Gauge } from "../charts";
import { useConsole } from "../ConsoleProvider";
import { useConsoleTheme } from "../theme";
import { Toggle } from "../ui";

type Tab = "overview" | "devices" | "users" | "activity";

const palette = ["#06b6d4", "#8b5cf6", "#22c55e", "#f59e0b", "#ef4444", "#14b8a6", "#3b82f6"];

function relativeTime(ts?: string | null) {
  if (!ts) return "never";
  const date = new Date(ts);
  if (Number.isNaN(date.getTime())) return "unknown";
  const seconds = Math.max(1, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function primaryField(type: string) {
  const t = type.toLowerCase();
  if (t === "aquaguard" || t === "agri-starter") return "pump";
  if (["smart-plug", "switch", "light", "fan"].includes(t)) return "power";
  return "power";
}

export default function AdminPage() {
  const { subscribe } = useConsole();
  const theme = useConsoleTheme();
  const [gate, setGate] = useState<"checking" | "admin" | "denied">("checking");
  const [me, setMe] = useState<{ uid: number; email: string } | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [devices, setDevices] = useState<AdminDevice[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const [st, de, us, ev] = await Promise.all([
      controlPlane.adminStats(),
      controlPlane.adminDevices(),
      controlPlane.adminUsers(),
      controlPlane.adminEvents(80),
    ]);
    if (st.status === 403 || de.status === 403 || us.status === 403 || ev.status === 403) {
      setGate("denied");
      setLoading(false);
      return;
    }
    if (st.ok) setStats(st.data);
    if (de.ok) setDevices(de.data.devices ?? []);
    if (us.ok) setUsers(us.data.users ?? []);
    if (ev.ok) setEvents(ev.data.events ?? []);
    if (!st.ok || !de.ok || !us.ok || !ev.ok) setError("Some admin data could not be loaded.");
    setLoading(false);
  }, []);

  useEffect(() => {
    let alive = true;
    controlPlane.adminMe().then((r) => {
      if (!alive) return;
      if (r.ok && r.data?.admin) {
        setMe({ uid: r.data.uid, email: r.data.email });
        setGate("admin");
        load();
      } else {
        setGate("denied");
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [load]);

  useEffect(() => {
    if (gate !== "admin") return;
    return subscribe((u) => {
      setDevices((prev) =>
        prev.map((d) => {
          if (d.id !== u.deviceId) return d;
          if (u.kind === "status") return { ...d, online: !!(u.payload as { online?: boolean }).online };
          if (u.kind === "state") return { ...d, online: true, state: { ...d.state, ...u.payload } };
          return { ...d, online: true };
        })
      );
    });
  }, [gate, subscribe]);

  const filteredDevices = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return devices;
    return devices.filter((d) =>
      `${d.id} ${d.name} ${d.type} ${d.owner_email ?? ""} ${d.fw_version ?? ""}`.toLowerCase().includes(q)
    );
  }, [devices, query]);

  const typeSegments = useMemo(
    () => (stats?.byType ?? []).map((x, i) => ({ label: x.type || "unknown", value: x.count, color: palette[i % palette.length] })),
    [stats]
  );

  const sendToggle = async (device: AdminDevice) => {
    const field = primaryField(device.type);
    const current = Boolean(device.state?.[field]);
    setBusy(`cmd:${device.id}`);
    setDevices((prev) => prev.map((d) => (d.id === device.id ? { ...d, state: { ...d.state, [field]: !current } } : d)));
    const r = await controlPlane.adminCommand(device.id, { action: "set", [field]: !current });
    if (!r.ok) setError(`Failed to command ${device.name || device.id}.`);
    setBusy(null);
  };

  const pushOta = async (device: AdminDevice) => {
    const url = prompt(`Firmware URL for ${device.name || device.id}`)?.trim();
    if (!url) return;
    const version = prompt("Optional firmware version")?.trim() || undefined;
    setBusy(`ota:${device.id}`);
    const r = await controlPlane.adminOta(device.id, url, version);
    if (!r.ok) setError(`Failed to push OTA for ${device.name || device.id}.`);
    setBusy(null);
  };

  const deleteDevice = async (device: AdminDevice) => {
    if (!confirm(`Delete device "${device.name || device.id}" from the fleet?`)) return;
    setBusy(`deldev:${device.id}`);
    const r = await controlPlane.adminDeleteDevice(device.id);
    if (r.ok) {
      setDevices((prev) => prev.filter((d) => d.id !== device.id));
      setStats((prev) => (prev ? { ...prev, devices: Math.max(0, prev.devices - 1), online: prev.online - (device.online ? 1 : 0) } : prev));
    } else {
      setError(`Failed to delete ${device.name || device.id}.`);
    }
    setBusy(null);
  };

  const setRole = async (user: AdminUser, isAdmin: boolean) => {
    if (user.id === me?.uid) return;
    setBusy(`role:${user.id}`);
    setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_admin: isAdmin } : u)));
    const r = await controlPlane.adminSetRole(user.id, isAdmin);
    if (!r.ok) {
      setUsers((prev) => prev.map((u) => (u.id === user.id ? { ...u, is_admin: user.is_admin } : u)));
      setError(`Failed to update ${user.email}.`);
    }
    setBusy(null);
  };

  const deleteUser = async (user: AdminUser) => {
    if (user.id === me?.uid) return;
    if (!confirm(`Delete user "${user.email}" and their control-plane account?`)) return;
    setBusy(`deluser:${user.id}`);
    const r = await controlPlane.adminDeleteUser(user.id);
    if (r.ok) {
      setUsers((prev) => prev.filter((u) => u.id !== user.id));
      setStats((prev) => (prev ? { ...prev, users: Math.max(0, prev.users - 1) } : prev));
    } else {
      setError(`Failed to delete ${user.email}.`);
    }
    setBusy(null);
  };

  if (gate === "checking" || loading) {
    return (
      <div className="flex justify-center py-24 text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (gate === "denied") {
    return (
      <div className="mx-auto max-w-xl rounded-2xl cv-card p-8 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-amber-300" />
        <h1 className="mt-4 text-2xl font-extrabold text-white">Admins only</h1>
        <p className="mt-2 text-sm text-slate-400">Your account does not have access to the Circuvent control plane.</p>
        <Link href="/console" className="mt-5 inline-flex rounded-xl px-4 py-2.5 font-semibold text-white cv-gradient">
          Back to console
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">
            <ShieldCheck className="h-4 w-4" /> Control plane
          </div>
          <h1 className="mt-1 text-2xl font-extrabold text-white">Admin dashboard</h1>
          <p className="text-sm text-slate-400">Fleet-wide devices, users, OTA actions and recent activity.</p>
        </div>
        <button onClick={load} className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 hover:bg-white/10">
          Refresh
        </button>
      </div>

      {error && <div className="rounded-xl border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200">{error}</div>}

      <div className="flex gap-2 overflow-x-auto rounded-2xl cv-card p-2">
        {(["overview", "devices", "users", "activity"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize transition ${
              tab === t ? "text-white" : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
            }`}
            style={tab === t ? { background: "var(--cv-gradient)" } : undefined}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && stats && (
        <section className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat icon={<Users className="h-5 w-5" />} label="Users" value={stats.users} />
            <Stat icon={<Cpu className="h-5 w-5" />} label="Devices" value={stats.devices} />
            <Stat icon={<Zap className="h-5 w-5" />} label="Online" value={stats.online} />
            <Stat icon={<Activity className="h-5 w-5" />} label="7d events" value={stats.events7d} />
            <Stat icon={<UserCog className="h-5 w-5" />} label="Pending sign-ups" value={stats.pendingSignups} />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className={`${theme.cardClass} rounded-2xl p-5`}>
              <h2 className="font-bold text-white">Online ratio</h2>
              <div className="mt-5 flex justify-center">
                <Gauge value={stats.online} max={Math.max(1, stats.devices)} label="Online devices" unit="" />
              </div>
            </div>
            <div className={`${theme.cardClass} rounded-2xl p-5`}>
              <h2 className="font-bold text-white mb-4">Device distribution</h2>
              {typeSegments.length ? <Donut segments={typeSegments} /> : <div className="py-16 text-center text-sm text-slate-500">No devices yet.</div>}
            </div>
          </div>
        </section>
      )}

      {tab === "devices" && (
        <section className={`${theme.cardClass} rounded-2xl p-4`}>
          <div className="mb-4 flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              placeholder="Search all devices by owner, id, type or firmware"
            />
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
                <tr>
                  <th className="px-3 py-3">Device</th>
                  <th className="px-3 py-3">Owner</th>
                  <th className="px-3 py-3">Online</th>
                  <th className="px-3 py-3">Last seen</th>
                  <th className="px-3 py-3">Firmware</th>
                  <th className="px-3 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredDevices.map((d) => {
                  const field = primaryField(d.type);
                  const on = Boolean(d.state?.[field]);
                  return (
                    <tr key={d.id} className="align-middle text-slate-300">
                      <td className="px-3 py-3">
                        <div className="font-semibold text-white">{d.name || d.id}</div>
                        <div className="text-xs text-slate-500">{d.type} · {d.id}</div>
                      </td>
                      <td className="px-3 py-3">{d.owner_email || "Unassigned"}</td>
                      <td className="px-3 py-3">
                        <span className="inline-flex items-center gap-2">
                          <span className={`h-2.5 w-2.5 rounded-full ${d.online ? "bg-emerald-400" : "bg-slate-600"}`} />
                          {d.online ? "Online" : "Offline"}
                        </span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">{relativeTime(d.last_seen)}</td>
                      <td className="px-3 py-3">{d.fw_version || "—"}</td>
                      <td className="px-3 py-3">
                        <div className="flex justify-end gap-2">
                          <button
                            onClick={() => sendToggle(d)}
                            disabled={busy === `cmd:${d.id}`}
                            className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50"
                          >
                            <Power className="mr-1 inline h-3.5 w-3.5" /> Force {on ? "Off" : "On"}
                          </button>
                          <button onClick={() => pushOta(d)} className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs text-cyan-200 hover:bg-white/10">
                            <DownloadCloud className="mr-1 inline h-3.5 w-3.5" /> OTA
                          </button>
                          <button onClick={() => deleteDevice(d)} className="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/20">
                            <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "users" && (
        <section className={`${theme.cardClass} rounded-2xl p-4 overflow-x-auto`}>
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs uppercase tracking-[0.14em] text-slate-500">
              <tr>
                <th className="px-3 py-3">User</th>
                <th className="px-3 py-3">Devices</th>
                <th className="px-3 py-3">Admin</th>
                <th className="px-3 py-3">Created</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {users.map((u) => {
                const self = u.id === me?.uid;
                return (
                  <tr key={u.id} className="text-slate-300">
                    <td className="px-3 py-3">
                      <div className="font-semibold text-white">{u.name || u.email}</div>
                      <div className="text-xs text-slate-500">{u.email}</div>
                    </td>
                    <td className="px-3 py-3">{u.devices}</td>
                    <td className="px-3 py-3">
                      <Toggle checked={u.is_admin} onChange={(v) => setRole(u, v)} disabled={self || busy === `role:${u.id}`} label={`Admin role for ${u.email}`} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">{relativeTime(u.created_at)}</td>
                    <td className="px-3 py-3 text-right">
                      <button
                        onClick={() => deleteUser(u)}
                        disabled={self || busy === `deluser:${u.id}`}
                        className="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Trash2 className="mr-1 inline h-3.5 w-3.5" /> Delete
                      </button>
                      {self && <span className="ml-2 text-xs text-slate-500">you</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {tab === "activity" && (
        <section className="space-y-3">
          {events.map((e) => (
            <div key={e.id} className={`${theme.cardClass} rounded-2xl p-4 flex gap-3`}>
              <div className="mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-300">
                <Activity className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="font-semibold text-white">{e.title || e.kind}</span>
                  <span className="text-xs uppercase tracking-[0.14em] text-slate-500">{e.kind}</span>
                </div>
                <div className="mt-1 text-sm text-slate-400">{e.body || e.device_id || "Fleet event"}</div>
                <div className="mt-2 text-xs text-slate-500">{e.owner_email || "Unknown owner"} · {relativeTime(e.ts)}</div>
              </div>
            </div>
          ))}
          {!events.length && <div className="rounded-2xl border border-dashed border-white/15 py-16 text-center text-slate-500">No recent fleet events.</div>}
        </section>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl cv-card p-4">
      <div className="flex items-center justify-between">
        <div className="text-slate-400">{icon}</div>
        <div className="text-2xl font-extrabold text-white tabular-nums">{value.toLocaleString()}</div>
      </div>
      <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
    </div>
  );
}
