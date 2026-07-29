// Tactile feedback for control actions.
//
// Why this exists: device toggles are already optimistic — `store.tsx` writes
// the new state locally before the command leaves the phone — so the *visual*
// state is instant. What was missing is physical confirmation. On a smart-home
// remote the user is often looking at the appliance, not the screen, so a tap
// that produces no sensation feels like it did nothing, and they tap again.
// A ~10ms haptic tick closes that loop and is the single cheapest fix for the
// "it feels slow" complaint, independent of network round-trip time.
//
// Every call is fire-and-forget and individually guarded: haptics are a nicety,
// never a reason for a control action to fail. Devices without a vibrator (and
// web) simply no-op.

import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Haptics from "expo-haptics";

const PREF_KEY = "cv-haptics";

let enabled = true;

/** Lets Settings turn haptics off globally without touching call sites. */
export function setHapticsEnabled(v: boolean): void {
  enabled = v;
  AsyncStorage.setItem(PREF_KEY, v ? "1" : "0").catch(() => {});
}

export function hapticsEnabled(): boolean {
  return enabled;
}

/**
 * Restores the saved preference. Called once at startup — without it the
 * setting silently resets to "on" every cold start.
 */
export async function initHaptics(): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(PREF_KEY);
    if (raw !== null) enabled = raw === "1";
  } catch {
    /* keep the default */
  }
  return enabled;
}

const supported = Platform.OS === "ios" || Platform.OS === "android";

function safe(fn: () => Promise<unknown>): void {
  if (!enabled || !supported) return;
  try {
    void fn().catch(() => {});
  } catch {
    /* never let feedback break an action */
  }
}

/** Light tick — selection changes, chips, tabs, sliders crossing a step. */
export const tapLight = (): void => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));

/** Medium thud — a real state change landed (relay on/off, scene applied). */
export const tapMedium = (): void => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));

/** Heavy — destructive or high-consequence confirmation (unlock, disarm). */
export const tapHeavy = (): void => safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));

export const notifySuccess = (): void =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));

export const notifyWarning = (): void =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));

export const notifyError = (): void =>
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));

/** Discrete selection movement — cheaper than an impact, use for pickers. */
export const selection = (): void => safe(() => Haptics.selectionAsync());

/**
 * Feedback for a boolean control. Turning something *on* gets the heavier of
 * the two so "on" feels like a commitment and "off" feels like a release.
 */
export function toggleFeedback(next: boolean): void {
  if (next) tapMedium();
  else tapLight();
}
