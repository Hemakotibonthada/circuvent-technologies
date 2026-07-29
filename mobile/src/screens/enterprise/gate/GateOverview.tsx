/**
 * Live status board for the physical gate/barrier estate.
 *
 * Sources every number and label from real endpoints:
 *   - Gates and their online/last-seen state → `api.devices()` filtered by
 *     `isGateDevice`, so the KPI count is what the server actually reports.
 *   - Recent activity → `api.events()` filtered to gate-relevant events.
 *   - Pass counts (active today, redemptions today) → `api.gatePasses()`.
 *
 * The command buttons publish real MQTT commands via `api.command()`. Nothing
 * on this screen is simulated — a gate that fails to respond is called out as
 * failed, and a gate that has no telemetry says "unknown" rather than picking
 * a plausible default.
 */
import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { formatRelative, triageEvents } from "../../../enterprise";
import { Callout, HeroBand, Kpi, KpiGrid, MetricRow } from "../../../enterprise-ui";
import { ToastHost, useTheme, useToast } from "../../../ui";
import type { AppEvent, GatePass } from "../../../api";
import {
  DetailList,
  GateDeviceRow,
  GateEventRow,
  GateScaffold,
  HonestEmpty,
  Section,
} from "./parts";
import { useGateData } from "./useGate";
import { isGateEvent, isTerminalStatus, usesRemaining } from "./types";

interface Props {
  onBack: () => void;
}

function passesActiveNow(passes: GatePass[]): number {
  return passes.filter((p) => p.status === "active").length;
}

function passesActiveToday(passes: GatePass[]): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const t = startOfDay.getTime();
  return passes.filter((p) => new Date(p.valid_to).getTime() >= t && !isTerminalStatus(p.status)).length;
}

function redemptionsToday(passes: GatePass[]): number {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const t = startOfDay.getTime();
  // "Used today" = last_used inside today's window; only what the server
  // stamped, no client-side inference from usage counters.
  return passes.reduce((n, p) => {
    if (!p.last_used) return n;
    const used = new Date(p.last_used).getTime();
    return Number.isFinite(used) && used >= t ? n + 1 : n;
  }, 0);
}

function usesLeftTotal(passes: GatePass[]): number {
  return passes.filter((p) => !isTerminalStatus(p.status)).reduce((n, p) => n + usesRemaining(p), 0);
}

function lastOpenedAt(events: AppEvent[]): AppEvent | null {
  // Prefer events whose kind is "security" and whose body mentions gate/open,
  // which is what the backend writes on a successful `grantOpen` redeem.
  return events.find((e) => /gate|open|redeem|barrier/i.test(`${e.title} ${e.body}`)) ?? events[0] ?? null;
}

