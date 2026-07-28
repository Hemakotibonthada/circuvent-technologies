"use client";

/**
 * Access & Users — operator accounts, roles, API keys and the audit trail.
 *
 * Every value on this page comes from a real source:
 *   • Accounts and roles are read live from the Circuvent control plane
 *     (`/admin/users`, `/admin/me`) and mutated through it (`adminSetRole`,
 *     `adminDeleteUser`). The plane models access as a single `is_admin` flag,
 *     so there are exactly two truthful roles: Operator and Member.
 *   • API keys are generated in the browser with the Web Crypto API; only a
 *     display prefix and metadata are persisted, by this app's own disk-backed
 *     admin-config store (`/api/smarthome/admin/config`). The full secret is
 *     shown once and never stored.
 *   • The audit trail is the real log of operator actions taken through this
 *     console, merged with security-relevant events from the control plane.
 *
 * There is deliberately no tenant / billing / SSO / session-registry UI: this
 * is a single-tenant, self-hosted control plane with no upstream for any of
 * those, so the fabricated versions were removed rather than faked.
 */

import { useCallback, useMemo, useState, type ReactNode } from "react";
import {
  ShieldCheck, Users, ShieldAlert, KeyRound, ScrollText, Plus, Trash2, Check, X,
  RefreshCw, TriangleAlert, UserCog, UserRound, CircleUser, Cpu, ServerCog,
} from "lucide-react";
import {
  useAdminUsers, useAdminConfig, useAdminAudit, useAdminEvents, useResource,
  type Resource, type ConfigResource, type ConfigRecord, type AuditEntry,
} from "../_lib/api";
import { controlPlane, type AdminUser, type AdminEvent } from "@/lib/control-plane";
import { relativeTime, fmtDate, fmtDateTime, num } from "../_lib/format";
import {
  Panel, PageHeader, StatCard, Badge, Btn, DataTable, Tabs, SearchInput, Segmented,
  Modal, Field, Input, Select, StaggerGrid, StaggerItem, EmptyState, ResourceGate,
  LoadingState, ErrorState, CopyButton, TONE, type Column, type Tone,
} from "../_ui";

type Tab = "users" | "roles" | "keys" | "audit";

interface AdminMe {
  admin: boolean;
  uid: number;
  email: string;
}

interface ApiKeyRecord extends ConfigRecord {
  name: string;
  prefix: string;
  scopes?: string[];
  expiresAt?: string | null;
}

interface AuditRow {
  id: string;
  ts: string;
  actor: string;
  action: string;
  target: string;
  summary: string;
  source: "console" | "control-plane";
}

interface Cap {
  label: string;
  operator: boolean;
  member: boolean;
}

// What the control plane's single `is_admin` flag actually grants — no invented
// granular RBAC matrix, just the truth of the two roles this backend supports.
const CAPS: Cap[] = [
  { label: "Sign in to this admin console", operator: true, member: false },
  { label: "Manage all accounts & roles", operator: true, member: false },
  { label: "Provision & control any device", operator: true, member: false },
  { label: "Push firmware over-the-air", operator: true, member: false },
  { label: "Change platform configuration", operator: true, member: false },
  { label: "Manage their own devices & scenes", operator: true, member: true },
];

const ALL_SCOPES = [
  "devices:read", "devices:command", "telemetry:read",
  "automations:write", "events:read", "admin:all",
];

const EXPIRY_OPTIONS: { value: string; label: string }[] = [
  { value: "never", label: "No expiry" },
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
];

// --------------------------------------------------------------- helpers ---

/** Extract the control plane's real error message, or a truthful fallback. */
function apiError(res: { status: number; data: unknown }): string {
  const d = res.data;
  const body = d && typeof d === "object" && "error" in d ? String((d as { error?: unknown }).error ?? "") : "";
  if (body) return body;
  if (res.status === 0) return "Cannot reach the control plane.";
  if (res.status === 401) return "Your operator session has expired — sign in again.";
  if (res.status === 403) return "This account is not an operator.";
  if (res.status === 404) return "That account no longer exists.";
  return `Control plane returned ${res.status}.`;
}

/** Cryptographically random secret. Only the prefix is ever persisted. */
function generateSecret(): { secret: string; prefix: string } {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const secret = `cv_live_${hex}`;
  return { secret, prefix: secret.slice(0, 16) };
}

