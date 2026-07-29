/**
 * Access log — a timeline view of gate-relevant events.
 *
 * There is no dedicated gate-history endpoint on the server (see
 * `platform/api/src/routes/gate.ts` — the redeem path publishes MQTT but does
 * not write a history row). This screen therefore derives its rows strictly
 * from `api.events(...)` filtered to the gate module: any event whose
 * `device_id` matches a known gate device, plus a small set of kinds that the
 * backend uses for pass and access lifecycle. When there are no such events
 * we show an honest `EmptyState` — we do NOT fabricate rows.
 */
import React, { useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import type { AppEvent } from "../../../api";
import { formatDateTime, formatRelative, severityOf, toCsv, triageEvents } from "../../../enterprise";
import { Share } from "react-native";
import { useTheme } from "../../../ui";
import {
  EventTimeline,
  FilterBar,
  Kpi,
  KpiGrid,
  MetricRow,
  SearchField,
  SeverityBadge,
} from "../../../enterprise-ui";
import { GateScaffold, HonestEmpty, Section } from "./parts";
import { GATE_EVENT_KINDS, isGateEvent } from "./types";
import { useGateData } from "./useGate";

interface Props {
  onBack: () => void;
}

type SeverityFilter = "all" | "critical" | "warning" | "info" | "success";

const SEVERITY_FILTERS: { value: SeverityFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "critical", label: "Alerts" },
  { value: "warning", label: "Warnings" },
  { value: "info", label: "Activity" },
  { value: "success", label: "Success" },
];

export default function AccessLog({ onBack }: Props) {
  const { c } = useTheme();
  const gate = useGateData();
  const [query, setQuery] = useState("");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

  const deviceIds = useMemo(
    () => new Set(gate.gateDevices.map((d) => d.id)),
    [gate.gateDevices],
  );
  const deviceName = useMemo(() => {
    const map: Record<string, string> = {};
    for (const d of gate.gateDevices) map[d.id] = d.name;
    return map;
  }, [gate.gateDevices]);

  const gateEvents = useMemo(() => {
    return gate.events.filter((e) => isGateEvent(e, deviceIds));
  }, [gate.events, deviceIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return gateEvents.filter((e) => {
      const sev = severityOf(e.kind);
      if (severityFilter !== "all" && sev !== severityFilter) return false;
      if (!q) return true;
      const hay =
        `${e.title} ${e.body} ${e.kind} ${e.device_id ?? ""}`.toLowerCase();
      return hay.includes(q);
    });
  }, [gateEvents, query, severityFilter]);

  const triaged = useMemo(() => triageEvents(filtered), [filtered]);

  const now = Date.now();
  const in24 = triaged.filter((e) => now - new Date(e.ts).getTime() < 86_400_000);
  const critical = triaged.filter((e) => severityOf(e.kind) === "critical");
  const success = triaged.filter((e) => severityOf(e.kind) === "success");
  const withDevice = triaged.filter((e) => e.device_id).length;
  const withoutDevice = triaged.filter((e) => !e.device_id).length;
  const uniqueDevices = new Set(triaged.map((e) => e.device_id).filter(Boolean)).size;

  const timelineItems = useMemo(
    () =>
      triaged.slice(0, 60).map((e) => ({
        id: String(e.id),
        title: e.title || e.kind,
        body: bodyWithDevice(e, deviceName),
        time: formatRelative(e.ts),
        severity: severityOf(e.kind),
        icon: iconForKind(e.kind),
      })),
    [triaged, deviceName],
  );

  const exportCsv = async () => {
    if (!triaged.length) return;
    const csv = toCsv(
      triaged.map((e) => ({
        id: e.id,
        ts: e.ts,
        kind: e.kind,
        severity: severityOf(e.kind),
        device_id: e.device_id ?? "",
        device_name: e.device_id ? deviceName[e.device_id] ?? "" : "",
        title: e.title,
        body: e.body,
        read: e.read ? "1" : "0",
      })),
    );
    try {
      await Share.share({
        message: csv,
        title: `gate-access-log-${new Date().toISOString().slice(0, 10)}.csv`,
      });
    } catch {
      /* user cancelled the share sheet */
    }
  };

  return (
    <GateScaffold
      title="Access log"
      subtitle="Gate activity from the events feed"
      onBack={onBack}
      loading={gate.loading && !gate.lastUpdated}
      error={gate.error && !gate.lastUpdated ? gate.error : null}
      onRetry={gate.reload}
      onRefresh={gate.reload}
      refreshing={gate.refreshing}
      actions={
        triaged.length
          ? [{ icon: "download", label: "Export CSV", onPress: exportCsv }]
          : undefined
      }
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={gate.refreshing}
            onRefresh={gate.reload}
            tintColor={c.accentHi}
          />
        }
      >
        <KpiGrid>
          <Kpi
            icon="history"
            label="Events shown"
            value={triaged.length}
            unit={query || severityFilter !== "all" ? "filtered" : "total"}
            tint={c.text}
          />
          <Kpi icon="clock" label="Last 24h" value={in24.length} tint={c.accent} />
          <Kpi icon="alert" label="Critical" value={critical.length} tint={c.red} invertDelta />
          <Kpi icon="success" label="Success" value={success.length} tint={c.green} />
        </KpiGrid>

        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Filter by title, code, device…"
        />
        <FilterBar
          value={severityFilter}
          onChange={(v) => setSeverityFilter(v as SeverityFilter)}
          options={SEVERITY_FILTERS.map((f) => ({ value: f.value, label: f.label }))}
          counts={buildSeverityCounts(gateEvents)}
        />

        <Section
          icon="dashboard"
          title="Breakdown"
          subtitle={
            gate.lastUpdated
              ? `Updated ${formatRelative(gate.lastUpdated)}`
              : "Loading…"
          }
        >
          <MetricRow
            label="Attached to a gate device"
            value={String(withDevice)}
            icon="gate"
          />
          <MetricRow
            label="Broader access events"
            value={String(withoutDevice)}
            icon="shield"
          />
          <MetricRow
            label="Devices involved"
            value={String(uniqueDevices)}
            icon="gate"
            last
          />
        </Section>

        <Section icon="history" title="Timeline" subtitle={legendText(gateEvents)}>
          {triaged.length ? (
            <>
              <EventTimeline items={timelineItems} />
              {triaged.length > 60 ? (
                <Text
                  style={{ color: c.faint, fontSize: 12, marginTop: 10, textAlign: "center" }}
                >
                  Showing the most relevant 60 of {triaged.length}. Narrow the filter to see more
                  detail.
                </Text>
              ) : null}
            </>
          ) : gateEvents.length ? (
            <HonestEmpty
              icon="filter"
              title="No matches"
              subtitle="Nothing in the current gate events matches your search or severity filter. Clear the filter to see everything again."
            />
          ) : (
            <HonestEmpty
              icon="history"
              title="No gate events recorded"
              subtitle={
                "There is no server-side gate history endpoint — we derive this list from the /events feed. When a gate device raises an event, or a pass is redeemed with an event kind we track, it will appear here."
              }
            />
          )}
        </Section>

        <Section icon="info" title="What counts as a gate event?" subtitle="Data source is honest about its limits">
          <Text style={{ color: c.textDim, fontSize: 13, lineHeight: 19 }}>
            An event is included here when either the {""}
            <Text style={{ fontWeight: "800", color: c.text }}>device_id</Text> matches one of your
            gate barriers, or when the event kind is in the list below and its title mentions
            access-related language. The redeem endpoint publishes MQTT rather than writing a
            history row, so a bare successful redeem may not appear here unless another rule fires
            an event on the server.
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
            {GATE_EVENT_KINDS.map((k) => (
              <View
                key={k}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: c.border,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 5,
                }}
              >
                <SeverityBadge severity={severityOf(k)} />
                <Text style={{ color: c.textDim, fontSize: 12, fontWeight: "700" }}>{k}</Text>
              </View>
            ))}
          </View>
        </Section>

        {gate.gateDevices.length ? (
          <Section
            icon="gate"
            title="Devices tracked"
            subtitle={`${gate.gateDevices.length} gate device${gate.gateDevices.length === 1 ? "" : "s"} feed this log`}
          >
            {gate.gateDevices.map((d, i) => {
              const events = triaged.filter((e) => e.device_id === d.id);
              const last = events[0];
              return (
                <MetricRow
                  key={d.id}
                  label={d.name}
                  value={
                    events.length
                      ? `${events.length} · ${formatRelative(last!.ts)}`
                      : "No events"
                  }
                  icon="gate"
                  last={i === gate.gateDevices.length - 1}
                  tint={events.length ? c.text : c.faint}
                />
              );
            })}
          </Section>
        ) : null}

        {triaged.length ? (
          <Section
            icon="calendar"
            title="Latest details"
            subtitle="Full timestamps for the newest ten events"
          >
            {triaged.slice(0, 10).map((e, i) => (
              <View
                key={e.id}
                style={[
                  { paddingVertical: 10, gap: 4 },
                  i < 9 && { borderBottomWidth: 1, borderBottomColor: c.border },
                ]}
              >
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <SeverityBadge severity={severityOf(e.kind)} />
                  <Text style={{ color: c.text, fontWeight: "800", fontSize: 13.5, flex: 1 }} numberOfLines={1}>
                    {e.title || e.kind}
                  </Text>
                </View>
                {e.body ? (
                  <Text style={{ color: c.textDim, fontSize: 12.5 }} numberOfLines={2}>
                    {e.body}
                  </Text>
                ) : null}
                <Text style={{ color: c.faint, fontSize: 11 }}>
                  {formatDateTime(e.ts)}
                  {e.device_id ? ` · ${deviceName[e.device_id] ?? e.device_id}` : ""}
                </Text>
              </View>
            ))}
          </Section>
        ) : null}
      </ScrollView>
    </GateScaffold>
  );
}

