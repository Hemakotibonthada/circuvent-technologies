import React, { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, Animated, Easing, Platform, Linking } from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import { Screen, Card, SectionLabel, useTheme, IconButton, useBackHandler } from "../ui";
import { Device, api } from "../api";
import { sealToDevice } from "../crypto";
import {
  wifiAutoSupported, ensureWifiPermissions, discoverDeviceAPs, connectToDeviceAP,
  leaveDeviceAP, rssiBars, type DeviceAP,
} from "../wifi";
import { readWifiStatus, wifiNotice, reprovisionRoute } from "../wifi-status";

const BASE = "http://192.168.4.1";
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
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

type Step = "intro" | "push" | "pushing" | "discover" | "connect" | "wifi" | "sending" | "done" | "fail";
interface Net { ssid: string; rssi: number; lock: boolean }

// Change the Wi-Fi network of an already-provisioned device. The device keeps its
// identity (id/key) — we only push new Wi-Fi credentials after a reset, so no
// re-claim is needed.
export default function ChangeWifi({ device, onBack }: { device: Device; onBack: () => void }) {
  const { c } = useTheme();
  const [step, setStep] = useState<Step>("intro");
  const [deviceAPs, setDeviceAPs] = useState<DeviceAP[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [connectingSsid, setConnectingSsid] = useState("");
  const [autoMode, setAutoMode] = useState(false);
  const [apError, setApError] = useState("");
  const [networks, setNetworks] = useState<Net[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState("");
  const [scanElapsed, setScanElapsed] = useState(0);
  const [manual, setManual] = useState(false);
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [note, setNote] = useState("");
  const discoverStop = useRef(false);

  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const active = discovering || !!connectingSsid;
    if (!active) { pulse.stopAnimation(); pulse.setValue(0); return; }
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.ease), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [discovering, connectingSsid, pulse]);

  useEffect(() => () => { discoverStop.current = true; leaveDeviceAP(); }, []);

  const openWifiSettings = async () => {
    try {
      if (Platform.OS === "android") await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.WIFI_SETTINGS);
      else await Linking.openSettings();
    } catch { /* ignore */ }
  };

  const startDiscover = () => {
    if (wifiAutoSupported()) { setStep("discover"); setTimeout(() => discover(), 300); }
    else setStep("connect");
  };

  /*
   * The device is online, so it can simply be handed new credentials.
   *
   * `{action:"wifi", ssid, pass}` has been handled by every build since the
   * shared library grew _applyWifi(), and nothing had ever sent it — so the
   * app made people find the board, hold a button for three seconds and hope
   * the phone's scan noticed an open hotspot, all to reach a device that was
   * answering the whole time.
   *
   * It is safe to do remotely because _applyWifi() puts the old credentials
   * back if the new network will not take it. The worst case is a device that
   * is exactly where it started and says so.
   */
  const pushWifi = async () => {
    setError("");
    if (!ssid.trim()) { setError("Enter the Wi-Fi network to move this device to."); return; }
    setStep("pushing");
    setNote(`Sending the new network to ${device.name || device.id}…`);
    const r = await api.command(device.id, { action: "wifi", ssid: ssid.trim(), pass });
    if (!r.ok) {
      setError("Couldn't reach the device just now. Try again, or use the hotspot route below.");
      setStep("push");
      return;
    }
    await watchWifiStatus();
  };

  /**
   * Follows the device's own account of the change.
   *
   * A device swapping networks stops answering by design, so "offline" here is
   * the expected middle of a healthy operation rather than evidence of one
   * going wrong. wifiStatus is what tells the two apart, and reading it is the
   * whole reason this screen can say anything at all during the gap.
   */
  const watchWifiStatus = async () => {
    setNote("Moving the device onto the new network…");
    for (let i = 0; i < 24; i++) {
      await sleep(2500);
      const r = await api.devices();
      if (!r.ok) continue;
      const d = (r.data.devices || []).find((x) => x.id === device.id);
      if (!d) continue;
      const w = readWifiStatus((d.state as Record<string, unknown> | undefined)?.wifiStatus);

      if (w.phase === "failed") {
        setError(wifiNotice(w, !!d.online) || "The device could not join that network.");
        setStep("push");
        return;
      }
      if (w.phase === "unchanged") {
        setNote(wifiNotice(w, !!d.online) || "");
        setStep("done");
        return;
      }
      if (w.phase === "ok" && d.online) { setNote(""); setStep("done"); return; }

      const notice = wifiNotice(w, !!d.online);
      if (notice) setNote(notice);
    }
    setStep("done");
    setNote("Sent. The device has not reported back yet — it may still be joining, or the password may be wrong.");
  };

  /*
   * Raise the device's setup hotspot without anybody walking to it.
   *
   * The console has been able to do this since the firmware grew the `setup`
   * action; the app never learned. It is the right route when the new network
   * is one the device cannot be told about over the old one — moving house,
   * or a router that has already gone.
   */
  const openSetupRemotely = async () => {
    setApError(""); setNote("");
    const r = await api.command(device.id, { action: "setup", minutes: 10 });
    if (!r.ok) {
      setApError("Couldn't ask the device to open setup mode. Use the button route instead.");
      return;
    }
    setNote("Asked the device to open its setup hotspot for 10 minutes. It will rejoin your Wi-Fi on its own afterwards.");
    await sleep(4000);
    startDiscover();
  };

  const discover = async () => {
    setApError(""); setDeviceAPs([]); setDiscovering(true); discoverStop.current = false;
    const ok = await ensureWifiPermissions();
    if (!ok) { setDiscovering(false); setApError("Location permission is needed to find your device. Grant it, or connect manually."); return; }
    const found = await discoverDeviceAPs(15000, (aps) => setDeviceAPs(aps), () => discoverStop.current);
    setDiscovering(false);
    if (!found.length && !discoverStop.current) setApError("No device found yet. Hold the device's button ~3s until it blinks, then tap Rescan.");
  };

  const pickDeviceAP = async (ap: DeviceAP) => {
    setApError(""); setConnectingSsid(ap.ssid); discoverStop.current = true;
    try {
      await connectToDeviceAP(ap.ssid);
      await sleep(1200);
      setAutoMode(true); setConnectingSsid("");
      goWifi(true);
    } catch {
      setConnectingSsid("");
      setApError(`Couldn't join ${ap.ssid}. Tap it to retry, or use "Connect manually".`);
    }
  };

  const scan = async () => {
    setScanErr(""); setScanning(true); setScanElapsed(0);
    const start = Date.now();
    const tick = setInterval(() => setScanElapsed(Math.round((Date.now() - start) / 1000)), 500);
    try {
      for (let i = 0; Date.now() - start < 15000; i++) {
        try {
          const res = await fetchTimeout(`${BASE}/scan`, {}, 5000);
          const arr = (await res.json()) as Net[];
          arr.sort((a, b) => b.rssi - a.rssi);
          if (arr.length) { setNetworks(arr); setScanErr(""); return; }
        } catch { /* transient */ }
        await sleep(1200);
      }
      setScanErr("Couldn't read nearby networks yet. Tap Rescan — or enter your Wi-Fi name manually below.");
    } finally { clearInterval(tick); setScanning(false); }
  };

  const goWifi = (auto = false) => { setStep("wifi"); setNetworks([]); setScanErr("Reading nearby networks from the device…"); setTimeout(() => scan(), auto ? 400 : 800); };

  const send = async () => {
    setError("");
    if (!ssid.trim()) { setError("Pick or enter your Wi-Fi network."); return; }
    setStep("sending"); setNote("Securing the connection to the device…");
    let pk = "";
    try { const r = await fetchTimeout(`${BASE}/info`, {}, 8000); pk = String(((await r.json()) as { pk?: string }).pk || ""); } catch { /* below */ }
    if (!pk) { setError("Couldn't reach the device. Make sure it's reset and you're connected to it."); setStep("wifi"); return; }
    let sealed;
    try {
      const plaintext = `ssid=${encodeURIComponent(ssid)}&pass=${encodeURIComponent(pass)}`;
      sealed = sealToDevice(pk, plaintext);
    } catch { setError("Encryption failed. Please try again."); setStep("wifi"); return; }
    setNote("Sending new Wi-Fi securely…");
    const body = `enc=1&epk=${encodeURIComponent(sealed.epk)}&nonce=${encodeURIComponent(sealed.nonce)}&box=${encodeURIComponent(sealed.box)}`;
    try {
      const res = await fetchTimeout(`${BASE}/save`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }, 10000);
      if (!res.ok) throw new Error(String(res.status));
      if (autoMode) { setNote("Switching your phone back to home Wi-Fi…"); await leaveDeviceAP(); await sleep(1500); }
      confirmOnline();
    } catch {
      setError("Lost the connection to the device. Try again."); setStep("wifi");
    }
  };

  // The device reboots and rejoins with its SAME identity — watch it come back.
  const confirmOnline = async () => {
    setStep("done"); setNote("Your device is reconnecting on the new network…");
    for (let i = 0; i < 20; i++) {
      await sleep(3000);
      const r = await api.devices();
      if (r.ok) {
        const d = (r.data.devices || []).find((x) => x.id === device.id);
        if (d?.online) { setNote(""); return; }
      }
    }
    setNote("Sent. If it doesn't reconnect shortly, double-check the Wi-Fi password and try again.");
  };

  const goBack = () => {
    if (step === "intro") return onBack();
    if (step === "push") return setStep("intro");
    if (step === "pushing") return; // a change is in flight; leaving mid-way tells the user nothing
    if (step === "discover") { discoverStop.current = true; return setStep("intro"); }
    if (step === "wifi") { if (autoMode) { leaveDeviceAP(); setAutoMode(false); } return setStep(wifiAutoSupported() ? "discover" : "connect"); }
    if (step === "connect") return setStep("intro");
    if (step === "fail") return setStep("intro");
    return setStep("intro");
  };
  useBackHandler(() => { goBack(); return true; });

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1.5] });
  const opacity = pulse.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 0.5, 0] });

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 52, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 }}>
          <IconButton glyph="‹" onPress={goBack} />
          <Text style={{ color: c.text, fontSize: 22, fontWeight: "800", flex: 1 }} numberOfLines={1}>Change Wi-Fi</Text>
        </View>

        {step === "intro" && (
          <View>
            {reprovisionRoute(!!device.online) === "push" ? (
              /*
               * The device is answering, so none of the button-and-hotspot
               * ceremony is necessary. That ceremony was the entire screen
               * before, which is why re-provisioning a board that was online
               * and three metres away still meant finding it and holding a
               * button until a light blinked.
               */
              <View>
                <SectionLabel>Move this device to another network</SectionLabel>
                <Card padded style={{ marginBottom: 12 }}>
                  <Text style={{ color: c.text, fontSize: 16, fontWeight: "700", marginBottom: 8 }}>{device.name || device.id}</Text>
                  <Text style={{ color: c.textDim, fontSize: 14, lineHeight: 22 }}>
                    This device is online, so its new Wi-Fi can be sent straight to it — no buttons, and no need to go and find it.
                    {"\n\n"}It drops off for up to a minute while it joins. If the new network refuses it, it puts the old one back and tells you why.
                  </Text>
                </Card>
                <Primary c={c} label="Enter the new Wi-Fi" onPress={() => { setError(""); setStep("push"); }} />
                <Pressable onPress={openSetupRemotely} style={{ marginTop: 14, minHeight: 44, justifyContent: "center" }}>
                  <Text style={{ color: c.accentHi, textAlign: "center" }}>Open the device's setup hotspot instead ›</Text>
                </Pressable>
                <Pressable onPress={startDiscover} style={{ marginTop: 6, minHeight: 44, justifyContent: "center" }}>
                  <Text style={{ color: c.faint, textAlign: "center", fontSize: 13 }}>Use the reset button route</Text>
                </Pressable>
                {!!note && <Text style={{ color: c.textDim, fontSize: 13, marginTop: 12 }}>{note}</Text>}
                {!!apError && <Text style={{ color: c.red, fontSize: 13, marginTop: 12 }}>{apError}</Text>}
              </View>
            ) : (
              <View>
                <SectionLabel>Step 1 · Reset the device</SectionLabel>
                <Card padded style={{ marginBottom: 12 }}>
                  <Text style={{ color: c.text, fontSize: 16, fontWeight: "700", marginBottom: 8 }}>{device.name || device.id}</Text>
                  <Text style={{ color: c.textDim, fontSize: 13, marginBottom: 10 }}>
                    This device is not reachable right now, so its new Wi-Fi has to be handed over in person.
                  </Text>
                  <Text style={{ color: c.textDim, fontSize: 14, lineHeight: 22 }}>
                    1. On the device, press &amp; hold the <Text style={{ color: c.text, fontWeight: "700" }}>reset/BOOT button for ~3 seconds</Text> until the light starts blinking.{"\n"}
                    2. It re-opens its setup hotspot — its saved login stays intact, only the Wi-Fi changes.{"\n"}
                    3. Tap Continue and we'll find it for you.
                  </Text>
                </Card>
                <Text style={{ color: c.faint, fontSize: 12, marginBottom: 16 }}>Tip: holding for ~8 seconds does a full factory reset instead.</Text>
                <Primary c={c} label="Continue" onPress={startDiscover} />
              </View>
            )}
          </View>
        )}

        {step === "push" && (
          <View>
            <SectionLabel>The network to move it to</SectionLabel>
            <Card padded style={{ marginBottom: 12 }}>
              <Text style={{ color: c.textDim, fontSize: 13, lineHeight: 20 }}>
                Sent to the device over your existing connection. It has to be a 2.4 GHz network — these boards have no 5 GHz radio, which is the most common reason a correct password still fails.
              </Text>
            </Card>
            <TextInput
              value={ssid}
              onChangeText={setSsid}
              placeholder="Wi-Fi name (SSID)"
              placeholderTextColor={c.faint}
              autoCapitalize="none"
              autoCorrect={false}
              style={{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, color: c.text, marginBottom: 10 }}
            />
            <TextInput
              value={pass}
              onChangeText={setPass}
              placeholder="Password"
              placeholderTextColor={c.faint}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
              style={{ backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, minHeight: 48, color: c.text, marginBottom: 14 }}
            />
            {!!error && <Text style={{ color: c.red, fontSize: 13, marginBottom: 12 }}>{error}</Text>}
            <Primary c={c} label="Send to device" onPress={pushWifi} />
          </View>
        )}

        {step === "pushing" && (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <ActivityIndicator color={c.accentHi} size="large" />
            <Text style={{ color: c.textDim, fontSize: 14, textAlign: "center", lineHeight: 22, marginTop: 18 }}>{note}</Text>
          </View>
        )}

        {step === "discover" && (
          <View>
            <SectionLabel>Step 2 · Find your device</SectionLabel>
            <View style={{ height: 140, alignItems: "center", justifyContent: "center", marginVertical: 6 }}>
              <View style={{ position: "absolute", alignItems: "center", justifyContent: "center" }}>
                <Animated.View style={{ position: "absolute", width: 130, height: 130, borderRadius: 65, borderWidth: 2, borderColor: c.accentHi, transform: [{ scale }], opacity }} />
              </View>
              <Text style={{ fontSize: 44 }}>{connectingSsid ? "🔗" : "📡"}</Text>
            </View>
            <Text style={{ color: c.textDim, fontSize: 14, textAlign: "center", lineHeight: 22, marginBottom: 6 }}>
              {connectingSsid ? `Connecting to ${connectingSsid}…\nTap “Connect” if your phone asks.`
                : discovering ? "Scanning for your device…"
                : deviceAPs.length ? "Tap your device to connect automatically." : "Make sure the device light is blinking."}
            </Text>
            {deviceAPs.map((ap) => (
              <Pressable key={ap.ssid} onPress={() => pickDeviceAP(ap)} disabled={!!connectingSsid}>
                <Card padded style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10, borderColor: connectingSsid === ap.ssid ? c.accentHi : undefined, borderWidth: connectingSsid === ap.ssid ? 1 : 0 }}>
                  <Text style={{ fontSize: 22 }}>📶</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: c.text, fontSize: 15, fontWeight: "700" }} numberOfLines={1}>{ap.ssid}</Text>
                    <Text style={{ color: c.faint, fontSize: 12 }}>Circuvent device · {ap.hwid}</Text>
                  </View>
                  {connectingSsid === ap.ssid ? <ActivityIndicator color={c.accentHi} /> : <Text style={{ color: c.accentHi, fontSize: 16 }}>{rssiBars(ap.rssi)}</Text>}
                </Card>
              </Pressable>
            ))}
            {!!apError && <Text style={{ color: c.red, fontSize: 13, marginTop: 12 }}>{apError}</Text>}
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 16 }}>
              <Pressable onPress={() => discover()} disabled={discovering || !!connectingSsid} hitSlop={10}><Text style={{ color: c.accentHi, opacity: discovering || connectingSsid ? 0.5 : 1 }}>{discovering ? "Scanning…" : "↻ Rescan"}</Text></Pressable>
              <Pressable onPress={() => { discoverStop.current = true; setDiscovering(false); setStep("connect"); }} hitSlop={10}><Text style={{ color: c.accentHi }}>Connect manually ›</Text></Pressable>
            </View>
          </View>
        )}

        {step === "connect" && (
          <View>
            <SectionLabel>Step 2 · Connect manually</SectionLabel>
            <Card padded style={{ marginBottom: 12 }}>
              <Text style={{ color: c.textDim, fontSize: 14, lineHeight: 22 }}>
                1. Open Wi-Fi settings and join <Text style={{ color: c.text, fontWeight: "700" }}>Circuvent-Setup-…</Text> (no password).{"\n"}
                2. Turn <Text style={{ color: c.text, fontWeight: "700" }}>mobile data OFF</Text>.{"\n"}
                3. Come back and tap Continue.
              </Text>
            </Card>
            <Pressable onPress={openWifiSettings} style={{ marginBottom: 12, minHeight: 44, justifyContent: "center" }}><Text style={{ color: c.accentHi, textAlign: "center" }}>Open Wi-Fi settings</Text></Pressable>
            <Primary c={c} label="Continue" onPress={() => goWifi(false)} />
          </View>
        )}

        {step === "wifi" && (
          <View>
            <SectionLabel>Step 3 · Choose the new Wi-Fi</SectionLabel>
            {autoMode && <View style={{ backgroundColor: "rgba(34,197,94,0.12)", borderColor: "rgba(34,197,94,0.4)", borderWidth: 1, borderRadius: 10, padding: 10, marginBottom: 12 }}><Text style={{ color: c.green, fontSize: 13, fontWeight: "700" }}>✓ Connected to your device</Text></View>}
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <Text style={{ color: c.text, fontWeight: "600" }}>Networks near the device {networks.length ? `(${networks.length})` : ""}</Text>
              <Pressable onPress={() => scan()} disabled={scanning} hitSlop={10}><Text style={{ color: c.accentHi, opacity: scanning ? 0.5 : 1 }}>{scanning ? "Scanning…" : "↻ Rescan"}</Text></Pressable>
            </View>
            {scanning && <View style={{ alignItems: "center", paddingVertical: 12 }}><ActivityIndicator color={c.accentHi} /><Text style={{ color: c.faint, fontSize: 12, marginTop: 8 }}>Reading networks… {scanElapsed}s</Text></View>}
            {!!scanErr && !scanning && <Text style={{ color: c.red, fontSize: 13 }}>{scanErr}</Text>}
            {!manual && networks.map((nw) => (
              <Pressable key={nw.ssid} onPress={() => setSsid(nw.ssid)}>
                <Card padded style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 8, borderColor: ssid === nw.ssid ? c.accentHi : undefined, borderWidth: ssid === nw.ssid ? 1 : 0 }}>
                  <Text style={{ color: c.text }} numberOfLines={1}>{ssid === nw.ssid ? "● " : ""}{nw.ssid}</Text>
                  <Text style={{ color: c.textDim }}>{nw.lock ? "🔒 " : ""}{bars(nw.rssi)}</Text>
                </Card>
              </Pressable>
            ))}
            <Pressable onPress={() => setManual((m) => !m)} hitSlop={8}><Text style={{ color: c.accentHi, marginTop: 10 }}>{manual ? "‹ Pick from the list" : "Enter network name manually"}</Text></Pressable>
            {manual && <TextInput value={ssid} onChangeText={setSsid} placeholder="Wi-Fi name (SSID)" placeholderTextColor={c.faint} autoCapitalize="none" style={{ marginTop: 8, color: c.text, backgroundColor: c.cardHi, borderRadius: 10, padding: 12 }} />}
            {(ssid.length > 0 || manual) && (
              <TextInput value={pass} onChangeText={setPass} placeholder={`Password for "${ssid || "your Wi-Fi"}"`} placeholderTextColor={c.faint} secureTextEntry style={{ marginTop: 10, color: c.text, backgroundColor: c.cardHi, borderRadius: 10, padding: 12 }} />
            )}
            {!!error && <Text style={{ color: c.red, fontSize: 13, marginTop: 10 }}>{error}</Text>}
            <View style={{ height: 12 }} />
            <Primary c={c} label="🔒 Encrypt & send" onPress={send} />
          </View>
        )}

        {step === "sending" && (
          <View style={{ alignItems: "center", paddingVertical: 50 }}>
            <ActivityIndicator color={c.accentHi} size="large" />
            <Text style={{ color: c.textDim, marginTop: 16 }}>{note}</Text>
          </View>
        )}

        {step === "done" && (
          <View style={{ alignItems: "center", paddingVertical: 30 }}>
            <Text style={{ fontSize: 46 }}>{note ? "🔄" : "✅"}</Text>
            <Text style={{ color: c.text, fontSize: 18, fontWeight: "800", marginTop: 12, textAlign: "center" }}>{note ? "New Wi-Fi sent" : "Wi-Fi updated"}</Text>
            {!!note && <Text style={{ color: c.faint, fontSize: 13, marginTop: 8, textAlign: "center" }}>{note}</Text>}
            {!note && <Text style={{ color: c.green, fontSize: 14, marginTop: 8 }}>{device.name || device.id} is back online</Text>}
            <View style={{ height: 20 }} />
            <Primary c={c} label="Done" onPress={onBack} />
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

function Primary({ c, label, onPress }: { c: ReturnType<typeof useTheme>["c"]; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={{ backgroundColor: c.accent, borderRadius: 14, paddingVertical: 15, alignItems: "center" }}>
      <Text style={{ color: c.onAccent || "#fff", fontWeight: "800", fontSize: 16 }}>{label}</Text>
    </Pressable>
  );
}