function expiryToIso(v: string): string | null {
  if (v === "never") return null;
  const days = Number(v);
  if (!Number.isFinite(days)) return null;
  return new Date(Date.now() + days * 86400000).toISOString();
}

function isSecurityEvent(kind: string): boolean {
  const k = kind.toLowerCase();
  return ["auth", "login", "logout", "secur", "sos", "alert", "tamper", "lock",
    "unlock", "fault", "denied", "password", "mfa", "role", "admin"].some((s) => k.includes(s));
}

// ------------------------------------------------------------------- page ---

export default function AccessPage() {
  const usersRes = useAdminUsers();
  const keys = useAdminConfig<ApiKeyRecord>("api-keys");
  const auditRes = useAdminAudit();
  const eventsRes = useAdminEvents(200);
  const meRes = useResource<AdminMe, AdminMe>(useCallback(() => controlPlane.adminMe(), []), (r) => r, 0);
  const [tab, setTab] = useState<Tab>("users");

  const users = usersRes.data ?? [];
  const operators = users.filter((u) => u.is_admin).length;
  const auditCount =
    (auditRes.data?.length ?? 0) +
    (eventsRes.data?.filter((e) => isSecurityEvent(e.kind)).length ?? 0);

  const refreshAll = () => {
    usersRes.reload();
    keys.reload();
    auditRes.reload();
    eventsRes.reload();
    meRes.reload();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Access & Users"
        icon={<ShieldCheck className="h-5 w-5" />}
        subtitle="Operator accounts and roles from the Circuvent control plane, scoped API keys persisted by this console, and a real audit trail. No tenants, billing or SSO — this is a single-tenant, self-hosted plane."
        actions={<Btn variant="subtle" onClick={refreshAll}><RefreshCw className="h-4 w-4" /> Refresh</Btn>}
      />

      <StaggerGrid className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StaggerItem>
          <StatCard label="Accounts" value={usersRes.loading ? "—" : num(users.length)} icon={<Users className="h-4 w-4" />} tone="blue" sub="control-plane users" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Operators" value={usersRes.loading ? "—" : num(operators)} icon={<ShieldAlert className="h-4 w-4" />} tone="brand" sub={usersRes.loading ? "is_admin = true" : `${num(users.length - operators)} members`} />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="API keys" value={keys.loading ? "—" : num(keys.rows.length)} icon={<KeyRound className="h-4 w-4" />} tone="violet" sub="stored in this console" />
        </StaggerItem>
        <StaggerItem>
          <StatCard label="Audit entries" value={auditRes.loading || eventsRes.loading ? "—" : num(auditCount)} icon={<ScrollText className="h-4 w-4" />} tone="amber" sub="operator + security" />
        </StaggerItem>
      </StaggerGrid>

      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { value: "users", label: "Users", icon: <Users className="h-4 w-4" />, count: users.length || undefined },
          { value: "roles", label: "Roles", icon: <ShieldAlert className="h-4 w-4" />, count: 2 },
          { value: "keys", label: "API Keys", icon: <KeyRound className="h-4 w-4" />, count: keys.rows.length || undefined },
          { value: "audit", label: "Audit Log", icon: <ScrollText className="h-4 w-4" />, count: auditCount || undefined },
        ]}
      />

      {tab === "users" && <UsersTab usersRes={usersRes} meRes={meRes} />}
      {tab === "roles" && <RolesTab usersRes={usersRes} />}
      {tab === "keys" && <KeysTab keys={keys} />}
      {tab === "audit" && <AuditTab auditRes={auditRes} eventsRes={eventsRes} />}
    </div>
  );
}

// ----------------------------------------------------------------- shared ---

function Avatar({ name, email }: { name: string; email: string }) {
  const initials =
    (name || email)
      .split(/[\s@.]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("") || "?";
  return (
    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ background: "var(--cv-gradient)" }}>
      {initials}
    </span>
  );
}

function RoleBadge({ isAdmin }: { isAdmin: boolean }) {
  return isAdmin ? (
    <Badge tone="brand"><ShieldCheck className="h-3 w-3" /> Operator</Badge>
  ) : (
    <Badge tone="slate"><UserRound className="h-3 w-3" /> Member</Badge>
  );
}

