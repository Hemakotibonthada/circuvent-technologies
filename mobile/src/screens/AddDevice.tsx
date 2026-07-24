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
 * Zero-touch "Add a device" wizard.
 *
 * Every device runs the SAME firmware with NO baked-in id/key. On first boot it
 * broadcasts an open AP "Circuvent-Setup-XXXX" and serves a tiny portal at
 * 192.168.4.1 (GET /info -> {hwid,type}, POST /save). The app:
 *   1. collects the home Wi-Fi,
 *   2. reads /info from the device (over the device AP),
 *   3. provisions a fresh identity from the control plane (id+key, owned by the
 *      user) over cellular,
 *   4. pushes id+key+Wi-Fi to the device, which reboots and connects.
 * No manual id/key, no separate claim — the device is owned the moment it's set up.
 *
 * NOTE: keep mobile data ON during setup so the phone can reach both the device
 * (local Wi-Fi) and the control plane (cellular) at the same time.
 */

const INFO_URL = "http://192.168.4.1/info";
const SAVE_URL = "http://192.168.4.1/save";
const BROKER = "mqtt.circuvent.com";

type Step = "mode" | "wifi" | "connect" | "working" | "done" | "manual";

function fetchTimeout(url: string, opts: RequestInit, ms: number): Promise<Response> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { ...opts, signal: c.signal }).finally(() => clearTimeout(t));
}

const rand = () => Math.random().toString(36).slice(2, 6);

