import React, { useState, useEffect, useRef, useMemo } from "react";
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
  Animated,
  Easing,
  Modal,
  KeyboardAvoidingView,
} from "react-native";
import * as IntentLauncher from "expo-intent-launcher";
import { CameraView, useCameraPermissions } from "expo-camera";
import { api } from "../api";
import { sealToDevice } from "../crypto";
import { parseSetupQr } from "../qr";
import { useBackHandler, useTheme } from "../ui";
import { usePrompt } from "../overlays";
import { useKeyboardHeight } from "../keyboard";
import { Icon, type IconName } from "../icons";
import { deviceMeta, DEVICE_META, TAP_SLOP, type Palette } from "../theme";
import {
  wifiAutoSupported, ensureWifiPermissions, discoverDeviceAPs, connectToDeviceAP,
  leaveDeviceAP, rssiBars, type DeviceAP,
} from "../wifi";

/**
 * Secure zero-touch onboarding (A + B).
 *  1. Mint a short-lived provisioning TOKEN on the internet (no secret in it).
 *  2. Join the device hotspot (mobile data OFF); the device scans Wi-Fi (2.4 GHz).
 *  3. ENCRYPT {ssid, pass, token} to the device's public key (NaCl box) and push
 *     it — the Wi-Fi password never crosses the hotspot in clear (A).
 *  4. The device joins Wi-Fi and redeems the token over TLS to fetch its secret
 *     from the cloud (B) — the permanent secret is never on the local link.
 *  5. Confirm by watching the account for the newly self-provisioned device.
 */

const BASE = "http://192.168.4.1";

// Derived from DEVICE_META rather than listed here.
//
// Icons were already taken from there, with a comment warning that a second
// parallel mapping is how a new device type ends up blank — but the list of
// types was still hand-maintained, and five shipped types had gone missing from
// it: the Touch Switchboard, WaterTank Duo, RFID Gate, FaceDoor and Sentinel.
// All five have firmware, a control panel, and a page in the shop; none of them
// could be added from the app that sells them.
//
// ORDER is presentation only. Anything in DEVICE_META and not named there still
// appears, at the end — so the next device type is offered the day it is
// defined, whether or not anyone remembers to touch this file.
const ORDER = [
  "smart-plug", "smart-switch", "touchboard", "home-hub",
  "smart-light", "smart-fan", "curtain", "smart-lock",
  "facedoor", "rfid-gate", "anpr-cam", "drone-link", "drone-x1",
  "aquaguard", "watertank", "agri-starter",
  "sentinel", "guardian", "motion-sensor", "energy-monitor",
  "camera", "cctv", "doorbell",
];

const TYPES: { id: string; label: string }[] = (() => {
  const all = Object.keys(DEVICE_META);
  const ranked = [...all].sort((a, b) => {
    const ia = ORDER.indexOf(a);
    const ib = ORDER.indexOf(b);
    return (ia < 0 ? ORDER.length : ia) - (ib < 0 ? ORDER.length : ib);
  });
  return ranked.map((id) => ({ id, label: DEVICE_META[id].label }));
})();

