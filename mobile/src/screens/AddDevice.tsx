import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  TextInput,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Platform,
  Linking,
} from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import { api } from "../api";

/**
 * Enterprise zero-touch onboarding.
 *
 *  1. PICK type + PROVISION on the internet first (server mints id+key, owns it
 *     to the user, creates the broker client). Done while on home Wi-Fi/cellular.
 *  2. Join the device hotspot (mobile data OFF) — the DEVICE scans nearby Wi-Fi
 *     (GET /scan; 2.4 GHz only, which is all an ESP32 sees) and the app shows a
 *     picker. User selects the network + enters the password.
 *  3. PUSH ssid+pass+id+key to the device (local, 192.168.4.1/save).
 *  4. VALIDATE by polling the control plane until the device comes online. If it
 *     never joins, the password was likely wrong -> back to the picker to retry
 *     (no re-provision). Every step shows a live, meaningful status.
 */

const BASE = "http://192.168.4.1";
const BROKER = "mqtt.circuvent.com";

const TYPES = [
  { id: "smart-plug", label: "Smart Plug", emoji: "🔌" },
  { id: "smart-switch", label: "Smart Switch", emoji: "🎚️" },
  { id: "aquaguard", label: "AquaGuard tank", emoji: "💧" },
  { id: "home-hub", label: "Home Hub", emoji: "🏠" },
  { id: "energy-monitor", label: "Energy Monitor", emoji: "⚡" },
  { id: "guardian", label: "Guardian SOS", emoji: "🛡️" },
  { id: "motion-sensor", label: "Motion Sensor", emoji: "🚶" },
  { id: "agri-starter", label: "Agri Starter", emoji: "🌱" },
];

type Step = "mode" | "details" | "provision" | "connect" | "wifi" | "sending" | "reconnect" | "waiting" | "done" | "fail" | "manual";
type LogState = "run" | "ok" | "err";
interface LogItem { msg: string; state: LogState }
interface Net { ssid: string; rssi: number; lock: boolean }

const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join("");

function fetchTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(t));
}

function bars(rssi: number): string {
  if (rssi >= -55) return "▂▄▆█";
  if (rssi >= -67) return "▂▄▆";
  if (rssi >= -78) return "▂▄";
  return "▂";
}