/* ---------------------------------------------------------- helpers ---- */

function iconForKind(kind: string): "gate" | "alert" | "success" | "check" | "shield" | "history" {
  switch (kind) {
    case "alert":
    case "fault":
    case "error":
      return "alert";
    case "success":
      return "success";
    case "security":
      return "shield";
    case "info":
      return "check";
    default:
      return "history";
  }
}

function bodyWithDevice(e: AppEvent, deviceName: Record<string, string>): string | undefined {
  const parts: string[] = [];
  if (e.body) parts.push(e.body);
  if (e.device_id && deviceName[e.device_id]) {
    parts.push(`Device: ${deviceName[e.device_id]}`);
  }
  return parts.length ? parts.join(" · ") : undefined;
}

function countBySeverity(events: AppEvent[], sev: SeverityFilter): number {
  if (sev === "all") return events.length;
  return events.filter((e) => severityOf(e.kind) === sev).length;
}

function buildSeverityCounts(events: AppEvent[]): Partial<Record<SeverityFilter, number>> {
  return {
    all: events.length,
    critical: countBySeverity(events, "critical"),
    warning: countBySeverity(events, "warning"),
    info: countBySeverity(events, "info"),
    success: countBySeverity(events, "success"),
  };
}

function legendText(events: AppEvent[]): string {
  if (!events.length) return "No events currently classified as gate activity";
  const kinds = new Set(events.map((e) => e.kind));
  return `${events.length} event${events.length === 1 ? "" : "s"} · ${kinds.size} distinct kind${
    kinds.size === 1 ? "" : "s"
  }`;
}
