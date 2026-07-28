"use client";

import { useMemo, useState } from "react";
import {
  ShieldCheck, Building2, Users, KeyRound, MonitorSmartphone, ScrollText, Plus,
  Trash2, ShieldAlert, Fingerprint, Globe, Lock, Check, X, Mail, MoreHorizontal, LogOut,
} from "lucide-react";
import {
  tenantsStore, usersStore, rolesStore, apiKeysStore, sessionsStore, auditStore,
  type Tenant, type AdminUserX, type ApiKey, type Session, type AuditEntry, type Role,
} from "../_lib/sim";
import { useStore, uid } from "../_lib/store";
import { relativeTime, fmtDate, num, money, pct } from "../_lib/format";
import {
  PageHeader, Panel, StatCard, Badge, Dot, Btn, Toggle, DataTable, Tabs, SearchInput,
  Modal, Field, Input, Progress, StaggerGrid, StaggerItem, EmptyState, SectionTitle,
  type Column, type Tone,
} from "../_ui";

type Tab = "tenants" | "users" | "roles" | "keys" | "sessions" | "audit" | "policies";

export default function AccessPage() {
  const tenants = useStore(tenantsStore);
  const users = useStore(usersStore);
  const roles = useStore(rolesStore);
  const keys = useStore(apiKeysStore);
  const sessions = useStore(sessionsStore);
  const audit = useStore(auditStore);
  const [tab, setTab] = useState<Tab>("tenants");

  const mfaAdoption = users.length ? (users.filter((u) => u.mfa).length / users.length) * 100 : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Access & Tenants" icon={<ShieldCheck className="h-5 w-5" />}
        subtitle="Multi-tenant isolation, role-based access, SSO/MFA, scoped API keys, live sessions and a complete audit trail."
      />

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem><StatCard label="Tenants" value={num(tenants.length)} icon={<Building2 className="h-4 w-4" />} tone="brand" sub={`${tenants.filter((t) => t.status === "active").length} active`} /></StaggerItem>
        <StaggerItem><StatCard label="Users" value={num(users.length)} icon={<Users className="h-4 w-4" />} tone="blue" sub={`${users.filter((u) => u.status === "invited").length} pending`} /></StaggerItem>
        <StaggerItem><StatCard label="MFA adoption" value={pct(mfaAdoption)} icon={<Fingerprint className="h-4 w-4" />} tone={mfaAdoption > 70 ? "green" : "amber"} /></StaggerItem>
        <StaggerItem><StatCard label="Active sessions" value={num(sessions.length)} icon={<MonitorSmartphone className="h-4 w-4" />} tone="violet" /></StaggerItem>
      </StaggerGrid>

      <Tabs<Tab>
        value={tab} onChange={setTab}
        tabs={[
          { value: "tenants", label: "Tenants", icon: <Building2 className="h-4 w-4" />, count: tenants.length },
          { value: "users", label: "Users", icon: <Users className="h-4 w-4" />, count: users.length },
          { value: "roles", label: "Roles", icon: <ShieldAlert className="h-4 w-4" />, count: roles.length },
          { value: "keys", label: "API Keys", icon: <KeyRound className="h-4 w-4" />, count: keys.length },
          { value: "sessions", label: "Sessions", icon: <MonitorSmartphone className="h-4 w-4" />, count: sessions.length },
          { value: "audit", label: "Audit Log", icon: <ScrollText className="h-4 w-4" /> },
          { value: "policies", label: "Policies", icon: <Lock className="h-4 w-4" /> },
        ]}
      />

      {tab === "tenants" && <TenantsTab tenants={tenants} />}
      {tab === "users" && <UsersTab users={users} roles={roles} tenants={tenants} />}
      {tab === "roles" && <RolesTab roles={roles} />}
      {tab === "keys" && <KeysTab keys={keys} />}
      {tab === "sessions" && <SessionsTab sessions={sessions} />}
      {tab === "audit" && <AuditTab audit={audit} />}
      {tab === "policies" && <PoliciesTab />}
    </div>
  );
}