type Step = "mode" | "qr" | "details" | "prep" | "discover" | "connect" | "wifi" | "sending" | "reconnect" | "waiting" | "done" | "fail" | "manual";
type LogState = "run" | "ok" | "err";
interface LogItem { msg: string; state: LogState }
interface Net { ssid: string; rssi: number; lock: boolean }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
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
  const { c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  const [step, setStep] = useState<Step>("mode");
  const [type, setType] = useState("");
  const [name, setName] = useState("");
  const { prompt, promptNode } = usePrompt();
  const kb = useKeyboardHeight();
  const [ssid, setSsid] = useState("");
  const [pass, setPass] = useState("");
  const [manual, setManual] = useState(false);
  const [networks, setNetworks] = useState<Net[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanErr, setScanErr] = useState("");
  const [retryNote, setRetryNote] = useState("");
  const [error, setError] = useState("");
  const [log, setLog] = useState<LogItem[]>([]);
  const [token, setToken] = useState("");
  const [knownIds, setKnownIds] = useState<string[]>([]);
  const [mid, setMid] = useState("");
  const [mkey, setMkey] = useState("");
  const [busy, setBusy] = useState(false);
  const [targetSsid, setTargetSsid] = useState("");
  /** SSID whose password is being asked for, or "" when the prompt is closed. */
  const [askPassFor, setAskPassFor] = useState("");
  const [passDraft, setPassDraft] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [scanLock, setScanLock] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  // auto-discovery / auto-connect
  const [deviceAPs, setDeviceAPs] = useState<DeviceAP[]>([]);
  const [discovering, setDiscovering] = useState(false);
  const [apError, setApError] = useState("");
  const [connectingSsid, setConnectingSsid] = useState("");
  const [autoMode, setAutoMode] = useState(false);
  const [scanElapsed, setScanElapsed] = useState(0);
  const discoverStop = useRef(false);

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

  const openScanner = async () => {
    setError("");
    const p = permission?.granted ? permission : await requestPermission();
    if (!p?.granted) {
      setError("Camera access is needed to scan the device QR. You can also set up manually.");
      return;
    }
    setScanLock(false);
    setStep("qr");
  };

  const onScanned = ({ data }: { data: string }) => {
    if (scanLock) return;
    const hint = parseSetupQr(data);
    if (!hint) return; // not a Circuvent code — keep scanning
    setScanLock(true);
    if (hint.type) setType(hint.type);
    if (hint.ssid) setTargetSsid(hint.ssid);
    if (hint.name && !name.trim()) setName(hint.name);
    setError("");
    setStep("details");
  };

  // Step 1 — prepare: snapshot existing devices + mint a provisioning token (internet).
  /*
   * Picking a type asks for the name there and then.
   *
   * The name is what the device will be called everywhere afterwards, and it is
   * far easier to give while you are looking at the thing you just chose than
   * to hunt for a field further down a grid that is taller than the screen.
   *
   * Cancelling still selects the type: somebody who does not want to name it
   * has picked what they are setting up, and the default name is fine.
   */
  const pickType = async (id: string) => {
    setType(id);
    setError("");
    const suggested = name || TYPES.find((t) => t.id === id)?.label || "";
    const next = await prompt({
      title: "Name this device",
      message: "This is what you will see everywhere — on the home screen, in scenes and in automations.",
      placeholder: "e.g. Living room lamp",
      initialValue: suggested,
      maxLength: 40,
    });
    if (next !== null) setName(next.trim());
  };

  const prepare = async () => {
    setError(""); setLog([]); setStep("prep");
    addLog("Preparing a secure setup for your account…");
    const dl = await api.devices();
    setKnownIds(dl.ok ? (dl.data.devices || []).map((d) => d.id) : []);
    const r = await api.provisioningToken(type, name.trim() || type);
    if (!r.ok || !r.data?.token) {
      setLast("err", "Couldn't prepare setup.");
      setError(r.status === 0 ? "No internet for this step — stay on your home Wi-Fi / mobile data and retry." : r.data?.error || "Please try again.");
      setStep("fail");
      return;
    }
    setToken(r.data.token);
    setLast("ok", "Account prepared ✓");
    // Android with the native Wi-Fi module → in-app auto-discovery + auto-connect.
    // Everywhere else → the manual "join in Settings" flow.
    if (wifiAutoSupported()) { setStep("discover"); setTimeout(() => discover(), 300); }
    else setStep("connect");
  };

  // Step 2 (auto) — scan the airwaves for nearby "Circuvent-Setup-…" hotspots and
  // show them live; no trip to Android Settings.
  const discover = async () => {
    setApError(""); setDeviceAPs([]); setDiscovering(true);
    discoverStop.current = false;
    const okPerm = await ensureWifiPermissions();
    if (!okPerm) {
      setDiscovering(false);
      setApError("Location permission is needed to find nearby devices. Grant it, or connect manually below.");
      return;
    }
    const found = await discoverDeviceAPs(15000, (aps) => setDeviceAPs(aps), () => discoverStop.current);
    setDiscovering(false);
    if (!found.length && !discoverStop.current) {
      setApError("No Circuvent device found yet. Power it on, wait ~15s for the light to blink, then tap Rescan — or connect manually.");
    }
  };

  // Tap a discovered device → connect the phone to its open hotspot in-app.
  const pickDeviceAP = async (ap: DeviceAP) => {
    setApError(""); setConnectingSsid(ap.ssid); discoverStop.current = true;
    try {
      await connectToDeviceAP(ap.ssid);
      // Give the AP a beat to settle, then confirm we actually landed on it.
      await sleep(1200);
      setAutoMode(true);
      setConnectingSsid("");
      goWifi(true);
    } catch {
      setConnectingSsid("");
      setApError(`Couldn't join ${ap.ssid}. Tap it to retry, or use "Connect manually".`);
    }
  };

  // Bounded, progressive device scan (~15s) so results show fast with a Rescan.
  const scan = async () => {
    setScanErr(""); setScanning(true); setScanElapsed(0);
    const start = Date.now();
    const tick = setInterval(() => setScanElapsed(Math.round((Date.now() - start) / 1000)), 500);
    try {
      // Up to ~15s: quick 5s attempts, ~1.2s apart, through any AP transition.
      for (let i = 0; Date.now() - start < 15000; i++) {
        try {
          const res = await fetchTimeout(`${BASE}/scan`, {}, 5000);
          const arr = (await res.json()) as Net[];
          arr.sort((a, b) => b.rssi - a.rssi);
          if (arr.length) { setNetworks(arr); setScanErr(""); return; }
        } catch {
          // transient — the phone may still be switching to the device hotspot
        }
        await sleep(1200);
      }
      setScanErr(
        autoMode
          ? "Couldn't read the network list from the device yet. Tap Rescan — or enter your Wi-Fi name manually below."
          : "Couldn't get the network list. Make sure you're on the \u201CCircuvent-Setup-\u2026\u201D Wi-Fi, then tap Rescan — or enter your Wi-Fi name manually below."
      );
    } finally {
      clearInterval(tick);
      setScanning(false);
    }
  };

  const goWifi = (auto = false) => { setStep("wifi"); setRetryNote(""); setNetworks([]); setScanErr("Reading nearby networks from the device…"); setTimeout(() => scan(), auto ? 400 : 800); };

  /*
   * The dialog connects. It does not hand you back to a form.
   *
   * Entering the password used to close the dialog and return to the network
   * list, where a second password field and an "Encrypt & send" button waited
   * further down — so the password was typed once, shown again, and the real
   * next step was below the fold. Two fields for one secret is also how they
   * disagree.
   *
   * The draft is passed explicitly because setPass has not applied yet in this
   * tick; reading state here would encrypt the previous password.
   */
  const connectWithPass = () => {
    const entered = passDraft;
    setPass(entered);
    setAskPassFor("");
    void sendToDevice(entered, askPassFor || ssid);
  };

  // Step 3 — encrypt {ssid,pass,token} to the device and push (local, mobile data OFF).
  /*
   * `overridePass` exists because the dialog sends immediately on submit.
   *
   * setPass is asynchronous, so reading `pass` here in the same tick as the
   * dialog closes would encrypt the previous password — or an empty string on
   * the first attempt — and the device would fail to join with no clue why.
   */
  const sendToDevice = async (overridePass?: string, overrideSsid?: string) => {
    const wifiPass = overridePass ?? pass;
    const wifiSsid = overrideSsid ?? ssid;
    setError("");
    if (!wifiSsid.trim()) { setError("Pick or enter your Wi-Fi network."); return; }
    setStep("sending");
    setLog([{ msg: "Account prepared ✓", state: "ok" }, { msg: "Securing the connection to the device…", state: "run" }]);

    let pk = "";
    try {
      const r = await fetchTimeout(`${BASE}/info`, {}, 8000);
      pk = String(((await r.json()) as { pk?: string }).pk || "");
    } catch {
      /* handled below */
    }
    if (!pk) {
      setLast("err", "Couldn't reach the device.");
      setError("Join the \u201CCircuvent-Setup-\u2026\u201D Wi-Fi (mobile data OFF) and try again.");
      setStep("wifi");
      return;
    }

    let sealed;
    try {
      const plaintext = `ssid=${encodeURIComponent(wifiSsid)}&pass=${encodeURIComponent(wifiPass)}&token=${encodeURIComponent(token)}`;
      sealed = sealToDevice(pk, plaintext);
    } catch {
      setLast("err", "Encryption failed.");
      setError("Please try again.");
      setStep("wifi");
      return;
    }
    setLast("ok", "Wi-Fi encrypted for this device ✓");
    addLog("Sending encrypted Wi-Fi to the device…");

    const body = `enc=1&epk=${encodeURIComponent(sealed.epk)}&nonce=${encodeURIComponent(sealed.nonce)}&box=${encodeURIComponent(sealed.box)}`;
    try {
      const res = await fetchTimeout(`${BASE}/save`, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body }, 10000);
      if (!res.ok) throw new Error(String(res.status));
      setLast("ok", "Encrypted Wi-Fi sent ✓");
      if (autoMode) {
        // We joined the AP in-app — release it so the phone returns to home Wi-Fi,
        // then watch for the device to register. No manual Settings trip needed.
        addLog("Switching your phone back to home Wi-Fi…");
        await leaveDeviceAP();
        await sleep(1500);
        setLast("ok", "Back on your home Wi-Fi ✓");
        waitForOnline();
      } else {
        setStep("reconnect");
      }
    } catch {
      setLast("err", "Couldn't reach the device.");
      setError(autoMode
        ? "Lost the connection to the device. Tap \u201CTry again\u201D to rejoin and resend."
        : "Make sure you're on the \u201CCircuvent-Setup-\u2026\u201D Wi-Fi with mobile data OFF, then try again.");
      setStep("wifi");
    }
  };

  // Step 5 — the device joins Wi-Fi + self-provisions over TLS; watch for it.
  const waitForOnline = async () => {
    setStep("waiting");
    setLog([
      { msg: "Encrypted Wi-Fi sent ✓", state: "ok" },
      { msg: "Device is joining Wi-Fi & registering securely over TLS…", state: "run" },
    ]);
    for (let i = 0; i < 24; i++) {
      await sleep(3000);
      const r = await api.devices();
      if (r.ok) {
        const fresh = (r.data.devices || []).find((d) => !knownIds.includes(d.id) && d.online);
        if (fresh) {
          setLast("ok", `${fresh.name || fresh.id} is online ✓`);
          setStep("done");
          return;
        }
      }
    }
    setLast("err", "Device didn't come online.");
    setRetryNote("The device didn't register in time — usually a wrong Wi-Fi password. Re-join the \u201CCircuvent-Setup-\u2026\u201D hotspot (mobile data OFF) and re-enter it.");
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
    if (step === "discover") { discoverStop.current = true; return setStep("connect"); }
    if (step === "wifi") { if (autoMode) { leaveDeviceAP(); setAutoMode(false); } return setStep(wifiAutoSupported() ? "discover" : "connect"); }
    setStep("mode");
  };

  // Release any device-AP binding if the user backs out mid-setup.
  useEffect(() => () => { discoverStop.current = true; leaveDeviceAP(); }, []);

  useBackHandler(() => { goBack(); return true; });

  return (
    <View style={s.wrap}>
      {/*
        No back control here.
        
        The overlay is wrapped in SwipeBack and the Android hardware button is
        handled below, so there were three ways out of this screen and one of
        them was a violet word competing with the title for the top-left corner.
        The gestures are the ones people already use everywhere else in the app.
      */}
      <View style={s.top}>
        <Text style={s.title}>Add a device</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 18, paddingBottom: 40 }}>
        {step === "mode" && (
          <View>
            <Text style={s.lead}>How would you like to add your device?</Text>
            <Pressable style={s.optCard} onPress={() => setStep("details")}>
              <Text style={s.optEmoji}>🔒</Text>
              <View style={{ flex: 1 }}><Text style={s.optTitle}>Set up a new device</Text><Text style={s.optSub}>Encrypted Wi-Fi setup — no codes to type</Text></View>
              <Text style={s.chev}>›</Text>
            </Pressable>
            <Pressable style={s.optCard} onPress={openScanner}>
              <Text style={s.optEmoji}>📷</Text>
              <View style={{ flex: 1 }}><Text style={s.optTitle}>Scan device QR</Text><Text style={s.optSub}>Point at the QR on the box or device</Text></View>
              <Text style={s.chev}>›</Text>
            </Pressable>
            <Pressable style={s.optCard} onPress={() => setStep("manual")}>
              <Text style={s.optEmoji}>🔗</Text>
              <View style={{ flex: 1 }}><Text style={s.optTitle}>Add by ID &amp; key</Text><Text style={s.optSub}>The device is already online</Text></View>
              <Text style={s.chev}>›</Text>
            </Pressable>
          </View>
        )}

        {step === "qr" && (
          <View>
            <StepTag>Scan the QR on your device</StepTag>
            <View style={s.scanBox}>
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={onScanned}
              />
              <View style={s.scanFrame} pointerEvents="none" />
            </View>
            <Text style={[s.lead, { marginTop: 12 }]}>
              Center the QR label inside the frame. We'll pick the device type for you.
            </Text>
            {!!error && <Text style={s.err}>{error}</Text>}
            <Pressable style={s.secondary} onPress={() => { setError(""); setStep("details"); }}>
              <Text style={s.secondaryT}>Enter manually instead</Text>
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
                <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={t.label} accessibilityState={{ selected: type === t.id }} style={[s.typeChip, type === t.id && s.typeChipOn]} onPress={() => pickType(t.id)}>
                  <Icon name={deviceMeta(t.id).icon as IconName} size={22} color={type === t.id ? c.accent : c.textDim} />
                  <Text style={[s.typeLabel, type === t.id && { color: "#fff" }]}>{t.label}</Text>
                </Pressable>
              ))}
            </View>
            {/*
              The name is asked for in a dialog the moment a type is picked,
              rather than in a field below the grid. With eleven device types
              the grid is taller than the screen, so the field and the Next
              button were both under the fold: choosing a type appeared to do
              nothing, and the obvious next move was to scroll looking for
              one.

              What was chosen is shown here instead, so the step still says
              what it knows.
            */}
            {!!type && (
              <Pressable onPress={() => pickType(type)} style={s.chosenRow} accessibilityRole="button" accessibilityLabel={`Name: ${name || "not set"}. Tap to change.`}>
                <Icon name={deviceMeta(type).icon as IconName} size={18} color={c.accent} />
                <Text style={s.chosenName} numberOfLines={1}>{name || TYPES.find((t) => t.id === type)?.label}</Text>
                <Text style={s.chosenEdit}>Rename</Text>
              </Pressable>
            )}
            {!!error && <Text style={s.err}>{error}</Text>}
            <Primary label="Next" onPress={() => { if (!type) { setError("Pick what you're setting up."); return; } setError(""); prepare(); }} />
          </View>
        )}

        {(step === "prep" || step === "sending" || step === "waiting") && (
          <View>
            <StepTag>{step === "prep" ? "Step 1 · Preparing" : step === "sending" ? "Step 2 · Encrypting & sending" : "Step 3 · Confirming"}</StepTag>
            <ProgressLog items={log} />
          </View>
        )}

        {step === "discover" && (
          <View>
            <StepTag>Step 2 of 3 · Find your device</StepTag>
            <ProgressLog items={[{ msg: "Account prepared ✓", state: "ok" }]} />
            <View style={s.radarWrap}>
              <RadarPulse active={discovering || !!connectingSsid} />
              <Text style={s.radarGlyph}>{connectingSsid ? "🔗" : "📡"}</Text>
            </View>
            <Text style={[s.lead, { textAlign: "center", marginTop: 4 }]}>
              {connectingSsid
                ? `Connecting to ${connectingSsid}…\nTap “Connect” if your phone shows a prompt.`
                : discovering
                  ? "Scanning for nearby Circuvent devices…\nPower it on and wait for the light to blink."
                  : deviceAPs.length
                    ? "Tap your device below to connect automatically."
                    : "Make sure the device is powered on and blinking."}
            </Text>

            {deviceAPs.map((ap) => (
              <Pressable key={ap.ssid} style={[s.apRow, connectingSsid === ap.ssid && s.apRowOn]} onPress={() => pickDeviceAP(ap)} disabled={!!connectingSsid}>
                {/*
                  The device's own icon, not a generic signal glyph, and the
                  name it was just given rather than the raw hotspot SSID.
                  "Circuvent-Setup-4F2A91" is the right thing for the radio to
                  be called and the wrong thing to show somebody who has just
                  said they are setting up a water tank.
                */}
                <View style={s.apIcon}>
                  <Icon name={deviceMeta(type || "").icon as IconName} size={20} color={c.accent} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.apName} numberOfLines={1}>
                    {name || TYPES.find((t) => t.id === type)?.label || ap.ssid}
                  </Text>
                  <Text style={s.apSub}>Found nearby · {ap.hwid}</Text>
                </View>
                {connectingSsid === ap.ssid ? <ActivityIndicator color={c.accent} /> : <Text style={s.apBars}>{rssiBars(ap.rssi)}</Text>}
              </Pressable>
            ))}

            {!!apError && <Text style={[s.err, { marginTop: 10 }]}>{apError}</Text>}

            <View style={[s.rowBetween, { marginTop: 16 }]}>
              <Pressable onPress={() => discover()} disabled={discovering || !!connectingSsid} hitSlop={10}>
                <Text style={[s.link, (discovering || !!connectingSsid) && { opacity: 0.5 }]}>{discovering ? "Scanning…" : "↻ Rescan"}</Text>
              </Pressable>
              <Pressable onPress={() => { discoverStop.current = true; setDiscovering(false); setStep("connect"); }} hitSlop={10}>
                <Text style={s.link}>Connect manually ›</Text>
              </Pressable>
            </View>
          </View>
        )}

        {step === "connect" && (
          <View>
            <StepTag>Step 2 of 3 · Connect manually</StepTag>
            {/*
              iOS never reaches the radar — Apple exposes no API for scanning
              nearby Wi-Fi, so there is no list of hotspots to put an icon on.
              This step is what iOS gets instead, so the device being set up is
              named and shown here rather than the user reading four numbered
              instructions with no indication of what they apply to.
            */}
            {!!type && (
              <View style={s.chosenRow}>
                <Icon name={deviceMeta(type).icon as IconName} size={18} color={c.accent} />
                <Text style={s.chosenName} numberOfLines={1}>{name || TYPES.find((t) => t.id === type)?.label}</Text>
              </View>
            )}
            <ProgressLog items={[{ msg: "Account prepared ✓", state: "ok" }]} />
            <Text style={[s.lead, { marginTop: 14 }]}>
              1. Power on the device, wait ~15s.{"\n"}
              2. Tap below, join <Text style={s.b}>{targetSsid || "Circuvent-Setup-…"}</Text> (no password).{"\n"}
              3. Turn <Text style={s.b}>mobile data OFF</Text> so the phone can talk to the device.{"\n"}
              4. Come back and tap <Text style={s.b}>Continue</Text>.
            </Text>
            <Pressable style={s.secondary} onPress={openWifiSettings}><Text style={s.secondaryT}>Open Wi-Fi settings</Text></Pressable>
            {wifiAutoSupported() && (
              <Pressable hitSlop={TAP_SLOP} onPress={() => { setStep("discover"); setTimeout(() => discover(), 300); }}><Text style={[s.link, { textAlign: "center", marginBottom: 6 }]}>‹ Find &amp; connect automatically instead</Text></Pressable>
            )}
            <Primary label="Continue" onPress={() => goWifi(false)} />
          </View>
        )}

        {step === "wifi" && (
          <View>
            <StepTag>Step 2 of 3 · Choose your home Wi-Fi</StepTag>
            {autoMode && <View style={s.okChip}><Text style={s.okChipT}>✓ Connected to your device automatically</Text></View>}
            {!!retryNote && <Text style={s.err}>{retryNote}</Text>}
            <View style={s.rowBetween}>
              <Text style={s.label}>Networks near the device {networks.length ? `(${networks.length})` : ""}</Text>
              <Pressable onPress={() => scan()} disabled={scanning} hitSlop={10}><Text style={[s.link, scanning && { opacity: 0.5 }]}>{scanning ? "Scanning…" : "↻ Rescan"}</Text></Pressable>
            </View>
            {scanning && (
              <View style={s.center}>
                <ActivityIndicator color={c.accent} />
                <Text style={s.hint}>Reading nearby networks from the device… {scanElapsed}s</Text>
              </View>
            )}
            {!!scanErr && !scanning && <Text style={s.err}>{scanErr}</Text>}
            {!manual && networks.map((nw) => (
              <Pressable
                key={nw.ssid}
                style={[s.netRow, ssid === nw.ssid && s.netRowOn]}
                accessibilityRole="button"
                accessibilityLabel={`${nw.ssid}${nw.lock ? ", secured" : ", open"}`}
                onPress={() => {
                  // Tapping a locked network asks for its password there and
                  // then, which is what every OS Wi-Fi picker does and what
                  // people expect. Previously the tap only set the SSID and the
                  // password field waited further down the page, so the obvious
                  // reading — "I picked my network, now what?" — was to scroll
                  // looking for a next step that had already scrolled past.
                  setSsid(nw.ssid);
                  if (nw.lock) {
                    setAskPassFor(nw.ssid);
                    setPassDraft(ssid === nw.ssid ? pass : "");
                  } else {
                    /*
                     * An open network has no password to ask for, so there is
                     * no dialog — and now no button underneath either. Tapping
                     * it has to be the whole action, or the one case with
                     * nothing to type would be the one that could not proceed.
                     */
                    setPass("");
                    void sendToDevice("", nw.ssid);
                  }
                }}
              >
                <Text style={s.netName} numberOfLines={1}>{ssid === nw.ssid ? "● " : ""}{nw.ssid}</Text>
                <Text style={s.netMeta}>{nw.lock ? "🔒 " : ""}{bars(nw.rssi)}</Text>
              </Pressable>
            ))}
            <Pressable onPress={() => setManual((m) => !m)} hitSlop={8}><Text style={[s.link, { marginTop: 10 }]}>{manual ? "‹ Pick from the list" : "Enter network name manually"}</Text></Pressable>
            {manual && <View style={{ marginTop: 8 }}><Field label="Wi-Fi name (SSID)" value={ssid} onChangeText={setSsid} placeholder="Your 2.4 GHz Wi-Fi" autoCapitalize="none" /></View>}
            {/*
              The password field only appears for a manually typed network,
              which has no row to tap and therefore no dialog. Picking from the
              list asks in the dialog and connects from there; leaving this here
              for that path gave two fields for one secret and put the real next
              step below the fold.
            */}
            {manual && (
              <View style={{ marginTop: 8 }}>
                <Field label={`Password for "${ssid || "your Wi-Fi"}"`} value={pass} onChangeText={setPass} placeholder="Wi-Fi password" secureTextEntry />
              </View>
            )}
            {!!error && <Text style={s.err}>{error}</Text>}
            {/* Only the manual path still needs a button; the list path has
                already sent by the time it returns here. */}
            {manual && <Primary label="🔒 Encrypt & send" onPress={() => sendToDevice()} />}
          </View>
        )}

        {step === "reconnect" && (
          <View>
            <StepTag>Almost done</StepTag>
            <ProgressLog items={[{ msg: "Account prepared ✓", state: "ok" }, { msg: "Encrypted Wi-Fi sent ✓", state: "ok" }]} />
            <Text style={[s.lead, { marginTop: 14 }]}>
              The device is restarting and joining <Text style={s.b}>{ssid}</Text>, then registering itself securely over
              TLS. Switch your phone back to your <Text style={s.b}>home Wi-Fi</Text> (turn mobile data on), then continue.
            </Text>
            <Pressable style={s.secondary} onPress={openWifiSettings}><Text style={s.secondaryT}>Open Wi-Fi settings</Text></Pressable>
            <Primary label="Continue" onPress={waitForOnline} />
          </View>
        )}

        {step === "done" && (
          <View>
            <StepTag>Done</StepTag>
            <ProgressLog items={log} />
            <Text style={[s.okBadge, { marginTop: 12 }]}>✓ {name || type} is set up securely</Text>
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

      {/*
        Password prompt.

        Modelled on the OS Wi-Fi picker deliberately: tapping a locked network
        should ask for its password, not silently select it and leave the field
        somewhere else on the page. autoFocus means the keyboard is already up,
        so joining a network is tap, type, done.
      */}
      <Modal visible={!!askPassFor} transparent animationType="fade" onRequestClose={() => setAskPassFor("")}>
        <Pressable style={s.modalScrim} onPress={() => setAskPassFor("")} accessibilityLabel="Dismiss" />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={[s.modalWrap, { paddingBottom: 22 + kb }]}
          pointerEvents="box-none"
        >
          <View style={s.modalCard}>
            <Text style={s.modalTitle} numberOfLines={1}>{askPassFor}</Text>
            <Text style={s.modalSub}>Enter the password for this network.</Text>
            <TextInput
              style={[s.input, { marginTop: 12 }]}
              value={passDraft}
              onChangeText={setPassDraft}
              placeholder="Wi-Fi password"
              placeholderTextColor={c.faint}
              secureTextEntry={!showPass}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              accessibilityLabel={`Password for ${askPassFor}`}
              onSubmitEditing={connectWithPass}
              returnKeyType="done"
            />
            <Pressable onPress={() => setShowPass((v) => !v)} hitSlop={10} style={{ paddingVertical: 10 }}>
              <Text style={s.link}>{showPass ? "Hide password" : "Show password"}</Text>
            </Pressable>
            <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
              <Pressable style={[s.secondary, { flex: 1, marginBottom: 0 }]} onPress={() => setAskPassFor("")}>
                <Text style={s.secondaryT}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[s.btn, { flex: 1, marginTop: 0 }, !passDraft && { opacity: 0.5 }]}
                disabled={!passDraft}
                onPress={connectWithPass}
              >
                <Text style={s.btnT}>Connect</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* The name dialog. Rendered here or `prompt()` resolves to a sheet that
          was never mounted, and awaiting it would hang forever. */}
      {promptNode}
    </View>
  );
}

