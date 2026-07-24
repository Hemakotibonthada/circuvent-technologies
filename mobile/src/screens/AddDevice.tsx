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
 * "Add a device" wizard.
 *
 * Two paths:
 *  - Wi-Fi setup (SoftAP): the unconfigured device broadcasts an open AP
 *    "Circuvent-Setup-XXXX" and serves a captive portal at 192.168.4.1. We
 *    collect the home Wi-Fi + the device id/key, have the user join the device
 *    AP, POST the Wi-Fi creds to 192.168.4.1/save (the device then reboots and
 *    joins the home network + our broker), and finally claim the device to the
 *    account. This mirrors the flow used by Kasa / Tuya / eWeLink.
 *  - Manual: the device is already online — just link it by id + key.
 */

const AP_PREFIX = "Circuvent-Setup-";
const SAVE_URL = "http://192.168.4.1/save";

type Step = "mode" | "identify" | "wifi" | "connect" | "sending" | "done" | "manual";

async function pushWifiCredentials(ssid: string, pass: string): Promise<{ ok: boolean; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(SAVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `ssid=${encodeURIComponent(ssid)}&pass=${encodeURIComponent(pass)}`,
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) return { ok: true };
    return { ok: false, error: `The device responded with ${res.status}. Please retry.` };
  } catch {
    clearTimeout(timer);
    return {
      ok: false,
      error:
        "Couldn't reach the device. Make sure your phone is connected to the \u201CCircuvent-Setup-\u2026\u201D Wi-Fi and mobile data is OFF, then retry.",
    };
  }
}

export default function AddDevice({ onClose }: { onClose: (added: boolean) => void }) {
  const [step, setStep] = useState<Step>("mode");
  const [id, setId] = useState("");
  const [key, setKey] = useState("");
  const [name, setName] = useState("");
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const openWifiSettings = async () => {
    try {
      if (Platform.OS === "android") {
        await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.WIFI_SETTINGS);
      } else {
        await Linking.openSettings();
      }
    } catch {
      /* ignore */
    }
  };

  const send = async () => {
    setError("");
    setStep("sending");
    const r = await pushWifiCredentials(ssid, pass);
    if (r.ok) setStep("done");
    else {
      setError(r.error || "Failed to send Wi-Fi credentials.");
      setStep("connect");
    }
  };

  const claim = async (fromManual: boolean) => {
    setError("");
    if (!id.trim() || !key.trim()) {
      setError("Enter the device ID and key from the label.");
      return;
    }
    setBusy(true);
    const r = await api.claim(id.trim(), key.trim(), name.trim() || id.trim());
    setBusy(false);
    if (r.ok && r.data?.success) onClose(true);
    else setError(r.data?.error || (fromManual ? "Could not add device. Check the ID and key." : "Device linked, but claiming failed — it may still be connecting. Try again in a moment."));
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
            <Pressable style={s.optCard} onPress={() => setStep("identify")}>
              <Text style={s.optEmoji}>📶</Text>
              <View style={{ flex: 1 }}>
                <Text style={s.optTitle}>Set up a new device</Text>
                <Text style={s.optSub}>Connect a brand-new device to your Wi-Fi</Text>
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
            <Field label="Device ID" value={id} onChangeText={setId} placeholder="e.g. cv-plug-0001" autoCapitalize="none" />
            <Field label="Device key" value={key} onChangeText={setKey} placeholder="Key from the device label" autoCapitalize="none" />
            <Field label="Name (optional)" value={name} onChangeText={setName} placeholder="e.g. Living-room plug" />
            {!!error && <Text style={s.err}>{error}</Text>}
            <Primary label="Link device" busy={busy} onPress={() => claim(true)} />
          </View>
        )}

        {step === "identify" && (
          <View>
            <StepTag>Step 1 of 4 · Identify the device</StepTag>
            <Text style={s.lead}>Enter the ID and key printed on the device label. You&apos;ll link it to your account at the end.</Text>
            <Field label="Device ID" value={id} onChangeText={setId} placeholder="e.g. cv-plug-0001" autoCapitalize="none" />
            <Field label="Device key" value={key} onChangeText={setKey} placeholder="Key from the device label" autoCapitalize="none" />
            <Field label="Name (optional)" value={name} onChangeText={setName} placeholder="e.g. Living-room plug" />
            {!!error && <Text style={s.err}>{error}</Text>}
            <Primary
              label="Next"
              onPress={() => {
                if (!id.trim() || !key.trim()) { setError("Enter the device ID and key."); return; }
                setError(""); setStep("wifi");
              }}
            />
          </View>
        )}

        {step === "wifi" && (
          <View>
            <StepTag>Step 2 of 4 · Your Wi-Fi</StepTag>
            <Text style={s.lead}>The device will use this network. Circuvent devices support 2.4 GHz Wi-Fi only.</Text>
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
            <StepTag>Step 3 of 4 · Connect to the device</StepTag>
            <Text style={s.lead}>
              1. Power on the device and wait ~15s for its setup hotspot.{"\n"}
              2. Tap below and join the <Text style={s.b}>{AP_PREFIX}…</Text> network (no password).{"\n"}
              3. Turn <Text style={s.b}>mobile data OFF</Text> so the app can reach the device.{"\n"}
              4. Come back here and tap <Text style={s.b}>Send Wi-Fi</Text>.
            </Text>
            <Pressable style={s.secondary} onPress={openWifiSettings}>
              <Text style={s.secondaryT}>Open Wi-Fi settings</Text>
            </Pressable>
            {!!error && <Text style={s.err}>{error}</Text>}
            <Primary label="Send Wi-Fi to device" onPress={send} />
          </View>
        )}

        {step === "sending" && (
          <View style={s.center}>
            <ActivityIndicator size="large" color="#06b6d4" />
            <Text style={[s.lead, { textAlign: "center", marginTop: 16 }]}>Sending your Wi-Fi to the device…</Text>
          </View>
        )}

        {step === "done" && (
          <View>
            <StepTag>Step 4 of 4 · Finish</StepTag>
            <Text style={s.okBadge}>✓ Wi-Fi sent</Text>
            <Text style={s.lead}>
              The device is restarting and joining <Text style={s.b}>{ssid}</Text>. Now:{"\n\n"}
              1. Reconnect your phone to your home Wi-Fi (and turn mobile data back on).{"\n"}
              2. Tap <Text style={s.b}>Link device</Text> to add it to your account.
            </Text>
            {!!error && <Text style={s.err}>{error}</Text>}
            <Primary label="Link device" busy={busy} onPress={() => claim(false)} />
            <Pressable onPress={() => setStep("connect")} style={{ marginTop: 12 }}>
              <Text style={s.link}>Re-send Wi-Fi credentials</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Field({
  label,
  ...props
}: { label: string } & React.ComponentProps<typeof TextInput>) {
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
  link: { color: "#8b5cf6", textAlign: "center" },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 60 },
  okBadge: { color: "#22c55e", fontWeight: "800", fontSize: 16, marginBottom: 12 },
});