// --------------------------------------------------------------- tenants ---

function TenantsTab({ tenants }: { tenants: Tenant[] }) {
  const planTone: Record<string, Tone> = { Free: "slate", Pro: "blue", Business: "violet", Enterprise: "brand" };
  const statusTone: Record<string, Tone> = { active: "green", trial: "amber", suspended: "red" };
  const cols: Column<Tenant>[] = [
    { key: "name", header: "Tenant", sort: (a, b) => a.name.localeCompare(b.name), render: (t) => (
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-lg text-white" style={{ background: t.primaryColor }}><Building2 className="h-4 w-4" /></span>
        <div><div className="font-medium text-white">{t.name}</div><div className="text-[11px] ad-muted">{t.region} · since {fmtDate(t.createdAt)}</div></div>
      </div>
    ) },
    { key: "plan", header: "Plan", render: (t) => <Badge tone={planTone[t.plan]}>{t.plan}</Badge> },
    { key: "status", header: "Status", render: (t) => <Badge tone={statusTone[t.status]}><Dot tone={statusTone[t.status]} /> {t.status}</Badge> },
    { key: "devices", header: "Devices", align: "right", sort: (a, b) => a.devices - b.devices, render: (t) => (
      <div className="min-w-[120px]">
        <div className="flex justify-between text-xs"><span className="text-white tabular-nums">{num(t.devices)}</span><span className="ad-muted tabular-nums">/{num(t.deviceQuota)}</span></div>
        <Progress value={(t.devices / t.deviceQuota) * 100} tone={t.devices / t.deviceQuota > 0.9 ? "red" : "brand"} height={5} />
      </div>
    ) },
    { key: "seats", header: "Seats", align: "right", render: (t) => <span className="tabular-nums text-slate-300">{t.seats}/{t.seatQuota}</span> },
    { key: "storage", header: "Storage", align: "right", render: (t) => <span className="tabular-nums text-slate-300">{t.storageGb}/{t.storageQuotaGb} GB</span> },
    { key: "mrr", header: "MRR", align: "right", sort: (a, b) => a.mrr - b.mrr, render: (t) => <span className="font-semibold text-white tabular-nums">{money(t.mrr)}</span> },
  ];
  return <DataTable rows={tenants} columns={cols} rowKey={(t) => t.id} />;
}

// ----------------------------------------------------------------- users ---

