import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import type { AdminDevice } from "../../../api";
import { api } from "../../../api";
import { formatDateTime, toCsv } from "../../../enterprise";
import { Screen, useTheme, useToast } from "../../../ui";
import { ActionButton, BottomSheet, Callout, CodeBlock, FilterBar, SearchField } from "../../../enterprise-ui";
import DeviceDetail from "./DeviceDetail";
import { AccessRequired, DeviceTable, FleetError, FleetLoading, FleetScaffold, FooterBar, ResultList } from "./parts";
import { deviceSearchText, fleetFilterCounts, FleetFilter, latestFirmware, matchesFleetFilter, unwrap, useFleetBundle, CommandResult } from "./useFleet";

const FILTERS = [
  { value: "all", label: "All", icon: "fleet" },
  { value: "online", label: "Online", icon: "online" },
  { value: "offline", label: "Offline", icon: "offline" },
  { value: "stale", label: "Stale", icon: "latency" },
  { value: "outdated", label: "Outdated", icon: "firmware" },
] as const;

export default function FleetInventory({ onBack }: { onBack: () => void }) {
  const { c } = useTheme();
  const toast = useToast();
  const fleet = useFleetBundle(false);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FleetFilter>("all");
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [results, setResults] = useState<CommandResult[]>([]);
  const [csv, setCsv] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const devices = fleet.data?.devices || [];
  const targetVersion = useMemo(() => latestFirmware(devices), [devices]);
  const counts = useMemo(() => fleetFilterCounts(devices, targetVersion), [devices, targetVersion]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return devices.filter((d) => matchesFleetFilter(d, filter, targetVersion)).filter((d) => !q || deviceSearchText(d).includes(q));
  }, [devices, filter, query, targetVersion]);

  const chosen = useMemo(() => devices.filter((d) => selected.has(d.id)), [devices, selected]);
  const toggle = (id: string) => setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const openRow = (d: AdminDevice) => { if (selectMode) toggle(d.id); else setDetailId(d.id); };

  async function runBulk(label: string, command: Record<string, unknown>) {
    if (!chosen.length) return;
    setBusy(label);
    const out: CommandResult[] = [];
    for (const d of chosen) {
      try { await unwrap(api.adminCommand(d.id, command), `${label} failed`); out.push({ id: d.id, ok: true, message: `${label} dispatched` }); }
      catch (e) { out.push({ id: d.id, ok: false, message: e instanceof Error ? e.message : `${label} failed` }); }
    }
    setResults(out);
    setBusy(null);
    toast.show(`${out.filter((r) => r.ok).length}/${out.length} ${label} commands dispatched`);
  }

  function exportRows() {
    const data = rows.map((d) => ({ id: d.id, name: d.name, type: d.type, room: d.room, online: d.online, fw_version: d.fw_version, owner_email: d.owner_email, last_seen: d.last_seen }));
    setCsv(toCsv(data));
  }

  if (detailId) return <DeviceDetail id={detailId} onBack={() => { setDetailId(null); fleet.refresh(); }} />;
  if (fleet.loading) return <Screen><FleetScaffold title="Fleet inventory" subtitle="Loading devices" onBack={onBack}><FleetLoading /></FleetScaffold></Screen>;
  if (fleet.adminBlocked) return <Screen><FleetScaffold title="Fleet inventory" subtitle="Admin-only" onBack={onBack} onRefresh={fleet.reload}><AccessRequired onRetry={fleet.reload} /></FleetScaffold></Screen>;
  if (fleet.error && !fleet.data) return <Screen><FleetScaffold title="Fleet inventory" subtitle="Device table" onBack={onBack} onRefresh={fleet.reload}><FleetError message={fleet.error} onRetry={fleet.reload} /></FleetScaffold></Screen>;

  return (
    <Screen>
      <FleetScaffold title="Fleet inventory" subtitle={`${rows.length} shown · ${devices.length} total`} onBack={onBack} onRefresh={fleet.reload} actions={[{ icon: selectMode ? "cancel" : "check", label: selectMode ? "Exit selection" : "Select devices", onPress: () => { setSelectMode((v) => !v); setSelected(new Set()); } }, { icon: "exportFile", label: "Export CSV", onPress: exportRows }]}>
        <ScrollView refreshControl={<RefreshControl refreshing={fleet.refreshing} onRefresh={fleet.refresh} tintColor={c.accent} />} contentContainerStyle={{ padding: 16, paddingBottom: selectMode ? 170 : 32, gap: 12 }}>
          {fleet.error ? <Callout kind="warning" text={fleet.error} icon="warning" /> : null}
          <SearchField value={query} onChange={setQuery} placeholder="Search id, name, type, room or owner" />
          <FilterBar options={FILTERS as any} value={filter} onChange={setFilter} counts={counts} />
          {selectMode ? <Callout kind="info" icon="check" text="Selection mode is active. Tap rows to select devices before dispatching bulk commands." /> : null}
          <DeviceTable rows={rows} targetVersion={targetVersion} selected={selected} onRowPress={openRow} />
          <ResultList results={results} />
        </ScrollView>
        {selectMode ? (
          <FooterBar>
            <Text style={{ color: c.text, fontWeight: "900" }}>{selected.size} selected</Text>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              <ActionButton label="Reboot" icon="power" onPress={() => runBulk("Reboot", { action: "reboot" })} busy={busy === "Reboot"} disabled={!selected.size || !!busy} />
              <ActionButton label="Identify" icon="signal" onPress={() => runBulk("Identify", { action: "identify" })} busy={busy === "Identify"} disabled={!selected.size || !!busy} />
              <ActionButton label="OTA action" icon="otaUpdate" onPress={() => runBulk("OTA action", { action: "ota" })} busy={busy === "OTA action"} disabled={!selected.size || !!busy} outline />
            </View>
          </FooterBar>
        ) : null}
        <BottomSheet visible={!!csv} onClose={() => setCsv("")} title="CSV export">
          <Callout kind="info" icon="copy" text="No file-share library is installed in this build. Select the CSV text below and copy it manually." />
          <CodeBlock label={`Generated ${formatDateTime(new Date())}`} text={csv} maxHeight={420} />
        </BottomSheet>
      </FleetScaffold>
    </Screen>
  );
}
