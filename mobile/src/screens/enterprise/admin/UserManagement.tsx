import React, { useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api, type AdminDevice, type AdminUser } from "../../../api";
import { Avatar, Card, ToastHost, useTheme, useToast } from "../../../ui";
import { ActionButton, BottomSheet, CodeBlock, ConfirmDialog, DataGrid, FilterBar, MetricRow, Pill, SearchField } from "../../../enterprise-ui";
import { formatDateTime, formatRelative, toCsv } from "../../../enterprise";
import { unwrap, useAdminResource, type AdminIdentity } from "./useAdmin";
import { AdminScreenFrame, IdentityCard, ScreenGate, SectionTitle, SourceNote, ownerLabel } from "./parts";
import { recordAdminAction } from "./auditLog";

type UserFilter = "all" | "admins" | "standard" | "hasDevices" | "noDevices";

interface UserData {
  users: AdminUser[];
  devices: AdminDevice[];
}

async function loadUsers(): Promise<UserData> {
  const [users, devices] = await Promise.all([
    unwrap(api.adminUsers(), "Unable to load users."),
    unwrap(api.adminDevices(), "Unable to load devices."),
  ]);
  return { users: users.users, devices: devices.devices };
}

export default function UserManagement({ onBack }: { onBack: () => void }) {
  const loader = useCallback(() => loadUsers(), []);
  const { state, refresh } = useAdminResource(loader);
  return (
    <ScreenGate state={state} onBack={onBack} onRetry={refresh}>
      {(data) => <UserManagementReady data={data} me={state.me!} refreshing={state.refreshing} onRefresh={refresh} onBack={onBack} />}
    </ScreenGate>
  );
}

