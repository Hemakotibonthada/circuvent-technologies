// Circuvent device Wi-Fi helper — wraps react-native-wifi-reborn to auto-discover
// and auto-connect to a device's setup hotspot (open "Circuvent-Setup-XXXX" AP),
// so the user never has to leave the app for Android Settings. Degrades cleanly
// on iOS / Expo Go where the native module or scanning isn't available: callers
// then fall back to the manual "join in Settings" flow.
import { Platform, PermissionsAndroid, NativeModules } from "react-native";

export const AP_PREFIX = "Circuvent-Setup-";

export interface DeviceAP {
  ssid: string;
  rssi: number;
  hwid: string; // the short chip id after the prefix
}

// Load the native module lazily & defensively (absent in Expo Go / iOS Simulator).
type WifiModule = {
  loadWifiList: () => Promise<Array<{ SSID: string; BSSID?: string; level?: number; frequency?: number }>>;
  reScanAndLoadWifiList: () => Promise<Array<{ SSID: string; BSSID?: string; level?: number; frequency?: number }>>;
  connectToProtectedSSID: (ssid: string, password: string, isWEP: boolean, isHidden: boolean) => Promise<void>;
  getCurrentWifiSSID: () => Promise<string>;
  disconnect: () => Promise<boolean>;
  forceWifiUsageWithOptions: (use: boolean, options: { noInternet: boolean }) => Promise<void>;
  isEnabled: () => Promise<boolean>;
};

let Wifi: WifiModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  Wifi = require("react-native-wifi-reborn").default as WifiModule;
} catch {
  Wifi = null;
}

/** True only when the native Wi-Fi control module is usable (Android build). */
export function wifiAutoSupported(): boolean {
  return Platform.OS === "android" && !!Wifi && !!NativeModules.WifiManager;
}

/** Request the runtime permissions Android needs to scan for / connect to Wi-Fi. */
export async function ensureWifiPermissions(): Promise<boolean> {
  if (Platform.OS !== "android") return true;
  try {
    const P = PermissionsAndroid.PERMISSIONS;
    const wanted: string[] = [P.ACCESS_FINE_LOCATION];
    const nearby = (P as Record<string, string>).NEARBY_WIFI_DEVICES;
    if (nearby) wanted.push(nearby);
    const res = await PermissionsAndroid.requestMultiple(wanted as never[]);
    const R = res as Record<string, string>;
    const G = PermissionsAndroid.RESULTS.GRANTED;
    const fine = R[P.ACCESS_FINE_LOCATION] === G;
    const near = nearby ? R[nearby] === G : false;
    return fine || near;
  } catch {
    return false;
  }
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Scan nearby Wi-Fi and return only Circuvent setup hotspots (strongest first). */
export async function scanForDeviceAPs(fresh = true): Promise<DeviceAP[]> {
  if (!wifiAutoSupported() || !Wifi) return [];
  let list: Array<{ SSID?: string; level?: number }> = [];
  try {
    list = fresh ? await Wifi.reScanAndLoadWifiList() : await Wifi.loadWifiList();
  } catch {
    try {
      list = await Wifi.loadWifiList();
    } catch {
      list = [];
    }
  }
  const seen = new Set<string>();
  const out: DeviceAP[] = [];
  for (const e of list) {
    const ssid = String(e?.SSID || "");
    if (!ssid.startsWith(AP_PREFIX) || seen.has(ssid)) continue;
    seen.add(ssid);
    out.push({ ssid, rssi: Number(e?.level ?? -80), hwid: ssid.slice(AP_PREFIX.length) });
  }
  out.sort((a, b) => b.rssi - a.rssi);
  return out;
}

/**
 * Repeatedly scan for up to `budgetMs`, invoking `onResults` as devices appear,
 * so the UI can show hotspots progressively. Resolves with the final list.
 */
export async function discoverDeviceAPs(
  budgetMs: number,
  onResults: (aps: DeviceAP[]) => void,
  shouldStop?: () => boolean,
): Promise<DeviceAP[]> {
  const deadline = Date.now() + budgetMs;
  let last: DeviceAP[] = [];
  let first = true;
  while (Date.now() < deadline) {
    if (shouldStop?.()) break;
    const aps = await scanForDeviceAPs(!first);
    first = false;
    if (aps.length) {
      last = aps;
      onResults(aps);
    }
    // Android throttles active scans (~4 / 2 min); poll cached results in between.
    await sleep(2500);
  }
  return last;
}

/**
 * Connect the phone to an OPEN device hotspot and route the app's traffic to it
 * (the AP has no internet). On Android 10+ this shows the system "connect?"
 * dialog in-app — no Settings trip. Throws on failure so callers can fall back.
 */
export async function connectToDeviceAP(ssid: string): Promise<void> {
  if (!wifiAutoSupported() || !Wifi) throw new Error("wifi-auto-unsupported");
  await Wifi.connectToProtectedSSID(ssid, "", false, false);
  try {
    await Wifi.forceWifiUsageWithOptions(true, { noInternet: true });
  } catch {
    /* binding is best-effort; fetches to 192.168.4.1 may still work */
  }
}

/** Release the device-AP binding and disconnect, restoring normal connectivity. */
export async function leaveDeviceAP(): Promise<void> {
  if (!wifiAutoSupported() || !Wifi) return;
  try {
    await Wifi.forceWifiUsageWithOptions(false, { noInternet: false });
  } catch {
    /* ignore */
  }
  try {
    await Wifi.disconnect();
  } catch {
    /* ignore */
  }
}

/** SSID of the network the phone is currently on ("" if unknown). */
export async function currentSsid(): Promise<string> {
  if (!wifiAutoSupported() || !Wifi) return "";
  try {
    return (await Wifi.getCurrentWifiSSID()) || "";
  } catch {
    return "";
  }
}

/** True when the phone is currently joined to a Circuvent setup hotspot. */
export async function onDeviceAP(): Promise<boolean> {
  const s = await currentSsid();
  return s.startsWith(AP_PREFIX);
}

export function rssiBars(rssi: number): string {
  if (rssi >= -55) return "▂▄▆█";
  if (rssi >= -67) return "▂▄▆";
  if (rssi >= -78) return "▂▄";
  return "▂";
}
