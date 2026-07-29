import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { api, type AdminDevice } from "../../../api";
import { API_BASE } from "../../../config";
import { Card, ToastHost, useTheme, useToast } from "../../../ui";
import { ActionButton, Callout, ConfirmDialog, MetricRow, Stepper, TextField } from "../../../enterprise-ui";
import { createStore, fleetHealth, formatDateTime } from "../../../enterprise";
import { unwrap, useAdminResource, type AdminIdentity } from "./useAdmin";
import { AdminScreenFrame, IdentityCard, ScreenGate, SectionTitle, SourceNote } from "./parts";
import { auditStore, clearLocalAudit, recordAdminAction } from "./auditLog";

interface AdminPrefs {
  orgName: string;
  defaultRoom: string;
  staleMinutes: number;
  defaultOtaUrl: string;
  localAuditRetentionDays: number;
}

const DEFAULT_PREFS: AdminPrefs = { orgName: "Circuvent", defaultRoom: "Living Room", staleMinutes: 15, defaultOtaUrl: "", localAuditRetentionDays: 90 };
export const adminPrefsStore = createStore<AdminPrefs>("enterprise-admin-preferences-v1", DEFAULT_PREFS);
const localRolesStore = createStore<{ byUserId: Record<string, string> }>("enterprise-admin-local-roles-v1", { byUserId: {} });

interface SettingsData { me: AdminIdentity; prefs: AdminPrefs; devices: AdminDevice[] }

async function loadSettings(me: AdminIdentity): Promise<SettingsData> {
  const [prefs, devices] = await Promise.all([
    adminPrefsStore.load(),
    unwrap(api.adminDevices(), "Unable to load devices for stale-threshold preview."),
  ]);
  return { me, prefs, devices: devices.devices };
}

export default function OrgSettings({ onBack }: { onBack: () => void }) {
  const loader = useCallback((me: AdminIdentity) => loadSettings(me), []);
  const { state, refresh } = useAdminResource(loader);
  return <ScreenGate state={state} onBack={onBack} onRetry={refresh}>{(data) => <SettingsReady data={data} refreshing={state.refreshing} onRefresh={refresh} onBack={onBack} />}</ScreenGate>;
}

