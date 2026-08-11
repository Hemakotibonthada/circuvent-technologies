/**
 * What this install is, for the account's device list.
 *
 * The control plane records which phones are signed in to an account so that
 * support can answer "what build are you on" and the account holder can spot a
 * device they do not recognise. Everything here is sent as headers on
 * authenticated requests.
 *
 * Two decisions worth stating.
 *
 * The install id is random and generated once. It is not the device's hardware
 * id, advertising id or anything else that identifies the handset across apps —
 * those are exactly what a phone's privacy model exists to prevent, and none of
 * them are needed here. All this has to do is stay the same for one install of
 * one app so that a phone remains one row rather than becoming a new one on
 * every sign-in.
 *
 * There is no location. The app asks for location permission to show the
 * weather; sending coordinates to the platform under a different heading would
 * be using a permission for a purpose it was not granted for. The server
 * records the address the request came from, which is what a "recent sign-ins"
 * list shows everywhere else.
 */
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { APP_VERSION } from "./version";

const KEY = "cv-install-id";

let cached: string | null = null;

function randomId(): string {
  /* Not crypto — this is a correlation key, not a secret, and the app should
     not pull in a crypto dependency for it. */
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/** A stable id for this install, created on first use. */
export async function installId(): Promise<string> {
  if (cached) return cached;
  try {
    const saved = await AsyncStorage.getItem(KEY);
    if (saved) {
      cached = saved;
      return saved;
    }
    const made = randomId();
    await AsyncStorage.setItem(KEY, made);
    cached = made;
    return made;
  } catch {
    /* Storage unavailable: use a per-process id rather than failing. The row
       will churn, which is a reporting flaw and not a functional one. */
    cached = randomId();
    return cached;
  }
}

/**
 * The device's model and OS, from what React Native already knows.
 *
 * Deliberately no expo-device. `Platform.constants` carries the manufacturer,
 * model and release on Android and the system name and version on iOS, which
 * is everything the support question needs — adding a native dependency to
 * restate it would be a build risk for no new information.
 */
function describeDevice(): { model: string; osVersion: string } {
  const c = (Platform.constants ?? {}) as Record<string, unknown>;
  if (Platform.OS === "android") {
    const brand = String(c.Brand ?? c.Manufacturer ?? "").trim();
    const model = String(c.Model ?? "").trim();
    return {
      model: [brand, model].filter(Boolean).join(" ").slice(0, 64) || "Android device",
      osVersion: `Android ${String(c.Release ?? Platform.Version ?? "").trim()}`.trim(),
    };
  }
  if (Platform.OS === "ios") {
    return {
      model: String(c.systemName ?? "iOS device").trim().slice(0, 64),
      osVersion: `iOS ${String(c.osVersion ?? Platform.Version ?? "").trim()}`.trim(),
    };
  }
  return { model: Platform.OS, osVersion: String(Platform.Version ?? "") };
}

/** Headers describing this install, for authenticated requests. */
export async function installHeaders(): Promise<Record<string, string>> {
  const { model, osVersion } = describeDevice();
  return {
    "x-cv-install": await installId(),
    "x-cv-platform": Platform.OS,
    "x-cv-os": osVersion,
    "x-cv-app": APP_VERSION,
    "x-cv-model": model,
  };
}
