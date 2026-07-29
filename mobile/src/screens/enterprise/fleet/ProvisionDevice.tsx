import React, { useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text } from "react-native";
import type { AdminUser, ProvisionResult } from "../../../api";
import { api } from "../../../api";
import { Screen, useTheme, useToast, ToastHost } from "../../../ui";
import { ActionButton, Callout, CopyField, MetricRow, SelectField, TextField } from "../../../enterprise-ui";
import { AccessRequired, FleetError, FleetLoading, FleetScaffold } from "./parts";
import { errorText, loadAdminUsers, uniqueTypes, unwrap, useFleetBundle } from "./useFleet";

export default function ProvisionDevice({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const fleet = useFleetBundle(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [type, setType] = useState("aquaguard");
  const [name, setName] = useState("");
  const [owner, setOwner] = useState("none");
  const [busy, setBusy] = useState("");
  const [result, setResult] = useState<ProvisionResult | null>(null);
  const [token, setToken] = useState("");

  useEffect(() => { loadAdminUsers().then(setUsers).catch(() => setUsers([])); }, []);
  const typeOptions = useMemo(() => uniqueTypes(fleet.data?.devices || []).map((t) => ({ value: t, label: t, icon: "device" as const })), [fleet.data?.devices]);
  const ownerId = owner === "none" ? undefined : Number(owner);

  async function provisionSecret() {
    setBusy("secret"); setResult(null);
    try {
      const res = await unwrap(api.adminProvision({ type, name: name.trim() || undefined, owner_id: ownerId }), "Provisioning failed");
      setResult(res); toast.show("Device identity minted", "success");
    } catch (e) { toast.show(errorText(e), "error"); }
    finally { setBusy(""); }
  }

  async function provisionToken() {
    setBusy("token"); setToken("");
    try {
      const res = await unwrap(api.provisioningToken(type, name.trim() || type), "Token request failed");
      if (res.error) throw new Error(res.error);
      setToken(res.token); toast.show("Provisioning token created", "success");
    } catch (e) { toast.show(errorText(e), "error"); }
    finally { setBusy(""); }
  }

  if (fleet.loading) return <Screen><FleetScaffold title="Provision device" subtitle="Loading fleet types" onBack={onBack}><FleetLoading /></FleetScaffold></Screen>;
  if (fleet.adminBlocked) return <Screen><FleetScaffold title="Provision device" subtitle="Admin-only" onBack={onBack} onRefresh={fleet.reload}><AccessRequired onRetry={fleet.reload} /></FleetScaffold></Screen>;
  if (fleet.error && !fleet.data) return <Screen><FleetScaffold title="Provision device" subtitle="Mint identity" onBack={onBack} onRefresh={fleet.reload}><FleetError message={fleet.error} onRetry={fleet.reload} /></FleetScaffold></Screen>;

  return (
    <Screen>
      <FleetScaffold title="Provision device" subtitle="Mint a device identity" onBack={onBack} onRefresh={fleet.reload}>
        <ScrollView refreshControl={<RefreshControl refreshing={fleet.refreshing} onRefresh={fleet.refresh} tintColor={c.accent} />} contentContainerStyle={{ padding: 16, paddingBottom: 36, gap: 14 }}>
          <Callout kind="info" icon="provision" text="Provisioning tokens are safer for A+B onboarding because they do not expose the long-lived device key. Direct credentials are for controlled bench setup." />
          <SelectField label="Device type" value={type} options={typeOptions} onChange={setType} />
          <TextField label="Display name" value={name} onChange={setName} placeholder="e.g. Pump room controller" />
          <SelectField label="Owner" value={owner} options={[{ value: "none", label: "Unassigned", icon: "users" }, ...users.map((u) => ({ value: String(u.id), label: u.email, icon: "profile" as const }))]} onChange={setOwner} help="Users are loaded from the admin users endpoint when available." />
          <ActionButton label="Create safer onboarding token" icon="keyVariant" onPress={provisionToken} busy={busy === "token"} outline />
          <ActionButton label="Mint device credentials" icon="provision" onPress={provisionSecret} busy={busy === "secret"} />

          {token ? (
            <>
              <Text style={{ color: c.text, fontWeight: "900", fontSize: 16 }}>Short-lived onboarding token</Text>
              <CopyField label="Provisioning token" value={token} />
            </>
          ) : null}

          {result ? (
            <>
              <Callout kind="warning" icon="warning" title="Shown once" text="The device key and MQTT password are displayed once and cannot be recovered after this screen is dismissed. Select and copy them now." />
              <MetricRow label="Device id" value={result.id} icon="device" mono />
              <CopyField label="Device key" value={result.key} secret />
              <CopyField label="MQTT username" value={result.mqttUsername} />
              <CopyField label="MQTT password" value={result.mqttPassword} secret />
            </>
          ) : null}
        </ScrollView>
        <ToastHost toast={toast.toast} onHide={toast.hide} />
      </FleetScaffold>
    </Screen>
  );
}
