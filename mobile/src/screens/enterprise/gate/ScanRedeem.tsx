/**
 * Scan or redeem a guest pass.
 *
 * Two paths, both real:
 *   1. `expo-camera` in barcode mode. On a scan we extract a code from the
 *      QR payload (accepting the canonical `circuvent://gate?code=...` URL or
 *      a bare code) and call `api.redeemGatePass(code)`.
 *   2. Manual entry — a text field for guards who don't have camera access,
 *      or whose scanner failed. Same server endpoint, same behaviour.
 *
 * Camera permission denial is handled with a real explanation and a manual-
 * entry path, not a silent fallback. On a successful redeem the screen shows
 * the label the server confirmed and the uses left it reported — nothing is
 * inferred locally.
 *
 * Because `api.redeemGatePass` is deliberately unauthenticated (see
 * `platform/api/src/routes/gate.ts`), any user of the app can perform a redeem
 * — this is the design that makes it useful as a guard-facing screen when the
 * account belongs to the resident, not the guard.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Linking, ScrollView, StyleSheet, Text, View } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Speech from "expo-speech";
import { formatDateTime, formatRelative } from "../../../enterprise";
import { ToastHost, useTheme, useToast } from "../../../ui";
import {
  ActionButton,
  Callout,
  Kpi,
  KpiGrid,
  MetricRow,
  TabStrip,
  TextField,
  ToggleField,
} from "../../../enterprise-ui";
import { Icon } from "../../../icons";
import { GateScaffold, HonestEmpty, Section } from "./parts";
import {
  extractCode,
  isValidCodeShape,
  sanitiseCode,
  type RedemptionLogEntry,
} from "./types";
import { useGateData } from "./useGate";

interface Props {
  onBack: () => void;
}

type Mode = "scan" | "manual";

type LastResult =
  | { kind: "idle" }
  | { kind: "success"; label?: string; usesLeft?: number; code: string }
  | { kind: "error"; message: string; code: string };

const SCAN_COOLDOWN_MS = 1600;

export default function ScanRedeem({ onBack }: Props) {
  const { c } = useTheme();
  const gate = useGateData();
  const [permission, requestPermission] = useCameraPermissions();
  const [mode, setMode] = useState<Mode>("scan");
  const [manualCode, setManualCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [last, setLast] = useState<LastResult>({ kind: "idle" });
  const [torch, setTorch] = useState(false);
  const scanLockRef = useRef(0);
  const { toast, show, hide } = useToast();

  const speak = useCallback(
    (text: string) => {
      if (!gate.config.speakOutcome) return;
      try {
        // Speech.stop before the next utterance avoids overlapping messages
        // when a guard runs several redemptions in quick succession.
        Speech.stop();
        Speech.speak(text, { language: "en", rate: 0.95 });
      } catch {
        /* voice output is optional; silence on failure */
      }
    },
    [gate.config.speakOutcome],
  );

  const runRedeem = useCallback(
    async (raw: string, source: "scan" | "manual") => {
      const code = sanitiseCode(raw);
      if (!isValidCodeShape(code)) {
        const message = "Code must be at least 4 alphanumeric characters.";
        setLast({ kind: "error", message, code: code || raw });
        show(message, "warning");
        speak("Invalid code");
        return;
      }
      setSubmitting(true);
      const res = await gate.redeemCode(code);
      setSubmitting(false);

      if (res.ok) {
        setLast({ kind: "success", label: res.label, usesLeft: res.usesLeft, code });
        show(res.message, "success");
        speak(`Gate opened${res.label ? " for " + res.label : ""}`);
        // Clear the manual input so the guard can scan the next visitor
        // without a stale value confusing them.
        if (source === "manual") setManualCode("");
      } else {
        setLast({ kind: "error", message: res.message, code });
        show(res.message, "error");
        speak(res.message.includes("Unknown") ? "Unknown code" : "Pass rejected");
      }
    },
    [gate, show, speak],
  );

  const onScanned = useCallback(
    ({ data }: { data: string }) => {
      const now = Date.now();
      // Avoid double-fire from the OS scan callback while the previous
      // request is still in flight or the cooldown hasn't elapsed.
      if (submitting || now - scanLockRef.current < SCAN_COOLDOWN_MS) return;
      scanLockRef.current = now;
      const extracted = extractCode(data);
      if (!extracted) {
        setLast({ kind: "error", message: "The QR was not a Circuvent gate code.", code: data });
        show("Not a Circuvent code", "warning");
        speak("Unknown QR");
        return;
      }
      runRedeem(extracted, "scan");
    },
    [runRedeem, show, speak, submitting],
  );

  useEffect(() => {
    // Ask for camera permission the first time the user lands on scan mode.
    if (mode === "scan" && permission && !permission.granted && permission.canAskAgain) {
      // Do not auto-prompt on subsequent visits — the user may have chosen
      // manual entry deliberately.
    }
  }, [mode, permission]);

  const recentLog = gate.config.recentRedemptions;
  const successRate = useMemo(() => {
    if (!recentLog.length) return 0;
    const ok = recentLog.filter((e) => e.ok).length;
    return Math.round((ok / recentLog.length) * 100);
  }, [recentLog]);

  return (
    <GateScaffold
      title="Scan pass"
      subtitle="Redeem a guest QR or type the code"
      onBack={onBack}
      loading={gate.loading}
      error={gate.error && !gate.lastUpdated ? gate.error : null}
      onRetry={gate.reload}
    >
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <TabStrip
          tabs={[
            { value: "scan", label: "Scan QR", icon: "qrScan" },
            { value: "manual", label: "Type code", icon: "keypad" },
          ]}
          value={mode}
          onChange={setMode}
        />

        {mode === "scan" ? (
          <View style={{ gap: 12 }}>
            {!permission ? (
              <Callout kind="info" icon="camera" text="Checking camera permission…" />
            ) : !permission.granted ? (
              <PermissionPanel
                canAskAgain={permission.canAskAgain}
                onRequest={async () => {
                  const res = await requestPermission();
                  if (!res.granted && !res.canAskAgain) {
                    show("Enable camera access in system settings.", "warning");
                  }
                }}
                onManual={() => setMode("manual")}
              />
            ) : (
              <ViewFinder
                onScanned={onScanned}
                torch={torch}
                onToggleTorch={() => setTorch((v) => !v)}
                submitting={submitting}
              />
            )}
          </View>
        ) : (
          <ManualEntry
            code={manualCode}
            onChange={setManualCode}
            submitting={submitting}
            onSubmit={() => runRedeem(manualCode, "manual")}
          />
        )}

        <ResultPanel result={last} />

        <Section icon="check" title="Preferences" subtitle="Stored on this device only">
          <ToggleField
            label="Speak the outcome"
            help="Announce success or the failure reason when a redeem completes. Useful for a guard whose hands are on the barrier."
            icon="info"
            value={gate.config.speakOutcome}
            onChange={(v) => gate.saveConfig({ ...gate.config, speakOutcome: v })}
          />
        </Section>

        <Section icon="history" title="Recent redemptions" subtitle="Local scan log, this device only">
          <KpiGrid>
            <Kpi icon="check" label="Attempts" value={recentLog.length} tint={c.text} />
            <Kpi
              icon="success"
              label="Success"
              value={recentLog.filter((e) => e.ok).length}
              tint={c.green}
            />
            <Kpi
              icon="alert"
              label="Failures"
              value={recentLog.filter((e) => !e.ok).length}
              tint={c.red}
              invertDelta
            />
            <Kpi icon="pass" label="Success rate" value={`${successRate}%`} tint={c.accent} />
          </KpiGrid>

          {recentLog.length ? (
            recentLog.map((entry, i) => <RedemptionRow key={`${entry.ts}-${i}`} entry={entry} />)
          ) : (
            <HonestEmpty
              icon="history"
              title="No redemptions yet"
              subtitle="Scans and manual entries you make on this device are logged here — never uploaded."
            />
          )}
        </Section>
      </ScrollView>
      <ToastHost toast={toast} onHide={hide} />
    </GateScaffold>
  );
}