export default function AddDevice({ onClose }: { onClose: (added: boolean) => void }) {
  const [step, setStep] = useState<Step>("mode");
  const [name, setName] = useState("");
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [detail, setDetail] = useState("");
  const [busy, setBusy] = useState(false);

  // manual path
  const [mid, setMid] = useState("");
  const [mkey, setMkey] = useState("");

  const openWifiSettings = async () => {
    try {
      if (Platform.OS === "android") await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.WIFI_SETTINGS);
      else await Linking.openSettings();
    } catch {
      /* ignore */
    }
  };

  const run = async () => {
    setError("");
    setStep("working");

    // 1. read the device's hardware id + type over the setup AP
    setDetail("Reading device…");
    let hwid = "";
    let type = "";
    try {
      const r = await fetchTimeout(INFO_URL, {}, 8000);
      const info = (await r.json()) as { hwid?: string; type?: string };
      hwid = String(info.hwid || "");
      type = String(info.type || "");
    } catch {
      setError("Couldn't reach the device. Connect to the \u201CCircuvent-Setup-\u2026\u201D Wi-Fi (keep mobile data ON) and try again.");
      setStep("connect");
      return;
    }
    if (!hwid || !type) {
      setError("The device didn't report its details. Power-cycle it and retry.");
      setStep("connect");
      return;
    }

    // 2. provision a fresh identity from the control plane (over cellular)
    setDetail("Registering with your account…");
    let id = `${type}-${hwid}`.toLowerCase();
    let prov = await api.provision(id, type, name.trim() || type);
    if (!prov.ok && prov.status === 409) {
      id = `${id}-${rand()}`;
      prov = await api.provision(id, type, name.trim() || type);
    }
    if (!prov.ok || !prov.data?.key) {
      setError(prov.data?.error || "Couldn't register the device. Check your internet (keep mobile data ON) and retry.");
      setStep("connect");
      return;
    }
    const key = prov.data.key;

    // 3. push identity + Wi-Fi to the device; it reboots and joins
    setDetail("Sending Wi-Fi + identity to the device…");
    const body =
      `ssid=${encodeURIComponent(ssid)}&pass=${encodeURIComponent(pass)}` +
      `&id=${encodeURIComponent(id)}&key=${encodeURIComponent(key)}&broker=${encodeURIComponent(BROKER)}`;
    try {
      await fetchTimeout(SAVE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body,
      }, 10000);
    } catch {
      // The device reboots right after saving, which can abort the response —
      // that's expected. We confirm via the device coming online shortly.
    }
    setStep("done");
  };

  const claim = async () => {
    setError("");
    if (!mid.trim() || !mkey.trim()) {
      setError("Enter the device ID and key.");
      return;
    }
    setBusy(true);
    const r = await api.claim(mid.trim(), mkey.trim(), name.trim() || mid.trim());
    setBusy(false);
    if (r.ok && r.data?.success) onClose(true);
    else setError(r.data?.error || "Could not add device. Check the ID and key.");
  };

  return (
    <View style={s.wrap}>
      <View style={s.top}>
        <Pressable onPress={() => (step === "mode" ? onClose(false) : setStep("mode"))} hitSlop={10}>
          <Text style={s.back}>{step === "mode" ? "✕ Close" : "‹ Back"}</Text>
        </Pressable>
        <Text style={s.title}>Add a device</Text>
        <View style={{ width: 54 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        {step === "mode" && (
          <View>
            <Text style={s.lead}>How would you like to add your device?</Text>
            <Pressable style={s.optCard} onPress={() => setStep("wifi")}>
              <Text style={s.optEmoji}>📶</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.optTitle}>Set up a new device</Text>
                <Text style={s.optSub}>Connect it to Wi-Fi — no codes to type</Text>
              </View>
              <Text style={s.chev}>›</Text>
            </Pressable>
            <Pressable style={s.optCard} onPress={() => setStep("manual")}>
              <Text style={s.optEmoji}>🔗</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.optTitle}>Add by ID &amp; key</Text>
                <Text style={s.optSub}>The device is already online</Text>
              </View>
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

        {step === "wifi" && (
          <View>
            <StepTag>Step 1 of 3 · Your Wi-Fi</StepTag>
            <Text style={s.lead}>The device will join this network. Circuvent devices use 2.4 GHz Wi-Fi.</Text>
            <Field label="Device name" value={name} onChangeText={setName} placeholder="e.g. Overhead tank" />
            <Field label="Wi-Fi name (SSID)" value={ssid} onChangeText={setSsid} placeholder="Your home Wi-Fi" autoCapitalize="none" />
            <Field label="Wi-Fi password" value={pass} onChangeText={setPass} placeholder="Wi-Fi password" secureTextEntry />
            {!!error && <Text style={s.err}>{error}</Text>}
            <Primary
              label="Next"
              onPress={() => {
                if (!ssid.trim()) { setError("Enter your Wi-Fi name."); return; }
                setError(""); setStep("connect");
              }}
            />
          </View>
        )}

        {step === "connect" && (
          <View>
            <StepTag>Step 2 of 3 · Connect to the device</StepTag>
            <Text style={s.lead}>
              1. Power on the device and wait ~15s.{"\n"}
              2. Tap below and join the <Text style={s.b}>Circuvent-Setup-…</Text> Wi-Fi (no password).{"\n"}
              3. Keep <Text style={s.b}>mobile data ON</Text> so setup can reach the internet.{"\n"}
              4. Come back and tap <Text style={s.b}>Continue</Text>.
            </Text>
            <Pressable style={s.secondary} onPress={openWifiSettings}>
              <Text style={s.secondaryT}>Open Wi-Fi settings</Text>
            </Pressable>
            {!!error && <Text style={s.err}>{error}</Text>}
            <Primary label="Continue" onPress={run} />
          </View>
        )}

        {step === "working" && (
          <View style={s.center}>
            <ActivityIndicator size="large" color="#06b6d4" />
            <Text style={[s.lead, { textAlign: "center", marginTop: 16 }]}>{detail || "Setting up…"}</Text>
          </View>
        )}

        {step === "done" && (
          <View>
            <StepTag>Step 3 of 3 · All set</StepTag>
            <Text style={s.okBadge}>✓ Device configured</Text>
            <Text style={s.lead}>
              It&apos;s restarting and joining <Text style={s.b}>{ssid}</Text>, then it&apos;ll appear in your devices
              (usually within a minute). Reconnect your phone to your home Wi-Fi.
            </Text>
            <Primary label="Done" onPress={() => onClose(true)} />
          </View>
        )}
      </ScrollView>
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
  lead: { color: "#94a3b8", fontSize: 14, lineHeight: 21, marginBottom: 16 },
  b: { color: "#e5e7eb", fontWeight: "700" },
  stepTag: { color: "#06b6d4", fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 },
  optCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: "#111827", borderColor: "#1f2937", borderWidth: 1, borderRadius: 16, padding: 18, marginBottom: 12 },
  optEmoji: { fontSize: 26 },
  optTitle: { color: "#e5e7eb", fontSize: 16, fontWeight: "700" },
  optSub: { color: "#64748b", fontSize: 13, marginTop: 2 },
  chev: { color: "#475569", fontSize: 26 },
  fieldLabel: { color: "#94a3b8", fontSize: 12, marginBottom: 6 },
  input: { backgroundColor: "#111827", borderColor: "#334155", borderWidth: 1, borderRadius: 12, color: "#e5e7eb", padding: 14, fontSize: 15 },
  btn: { backgroundColor: "#06b6d4", borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
  btnT: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondary: { borderColor: "#334155", borderWidth: 1, borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 16 },
  secondaryT: { color: "#22d3ee", fontWeight: "700" },
  err: { color: "#f59e0b", marginBottom: 12, lineHeight: 20 },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  okBadge: { color: "#22c55e", fontWeight: "800", fontSize: 16, marginBottom: 12 },
});