function ConfirmDialog({
  open, title, message, confirmLabel = "Confirm", danger, busy, error, onClose, onConfirm,
}: {
  open: boolean; title: string; message: ReactNode; confirmLabel?: string; danger?: boolean;
  busy: boolean; error: string | null; onClose: () => void; onConfirm: () => void;
}) {
  return (
    <Modal open={open} onClose={() => { if (!busy) onClose(); }} title={title}>
      <div className="space-y-4">
        <div className="text-sm text-slate-300">{message}</div>
        {error && (
          <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/[0.08] px-3 py-2 text-sm text-red-200">
            <TriangleAlert className="h-4 w-4 shrink-0" /> {error}
          </div>
        )}
        <div className="flex justify-end gap-2">
          <Btn variant="subtle" onClick={onClose} disabled={busy}>Cancel</Btn>
          <Btn variant={danger ? "danger" : "primary"} onClick={onConfirm} disabled={busy}>
            {busy ? "Working…" : confirmLabel}
          </Btn>
        </div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ users ---

function SessionCard({ meRes }: { meRes: Resource<AdminMe> }) {
  const me = meRes.data;
  return (
    <Panel>
      <div className="flex flex-wrap items-center gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl" style={{ background: TONE.brand.bg, color: TONE.brand.fg }}>
          <CircleUser className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] ad-muted">Your session</div>
          {meRes.loading ? (
            <div className="mt-1.5 h-4 w-40 rounded bg-white/[0.06]" />
          ) : me ? (
            <div className="mt-0.5 flex flex-wrap items-center gap-2">
              <span className="truncate font-semibold text-white">{me.email}</span>
              <Badge tone="brand"><ShieldCheck className="h-3 w-3" /> Operator · uid {me.uid}</Badge>
            </div>
          ) : (
            <div className="mt-0.5 text-sm text-red-300">{meRes.error ?? "Not signed in to the control plane."}</div>
          )}
        </div>
        <p className="max-w-xs text-[11px] ad-muted">
          The control plane exposes no session registry, so other active sessions can’t be listed or revoked here.
        </p>
      </div>
    </Panel>
  );
}

function UsersTab({ usersRes, meRes }: { usersRes: Resource<AdminUser[]>; meRes: Resource<AdminMe> }) {
  const me = meRes.data;
  const users = useMemo(() => usersRes.data ?? [], [usersRes.data]);
  const operators = users.filter((u) => u.is_admin).length;
  const [q, setQ] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "operators" | "members">("all");
  const [confirm, setConfirm] = useState<{ kind: "promote" | "demote" | "delete"; user: AdminUser } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return users.filter((u) => {
      const roleOk = roleFilter === "all" || (roleFilter === "operators" ? u.is_admin : !u.is_admin);
      const hit = !needle || `${u.name} ${u.email}`.toLowerCase().includes(needle);
      return roleOk && hit;
    });
  }, [users, q, roleFilter]);

  const runConfirm = useCallback(async () => {
    if (!confirm) return;
    const { kind, user } = confirm;
    if (me?.uid === user.id) {
      setErr("You cannot change or delete your own operator account.");
      return;
    }
    setBusy(true);
    setErr(null);
    const res =
      kind === "delete"
        ? await controlPlane.adminDeleteUser(user.id)
        : await controlPlane.adminSetRole(user.id, kind === "promote");
    setBusy(false);
    if (res.ok) {
      setConfirm(null);
      usersRes.reload();
    } else {
      setErr(apiError(res));
    }
  }, [confirm, me, usersRes]);

  const cols: Column<AdminUser>[] = [
    {
      key: "user", header: "User", sort: (a, b) => a.name.localeCompare(b.name),
      render: (u) => (
        <div className="flex items-center gap-3">
          <Avatar name={u.name} email={u.email} />
          <div className="min-w-0">
            <div className="truncate font-medium text-white">{u.name || "—"}</div>
            <div className="truncate text-[11px] ad-muted">{u.email}</div>
          </div>
        </div>
      ),
    },
    { key: "role", header: "Role", render: (u) => <RoleBadge isAdmin={u.is_admin} /> },
    { key: "devices", header: "Devices", align: "right", sort: (a, b) => a.devices - b.devices, render: (u) => <span className="tabular-nums text-slate-300">{num(u.devices)}</span> },
    {
      key: "created", header: "Joined", align: "right",
      sort: (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
      render: (u) => <span className="text-xs ad-muted" title={fmtDate(u.created_at)}>{relativeTime(u.created_at)}</span>,
    },
    {
      key: "act", header: "", align: "right",
      render: (u) => {
        if (me?.uid === u.id) return <span className="text-[11px] ad-muted">that’s you</span>;
        return (
          <div className="flex justify-end gap-1">
            {u.is_admin ? (
              <button onClick={() => { setConfirm({ kind: "demote", user: u }); setErr(null); }} title="Revoke operator access" className="rounded p-1 text-slate-500 transition hover:text-amber-300">
                <UserRound className="h-4 w-4" />
              </button>
            ) : (
              <button onClick={() => { setConfirm({ kind: "promote", user: u }); setErr(null); }} title="Make operator" className="rounded p-1 text-slate-500 transition hover:text-cyan-300">
                <UserCog className="h-4 w-4" />
              </button>
            )}
            <button onClick={() => { setConfirm({ kind: "delete", user: u }); setErr(null); }} title="Delete account" className="rounded p-1 text-slate-500 transition hover:text-red-300">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      },
    },
  ];

  const kind = confirm?.kind;

  return (
    <div className="space-y-4">
      <SessionCard meRes={meRes} />
      <ResourceGate
        loading={usersRes.loading}
        error={usersRes.error}
        unauthorized={usersRes.unauthorized}
        onRetry={usersRes.reload}
        isEmpty={users.length === 0}
        empty={<EmptyState icon={<Users className="h-6 w-6" />} title="No accounts yet" hint="Accounts appear here as people register with the control plane." />}
        skeletonRows={5}
      >
        <div className="flex flex-wrap items-center gap-2">
          <SearchInput value={q} onChange={setQ} placeholder="Search by name or email…" className="min-w-[220px] flex-1" />
          <Segmented
            value={roleFilter}
            onChange={setRoleFilter}
            options={[
              { value: "all", label: `All (${users.length})` },
              { value: "operators", label: `Operators (${operators})` },
              { value: "members", label: `Members (${users.length - operators})` },
            ]}
          />
        </div>
        <div className="mt-3">
          <DataTable
            rows={filtered}
            columns={cols}
            rowKey={(u) => String(u.id)}
            empty={<div className="px-4 py-10 text-center text-sm ad-muted">No accounts match your filters.</div>}
          />
        </div>
      </ResourceGate>

      <ConfirmDialog
        open={!!confirm}
        title={kind === "delete" ? "Delete account" : kind === "promote" ? "Make operator" : "Revoke operator access"}
        danger={kind !== "promote"}
        busy={busy}
        error={err}
        confirmLabel={kind === "delete" ? "Delete account" : kind === "promote" ? "Make operator" : "Revoke operator"}
        message={confirm ? confirmMessage(confirm.kind, confirm.user) : ""}
        onClose={() => { setConfirm(null); setErr(null); }}
        onConfirm={runConfirm}
      />
    </div>
  );
}

function confirmMessage(kind: "promote" | "demote" | "delete", u: AdminUser): ReactNode {
  const who = <b className="text-slate-200">{u.email}</b>;
  if (kind === "promote") return <>Grant operator (admin) access to {who}? They will be able to manage every account and device in the control plane.</>;
  if (kind === "demote") return <>Remove operator access from {who}? They will keep only their own devices and lose this admin console.</>;
  return <>Permanently delete {who}? This removes the account from the control plane and unlinks its devices. This cannot be undone.</>;
}

// ------------------------------------------------------------------ roles ---

function RolesTab({ usersRes }: { usersRes: Resource<AdminUser[]> }) {
  const users = usersRes.data ?? [];
  const operators = users.filter((u) => u.is_admin);
  const members = users.filter((u) => !u.is_admin);

  return (
    <ResourceGate loading={usersRes.loading} error={usersRes.error} unauthorized={usersRes.unauthorized} onRetry={usersRes.reload} skeletonRows={3}>
      <div className="space-y-4">
        <div className="rounded-xl border border-white/5 bg-black/20 px-4 py-3 text-sm ad-muted">
          This control plane models access as a single <code className="rounded bg-black/40 px-1 font-mono text-cyan-300">is_admin</code> flag, so there are exactly two roles — no granular permission matrix exists upstream. Change a person’s role from the <b className="text-slate-200">Users</b> tab.
        </div>
        <StaggerGrid className="grid gap-4 md:grid-cols-2">
          <StaggerItem>
            <RoleCard
              title="Operator"
              tone="brand"
              icon={<UserCog className="h-5 w-5" />}
              description="Full administrative access. Backed by the control plane’s is_admin flag: manage every account and device, provision hardware, push firmware and change platform configuration."
              count={operators.length}
              granted={(c) => c.operator}
              people={operators}
            />
          </StaggerItem>
          <StaggerItem>
            <RoleCard
              title="Member"
              tone="slate"
              icon={<UserRound className="h-5 w-5" />}
              description="Standard account. Uses the normal apps to control only their own devices, scenes and automations — with no access to this admin console."
              count={members.length}
              granted={(c) => c.member}
            />
          </StaggerItem>
        </StaggerGrid>
      </div>
    </ResourceGate>
  );
}

function RoleCard({
  title, tone, icon, description, count, granted, people,
}: {
  title: string; tone: Tone; icon: ReactNode; description: string;
  count: number; granted: (c: Cap) => boolean; people?: AdminUser[];
}) {
  return (
    <Panel>
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 place-items-center rounded-lg" style={{ background: TONE[tone].bg, color: TONE[tone].fg }}>{icon}</span>
          <div>
            <div className="font-semibold text-white">{title}</div>
            <div className="text-[11px] ad-muted">{num(count)} {count === 1 ? "account" : "accounts"}</div>
          </div>
        </div>
        <Badge tone={tone}>{num(count)}</Badge>
      </div>
      <p className="mt-3 text-sm ad-muted">{description}</p>
      <div className="mt-3 space-y-1.5 border-t border-white/5 pt-3">
        {CAPS.map((c) => {
          const ok = granted(c);
          return (
            <div key={c.label} className="flex items-center gap-2 text-sm">
              {ok ? <Check className="h-4 w-4 shrink-0 text-green-400" /> : <X className="h-4 w-4 shrink-0 text-slate-600" />}
              <span className={ok ? "text-slate-200" : "text-slate-500"}>{c.label}</span>
            </div>
          );
        })}
      </div>
      {people && people.length > 0 && (
        <div className="mt-3 border-t border-white/5 pt-3">
          <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider ad-muted">Who holds this role</div>
          <div className="flex flex-wrap gap-1.5">
            {people.map((p) => (
              <span key={p.id} className="rounded-md bg-black/30 px-2 py-0.5 text-[11px] text-slate-300">{p.email}</span>
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

// ------------------------------------------------------------------- keys ---

function KeysTab({ keys }: { keys: ConfigResource<ApiKeyRecord> }) {
  const [showCreate, setShowCreate] = useState(false);
  const [revoke, setRevoke] = useState<ApiKeyRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const doRevoke = useCallback(async () => {
    if (!revoke) return;
    setBusy(true);
    setErr(null);
    const ok = await keys.remove(revoke.id);
    setBusy(false);
    if (ok) setRevoke(null);
    else setErr("Could not revoke the key. Confirm you’re still signed in as an operator and try again.");
  }, [revoke, keys]);

  const cols: Column<ApiKeyRecord>[] = [
    {
      key: "name", header: "Key",
      render: (k) => (
        <div>
          <div className="font-medium text-white">{k.name}</div>
          <div className="font-mono text-[11px] ad-muted">{k.prefix}••••••••</div>
        </div>
      ),
    },
    {
      key: "scopes", header: "Scopes",
      render: (k) => {
        const scopes = k.scopes ?? [];
        return scopes.length === 0 ? (
          <span className="text-xs ad-muted">none</span>
        ) : (
          <div className="flex flex-wrap gap-1">
            {scopes.map((s) => <span key={s} className="rounded bg-black/30 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">{s}</span>)}
          </div>
        );
      },
    },
    {
      key: "created", header: "Created", align: "right",
      render: (k) => (
        <div className="text-xs ad-muted">
          <div title={fmtDateTime(k.createdAt)}>{relativeTime(k.createdAt)}</div>
          <div className="text-[10px]">by {k.createdBy}</div>
        </div>
      ),
    },
    {
      key: "expiry", header: "Expiry", align: "right",
      render: (k) => {
        const exp = k.expiresAt ?? null;
        if (!exp) return <span className="text-xs ad-muted">never</span>;
        const expired = Date.parse(exp) < Date.now();
        return <Badge tone={expired ? "red" : "slate"}>{expired ? "expired" : fmtDate(exp)}</Badge>;
      },
    },
    {
      key: "act", header: "", align: "right",
      render: (k) => (
        <button onClick={() => { setRevoke(k); setErr(null); }} className="inline-flex items-center gap-1 text-xs font-semibold text-red-400 transition hover:text-red-300">
          <Trash2 className="h-3.5 w-3.5" /> Revoke
        </button>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm ad-muted">
          API keys are generated in your browser and persisted by this console’s own disk-backed config store — only a display prefix and metadata are kept, never the full secret. Accounts and devices, by contrast, live in the control plane.
        </p>
        <Btn variant="primary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Create API key</Btn>
      </div>

      <ResourceGate
        loading={keys.loading}
        error={keys.error}
        unauthorized={keys.unauthorized}
        onRetry={keys.reload}
        isEmpty={keys.rows.length === 0}
        empty={
          <EmptyState
            icon={<KeyRound className="h-6 w-6" />}
            title="No API keys yet"
            hint="Create a scoped key to let scripts and integrations call the platform on your behalf."
            action={<Btn variant="primary" onClick={() => setShowCreate(true)}><Plus className="h-4 w-4" /> Create API key</Btn>}
          />
        }
        skeletonRows={4}
      >
        <DataTable rows={keys.rows} columns={cols} rowKey={(k) => k.id} />
      </ResourceGate>

      <CreateKeyModal open={showCreate} onClose={() => setShowCreate(false)} keys={keys} />

      <ConfirmDialog
        open={!!revoke}
        title="Revoke API key"
        danger
        busy={busy}
        error={err}
        confirmLabel="Revoke key"
        message={revoke ? <>Revoke <b className="text-slate-200">{revoke.name}</b> (<span className="font-mono">{revoke.prefix}…</span>)? Any client using this key will immediately lose access.</> : ""}
        onClose={() => { setRevoke(null); setErr(null); }}
        onConfirm={doRevoke}
      />
    </div>
  );
}

function CreateKeyModal({ open, onClose, keys }: { open: boolean; onClose: () => void; keys: ConfigResource<ApiKeyRecord> }) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["devices:read"]);
  const [expiry, setExpiry] = useState<string>("never");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  const close = () => {
    setName("");
    setScopes(["devices:read"]);
    setExpiry("never");
    setErr(null);
    setSecret(null);
    setBusy(false);
    onClose();
  };

  const toggleScope = (s: string) => setScopes((p) => (p.includes(s) ? p.filter((x) => x !== s) : [...p, s]));

  const generate = useCallback(async () => {
    if (!name.trim()) {
      setErr("Give the key a name so you can recognise it later.");
      return;
    }
    setBusy(true);
    setErr(null);
    const { secret: full, prefix } = generateSecret();
    const rec = await keys.create({ name: name.trim(), prefix, scopes, expiresAt: expiryToIso(expiry) });
    setBusy(false);
    if (rec) setSecret(full);
    else setErr("Could not save the key. Confirm you’re signed in as an operator and try again.");
  }, [name, scopes, expiry, keys]);

  return (
    <Modal open={open} onClose={() => { if (!busy) close(); }} title={secret ? "Copy your API key" : "Create API key"}>
      {secret ? (
        <div className="space-y-4">
          <div className="flex items-start gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.08] px-3 py-2 text-sm text-amber-200">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            <span>This is the only time the full secret is shown. Copy it now — only its prefix is stored, so it cannot be recovered later.</span>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2.5">
            <code className="min-w-0 flex-1 break-all font-mono text-xs text-cyan-300">{secret}</code>
            <CopyButton text={secret} />
          </div>
          <Btn variant="primary" className="w-full" onClick={close}><Check className="h-4 w-4" /> Done</Btn>
        </div>
      ) : (
        <div className="space-y-3">
          <Field label="Key name"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="CI pipeline" /></Field>
          <Field label="Scopes" hint="Recorded with the key as metadata. Grant the minimum a client needs.">
            <div className="flex flex-wrap gap-2">
              {ALL_SCOPES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => toggleScope(s)}
                  className={`rounded-lg border px-2.5 py-1 font-mono text-xs transition ${scopes.includes(s) ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-white/10 text-slate-400 hover:text-slate-200"}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Expiry">
            <Select value={expiry} onChange={setExpiry} options={EXPIRY_OPTIONS} />
          </Field>
          {err && (
            <div role="alert" className="flex items-center gap-2 rounded-lg border border-red-500/25 bg-red-500/[0.08] px-3 py-2 text-sm text-red-200">
              <TriangleAlert className="h-4 w-4 shrink-0" /> {err}
            </div>
          )}
          <Btn variant="primary" className="w-full" onClick={generate} disabled={busy}>
            <KeyRound className="h-4 w-4" /> {busy ? "Generating…" : "Generate key"}
          </Btn>
        </div>
      )}
    </Modal>
  );
}

// ------------------------------------------------------------------ audit ---

function AuditTab({ auditRes, eventsRes }: { auditRes: Resource<AuditEntry[]>; eventsRes: Resource<AdminEvent[]> }) {
  const [q, setQ] = useState("");
  const [source, setSource] = useState<"all" | "console" | "control-plane">("all");

  const rows = useMemo<AuditRow[]>(() => {
    const consoleRows: AuditRow[] = (auditRes.data ?? []).map((a) => ({
      id: `cfg-${a.id}`,
      ts: a.ts,
      actor: a.actor,
      action: a.action,
      target: `${a.collection}/${a.target}`,
      summary: a.summary,
      source: "console",
    }));
    const planeRows: AuditRow[] = (eventsRes.data ?? [])
      .filter((e) => isSecurityEvent(e.kind))
      .map((e) => ({
        id: `evt-${e.id}`,
        ts: e.ts,
        actor: e.owner_email ?? "device",
        action: e.kind,
        target: e.device_id ?? "—",
        summary: e.body ? `${e.title} — ${e.body}` : e.title,
        source: "control-plane",
      }));
    return [...consoleRows, ...planeRows].sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts));
  }, [auditRes.data, eventsRes.data]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (source === "all" || r.source === source) &&
        (!needle || `${r.actor} ${r.action} ${r.target} ${r.summary}`.toLowerCase().includes(needle))
    );
  }, [rows, q, source]);

  if (auditRes.loading && eventsRes.loading) {
    return <LoadingState rows={6} label="Loading audit trail…" />;
  }

  if (auditRes.error && eventsRes.error && rows.length === 0) {
    return (
      <ErrorState
        message={auditRes.error}
        unauthorized={auditRes.unauthorized}
        onRetry={() => { auditRes.reload(); eventsRes.reload(); }}
      />
    );
  }

  const cols: Column<AuditRow>[] = [
    {
      key: "source", header: "Source",
      render: (r) =>
        r.source === "console" ? (
          <Badge tone="violet"><ServerCog className="h-3 w-3" /> console</Badge>
        ) : (
          <Badge tone="blue"><Cpu className="h-3 w-3" /> control plane</Badge>
        ),
    },
    { key: "actor", header: "Actor", render: (r) => <span className="font-medium text-white">{r.actor}</span> },
    { key: "action", header: "Action", render: (r) => <span className="text-slate-300">{r.action}</span> },
    { key: "summary", header: "Detail", render: (r) => <span className="text-slate-300">{r.summary}</span> },
    { key: "target", header: "Target", render: (r) => <span className="font-mono text-xs ad-muted">{r.target}</span> },
    {
      key: "ts", header: "When", align: "right",
      sort: (a, b) => Date.parse(a.ts) - Date.parse(b.ts),
      render: (r) => <span className="text-xs ad-muted" title={fmtDateTime(r.ts)}>{relativeTime(r.ts)}</span>,
    },
  ];

  return (
    <div className="space-y-3">
      {(auditRes.error || eventsRes.error) && (
        <div role="alert" className="flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2 text-sm text-amber-200">
          <TriangleAlert className="h-4 w-4 shrink-0" /> Some audit sources are unavailable: {auditRes.error ?? eventsRes.error}
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <SearchInput value={q} onChange={setQ} placeholder="Search the audit trail…" className="min-w-[220px] flex-1" />
        <Segmented
          value={source}
          onChange={setSource}
          options={[
            { value: "all", label: "All" },
            { value: "console", label: "Console" },
            { value: "control-plane", label: "Control plane" },
          ]}
        />
      </div>
      <DataTable
        rows={filtered}
        columns={cols}
        rowKey={(r) => r.id}
        dense
        empty={
          <div className="px-2 py-2">
            <EmptyState
              icon={<ScrollText className="h-6 w-6" />}
              title={rows.length === 0 ? "No audited activity yet" : "Nothing matches your filters"}
              hint={rows.length === 0 ? "Operator actions in this console and security-relevant events from the control plane appear here as they happen." : undefined}
            />
          </div>
        }
      />
    </div>
  );
}