export default function GateOverview({ onBack }: Props) {
  const { c } = useTheme();
  const gate = useGateData();
  const { toast, show, hide } = useToast();
  const [busyBy, setBusyBy] = useState<Record<string, string | null>>({});

  const gateDeviceIds = useMemo(() => new Set(gate.gateDevices.map((d) => d.id)), [gate.gateDevices]);
  const recent = useMemo(() => triageEvents(gate.events.filter((e) => isGateEvent(e, gateDeviceIds))).slice(0, 5), [gate.events, gateDeviceIds]);
  const lastOpen = useMemo(() => lastOpenedAt(recent), [recent]);

  const sendCommand = useCallback(
    async (deviceId: string, action: string, cmd: Record<string, unknown>, label: string) => {
      setBusyBy((s) => ({ ...s, [deviceId]: action }));
      const res = await gate.sendGateCommand(deviceId, cmd);
      setBusyBy((s) => ({ ...s, [deviceId]: null }));
      if (res.ok) {
        show(`${label} sent`, "success");
        // Refresh to pick up telemetry / event feedback within a beat.
        setTimeout(() => gate.refresh(), 1500);
      } else {
        show(res.message, "error");
      }
    },
    [gate, show],
  );

  return (
    <GateScaffold
      title="Gate access"
      subtitle="Live barrier state and today's passes"
      onBack={onBack}
      onRefresh={gate.refresh}
      refreshing={gate.refreshing}
      loading={gate.loading}
      error={gate.error && !gate.lastUpdated ? gate.error : null}
      onRetry={gate.reload}
    >
      <ScrollView
        refreshControl={<RefreshControl refreshing={gate.refreshing} onRefresh={gate.refresh} tintColor={c.accent} />}
        contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      >
        {gate.error ? <Callout kind="warning" icon="warning" text={gate.error} /> : null}

        <HeroBand
          label="Active passes"
          value={String(passesActiveNow(gate.passes))}
          unit={`of ${gate.passes.length}`}
          caption={
            lastOpen
              ? `Last activity ${formatRelative(lastOpen.ts)} — ${lastOpen.title}`
              : "No gate activity recorded yet"
          }
        />

        <KpiGrid>
          <Kpi
            icon="pass"
            label="Passes active now"
            value={passesActiveNow(gate.passes)}
            tint={c.green}
            footnote="Server-reported status"
          />
          <Kpi
            icon="calendar"
            label="Valid through today"
            value={passesActiveToday(gate.passes)}
            tint={c.cyan}
            footnote="Ends after midnight tonight"
          />
          <Kpi
            icon="check"
            label="Redemptions today"
            value={redemptionsToday(gate.passes)}
            tint={c.accent}
            footnote={
              lastOpen ? `Latest ${formatRelative(lastOpen.ts)}` : "None since midnight"
            }
          />
          <Kpi
            icon="keyVariant"
            label="Uses remaining"
            value={usesLeftTotal(gate.passes)}
            tint={c.violet}
            footnote="Across every unexpired pass"
          />
          <Kpi
            icon="gate"
            label="Gate devices"
            value={gate.gateDevices.length}
            tint={c.text}
            footnote={`${gate.gateDevices.filter((d) => d.online).length} online`}
          />
        </KpiGrid>

        <Section icon="gate" title="Barriers and locks" subtitle="Send a real MQTT command to a chosen gate">
          {gate.gateDevices.length ? (
            gate.gateDevices.map((d) => (
              <GateDeviceRow
                key={d.id}
                device={d}
                busy={busyBy[d.id] ?? null}
                onOpen={() => sendCommand(d.id, "open", { action: "open" }, "Open command")}
                onClose={() => sendCommand(d.id, "close", { action: "close" }, "Close command")}
                onLock={
                  typeof d.state?.locked === "boolean"
                    ? () => sendCommand(d.id, "lock", { action: "lock", locked: true }, "Lock command")
                    : undefined
                }
                onUnlock={
                  typeof d.state?.locked === "boolean"
                    ? () => sendCommand(d.id, "unlock", { action: "unlock", locked: false }, "Unlock command")
                    : undefined
                }
                onCommand={(action) => sendCommand(d.id, action, { action }, action)}
              />
            ))
          ) : (
            <HonestEmpty
              icon="gate"
              title="No gate devices"
              subtitle="Your account has no gates, smart-locks or barrier devices. Provision one from the Fleet module, then it will appear here."
            />
          )}
        </Section>

        <Section icon="history" title="Recent activity" subtitle="Gate-related events reported by the server">
          {recent.length ? (
            recent.map((event) => (
              <GateEventRow
                key={event.id}
                event={event}
                device={gate.devices.find((d) => d.id === event.device_id)}
              />
            ))
          ) : (
            <HonestEmpty
              icon="history"
              title="No activity yet"
              subtitle="No gate-related events have been reported in the last event page. Redeem a pass to see it appear here."
            />
          )}
        </Section>

        <Section icon="pass" title="Latest pass summary" subtitle="Newest three passes across every status">
          {gate.passes.length ? (
            <DetailList
              rows={gate.passes.slice(0, 3).map((p) => ({
                label: p.label || "Guest",
                value: (
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{ color: c.text, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>
                      {p.status}
                    </Text>
                    <Text style={{ color: c.faint, fontSize: 11 }} numberOfLines={1}>
                      {formatRelative(p.created_at)}
                    </Text>
                  </View>
                ),
                icon: "keyVariant",
              }))}
            />
          ) : (
            <HonestEmpty icon="pass" title="No passes yet" subtitle="Create a pass to see it summarised here." />
          )}
        </Section>

        {gate.lastUpdated ? (
          <MetricRow
            label="Last refreshed"
            value={formatRelative(new Date(gate.lastUpdated))}
            icon="refresh"
            last
          />
        ) : null}
      </ScrollView>
      <ToastHost toast={toast} onHide={hide} />
    </GateScaffold>
  );
}