function SettingsReady({ data, refreshing, onRefresh, onBack }: { data: SettingsData; refreshing: boolean; onRefresh: () => void; onBack: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const [prefs, setPrefs] = useState<AdminPrefs>(data.prefs);
  const [saved, setSaved] = useState(data.prefs);
  const [health, setHealth] = useState<{ ok: boolean; ms: number; at: string; raw: unknown } | null>(null);
  const [testing, setTesting] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const preview = useMemo(() => fleetHealth(data.devices, prefs.staleMinutes * 60_000), [data.devices, prefs.staleMinutes]);
  const dirty = JSON.stringify(prefs) !== JSON.stringify(saved);

  useEffect(() => { setPrefs(data.prefs); setSaved(data.prefs); }, [data.prefs]);

  const save = async () => {
    await adminPrefsStore.save(prefs);
    setSaved(prefs);
    await recordAdminAction({ action: "settings.updated", title: "Device-local admin preferences updated", body: "Organisation display preferences were updated on this device.", actorUid: data.me.uid, actorEmail: data.me.email, severity: "success", payload: { keys: Object.keys(prefs) } });
    toast.show("Settings saved on this device.", "success");
  };

  const testConnection = async () => {
    setTesting(true);
    const start = Date.now();
    try {
      const res = await api.health();
      const ms = Date.now() - start;
      setHealth({ ok: res.ok, ms, at: new Date().toISOString(), raw: res.data });
      toast.show(res.ok ? "Connection test succeeded." : "Connection test returned an error.", res.ok ? "success" : "warning");
    } catch (e) {
      setHealth({ ok: false, ms: Date.now() - start, at: new Date().toISOString(), raw: { error: (e as Error).message } });
      toast.show("Connection test failed.", "error");
    } finally {
      setTesting(false);
    }
  };

  const clearLocal = async () => {
    await Promise.all([
      adminPrefsStore.save(DEFAULT_PREFS),
      localRolesStore.save({ byUserId: {} }),
      clearLocalAudit(),
    ]);
    setPrefs(DEFAULT_PREFS);
    setSaved(DEFAULT_PREFS);
    await recordAdminAction({ action: "local.storage.cleared", title: "Local administration storage cleared", body: "Admin preferences, local role labels and prior local audit records were cleared on this device.", actorUid: data.me.uid, actorEmail: data.me.email, severity: "warning" });
    setClearOpen(false);
    toast.show("Local administration storage cleared.", "success");
  };

  return (
    <AdminScreenFrame title="Organisation Settings" subtitle="Control-plane connection and device-local preferences" onBack={onBack} refreshing={refreshing} onRefresh={onRefresh}>
      <IdentityCard me={data.me} />
      <SectionTitle icon="globe" title="Control-plane connection" subtitle="Auth token is never rendered" />
      <Card style={{ marginBottom: 14 }}>
        <MetricRow label="Base URL" value={API_BASE} icon="globe" mono />
        <MetricRow label="Signed-in admin" value={data.me.email} icon="profile" />
        <MetricRow label="Token" value="Stored by auth layer; not displayed here" icon="lock" last />
        <ActionButton label="Test connection" icon="ping" busy={testing} onPress={testConnection} />
        {health ? <View style={{ marginTop: 12 }}><MetricRow label="Result" value={health.ok ? "ok" : "not ok"} icon={health.ok ? "success" : "alert"} tint={health.ok ? c.green : c.red} /><MetricRow label="Round trip" value={`${health.ms} ms`} icon="latency" /><MetricRow label="Measured" value={formatDateTime(health.at)} icon="clock" last /></View> : null}
      </Card>

      <SectionTitle icon="settings" title="Device-local operator preferences" subtitle="Stored on this phone, not on the server" />
      <Card style={{ marginBottom: 14 }}>
        <TextField label="Organisation display name" value={prefs.orgName} onChange={(orgName) => setPrefs((p) => ({ ...p, orgName }))} placeholder="Organisation name" autoCapitalize="words" help="Device-local label used by administration screens." />
        <TextField label="Default room for new devices" value={prefs.defaultRoom} onChange={(defaultRoom) => setPrefs((p) => ({ ...p, defaultRoom }))} placeholder="Room name" autoCapitalize="words" help="Stored locally as an operator preference; provisioning APIs still receive explicit values." />
        <Stepper label="Stale-device threshold" value={prefs.staleMinutes} onChange={(staleMinutes) => setPrefs((p) => ({ ...p, staleMinutes }))} min={1} max={1440} step={5} unit="min" help={`Preview with current /admin/devices data: ${preview.stale} stale of ${data.devices.length} devices.`} />
        <TextField label="Default OTA image URL" value={prefs.defaultOtaUrl} onChange={(defaultOtaUrl) => setPrefs((p) => ({ ...p, defaultOtaUrl }))} placeholder="https://..." keyboardType="url" help="Stored locally as a default pointer for OTA workflows; it is not uploaded until an OTA action is explicitly performed." />
        <Stepper label="Local audit retention preference" value={prefs.localAuditRetentionDays} onChange={(localAuditRetentionDays) => setPrefs((p) => ({ ...p, localAuditRetentionDays }))} min={1} max={365} step={7} unit="days" help="Preference only. Server events are fetched live and are not controlled by this setting." />
        <ActionButton label="Save device-local preferences" icon="save" disabled={!dirty} onPress={save} />
      </Card>

      <SectionTitle icon="warning" title="Danger zone" subtitle="Local to this administration module" />
      <Callout kind="warning" title="What will be lost" text="Clearing local administration storage removes this device's organisation display preferences, local role labels, and prior local admin-action records. It does not delete users, devices, server events, or the hidden auth token." icon="warning" />
      <ActionButton label="Clear local administration storage" icon="trash" tone={c.red} outline onPress={() => setClearOpen(true)} />
      <ConfirmDialog visible={clearOpen} title="Clear local administration storage?" message="This will reset organisation display name, default room, stale threshold, default OTA URL, local role labels, and local admin-action records stored on this device. Server data and auth token are not cleared." confirmLabel="Clear local data" destructive onCancel={() => setClearOpen(false)} onConfirm={clearLocal} />
      <ToastHost toast={toast.toast} onHide={toast.hide} />
    </AdminScreenFrame>
  );
}