function UserManagementReady({ data, me, refreshing, onRefresh, onBack }: { data: UserData; me: AdminIdentity; refreshing: boolean; onRefresh: () => void; onBack: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<UserFilter>("all");
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [confirm, setConfirm] = useState<{ type: "role" | "delete"; user: AdminUser; next?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const counts = useMemo<Record<UserFilter, number>>(() => ({
    all: data.users.length,
    admins: data.users.filter((u) => u.is_admin).length,
    standard: data.users.filter((u) => !u.is_admin).length,
    hasDevices: data.users.filter((u) => u.devices > 0).length,
    noDevices: data.users.filter((u) => u.devices === 0).length,
  }), [data.users]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return data.users.filter((u) => {
      const matches = !q || `${u.name} ${u.email}`.toLowerCase().includes(q);
      const inFilter = filter === "all" || (filter === "admins" && u.is_admin) || (filter === "standard" && !u.is_admin) || (filter === "hasDevices" && u.devices > 0) || (filter === "noDevices" && u.devices === 0);
      return matches && inFilter;
    });
  }, [data.users, filter, query]);

  const devicesFor = useCallback((user: AdminUser) => data.devices.filter((d) => d.owner_id === user.id), [data.devices]);
  const csv = useMemo(() => toCsv(visible.map((u) => ({ id: u.id, name: u.name, email: u.email, is_admin: u.is_admin, devices: u.devices, created_at: u.created_at }))), [visible]);

  const performRole = async (user: AdminUser, next: boolean) => {
    if (!next && user.is_admin && counts.admins <= 1) {
      toast.show("Cannot remove the last remaining administrator.", "warning");
      return;
    }
    setBusy(true);
    try {
      const res = await unwrap(api.adminSetRole(user.id, next), "Unable to update administrator flag.");
      if (res.success) {
        await recordAdminAction({ action: "role.changed", title: next ? "Administrator flag enabled" : "Administrator flag disabled", body: `${user.email} was ${next ? "promoted" : "demoted"}. Server permission primitive changed: is_admin=${String(next)}.`, actorUid: me.uid, actorEmail: me.email, targetId: String(user.id), targetLabel: user.email, severity: next ? "success" : "warning", payload: { user_id: user.id, is_admin: next } });
        toast.show("User updated.", "success");
        setSelected(null);
        onRefresh();
      }
    } catch (e) {
      toast.show((e as Error).message, "error");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const performDelete = async (user: AdminUser) => {
    setBusy(true);
    const owned = devicesFor(user).length;
    try {
      const res = await unwrap(api.adminDeleteUser(user.id), "Unable to delete user.");
      if (res.success) {
        await recordAdminAction({ action: "user.deleted", title: "User deleted", body: `${user.email} was deleted after confirmation. They owned ${owned} device(s) at the time of deletion.`, actorUid: me.uid, actorEmail: me.email, targetId: String(user.id), targetLabel: user.email, severity: "warning", payload: { user_id: user.id, devices_owned: owned } });
        toast.show("User deleted.", "success");
        setSelected(null);
        onRefresh();
      }
    } catch (e) {
      toast.show((e as Error).message, "error");
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  const columns = [
    { key: "identity", header: "User", width: 230, render: (u: AdminUser) => <View style={{ flexDirection: "row", gap: 10, alignItems: "center" }}><Avatar name={u.name || u.email} size={34} /><View><Text style={{ color: c.text, fontWeight: "800" }} numberOfLines={1}>{u.name || "Unnamed user"}</Text><Text style={{ color: c.faint, fontSize: 12 }} numberOfLines={1}>{u.email}</Text></View></View>, sortValue: (u: AdminUser) => u.name || u.email },
    { key: "admin", header: "Admin", width: 110, render: (u: AdminUser) => <Pill label={u.is_admin ? "is_admin" : "standard"} color={u.is_admin ? c.green : c.faint} icon={u.is_admin ? "shieldLock" : "profile"} />, sortValue: (u: AdminUser) => (u.is_admin ? 1 : 0) },
    { key: "devices", header: "Devices", width: 95, align: "right" as const, render: (u: AdminUser) => <Text style={{ color: c.text, fontWeight: "800" }}>{u.devices}</Text>, sortValue: (u: AdminUser) => u.devices },
    { key: "created", header: "Created", width: 130, render: (u: AdminUser) => <Text style={{ color: c.textDim }}>{formatRelative(u.created_at)}</Text>, sortValue: (u: AdminUser) => new Date(u.created_at).getTime() },
  ];

  const confirmMessage = confirm?.type === "role"
    ? `${confirm.next ? "Enable" : "Disable"} the server-enforced is_admin flag for ${confirm.user.email}?${confirm.user.id === me.uid && confirm.user.is_admin && !confirm.next ? " You are demoting your own signed-in account; access may be lost immediately." : ""}`
    : confirm ? `Delete ${confirm.user.email}? They currently own ${devicesFor(confirm.user).length} device(s). This is destructive.` : "";

  return (
    <AdminScreenFrame title="User Management" subtitle="Real accounts and the server is_admin flag" onBack={onBack} refreshing={refreshing} onRefresh={onRefresh} actions={[{ icon: "exportFile", label: "Export visible users", onPress: () => setCsvOpen(true) }]}>
      <IdentityCard me={me} />
      <SourceNote text="Source: /admin/users joined with /admin/devices by owner_id. The only server permission primitive changed here is is_admin." />
      <SearchField value={query} onChange={setQuery} placeholder="Search users by name or email" />
      <FilterBar<UserFilter> value={filter} onChange={setFilter} counts={counts} options={[{ value: "all", label: "All", icon: "users" }, { value: "admins", label: "Admins", icon: "shieldLock", color: c.green }, { value: "standard", label: "Standard", icon: "profile" }, { value: "hasDevices", label: "Has devices", icon: "devices" }, { value: "noDevices", label: "No devices", icon: "empty" }]} />
      <DataGrid columns={columns} rows={visible} keyOf={(u) => String(u.id)} onRowPress={setSelected} emptyText="No users match the current filter." />

      <BottomSheet visible={!!selected} onClose={() => setSelected(null)} title={selected?.email || "User detail"}>
        {selected ? <>
          <Card style={{ marginBottom: 12 }}>
            <MetricRow label="Name" value={selected.name || "—"} icon="profile" />
            <MetricRow label="Email" value={selected.email} icon="mail" />
            <MetricRow label="Server admin flag" value={selected.is_admin ? "is_admin=true" : "is_admin=false"} icon="shieldLock" tint={selected.is_admin ? c.green : c.text} />
            <MetricRow label="Created" value={formatDateTime(selected.created_at)} icon="calendar" />
            <MetricRow label="Owned devices" value={String(devicesFor(selected).length)} icon="devices" last />
          </Card>
          <SectionTitle icon="devices" title="Devices owned by this user" subtitle="Joined from /admin/devices owner_id" />
          {devicesFor(selected).length ? devicesFor(selected).map((d) => <Card key={d.id} style={{ marginBottom: 8 }}><MetricRow label={d.name || d.id} value={d.type} icon="device" /><MetricRow label="Room" value={d.room || "—"} icon="rooms" /><MetricRow label="Owner" value={ownerLabel(d.owner_email, d.owner_id)} icon="profile" last /></Card>) : <Card><Text style={{ color: c.faint }}>No devices are assigned to this user.</Text></Card>}
          <View style={{ height: 12 }} />
          <ActionButton label={selected.is_admin ? "Disable is_admin" : "Enable is_admin"} icon={selected.is_admin ? "unlock" : "shieldLock"} tone={selected.is_admin ? c.amber : c.green} onPress={() => setConfirm({ type: "role", user: selected, next: !selected.is_admin })} />
          <View style={{ height: 10 }} />
          <ActionButton label="Delete user" icon="trash" tone={c.red} outline onPress={() => setConfirm({ type: "delete", user: selected })} />
        </> : null}
      </BottomSheet>

      <BottomSheet visible={csvOpen} onClose={() => setCsvOpen(false)} title="Visible users CSV">
        <SourceNote text="Copyable CSV generated from the currently visible /admin/users rows. No file-share library is installed." />
        <CodeBlock text={csv} label="users.csv" maxHeight={420} />
      </BottomSheet>

      <ConfirmDialog visible={!!confirm} title={confirm?.type === "delete" ? "Delete user" : "Change administrator flag"} message={confirmMessage} destructive={confirm?.type === "delete" || confirm?.next === false} confirmLabel={confirm?.type === "delete" ? "Delete" : "Apply"} busy={busy} onCancel={() => !busy && setConfirm(null)} onConfirm={() => confirm?.type === "delete" ? performDelete(confirm.user) : confirm ? performRole(confirm.user, !!confirm.next) : undefined} />
      <ToastHost toast={toast.toast} onHide={toast.hide} />
    </AdminScreenFrame>
  );
}
