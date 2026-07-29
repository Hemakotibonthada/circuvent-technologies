import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import type { AdminDeviceDetail, TelemetryRow } from "../../../api";
import { api } from "../../../api";
import { bucketSeries, formatDateTime, formatRelative, numericSeries, statsOf, telemetryFields } from "../../../enterprise";
import { LineChart } from "../../../charts";
import { Screen, useTheme, useToast, ToastHost } from "../../../ui";
import { ActionButton, BottomSheet, Callout, CodeBlock, ConfirmDialog, MetricRow, SelectField, TextField } from "../../../enterprise-ui";
import { FleetError, FleetLoading, FleetScaffold, InlineActions, JsonPreview } from "./parts";
import { errorText, summarizeJson, unwrap } from "./useFleet";

type DetailState = { loading: boolean; refreshing: boolean; error: string | null; device: AdminDeviceDetail | null; rows: TelemetryRow[] };

export default function DeviceDetail({ id, onBack }: { id: string; onBack: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const [state, setState] = useState<DetailState>({ loading: true, refreshing: false, error: null, device: null, rows: [] });
  const [field, setField] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [cmdOpen, setCmdOpen] = useState(false);
  const [otaOpen, setOtaOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [name, setName] = useState("");
  const [room, setRoom] = useState("");
  const [owner, setOwner] = useState("");
  const [command, setCommand] = useState(JSON.stringify({ action: "state" }, null, 2));
  const [cmdError, setCmdError] = useState("");
  const [otaUrl, setOtaUrl] = useState("");
  const [otaVersion, setOtaVersion] = useState("");
  const [busy, setBusy] = useState("");

  const load = useCallback(async (refreshing = false) => {
    setState((s) => ({ ...s, loading: !s.device && !refreshing, refreshing, error: null }));
    try {
      const [d, t] = await Promise.all([unwrap(api.adminDevice(id), "Unable to load device"), unwrap(api.adminDeviceTelemetry(id, 200), "Unable to load telemetry").catch(() => ({ telemetry: [] }))]);
      setState({ loading: false, refreshing: false, error: null, device: d.device, rows: t.telemetry || [] });
      setName(d.device.name || ""); setRoom(d.device.room || ""); setOwner(d.device.owner_id == null ? "" : String(d.device.owner_id));
    } catch (e) {
      setState((s) => ({ ...s, loading: false, refreshing: false, error: errorText(e, "Unable to load device") }));
    }
  }, [id]);

  useEffect(() => { load(false); }, [load]);
  const fields = useMemo(() => telemetryFields(state.rows), [state.rows]);
  useEffect(() => { if (!field && fields.length) setField(fields[0]); }, [field, fields]);
  const points = useMemo(() => field ? numericSeries(state.rows, field) : [], [state.rows, field]);
  const bucketed = useMemo(() => bucketSeries(points, Math.min(48, Math.max(8, points.length || 8))), [points]);
  const stats = useMemo(() => statsOf(points), [points]);

  async function saveIdentity() {
    setBusy("save");
    try { await unwrap(api.adminPatchDevice(id, { name: name.trim() || undefined, room: room.trim() || undefined, owner_id: owner.trim() ? Number(owner.trim()) : null }), "Unable to update device"); setEditOpen(false); toast.show("Device identity updated", "success"); load(true); }
    catch (e) { toast.show(errorText(e), "error"); }
    finally { setBusy(""); }
  }

  function parseCommand(): Record<string, unknown> | null {
    try { const parsed = JSON.parse(command); if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Command must be a JSON object"); setCmdError(""); return parsed as Record<string, unknown>; }
    catch (e) { setCmdError(errorText(e, "Invalid JSON")); return null; }
  }

  async function sendCommand(cmd: Record<string, unknown>, label: string) {
    setBusy(label);
    try { await unwrap(api.adminCommand(id, cmd), `${label} failed`); toast.show(`${label} dispatched`, "success"); }
    catch (e) { toast.show(errorText(e), "error"); }
    finally { setBusy(""); }
  }

  async function sendRaw() { const parsed = parseCommand(); if (!parsed) return; await sendCommand(parsed, "Command"); setCmdOpen(false); }
  async function sendOta() { setBusy("ota"); try { await unwrap(api.adminOta(id, otaUrl.trim(), otaVersion.trim() || undefined), "OTA dispatch failed"); toast.show("OTA dispatched to device", "success"); setOtaOpen(false); } catch (e) { toast.show(errorText(e), "error"); } finally { setBusy(""); } }
  async function deleteDevice() { setBusy("delete"); try { await unwrap(api.adminDeleteDevice(id), "Delete failed"); toast.show("Device deleted", "success"); onBack(); } catch (e) { toast.show(errorText(e), "error"); } finally { setBusy(""); } }

  if (state.loading) return <Screen><FleetScaffold title="Device detail" subtitle={id} onBack={onBack}><FleetLoading text="Loading device…" /></FleetScaffold></Screen>;
  if (state.error && !state.device) return <Screen><FleetScaffold title="Device detail" subtitle={id} onBack={onBack} onRefresh={() => load(false)}><FleetError message={state.error} onRetry={() => load(false)} /></FleetScaffold></Screen>;
  const d = state.device;
  if (!d) return <Screen><FleetScaffold title="Device detail" subtitle={id} onBack={onBack}><Callout kind="info" text="The device was not returned by the control plane." /></FleetScaffold></Screen>;

  return (
    <Screen>
      <FleetScaffold title={d.name || d.id} subtitle={`${d.type} · ${d.online ? "online" : "offline"}`} onBack={onBack} onRefresh={() => load(false)} actions={[{ icon: "edit", label: "Edit identity", onPress: () => setEditOpen(true) }, { icon: "terminal", label: "Command", onPress: () => setCmdOpen(true) }]}>
        <ScrollView refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={() => load(true)} tintColor={c.accent} />} contentContainerStyle={{ padding: 16, paddingBottom: 34, gap: 14 }}>
          {state.error ? <Callout kind="warning" text={state.error} icon="warning" /> : null}
          <View style={{ gap: 8 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: "900" }}>Identity</Text>
            <MetricRow label="Device id" value={d.id} icon="device" mono />
            <MetricRow label="Type" value={d.type || "—"} icon="topic" />
            <MetricRow label="Owner" value={d.owner_email || (d.owner_id == null ? "Unassigned" : String(d.owner_id))} icon="users" />
            <MetricRow label="Room" value={d.room || "—"} icon="rooms" />
            <MetricRow label="Created" value={formatDateTime(d.created_at)} icon="calendar" />
            <MetricRow label="Last seen" value={formatRelative(d.last_seen)} icon="clock" />
            <MetricRow label="Firmware" value={d.fw_version || "unknown"} icon="firmware" />
            <MetricRow label="Online" value={d.online ? "yes" : "no"} icon={d.online ? "online" : "offline"} last />
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: "900" }}>Actions</Text>
            <InlineActions>
              <ActionButton label="Reboot" icon="power" onPress={() => sendCommand({ action: "reboot" }, "Reboot")} busy={busy === "Reboot"} />
              <ActionButton label="Identify" icon="signal" onPress={() => sendCommand({ action: "identify" }, "Identify")} busy={busy === "Identify"} outline />
              <ActionButton label="OTA" icon="otaUpdate" onPress={() => setOtaOpen(true)} outline />
              <ActionButton label="Delete" icon="trash" tone="danger" onPress={() => setDeleteOpen(true)} outline />
            </InlineActions>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: "900" }}>Live state</Text>
            {Object.entries(d.state || {}).length ? Object.entries(d.state || {}).map(([k, v], i, arr) => typeof v === "object" && v !== null ? <JsonPreview key={k} label={k} value={v} /> : <MetricRow key={k} label={k} value={summarizeJson(v)} icon="activity" last={i === arr.length - 1} />) : <Callout kind="info" text="This device has not reported state fields yet." />}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: "900" }}>Telemetry explorer</Text>
            {fields.length ? <SelectField label="Numeric field" value={field} options={fields.map((f) => ({ value: f, label: f, icon: "charts" }))} onChange={setField} /> : <Callout kind="info" text="No numeric telemetry fields were found in the latest 200 frames." />}
            {field && bucketed.length ? <LineChart data={bucketed.map((p) => p.v)} color={c.accentHi} height={180} /> : null}
            {field && points.length ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {[ ["min", stats.min], ["avg", stats.avg], ["max", stats.max], ["last", stats.last] ].map(([label, value]) => <View key={String(label)} style={{ minWidth: 92, flex: 1 }}><MetricRow label={String(label)} value={Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })} /></View>)}
            </View> : null}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={{ color: c.text, fontSize: 16, fontWeight: "900" }}>Raw payloads</Text>
            {state.rows.slice(0, 20).map((r) => <CodeBlock key={r.ts} label={formatDateTime(r.ts)} text={JSON.stringify(r.payload, null, 2)} maxHeight={160} />)}
            {!state.rows.length ? <Callout kind="info" text="No telemetry frames were returned for this device." /> : null}
          </View>
        </ScrollView>

        <BottomSheet visible={editOpen} onClose={() => setEditOpen(false)} title="Edit identity" footer={<ActionButton label="Save" icon="save" onPress={saveIdentity} busy={busy === "save"} />}>
          <TextField label="Name" value={name} onChange={setName} />
          <TextField label="Room" value={room} onChange={setRoom} />
          <TextField label="Owner id" value={owner} onChange={setOwner} keyboardType="number-pad" help="Leave blank to unassign. Owner id is an admin control-plane identifier." />
        </BottomSheet>
        <BottomSheet visible={cmdOpen} onClose={() => setCmdOpen(false)} title="Send JSON command" footer={<ActionButton label="Dispatch command" icon="send" onPress={sendRaw} busy={busy === "Command"} />}>
          <TextField label="Command JSON" value={command} onChange={(v) => { setCommand(v); setCmdError(""); }} multiline error={cmdError} />
        </BottomSheet>
        <BottomSheet visible={otaOpen} onClose={() => setOtaOpen(false)} title="Single-device OTA" footer={<ActionButton label="Dispatch OTA" icon="otaUpdate" onPress={sendOta} busy={busy === "ota"} disabled={!otaUrl.trim()} />}>
          <TextField label="Image URL" value={otaUrl} onChange={setOtaUrl} autoCapitalize="none" />
          <TextField label="Target version" value={otaVersion} onChange={setOtaVersion} autoCapitalize="none" />
        </BottomSheet>
        <ConfirmDialog visible={deleteOpen} title="Delete device?" message={`Delete ${d.name || d.id} from the fleet? This is destructive.`} confirmLabel="Delete" destructive busy={busy === "delete"} onConfirm={deleteDevice} onCancel={() => setDeleteOpen(false)} />
        <ToastHost toast={toast.toast} onHide={toast.hide} />
      </FleetScaffold>
    </Screen>
  );
}