/* --------------------------------------------------------- viewfinder ---- */

function ViewFinder({
  onScanned,
  torch,
  onToggleTorch,
  submitting,
}: {
  onScanned: (r: { data: string }) => void;
  torch: boolean;
  onToggleTorch: () => void;
  submitting: boolean;
}) {
  const { c } = useTheme();
  return (
    <View>
      <View style={[styles.viewfinder, { borderColor: c.border, backgroundColor: "#000" }]}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          enableTorch={torch}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={submitting ? undefined : onScanned}
        />
        <View style={styles.reticle}>
          <View style={[styles.corner, styles.tl, { borderColor: c.accentHi }]} />
          <View style={[styles.corner, styles.tr, { borderColor: c.accentHi }]} />
          <View style={[styles.corner, styles.bl, { borderColor: c.accentHi }]} />
          <View style={[styles.corner, styles.br, { borderColor: c.accentHi }]} />
        </View>
        {submitting ? (
          <View style={styles.busyOverlay}>
            <Text style={{ color: "#fff", fontWeight: "900" }}>Redeeming…</Text>
          </View>
        ) : null}
      </View>

      <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
        <View style={{ flex: 1 }}>
          <ActionButton
            label={torch ? "Torch on" : "Torch off"}
            icon={torch ? "check" : "close"}
            outline
            onPress={onToggleTorch}
          />
        </View>
      </View>

      <Text style={{ color: c.faint, fontSize: 12, marginTop: 10, textAlign: "center" }}>
        Frame the guest's QR inside the reticle. The scanner accepts either the
        Circuvent gate URL or a bare code.
      </Text>
    </View>
  );
}

