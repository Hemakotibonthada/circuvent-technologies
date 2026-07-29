import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { api, type AdminUser } from "../../../api";
import { Card, ToastHost, useTheme, useToast } from "../../../ui";
import { ActionButton, DataGrid, MetricRow, Pill, SelectField } from "../../../enterprise-ui";
import { createStore, permissionsFor, ROLE_DESCRIPTION, ROLE_LABEL, ROLE_ORDER, type Permission, type Role } from "../../../enterprise";
import { unwrap, useAdminResource } from "./useAdmin";
import { AdminScreenFrame, HonestRbacCallout, ScreenGate, SectionTitle, SourceNote } from "./parts";

interface RoleAssignments { byUserId: Record<string, Role> }
const roleStore = createStore<RoleAssignments>("enterprise-admin-local-roles-v1", { byUserId: {} });

async function loadRoleUsers(): Promise<{ users: AdminUser[]; local: RoleAssignments }> {
  const [users, local] = await Promise.all([
    unwrap(api.adminUsers(), "Unable to load users."),
    roleStore.load(),
  ]);
  return { users: users.users, local };
}

export default function RolesAndAccess({ onBack, openUsers }: { onBack: () => void; openUsers?: () => void }) {
  const loader = useCallback(() => loadRoleUsers(), []);
  const { state, refresh } = useAdminResource(loader);
  return (
    <ScreenGate state={state} onBack={onBack} onRetry={refresh}>
      {(data) => <RolesReady data={data} refreshing={state.refreshing} onRefresh={refresh} onBack={onBack} openUsers={openUsers} />}
    </ScreenGate>
  );
}

function RolesReady({ data, refreshing, onRefresh, onBack, openUsers }: { data: { users: AdminUser[]; local: RoleAssignments }; refreshing: boolean; onRefresh: () => void; onBack: () => void; openUsers?: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const [assignments, setAssignments] = useState<RoleAssignments>(data.local);

  useEffect(() => setAssignments(data.local), [data.local]);

  const permissions = useMemo<Permission[]>(() => {
    const set = new Set<Permission>();
    ROLE_ORDER.forEach((r) => permissionsFor(r).forEach((p) => set.add(p)));
    return [...set];
  }, []);

  const setRole = async (user: AdminUser, role: Role) => {
    const next = { byUserId: { ...assignments.byUserId, [String(user.id)]: role } };
    setAssignments(next);
    await roleStore.save(next);
    toast.show(`Local presentation role saved for ${user.email}.`, "success");
  };

  const userRows = data.users.map((u) => ({ ...u, localRole: assignments.byUserId[String(u.id)] || (u.is_admin ? "admin" : "member") as Role }));

  return (
    <AdminScreenFrame title="Roles & Access" subtitle="Client-side presentation roles" onBack={onBack} refreshing={refreshing} onRefresh={onRefresh}>
      <HonestRbacCallout onUserManagement={openUsers} />
      <SourceNote text="Source: role definitions from src/enterprise.ts and real users from /admin/users. Assignments are stored only on this device." />

      <SectionTitle icon="role" title="Role model from enterprise.ts" subtitle="Labels tailor presentation; server permission remains is_admin." />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
        <View style={{ minWidth: 820 }}>
          <View style={{ flexDirection: "row" }}>
            <Cell text="Permission" head width={190} />
            {ROLE_ORDER.map((role) => <Cell key={role} text={ROLE_LABEL[role]} head width={126} />)}
          </View>
          {permissions.map((permission) => <View key={permission} style={{ flexDirection: "row" }}>
            <Cell text={permission} width={190} mono />
            {ROLE_ORDER.map((role) => <Cell key={`${role}-${permission}`} text={permissionsFor(role).includes(permission) ? "Allowed in app" : "Hidden"} width={126} ok={permissionsFor(role).includes(permission)} />)}
          </View>)}
        </View>
      </ScrollView>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
        {ROLE_ORDER.map((role) => <Card key={role} style={{ flex: 1, minWidth: 210 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}><Pill label={ROLE_LABEL[role]} icon={role === "owner" || role === "admin" ? "shieldLock" : "profile"} color={role === "owner" || role === "admin" ? c.green : c.accent} /><Text style={{ color: c.faint, fontSize: 12 }}>{permissionsFor(role).length} app permissions</Text></View>
          <Text style={{ color: c.textDim, marginTop: 8, lineHeight: 19 }}>{ROLE_DESCRIPTION[role]}</Text>
          <Text style={{ color: c.faint, marginTop: 8, fontSize: 12 }}>{role === "admin" || role === "owner" ? "Presentation role usually accompanies server is_admin=true, but does not grant it." : "Presentation role maps to server is_admin=false unless changed in User Management."}</Text>
        </Card>)}
      </View>

      <SectionTitle icon="users" title="Assign local role per real user" subtitle="Device-local storage; does not change server permissions" />
      <DataGrid rows={userRows} keyOf={(u) => String(u.id)} columns={[
        { key: "user", header: "User", width: 240, render: (u) => <View><Text style={{ color: c.text, fontWeight: "800" }}>{u.name || u.email}</Text><Text style={{ color: c.faint, fontSize: 12 }}>{u.email}</Text></View>, sortValue: (u) => u.email },
        { key: "server", header: "Server flag", width: 140, render: (u) => <Pill label={u.is_admin ? "is_admin=true" : "is_admin=false"} color={u.is_admin ? c.green : c.faint} icon="shieldLock" />, sortValue: (u) => u.is_admin ? 1 : 0 },
        { key: "local", header: "Local role", width: 190, render: (u) => <SelectField<Role> label="Local presentation role" value={u.localRole} onChange={(r) => setRole(u, r)} options={ROLE_ORDER.map((r) => ({ value: r, label: ROLE_LABEL[r] }))} /> },
        { key: "mapping", header: "Real mapping", width: 250, render: (u) => <Text style={{ color: c.textDim, lineHeight: 18 }}>{u.localRole === "admin" || u.localRole === "owner" ? "Label suggests admin UX; server still checks is_admin." : "Standard UX label; server admin calls remain blocked unless is_admin is true."}</Text> },
      ]} />

      <Card style={{ marginTop: 14 }}>
        <MetricRow label="Local storage" value="enterprise-admin-local-roles-v1" icon="storage" mono />
        <MetricRow label="Server roles endpoint" value="None" icon="info" />
        <MetricRow label="Real privilege control" value="/admin/users/:id is_admin" icon="shieldLock" last />
        {openUsers ? <ActionButton label="Open User Management" icon="users" onPress={openUsers} /> : null}
      </Card>
      <ToastHost toast={toast.toast} onHide={toast.hide} />
    </AdminScreenFrame>
  );
}

function Cell({ text, width, head, ok, mono }: { text: string; width: number; head?: boolean; ok?: boolean; mono?: boolean }) {
  const { c } = useTheme();
  return <View style={{ width, minHeight: 42, padding: 9, borderWidth: 1, borderColor: c.border, backgroundColor: head ? c.surfaceHi : c.card }}><Text style={{ color: head ? c.text : ok ? c.green : c.faint, fontWeight: head || ok ? "800" : "500", fontFamily: mono ? "monospace" : undefined, fontSize: 12 }}>{text}</Text></View>;
}
