import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo-modules-core";

/**
 * Siri / Shortcuts bridge.
 *
 * Loaded optionally so the app still runs on Android, in Expo Go, and in any
 * build made before this module existed — `requireOptionalNativeModule` returns
 * null instead of throwing, and every call below becomes a no-op.
 */

export interface SiriDevicePayload {
  id: string;
  name: string;
  room?: string | null;
  type: string;
  /** State key this device's on/off maps to. Empty when it cannot be switched. */
  toggleField: string;
  isOn: boolean;
  kind: "switch" | "lock" | "gate" | "curtain" | "security" | "sensor";
}

interface CircuventSiriNative {
  isSupported: boolean;
  sync(apiBase: string, token: string | null, devicesJson: string): boolean;
  clear(): void;
  cachedDeviceCount(): number;
}

const native = Platform.OS === "ios"
  ? requireOptionalNativeModule<CircuventSiriNative>("CircuventSiri")
  : null;

/** True when this build can actually talk to Siri (iOS 16+, module present). */
export function siriAvailable(): boolean {
  return !!native?.isSupported;
}

/**
 * Hands Siri the current device list and session.
 *
 * Safe to call often — it writes to disk and returns, and the intents read from
 * there without waking JavaScript.
 */
export function syncSiri(apiBase: string, token: string | null, devices: SiriDevicePayload[]): void {
  if (!native) return;
  try {
    native.sync(apiBase, token, JSON.stringify(devices));
  } catch {
    // Siri is a convenience. It must never be able to break the app it is
    // attached to, so a failure here is swallowed deliberately.
  }
}

/** Clears what Siri knows. Called on sign-out. */
export function clearSiri(): void {
  if (!native) return;
  try {
    native.clear();
  } catch {
    /* see above */
  }
}

export function siriDeviceCount(): number {
  if (!native) return 0;
  try {
    return native.cachedDeviceCount();
  } catch {
    return 0;
  }
}