function PermissionPanel({
  canAskAgain,
  onRequest,
  onManual,
}: {
  canAskAgain: boolean;
  onRequest: () => void;
  onManual: () => void;
}) {
  return (
    <View style={{ gap: 12 }}>
      <Callout
        kind="warning"
        icon="camera"
        title="Camera access needed"
        text={
          canAskAgain
            ? "We use the camera locally to read the guest QR code. Nothing is uploaded — we only extract the code and send it to the redeem endpoint."
            : "You've previously declined camera access. Enable it in system settings to scan QRs, or use the manual entry tab instead."
        }
      />
      <View style={{ flexDirection: "row", gap: 10 }}>
        {canAskAgain ? (
          <View style={{ flex: 1 }}>
            <ActionButton label="Allow camera" icon="camera" onPress={onRequest} />
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            <ActionButton
              label="Open settings"
              icon="check"
              onPress={() => Linking.openSettings().catch(() => {})}
            />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <ActionButton label="Type instead" icon="keypad" outline onPress={onManual} />
        </View>
      </View>
    </View>
  );
}

/* --------------------------------------------------------- manual entry -- */

function ManualEntry({
  code,
  onChange,
  submitting,
  onSubmit,
}: {
  code: string;
  onChange: (v: string) => void;
  submitting: boolean;
  onSubmit: () => void;
}) {
  const { c } = useTheme();
  const sanitized = sanitiseCode(code);
  const valid = isValidCodeShape(sanitized);
  return (
    <View>
      <TextField
        label="Guest code"
        value={code}
        onChange={(v) => onChange(sanitiseCode(v))}
        placeholder="e.g. AB2P4RTV"
        autoCapitalize="characters"
        help={
          sanitized.length
            ? valid
              ? `Ready — ${sanitized.length} characters`
              : "A little longer, please. Codes are at least four characters."
            : "Codes use only A-Z and 2-9. The guest reads it back from the pass."
        }
      />
      <ActionButton
        label={submitting ? "Redeeming…" : "Redeem code"}
        icon="check"
        onPress={onSubmit}
        busy={submitting}
        disabled={!valid}
      />
      <Text style={{ color: c.faint, fontSize: 11, marginTop: 12, textAlign: "center" }}>
        Redeem is unauthenticated: the code IS the credential. A revoked or
        expired code will be refused by the server.
      </Text>
    </View>
  );
}

/* --------------------------------------------------------- results ---- */

function ResultPanel({ result }: { result: LastResult }) {
  const { c } = useTheme();
  if (result.kind === "idle") return null;
  if (result.kind === "success") {
    return (
      <View style={[styles.result, { backgroundColor: c.green + "18", borderColor: c.green }]}>
        <Icon name="check" size={28} color={c.green} />
        <Text style={{ color: c.text, fontWeight: "900", fontSize: 16, marginTop: 6 }}>
          Gate opened {result.label ? `for ${result.label}` : ""}
        </Text>
        <Text style={{ color: c.textDim, fontSize: 12.5, marginTop: 3 }}>
          {result.usesLeft != null
            ? `${result.usesLeft} use${result.usesLeft === 1 ? "" : "s"} left on this pass.`
            : "The server acknowledged the redemption."}
        </Text>
        <Text style={{ color: c.faint, fontSize: 11, marginTop: 6 }}>Code {result.code}</Text>
      </View>
    );
  }
  return (
    <View style={[styles.result, { backgroundColor: c.red + "18", borderColor: c.red }]}>
      <Icon name="alert" size={26} color={c.red} />
      <Text style={{ color: c.text, fontWeight: "900", fontSize: 15, marginTop: 6 }}>
        Pass rejected
      </Text>
      <Text style={{ color: c.textDim, fontSize: 12.5, marginTop: 3, textAlign: "center" }}>
        {result.message}
      </Text>
      {result.code ? (
        <Text style={{ color: c.faint, fontSize: 11, marginTop: 6 }}>Attempted {result.code}</Text>
      ) : null}
    </View>
  );
}

function RedemptionRow({ entry }: { entry: RedemptionLogEntry }) {
  const { c } = useTheme();
  return (
    <View
      style={{
        borderBottomWidth: 1,
        borderBottomColor: c.border,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <Icon
        name={entry.ok ? "success" : "alert"}
        size={18}
        color={entry.ok ? c.green : c.red}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: c.text, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>
          {entry.ok ? entry.label || "Guest" : entry.message}
        </Text>
        <Text style={{ color: c.faint, fontSize: 11 }} numberOfLines={1}>
          {entry.code} · {formatRelative(entry.ts)} · {formatDateTime(entry.ts)}
        </Text>
      </View>
      <MetricRow label="" value={entry.ok ? "OK" : "Failed"} icon="check" tint={entry.ok ? c.green : c.red} last />
    </View>
  );
}

const styles = StyleSheet.create({
  viewfinder: {
    aspectRatio: 1,
    borderRadius: 24,
    borderWidth: 1,
    overflow: "hidden",
    position: "relative",
  },
  reticle: {
    ...StyleSheet.absoluteFillObject,
    padding: "18%",
    alignItems: "stretch",
    justifyContent: "space-between",
  },
  corner: {
    position: "absolute",
    width: 34,
    height: 34,
    borderWidth: 3,
    borderColor: "#fff",
  },
  tl: { top: "18%", left: "18%", borderRightWidth: 0, borderBottomWidth: 0, borderTopLeftRadius: 6 },
  tr: { top: "18%", right: "18%", borderLeftWidth: 0, borderBottomWidth: 0, borderTopRightRadius: 6 },
  bl: { bottom: "18%", left: "18%", borderRightWidth: 0, borderTopWidth: 0, borderBottomLeftRadius: 6 },
  br: { bottom: "18%", right: "18%", borderLeftWidth: 0, borderTopWidth: 0, borderBottomRightRadius: 6 },
  busyOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  result: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    marginTop: 14,
    marginBottom: 14,
  },
});