export default function AddDevice({ onClose }: { onClose: (added: boolean) => void }) {
  const [step, setStep] = useState<Step>("mode");
  const [type, setType] = useState("");
  const [name, setName] = useState("");
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [manual, setManual] = useState(false);
  const [networks, setNetworks] = useState<Net[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState("");
  const [retryNote, setRetryNote] = useState("");
  const [error, setError] = useState("");
  const [log, setLog] = useState<LogItem[]>([]);
  const [devId, setDevId] = useState("");
  const [devKey, setDevKey] = useState("");
  const [mid, setMid] = useState("");
  const [mkey, setMkey] = useState("");
  const [busy, setBusy] = useState(false);

  const setLast = (state: LogState, msg?: string) =>
    setLog((l) => l.map((it, i) => (i === l.length - 1 ? { msg: msg ?? it.msg, state } : it)));
  const addLog = (msg: string) => setLog((l) => [...l, { msg, state: "run" }]);

  const openWifiSettings = async () => {
    try {
      if (Platform.OS === "android") await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.WIFI_SETTINGS);
      else await Linking.openSettings();
    } catch {
      /* ignore */
    }
  };

  const provision = async () => {
    setError(""); setLog([]); setStep("provision");
    addLog("Registering your device with Circuvent…");
    let id = `${type}-${hex(8)}`;
    let r = await api.provision(id, type, name.trim() || type);
    if (!r.ok && r.status === 409) { id = `${type}-${hex(8)}`; r = await api.provision(id, type, name.trim() || type); }
    if (!r.ok || !r.data?.key) {
      setLast("err", "Couldn't register the device.");
      setError(r.status === 0 ? "No internet for this step. Stay on your home Wi-Fi / mobile data and try again." : r.data?.error || "Registration failed.");
      setStep("fail");
      return;
    }
    setDevId(id); setDevKey(r.data.key);
    setLast("ok", "Device registered to your account ✓");
    setStep("connect");
  };

  const scan = async () => {
    setScanErr(""); setScanning(true);
    try {
      const res = await fetchTimeout(`${BASE}/scan`, {}, 9000);
      const arr = (await res.json()) as Net[];
      arr.sort((a, b) => b.rssi - a.rssi);
      setNetworks(arr);
      if (!arr.length) setScanErr("No networks found. Move closer to your router or enter the name manually.");
    } catch {
      setScanErr("Couldn't reach the device to scan. Make sure you joined \u201CCircuvent-Setup-\u2026\u201D and mobile data is OFF.");
    }
    setScanning(false);
  };

  const goWifi = () => { setStep("wifi"); setRetryNote(""); scan(); };

  const sendToDevice = async () => {
    setError("");
    if (!ssid.trim()) { setError("Pick or enter your Wi-Fi network."); return; }
    setStep("sending");
    setLog([
      { msg: "Device registered to your account ✓", state: "ok" },
      { msg: `Sending Wi-Fi (${ssid}) to the device…`, state: "run" },
    ]);
    const body =
      `ssid=${encodeURIComponent(ssid)}&pass=${encodeURIComponent(pass)}` +
      `&id=${encodeURIComponent(devId)}&key=${encodeURIComponent(devKey)}&broker=${encodeURIComponent(BROKER)}`;
    try {
      const res = await fetchTimeout(`${BASE}/save`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }, 10000);
      if (!res.ok) throw new Error(String(res.status));
      setLast("ok", "Wi-Fi + identity sent to the device ✓");
      setStep("reconnect");
    } catch {
      setLast("err", "Couldn't reach the device.");
      setError("Make sure you're on the \u201CCircuvent-Setup-\u2026\u201D Wi-Fi with mobile data OFF, then try again.");
      setStep("wifi");
    }
  };

  const waitForOnline = async () => {
    setStep("waiting");
    setLog([
      { msg: "Device registered ✓", state: "ok" },
      { msg: "Wi-Fi sent ✓", state: "ok" },
      { msg: `Verifying the device can join ${ssid}…`, state: "run" },
    ]);
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      const r = await api.device(devId);
      if (r.ok && r.data?.device?.online) {
        setLast("ok", "Device is online ✓");
        setStep("done");
        return;
      }
    }
    // Never came online -> almost always a wrong Wi-Fi password. Let them retry.
    setLast("err", `The device couldn't join ${ssid}.`);
    setRetryNote(`The device didn't come online. The Wi-Fi password may be wrong. Re-join the "Circuvent-Setup-…" hotspot (mobile data OFF) and re-enter the password.`);
    setStep("wifi");
  };

  const claim = async () => {
    setError("");
    if (!mid.trim() || !mkey.trim()) { setError("Enter the device ID and key."); return; }
    setBusy(true);
    const r = await api.claim(mid.trim(), mkey.trim(), name.trim() || mid.trim());
    setBusy(false);
    if (r.ok && r.data?.success) onClose(true);
    else setError(r.data?.error || "Could not add device. Check the ID and key.");
  };

  const goBack = () => {
    if (step === "mode") return onClose(false);
    if (step === "fail") return setStep("details");
    if (step === "wifi") return setStep("connect");
    setStep("mode");
  };

  return (
    <View style={s.wrap}>
      <View style={s.top}>
        <Pressable onPress={goBack} hitSlop={10}><Text style={s.back}>{step === "mode" ? "✕ Close" : "‹ Back"}</Text></Pressable>
        <Text style={s.title}>Add a device</Text>
        <View style={{ width: 54 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        {step === "mode" && (
          <View>
            <Text style={s.lead}>How would you like to add your device?</Text>
            <Pressable style={s.optCard} onPress={() => setStep("details")}>
              <Text style={s.optEmoji}>📶</Text>
              <View style={{ flex: 1 }}><Text style={s.optTitle}>Set up a new device</Text><Text style={s.optSub}>Connect it to Wi-Fi — no codes to type</Text></View>
              <Text style={s.chev}>›</Text>
            </Pressable>
            <Pressable style={s.optCard} onPress={() => setStep("manual")}>
              <Text style={s.optEmoji}>🔗</Text>
              <View style={{ flex: 1 }}><Text style={s.optTitle}>Add by ID &amp; key</Text><Text style={s.optSub}>The device is already online</Text></View>
              <Text style={s.chev}>›</Text>
            </Pressable>
          </View>
        )}

        {step === "manual" && (
          <View>
            <StepTag>Link an existing device</StepTag>
            <Field label="Device ID" value={mid} onChangeText={setMid} placeholder="e.g. smart-plug-1a2b" autoCapitalize="none" />
            <Field label="Device key" value={mkey} onChangeText={setMkey} placeholder="Key from the device" autoCapitalize="none" />
            <Field label="Name (optional)" value={name} onChangeText={setName} placeholder="e.g. Living-room plug" />
            {!!error && <Text style={s.err}>{error}</Text>}
            <Primary label="Link device" busy={busy} onPress={claim} />
          </View>
        )}

        {step === "details" && (
          <View>
            <StepTag>Step 1 of 3 · What are you setting up?</StepTag>
            <View style={s.typeGrid}>
              {TYPES.map((t) => (
                <Pressable key={t.id} style={[s.typeChip, type === t.id && s.typeChipOn]} onPress={() => setType(t.id)}>
                  <Text style={s.typeEmoji}>{t.emoji}</Text>
                  <Text style={[s.typeLabel, type === t.id && { color: "#fff" }]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
            <View style={{ height: 10 }} />
            <Field label="Device name (optional)" value={name} onChangeText={setName} placeholder="e.g. Overhead tank" />
            {!!error && <Text style={s.err}>{error}</Text>}
            <Primary label="Next" onPress={() => { if (!type) { setError("Pick what you're setting up."); return; } setError(""); provision(); }} />
          </View>
        )}

        {(step === "provision" || step === "sending" || step === "waiting") && (
          <View>
            <StepTag>{step === "provision" ? "Step 1 · Registering" : step === "sending" ? "Step 2 · Sending to device" : "Step 3 · Confirming"}</StepTag>
            <ProgressLog items={log} />
          </View>
        )}

        {step === "connect" && (
          <View>
            <StepTag>Step 2 of 3 · Connect to the device</StepTag>
            <ProgressLog items={[{ msg: "Device registered to your account ✓", state: "ok" }]} />
            <Text style={[s.lead, { marginTop: 14 }]}>
              1. Power on the device, wait ~15s.{"\n"}
              2. Tap below, join <Text style={s.b}>Circuvent-Setup-…</Text> (no password).{"\n"}
              3. Turn <Text style={s.b}>mobile data OFF</Text> so the phone can talk to the device.{"\n"}
              4. Come back and tap <Text style={s.b}>Continue</Text>.
            </Text>
            <Pressable style={s.secondary} onPress={openWifiSettings}><Text style={s.secondaryT}>Open Wi-Fi settings</Text></Pressable>
            <Primary label="Continue" onPress={goWifi} />
          </View>
        )}

        {step === "wifi" && (
          <View>
            <StepTag>Step 2 of 3 · Choose the device's Wi-Fi</StepTag>
            {!!retryNote && <Text style={s.err}>{retryNote}</Text>}
            <View style={s.rowBetween}>
              <Text style={s.label}>Networks near the device {networks.length ? `(${networks.length})` : ""}</Text>
              <Pressable onPress={scan} disabled={scanning}><Text style={s.link}>{scanning ? "Scanning…" : "↻ Rescan"}</Text></Pressable>
            </View>

            {scanning && <View style={s.center}><ActivityIndicator color="#06b6d4" /><Text style={s.hint}>Asking the device to scan…</Text></View>}
            {!!scanErr && !scanning && <Text style={s.err}>{scanErr}</Text>}

            {!manual && networks.map((nw) => (
              <Pressable key={nw.ssid} style={[s.netRow, ssid === nw.ssid && s.netRowOn]} onPress={() => setSsid(nw.ssid)}>
                <Text style={s.netName} numberOfLines={1}>{nw.ssid}</Text>
                <Text style={s.netMeta}>{nw.lock ? "🔒 " : ""}{bars(nw.rssi)}</Text>
              </Pressable>
            ))}

            <Pressable onPress={() => setManual((m) => !m)}>
              <Text style={[s.link, { marginTop: 10 }]}>{manual ? "‹ Pick from the list" : "Enter network name manually"}</Text>
            </Pressable>
            {manual && (
              <View style={{ marginTop: 8 }}>
                <Field label="Wi-Fi name (SSID)" value={ssid} onChangeText={setSsid} placeholder="Your 2.4 GHz Wi-Fi" autoCapitalize="none" />
              </View>
            )}

            {(ssid.length > 0 || manual) && (
              <View style={{ marginTop: 8 }}>
                <Field label={`Password for "${ssid || "your Wi-Fi"}"`} value={pass} onChangeText={setPass} placeholder="Wi-Fi password" secureTextEntry />
              </View>
            )}

            {!!error && <Text style={s.err}>{error}</Text>}
            <Primary label="Send Wi-Fi to device" onPress={sendToDevice} />
          </View>
        )}

        {step === "reconnect" && (
          <View>
            <StepTag>Almost done</StepTag>
            <ProgressLog items={[{ msg: "Device registered ✓", state: "ok" }, { msg: "Wi-Fi + identity sent ✓", state: "ok" }]} />
            <Text style={[s.lead, { marginTop: 14 }]}>
              The device is restarting and joining <Text style={s.b}>{ssid}</Text>. Switch your phone back to your
              <Text style={s.b}> home Wi-Fi</Text> (turn mobile data on), then continue to verify.
            </Text>
            <Pressable style={s.secondary} onPress={openWifiSettings}><Text style={s.secondaryT}>Open Wi-Fi settings</Text></Pressable>
            <Primary label="Continue" onPress={waitForOnline} />
          </View>
        )}

        {step === "done" && (
          <View>
            <StepTag>Done</StepTag>
            <ProgressLog items={log} />
            <Text style={[s.okBadge, { marginTop: 12 }]}>✓ {name || type} is set up</Text>
            <Primary label="Finish" onPress={() => onClose(true)} />
          </View>
        )}

        {step === "fail" && (
          <View>
            <StepTag>Couldn&apos;t complete setup</StepTag>
            <ProgressLog items={log} />
            {!!error && <Text style={[s.err, { marginTop: 10 }]}>{error}</Text>}
            <Primary label="Try again" onPress={() => setStep("details")} />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function ProgressLog({ items }: { items: LogItem[] }) {
  return (
    <View style={{ marginTop: 6 }}>
      {items.map((it, i) => (
        <View key={i} style={s.logRow}>
          {it.state === "run" ? (
            <ActivityIndicator size="small" color="#06b6d4" style={{ width: 22 }} />
          ) : (
            <Text style={[s.logIcon, { color: it.state === "ok" ? "#22c55e" : "#ef4444" }]}>{it.state === "ok" ? "✓" : "✕"}</Text>
          )}
          <Text style={[s.logMsg, it.state === "err" && { color: "#fca5a5" }]}>{it.msg}</Text>
        </View>
      ))}
    </View>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor="#64748b" {...props} />
    </View>
  );
}
function Primary({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  return (
    <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={busy ? undefined : onPress}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>{label}</Text>}
    </Pressable>
  );
}
function StepTag({ children }: { children: React.ReactNode }) {
  return <Text style={s.stepTag}>{children}</Text>;
}

const s = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "#0b1020" },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomColor: "#1f2937", borderBottomWidth: 1 },
  back: { color: "#8b5cf6", fontSize: 15, width: 54 },
  title: { color: "#fff", fontSize: 17, fontWeight: "800" },
  lead: { color: "#94a3b8", fontSize: 14, lineHeight: 22, marginBottom: 16 },
  b: { color: "#e5e7eb", fontWeight: "700" },
  stepTag: { color: "#06b6d4", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 },
  optCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#111827", borderColor: "#1f2937", borderWidth: 1, borderRadius: 16, padding: 18, marginBottom: 12 },
  optEmoji: { fontSize: 26 },
  optTitle: { color: "#e5e7eb", fontSize: 16, fontWeight: "700" },
  optSub: { color: "#64748b", fontSize: 13, marginTop: 2 },
  chev: { color: "#475569", fontSize: 26 },
  label: { color: "#e5e7eb", fontSize: 14, fontWeight: "600", marginBottom: 10 },
  hint: { color: "#64748b", fontSize: 12, marginTop: 8 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  link: { color: "#22d3ee", fontWeight: "700" },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: { width: "31%", backgroundColor: "#111827", borderColor: "#1f2937", borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  typeChipOn: { borderColor: "#06b6d4", backgroundColor: "rgba(6,182,212,0.12)" },
  typeEmoji: { fontSize: 22, marginBottom: 4 },
  typeLabel: { color: "#94a3b8", fontSize: 11, textAlign: "center" },
  netRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: "#111827", borderColor: "#1f2937", borderWidth: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 8 },
  netRowOn: { borderColor: "#06b6d4", backgroundColor: "rgba(6,182,212,0.12)" },
  netName: { color: "#e5e7eb", fontSize: 15, flex: 1, marginRight: 10 },
  netMeta: { color: "#94a3b8", fontSize: 14 },
  fieldLabel: { color: "#94a3b8", fontSize: 12, marginBottom: 6 },
  input: { backgroundColor: "#111827", borderColor: "#334155", borderWidth: 1, borderRadius: 12, color: "#e5e7eb", padding: 14, fontSize: 15 },
  btn: { backgroundColor: "#06b6d4", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
  btnT: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondary: { borderColor: "#334155", borderWidth: 1, borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 16 },
  secondaryT: { color: "#22d3ee", fontWeight: "700" },
  err: { color: "#f59e0b", marginBottom: 12, lineHeight: 20 },
  okBadge: { color: "#22c55e", fontWeight: "800", fontSize: 16, marginBottom: 12 },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 20 },
  logRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  logIcon: { width: 22, textAlign: "center", fontSize: 16, fontWeight: "800" },
  logMsg: { color: "#cbd5e1", fontSize: 14, flex: 1 },
});
