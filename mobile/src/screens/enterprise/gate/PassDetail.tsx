/**
 * Pass detail — the big scannable QR, the readable code, share, and the
 * confirmable revoke path.
 *
 * The QR is rendered from `pass.qr` (the exact server-supplied URL, never
 * synthesised locally). The visible code is `pass.code` and is set as a copy
 * field so a guard can read it back. Revoke goes through a `ConfirmDialog`
 * because a revoke is destructive and a one-tap revoke is a support ticket.
 */
import React, { useCallback, useMemo, useState } from "react";
import { Alert, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { formatDateTime, formatRelative } from "../../../enterprise";
import { ToastHost, useTheme, useToast } from "../../../ui";
import {
  ActionButton,
  Callout,
  ConfirmDialog,
  CopyField,
  Kpi,
  KpiGrid,
  MetricRow,
} from "../../../enterprise-ui";
import type { GatePass } from "../../../api";
import {
  BigCode,
  CountdownText,
  DetailList,
  GateQr,
  GateScaffold,
  HonestEmpty,
  PassStatusPill,
  Section,
} from "./parts";
import {
  PASS_STATUS_HELP,
  PASS_STATUS_LABEL,
  canRevoke,
  fullValidityLabel,
  isTerminalStatus,
  usesRemaining,
} from "./types";
import { useGateData } from "./useGate";

interface Props {
  /** When null, the screen shows a picker over available passes. */
  pass: GatePass | null;
  onBack: () => void;
  onRevoked?: () => void;
}

export function PassDetail({ pass: passProp, onBack, onRevoked }: Props) {
  const { c } = useTheme();
  const gate = useGateData();
  const { toast, show, hide } = useToast();
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(passProp?.id ?? null);

  // Prefer the live pass row from the shared store: if a revoke came in from
  // a sibling screen we want to reflect it here.
  const pass = useMemo(() => {
    if (!passProp) return null;
    return gate.passes.find((p) => p.id === passProp.id) ?? passProp;
  }, [gate.passes, passProp]);

  const device = useMemo(() => {
    if (!pass) return null;
    return gate.devices.find((d) => d.id === pass.device_id) ?? null;
  }, [gate.devices, pass]);

  const doShare = useCallback(async () => {
    if (!pass) return;
    try {
      // A message-only share: recipients paste into any messenger. The URL
      // format is exactly what the QR encodes, so scanning the QR and opening
      // the URL both end up at `/gate/redeem`.
      await Share.share({
        message: `${pass.label}: ${pass.qr}\n\nCode: ${pass.code}\nValid: ${fullValidityLabel(pass)}`,
        title: `Guest pass: ${pass.label}`,
      });
    } catch (err) {
      show(err instanceof Error ? err.message : "Could not share", "error");
    }
  }, [pass, show]);

  const copyCode = useCallback(() => {
    if (!pass) return;
    // The base kit does not depend on expo-clipboard, so we fall back to
    // sharing the code — RN's Share sheet always exposes a "copy" target on
    // both iOS and Android.
    Share.share({ message: pass.code, title: `Guest code ${pass.label}` }).catch(() => {
      Alert.alert("Code", pass.code);
    });
  }, [pass]);

  const copyQrPayload = useCallback(() => {
    if (!pass) return;
    Share.share({ message: pass.qr, title: `Guest QR URL ${pass.label}` }).catch(() => {
      Alert.alert("QR URL", pass.qr);
    });
  }, [pass]);

  const revoke = useCallback(async () => {
    if (!pass) return;
    setBusy(true);
    const res = await gate.revokePass(pass.id);
    setBusy(false);
    setConfirmRevoke(false);
    if (res.ok) {
      show("Pass revoked", "success");
      onRevoked?.();
    } else {
      show(res.message, "error");
    }
  }, [gate, pass, onRevoked, show]);

  const selectPass = useCallback(
    (id: number) => setSelectedId(id),
    [],
  );

  // No pass in and none picked — offer the picker.
  if (!pass) {
    const chosen = selectedId != null ? gate.passes.find((p) => p.id === selectedId) : null;
    if (chosen) return <PassDetail pass={chosen} onBack={onBack} onRevoked={onRevoked} />;
    return (
      <GateScaffold
        title="Pass detail"
        subtitle="Pick a pass to view its QR"
        onBack={onBack}
        loading={gate.loading}
        error={gate.error && !gate.lastUpdated ? gate.error : null}
        onRetry={gate.reload}
      >
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
          {gate.passes.length ? (
            <>
              <Text style={{ color: c.text, fontSize: 14, fontWeight: "800", marginBottom: 10 }}>
                Choose a pass ({gate.passes.length} loaded)
              </Text>
              {gate.passes.map((p) => (
                <View
                  key={p.id}
                  style={{
                    borderWidth: 1,
                    borderColor: c.border,
                    borderRadius: 14,
                    backgroundColor: c.card,
                    padding: 12,
                    marginBottom: 10,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: c.text, fontWeight: "800" }} numberOfLines={1}>
                      {p.label || "Guest"}
                    </Text>
                    <Text style={{ color: c.faint, fontSize: 12 }} numberOfLines={1}>
                      {p.device_id} · {formatRelative(p.created_at)}
                    </Text>
                  </View>
                  <PassStatusPill status={p.status} />
                  <ActionButton label="Open" icon="chevron" onPress={() => selectPass(p.id)} outline />
                </View>
              ))}
            </>
          ) : (
            <HonestEmpty
              icon="pass"
              title="No passes to show"
              subtitle="Create a guest pass first, then it will appear here for sharing and revoking."
            />
          )}
        </ScrollView>
      </GateScaffold>
    );
  }

  const terminal = isTerminalStatus(pass.status);

  return (
    <GateScaffold
      title="Pass detail"
      subtitle={pass.label || "Guest"}
      onBack={onBack}
      onRefresh={gate.refresh}
      refreshing={gate.refreshing}
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        {gate.error ? <Callout kind="warning" icon="warning" text={gate.error} /> : null}

        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <PassStatusPill status={pass.status} />
          <View style={{ marginTop: 10 }}>
            <CountdownText pass={pass} />
          </View>
          <Text style={{ color: c.faint, fontSize: 12, textAlign: "center", marginTop: 4 }}>
            {PASS_STATUS_HELP[pass.status]}
          </Text>
        </View>

        {pass.status === "active" || pass.status === "scheduled" ? (
          <Section title="Scan or read" subtitle="Give the guest either the QR or the code">
            <View style={[styles.qrCard, { backgroundColor: c.card, borderColor: c.border }]}>
              <GateQr text={pass.qr} size={280} />
              <BigCode code={pass.code} />
              <Text style={{ color: c.faint, fontSize: 11, textAlign: "center", marginTop: 8 }}>
                Payload: {pass.qr}
              </Text>
            </View>
          </Section>
        ) : (
          <Section title="Pass no longer redeemable" subtitle={PASS_STATUS_LABEL[pass.status]}>
            <Callout
              kind={pass.status === "revoked" ? "critical" : pass.status === "expired" ? "warning" : "info"}
              icon={pass.status === "revoked" ? "cancel" : pass.status === "expired" ? "history" : "success"}
              title={PASS_STATUS_LABEL[pass.status]}
              text={PASS_STATUS_HELP[pass.status]}
            />
          </Section>
        )}

        <Section title="Codes and payload" subtitle="Read-only; the server issued these">
          <CopyField label="Code" value={pass.code} onCopy={copyCode} />
          <CopyField label="QR URL" value={pass.qr} onCopy={copyQrPayload} />
          <ActionButton label="Share pass" icon="share" onPress={doShare} tone={c.accent} />
        </Section>

        <Section icon="clock" title="Validity">
          <DetailList
            rows={[
              { label: "Status", value: PASS_STATUS_LABEL[pass.status], icon: "check", tint: pass.status === "active" ? c.green : undefined },
              { label: "Valid from", value: formatDateTime(pass.valid_from), icon: "calendar" },
              { label: "Valid to", value: formatDateTime(pass.valid_to), icon: "calendar" },
              { label: "Uses left", value: `${usesRemaining(pass)} of ${pass.max_uses}`, icon: "keyVariant" },
              {
                label: "Last used",
                value: pass.last_used ? `${formatRelative(pass.last_used)} — ${formatDateTime(pass.last_used)}` : "Never redeemed",
                icon: "history",
              },
              { label: "Created", value: `${formatRelative(pass.created_at)} — ${formatDateTime(pass.created_at)}`, icon: "clock" },
            ]}
          />
        </Section>

        <Section icon="gate" title="Applies to">
          <DetailList
            rows={[
              { label: "Device id", value: pass.device_id, icon: "keyVariant", mono: true },
              { label: "Device name", value: device?.name || "Not found in current inventory", icon: "gate" },
              { label: "Device type", value: device?.type || "—", icon: "info" },
              { label: "Online", value: device ? (device.online ? "Yes" : "No") : "Unknown", icon: "online", tint: device?.online ? c.green : c.faint },
            ]}
          />
        </Section>

        <KpiGrid>
          <Kpi icon="keyVariant" label="Uses" value={`${pass.uses}/${pass.max_uses}`} tint={c.accent} />
          <Kpi
            icon="clock"
            label="Window"
            value={fullValidityLabel(pass)}
            tint={c.text}
            footnote="Server-issued"
          />
        </KpiGrid>

        <Section icon="cancel" title="Revoke">
          {canRevoke(pass.status) ? (
            <>
              <ActionButton
                label="Revoke this pass"
                icon="trash"
                tone={c.red}
                onPress={() => setConfirmRevoke(true)}
                busy={busy}
              />
              <Text style={{ color: c.faint, fontSize: 11, marginTop: 8, textAlign: "center" }}>
                Revoking is immediate. A revoked pass cannot be restored.
              </Text>
            </>
          ) : (
            <Callout
              kind="info"
              icon="info"
              title="Cannot revoke"
              text={
                terminal
                  ? "This pass is already in a terminal state and does not need revoking."
                  : "Only active or scheduled passes can be revoked."
              }
            />
          )}
        </Section>
      </ScrollView>

      <ConfirmDialog
        visible={confirmRevoke}
        title={`Revoke "${pass.label || "Guest"}"?`}
        message={
          usesRemaining(pass) > 0
            ? `This pass still has ${usesRemaining(pass)} of ${pass.max_uses} uses left. Once revoked it cannot be reactivated.`
            : "Once revoked this pass cannot be reactivated."
        }
        confirmLabel="Revoke"
        destructive
        busy={busy}
        onConfirm={revoke}
        onCancel={() => setConfirmRevoke(false)}
      />
      <ToastHost toast={toast} onHide={hide} />
    </GateScaffold>
  );
}

const styles = StyleSheet.create({
  qrCard: {
    borderWidth: 1,
    borderRadius: 20,
    padding: 18,
    alignItems: "center",
  },
});

/**
 * Standalone entry point for the registry. When there is nothing selected we
 * default to the newest pass so the screen has something useful to render.
 */
export default function PassDetailStandalone({ onBack }: { onBack: () => void }) {
  const gate = useGateData();
  const newest = gate.passes[0] ?? null;
  return <PassDetail pass={newest} onBack={onBack} />;
}