function ProgressLog({ items }: { items: LogItem[] }) {
  const { c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  return (
    <View style={{ marginTop: 6 }}>
      {items.map((it, i) => (
        <View key={i} style={s.logRow}>
          {it.state === "run" ? (
            <ActivityIndicator size="small" color={c.accent} style={{ width: 22 }} />
          ) : (
            <Text style={[s.logIcon, { color: it.state === "ok" ? c.green : c.red }]}>{it.state === "ok" ? "✓" : "✕"}</Text>
          )}
          <Text style={[s.logMsg, it.state === "err" && { color: c.red }]}>{it.msg}</Text>
        </View>
      ))}
    </View>
  );
}

function Field({ label, ...props }: { label: string } & React.ComponentProps<typeof TextInput>) {
  const { c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput style={s.input} placeholderTextColor={c.faint} {...props} />
    </View>
  );
}
function Primary({ label, onPress, busy }: { label: string; onPress: () => void; busy?: boolean }) {
  const { c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  return (
    <Pressable style={[s.btn, busy && { opacity: 0.6 }]} onPress={busy ? undefined : onPress}>
      {busy ? <ActivityIndicator color="#fff" /> : <Text style={s.btnT}>{label}</Text>}
    </Pressable>
  );
}
function StepTag({ children }: { children: React.ReactNode }) {
  const { c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  return <Text style={s.stepTag}>{children}</Text>;
}

// Animated radar rings shown while discovering / connecting to a device hotspot.
function RadarPulse({ active }: { active: boolean }) {
  const { c } = useTheme();
  const s = useMemo(() => makeStyles(c), [c]);

  const a1 = useRef(new Animated.Value(0)).current;
  const a2 = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!active) { a1.stopAnimation(); a2.stopAnimation(); a1.setValue(0); a2.setValue(0); return; }
    const mk = (v: Animated.Value, delay: number) =>
      Animated.loop(Animated.sequence([
        Animated.delay(delay),
        Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]));
    const l1 = mk(a1, 0); const l2 = mk(a2, 900);
    l1.start(); l2.start();
    return () => { l1.stop(); l2.stop(); };
  }, [active, a1, a2]);
  const ring = (v: Animated.Value) => ({
    transform: [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.35, 1.4] }) }],
    opacity: v.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.5, 0] }),
  });
  return (
    <View style={s.radarInner} pointerEvents="none">
      <Animated.View style={[s.radarRing, ring(a1)]} />
      <Animated.View style={[s.radarRing, ring(a2)]} />
    </View>
  );
}