function UsersTab({ users, roles, tenants }: { users: AdminUserX[]; roles: Role[]; tenants: Tenant[] }) {
  const [q, setQ] = useState("");
  const [invite, setInvite] = useState(false);
  const filtered = users.filter((u) => `${u.name} ${u.email} ${u.role} ${u.tenant}`.toLowerCase().includes(q.toLowerCase()));
  const statusTone: Record<string, Tone> = { active: "green", invited: "amber", suspended: "red" };

  const doInvite = (name: string, email: string, role: string, tenant: string) => {
    usersStore.set((prev) => [{ id: uid("usr"), name, email, role, tenant, status: "invited", mfa: false, lastActive: new Date().toISOString(), createdAt: new Date().toISOString() }, ...prev]);
    auditStore.set((prev) => [{ id: uid("aud"), actor: "You", action: `invited ${email}`, target: tenant, category: "auth", ip: "10.0.0.1", ts: new Date().toISOString() }, ...prev]);
  };
  const remove = (id: string) => usersStore.set((prev) => prev.filter((u) => u.id !== id));
  const toggleStatus = (id: string) => usersStore.set((prev) => prev.map((u) => u.id === id ? { ...u, status: u.status === "suspended" ? "active" : "suspended" } : u));

  const cols: Column<AdminUserX>[] = [
    { key: "name", header: "User", sort: (a, b) => a.name.localeCompare(b.name), render: (u) => (
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-full text-xs font-bold text-white" style={{ background: "linear-gradient(135deg,#06b6d4,#8b5cf6)" }}>{u.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}</span>
        <div className="min-w-0"><div className="truncate font-medium text-white">{u.name}</div><div className="truncate text-[11px] ad-muted">{u.email}</div></div>
      </div>
    ) },
    { key: "role", header: "Role", render: (u) => <Badge tone={u.role === "Super Admin" ? "brand" : "slate"}>{u.role}</Badge> },
    { key: "tenant", header: "Tenant", render: (u) => <span className="text-slate-400">{u.tenant}</span> },
    { key: "mfa", header: "MFA", align: "center", render: (u) => u.mfa ? <Check className="mx-auto h-4 w-4 text-green-400" /> : <X className="mx-auto h-4 w-4 text-slate-600" /> },
    { key: "status", header: "Status", render: (u) => <Badge tone={statusTone[u.status]}>{u.status}</Badge> },
    { key: "last", header: "Last active", align: "right", render: (u) => <span className="text-xs ad-muted">{relativeTime(u.lastActive)}</span> },
    { key: "act", header: "", align: "right", render: (u) => (
      <div className="flex justify-end gap-1">
        <button onClick={() => toggleStatus(u.id)} title="Suspend/activate" className="rounded p-1 text-slate-500 hover:text-amber-300"><Lock className="h-4 w-4" /></button>
        <button onClick={() => remove(u.id)} title="Offboard" className="rounded p-1 text-slate-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
      </div>
    ) },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search users…" className="min-w-[220px] flex-1" />
        <Btn variant="primary" onClick={() => setInvite(true)}><Plus className="h-4 w-4" /> Invite user</Btn>
      </div>
      <DataTable rows={filtered} columns={cols} rowKey={(u) => u.id} empty={<EmptyState icon={<Users className="h-6 w-6" />} title="No users" />} />
      <InviteModal open={invite} onClose={() => setInvite(false)} roles={roles} tenants={tenants} onInvite={doInvite} />
    </div>
  );
}

function InviteModal({ open, onClose, roles, tenants, onInvite }: { open: boolean; onClose: () => void; roles: Role[]; tenants: Tenant[]; onInvite: (n: string, e: string, r: string, t: string) => void }) {
  const [name, setName] = useState(""); const [email, setEmail] = useState("");
  const [role, setRole] = useState(roles[1]?.name ?? "View-Only"); const [tenant, setTenant] = useState(tenants[0]?.name ?? "");
  return (
    <Modal open={open} onClose={onClose} title="Invite a user">
      <div className="space-y-3">
        <Field label="Full name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" /></Field>
        <Field label="Email" hint="An invitation link expires in 7 days."><Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" type="email" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Role"><select className="ad-input" value={role} onChange={(e) => setRole(e.target.value)}>{roles.map((r) => <option key={r.id}>{r.name}</option>)}</select></Field>
          <Field label="Tenant"><select className="ad-input" value={tenant} onChange={(e) => setTenant(e.target.value)}>{tenants.map((t) => <option key={t.id}>{t.name}</option>)}</select></Field>
        </div>
        <Btn variant="primary" className="w-full" onClick={() => { if (email) { onInvite(name || email, email, role, tenant); onClose(); } }}><Mail className="h-4 w-4" /> Send invitation</Btn>
      </div>
    </Modal>
  );
}

// ----------------------------------------------------------------- roles ---

function RolesTab({ roles }: { roles: Role[] }) {
  const perms = ["device", "telemetry", "ota", "provision", "incident", "billing", "security", "cert", "audit", "tenant"];
  const verbs = ["read", "write", "delete"];
  const has = (role: Role, perm: string, verb: string) => role.permissions.includes("*") || role.permissions.includes(`${perm}:*`) || role.permissions.includes(`${perm}:${verb}`) || role.permissions.includes(`*:${verb}`);
  return (
    <div className="space-y-4">
      <StaggerGrid className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {roles.map((r) => (
          <StaggerItem key={r.id}>
            <Panel>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-cyan-400" /><span className="font-semibold text-white">{r.name}</span></div>
                {r.builtin ? <Badge tone="slate">built-in</Badge> : <Badge tone="brand">custom</Badge>}
              </div>
              <p className="mt-2 text-sm ad-muted">{r.description}</p>
              <div className="mt-3 flex flex-wrap gap-1">{r.permissions.slice(0, 4).map((p) => <span key={p} className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">{p}</span>)}</div>
              <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-3 text-xs ad-muted"><span>{r.members} members</span><button className="text-cyan-400 hover:text-cyan-300">Edit</button></div>
            </Panel>
          </StaggerItem>
        ))}
      </StaggerGrid>

      <Panel>
        <SectionTitle>Permission matrix (ABAC-ready)</SectionTitle>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-white/10 text-left"><th className="px-3 py-2 text-[11px] uppercase ad-muted">Resource</th>{roles.map((r) => <th key={r.id} className="px-3 py-2 text-center text-[11px] uppercase ad-muted">{r.name.split(" ")[0]}</th>)}</tr></thead>
            <tbody>
              {perms.map((p) => (
                <tr key={p} className="border-b border-white/5">
                  <td className="px-3 py-2 font-mono text-xs text-slate-300">{p}</td>
                  {roles.map((r) => (
                    <td key={r.id} className="px-3 py-2 text-center">
                      <span className="inline-flex gap-0.5">{verbs.map((v) => <span key={v} title={v} className="h-2 w-2 rounded-full" style={{ background: has(r, p, v) ? "#22c55e" : "rgba(255,255,255,.08)" }} />)}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex gap-4 text-[11px] ad-muted"><span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-green-500" /> granted</span><span>read · write · delete</span></div>
      </Panel>
    </div>
  );
}

// ------------------------------------------------------------------ keys ---

function KeysTab({ keys }: { keys: ApiKey[] }) {
  const [create, setCreate] = useState(false);
  const revoke = (id: string) => apiKeysStore.set((prev) => prev.map((k) => k.id === id ? { ...k, status: "revoked" } : k));
  const add = (name: string, scopes: string[]) => apiKeysStore.set((prev) => [{ id: uid("key"), name, prefix: `cv_live_${Math.random().toString(16).slice(2, 8)}`, scopes, tenant: "Circuvent", createdBy: "You", lastUsed: null, createdAt: new Date().toISOString(), expiresAt: null, status: "active" }, ...prev]);
  const cols: Column<ApiKey>[] = [
    { key: "name", header: "Key", render: (k) => (<div><div className="font-medium text-white">{k.name}</div><div className="font-mono text-[11px] ad-muted">{k.prefix}••••••••</div></div>) },
    { key: "scopes", header: "Scopes", render: (k) => <div className="flex flex-wrap gap-1">{k.scopes.map((s) => <span key={s} className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">{s}</span>)}</div> },
    { key: "tenant", header: "Tenant", render: (k) => <span className="text-slate-400">{k.tenant}</span> },
    { key: "used", header: "Last used", align: "right", render: (k) => <span className="text-xs ad-muted">{k.lastUsed ? relativeTime(k.lastUsed) : "never"}</span> },
    { key: "status", header: "Status", render: (k) => <Badge tone={k.status === "active" ? "green" : "red"}>{k.status}</Badge> },
    { key: "act", header: "", align: "right", render: (k) => k.status === "active" ? <button onClick={() => revoke(k.id)} className="text-xs font-semibold text-red-400 hover:text-red-300">Revoke</button> : <span className="text-xs ad-muted">revoked</span> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Btn variant="primary" onClick={() => setCreate(true)}><Plus className="h-4 w-4" /> Create API key</Btn></div>
      <DataTable rows={keys} columns={cols} rowKey={(k) => k.id} />
      <CreateKeyModal open={create} onClose={() => setCreate(false)} onCreate={add} />
    </div>
  );
}

function CreateKeyModal({ open, onClose, onCreate }: { open: boolean; onClose: () => void; onCreate: (n: string, s: string[]) => void }) {
  const [name, setName] = useState("");
  const allScopes = ["device:read", "device:command", "telemetry:read", "ota:deploy", "provision:create", "*"];
  const [scopes, setScopes] = useState<string[]>(["device:read"]);
  const toggle = (s: string) => setScopes((p) => p.includes(s) ? p.filter((x) => x !== s) : [...p, s]);
  return (
    <Modal open={open} onClose={onClose} title="Create scoped API key">
      <div className="space-y-3">
        <Field label="Key name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CI pipeline" /></Field>
        <Field label="Scopes" hint="Grant the minimum required permissions.">
          <div className="flex flex-wrap gap-2">{allScopes.map((s) => <button key={s} onClick={() => toggle(s)} className={`rounded-lg border px-2.5 py-1 font-mono text-xs ${scopes.includes(s) ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-white/10 text-slate-400"}`}>{s}</button>)}</div>
        </Field>
        <Btn variant="primary" className="w-full" onClick={() => { if (name) { onCreate(name, scopes); onClose(); setName(""); } }}><KeyRound className="h-4 w-4" /> Generate key</Btn>
      </div>
    </Modal>
  );
}

// -------------------------------------------------------------- sessions ---

function SessionsTab({ sessions }: { sessions: Session[] }) {
  const terminate = (id: string) => sessionsStore.set((prev) => prev.filter((s) => s.id !== id));
  const cols: Column<Session>[] = [
    { key: "user", header: "User", render: (s) => (<div><div className="font-medium text-white">{s.user} {s.current && <Badge tone="green">this device</Badge>}</div><div className="text-[11px] ad-muted">{s.email}</div></div>) },
    { key: "device", header: "Device", render: (s) => <span className="text-slate-300">{s.device}</span> },
    { key: "ip", header: "IP / Location", render: (s) => (<div><div className="font-mono text-xs text-slate-300">{s.ip}</div><div className="text-[11px] ad-muted">{s.location}</div></div>) },
    { key: "seen", header: "Last seen", align: "right", render: (s) => <span className="text-xs ad-muted">{relativeTime(s.lastSeen)}</span> },
    { key: "act", header: "", align: "right", render: (s) => s.current ? <span className="text-xs ad-muted">current</span> : <button onClick={() => terminate(s.id)} className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 hover:text-red-300"><LogOut className="h-3.5 w-3.5" /> Terminate</button> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm ad-muted">Live sessions with remote termination. Contextual monitoring flags impossible-travel logins.</p>
        <Btn variant="danger" onClick={() => sessionsStore.set((prev) => prev.filter((s) => s.current))}><LogOut className="h-4 w-4" /> Revoke all others</Btn>
      </div>
      <DataTable rows={sessions} columns={cols} rowKey={(s) => s.id} />
    </div>
  );
}

// ----------------------------------------------------------------- audit ---

function AuditTab({ audit }: { audit: AuditEntry[] }) {
  const [cat, setCat] = useState("all");
  const [q, setQ] = useState("");
  const cats = ["all", "auth", "device", "config", "security", "billing", "ota"];
  const catTone: Record<string, Tone> = { auth: "blue", device: "brand", config: "violet", security: "red", billing: "amber", ota: "cyan" };
  const filtered = audit.filter((a) => (cat === "all" || a.category === cat) && `${a.actor} ${a.action} ${a.target}`.toLowerCase().includes(q.toLowerCase()));
  const cols: Column<AuditEntry>[] = [
    { key: "actor", header: "Actor", render: (a) => <span className="font-medium text-white">{a.actor}</span> },
    { key: "action", header: "Action", render: (a) => <span className="text-slate-300">{a.action}</span> },
    { key: "target", header: "Target", render: (a) => <span className="font-mono text-xs ad-muted">{a.target}</span> },
    { key: "cat", header: "Category", render: (a) => <Badge tone={catTone[a.category]}>{a.category}</Badge> },
    { key: "ip", header: "IP", render: (a) => <span className="font-mono text-xs ad-muted">{a.ip}</span> },
    { key: "ts", header: "When", align: "right", sort: (a, b) => +new Date(a.ts) - +new Date(b.ts), render: (a) => <span className="text-xs ad-muted">{relativeTime(a.ts)}</span> },
  ];
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search audit log…" className="min-w-[200px] flex-1" />
        <div className="flex flex-wrap gap-1">{cats.map((c) => <button key={c} onClick={() => setCat(c)} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium capitalize ${cat === c ? "bg-cyan-500/15 text-cyan-300" : "text-slate-400 hover:text-white"}`}>{c}</button>)}</div>
      </div>
      <DataTable rows={filtered} columns={cols} rowKey={(a) => a.id} dense />
    </div>
  );
}

// -------------------------------------------------------------- policies ---

function PoliciesTab() {
  const [sso, setSso] = useState({ saml: true, google: true, azure: false, okta: false });
  const [mfa, setMfa] = useState({ required: true, totp: true, webauthn: true, sms: false });
  const [pw, setPw] = useState({ minLen: 12, rotate: 90, complexity: true });
  const [ips, setIps] = useState(["10.0.0.0/8", "192.168.1.0/24"]);
  const [newIp, setNewIp] = useState("");
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Panel>
        <SectionTitle>SSO / Identity providers</SectionTitle>
        <div className="space-y-2.5">
          {([["saml", "SAML 2.0"], ["google", "Google Workspace"], ["azure", "Microsoft Entra ID"], ["okta", "Okta"]] as const).map(([k, label]) => (
            <div key={k} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-white"><Globe className="h-4 w-4 text-cyan-400" /> {label}</span>
              <Toggle checked={sso[k]} onChange={(v) => setSso((s) => ({ ...s, [k]: v }))} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Multi-factor authentication</SectionTitle>
        <div className="space-y-2.5">
          {([["required", "Enforce MFA for all users"], ["totp", "Authenticator app (TOTP)"], ["webauthn", "Hardware keys / passkeys (WebAuthn)"], ["sms", "SMS one-time codes"]] as const).map(([k, label]) => (
            <div key={k} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3">
              <span className="flex items-center gap-2 text-sm text-white"><Fingerprint className="h-4 w-4 text-violet-400" /> {label}</span>
              <Toggle checked={mfa[k]} onChange={(v) => setMfa((s) => ({ ...s, [k]: v }))} />
            </div>
          ))}
        </div>
      </Panel>

      <Panel>
        <SectionTitle>Password policy</SectionTitle>
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm"><span className="text-slate-300">Minimum length</span><span className="font-semibold text-white tabular-nums">{pw.minLen} chars</span></div>
          <input type="range" min={8} max={32} value={pw.minLen} onChange={(e) => setPw((p) => ({ ...p, minLen: +e.target.value }))} className="w-full accent-cyan-500" />
          <div className="flex items-center justify-between text-sm"><span className="text-slate-300">Force rotation</span><span className="font-semibold text-white tabular-nums">{pw.rotate} days</span></div>
          <input type="range" min={30} max={365} step={30} value={pw.rotate} onChange={(e) => setPw((p) => ({ ...p, rotate: +e.target.value }))} className="w-full accent-cyan-500" />
          <div className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-3"><span className="text-sm text-white">Require complexity (Argon2 hashing)</span><Toggle checked={pw.complexity} onChange={(v) => setPw((p) => ({ ...p, complexity: v }))} /></div>
        </div>
      </Panel>

      <Panel>
        <SectionTitle>IP allowlist (CIDR)</SectionTitle>
        <div className="space-y-2">
          {ips.map((ip) => (
            <div key={ip} className="flex items-center justify-between rounded-xl border border-white/5 bg-black/20 px-4 py-2.5">
              <span className="font-mono text-sm text-white">{ip}</span>
              <button onClick={() => setIps((p) => p.filter((x) => x !== ip))} className="text-slate-500 hover:text-red-300"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <Input value={newIp} onChange={(e) => setNewIp(e.target.value)} placeholder="203.0.113.0/24" className="font-mono" />
            <Btn variant="subtle" onClick={() => { if (newIp) { setIps((p) => [...p, newIp]); setNewIp(""); } }}><Plus className="h-4 w-4" /></Btn>
          </div>
        </div>
      </Panel>
    </div>
  );
}