/*
 * Styles are built from the active palette rather than written as literals.
 *
 * This screen was 57 hard-coded colours -- #0b1020 backgrounds, #e5e7eb text --
 * and never called useTheme at all. In the light scheme that is near-white
 * text on a near-black card the user did not ask for. The admin console had
 * the same defect for the same reason, so this follows the pattern the rest of
 * the app already uses: a factory taking the palette, memoised per component.
 */
function makeStyles(c: Palette) {
  return StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.bg },
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, borderBottomColor: c.border, borderBottomWidth: 1 },
  back: { color: c.violet, fontSize: 15, width: 54 },
  title: { color: "#fff", fontSize: 17, fontWeight: "800" },
  lead: { color: c.textDim, fontSize: 14, lineHeight: 22, marginBottom: 16 },
  b: { color: c.text, fontWeight: "700" },
  stepTag: { color: c.accent, fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 },
  optCard: { flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 16, padding: 18, marginBottom: 12 },
  scanBox: { height: 300, borderRadius: 18, overflow: "hidden", backgroundColor: "#000", borderWidth: 1, borderColor: c.borderHi, alignItems: "center", justifyContent: "center" },
  scanFrame: { position: "absolute", width: 190, height: 190, borderRadius: 16, borderWidth: 3, borderColor: c.accent, opacity: 0.9 },
  optEmoji: { fontSize: 26 },
  optTitle: { color: c.text, fontSize: 16, fontWeight: "700" },
  optSub: { color: c.faint, fontSize: 13, marginTop: 2 },
  chev: { color: c.faint, fontSize: 26 },
  label: { color: c.text, fontSize: 14, fontWeight: "600", marginBottom: 10 },
  hint: { color: c.faint, fontSize: 12, marginTop: 8 },
  radarWrap: { height: 150, alignItems: "center", justifyContent: "center", marginVertical: 6 },
  radarInner: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  radarRing: { position: "absolute", width: 140, height: 140, borderRadius: 70, borderWidth: 2, borderColor: c.accent },
  radarGlyph: { fontSize: 46 },
  apRow: { flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 14, padding: 14, marginTop: 10 },
  apRowOn: { borderColor: c.accent },
  apIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.cardHi },
  chosenRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, borderColor: c.border, backgroundColor: c.card, marginTop: 12, marginBottom: 4 },
  chosenName: { flex: 1, color: c.text, fontWeight: "700", fontSize: 15 },
  chosenEdit: { color: c.accent, fontSize: 13, fontWeight: "700" },
  apName: { color: c.text, fontSize: 15, fontWeight: "700" },
  apSub: { color: c.faint, fontSize: 12, marginTop: 2 },
  apBars: { color: c.accent, fontSize: 16 },
  okChip: { backgroundColor: c.green + "1f", borderColor: c.green + "66", borderWidth: 1, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 12 },
  okChipT: { color: c.green, fontSize: 13, fontWeight: "700" },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  link: { color: c.accentHi, fontWeight: "700" },
  typeGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  typeChip: { width: "31%", backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  typeChipOn: { borderColor: c.accent, backgroundColor: c.accent + "1f" },
  typeLabel: { color: c.textDim, fontSize: 11, textAlign: "center", marginTop: 6 },
  netRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", backgroundColor: c.card, borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingVertical: 14, paddingHorizontal: 14, marginBottom: 8 },
  netRowOn: { borderColor: c.accent, backgroundColor: c.accent + "1f" },
  netName: { color: c.text, fontSize: 15, flex: 1, marginRight: 10 },
  netMeta: { color: c.textDim, fontSize: 14 },
  fieldLabel: { color: c.textDim, fontSize: 12, marginBottom: 6 },
  input: { backgroundColor: c.card, borderColor: c.borderHi, borderWidth: 1, borderRadius: 12, color: c.text, padding: 14, fontSize: 15 },
  btn: { backgroundColor: c.accent, borderRadius: 12, padding: 16, alignItems: "center", marginTop: 8 },
  btnT: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondary: { borderColor: c.borderHi, borderWidth: 1, borderRadius: 12, padding: 14, alignItems: "center", marginBottom: 16 },
  secondaryT: { color: c.accentHi, fontWeight: "700" },
  err: { color: c.amber, marginBottom: 12, lineHeight: 20 },
  okBadge: { color: c.green, fontWeight: "800", fontSize: 16, marginBottom: 12 },
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 20 },
  logRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 7 },
  logIcon: { width: 22, textAlign: "center", fontSize: 16, fontWeight: "800" },
  logMsg: { color: c.text, fontSize: 14, flex: 1 },
  modalScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.6)" },
  modalWrap: { flex: 1, justifyContent: "center", padding: 22 },
  /* c.overlay, not c.card: a modal has to stay readable even when the card
     fill is a few percent of white, which is what glass is. */
  modalCard: { backgroundColor: c.overlay, borderColor: c.borderHi, borderWidth: 1, borderRadius: 18, padding: 18 },
  modalTitle: { color: c.text, fontSize: 18, fontWeight: "800" },
  modalSub: { color: c.textDim, fontSize: 13, marginTop: 4 },
  });
}
