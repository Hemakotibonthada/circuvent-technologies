"use strict";
/**
 * Display settings — the platform half.
 *
 * Split from view-settings.ts because that file has to stay importable from
 * the root Jest suite, which is where mobile logic is tested (Docs/24 §1) and
 * which cannot transform react-native's ESM. Everything here touches a native
 * module; everything there is arithmetic. The same split is why tank-link.ts
 * is testable and its screens are not.
 *
 * WHY THE TEXT PATCH LIVES AT ALL
 *
 * The obvious implementation of a text-size setting is to scale a design
 * token. That does not work here: `fontSize:` is written literally 681 times
 * across 86 files and there is no shared Text wrapper, so a token-based
 * setting would move a handful of labels and leave the rest of the app alone —
 * a switch that persists a preference with almost no effect, which is the same
 * failure the web's view-settings module was written to fix.
 *
 * So the multiplier is applied where every size necessarily passes: Text's own
 * render. It reaches all 681 without editing any of them, and a screen written
 * tomorrow is covered without being told this file exists.
 */

import { Platform, StyleSheet, Text, TextInput } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  DEFAULT_VIEW_SETTINGS,
  STORAGE_KEY,
  clampScale,
  parseViewSettings,
  type ViewSettings,
} from "./view-settings";

let currentScale = 1;
let installed = false;

/** The multiplier the Text patch is currently applying. */
export function getTextScale(): number {
  return currentScale;
}

export function setTextScaleMultiplier(percent: number): void {
  currentScale = clampScale(percent) / 100;
}

/**
 * Make every Text and TextInput honour the multiplier.
 *
 * Idempotent, because a second patch would wrap the first and square the
 * scale — 115% would silently become 132%, which reads as a bad design
 * decision rather than a double-applied transform.
 *
 * `allowFontScaling` is deliberately left alone. It is the OS accessibility
 * setting, and someone who has already enlarged type system-wide should get
 * this on top of that, not instead of it.
 */
export function installTextScaling(): void {
  if (installed) return;
  installed = true;

  for (const Component of [Text, TextInput] as unknown as {
    render?: (...args: unknown[]) => React.ReactElement;
  }[]) {
    const original = Component.render;
    if (typeof original !== "function") continue;
    Component.render = function patched(this: unknown, ...args: unknown[]) {
      const element = original.apply(this, args);
      if (currentScale === 1) return element;
      const style = (element.props as { style?: unknown }).style;
      const flat = StyleSheet.flatten(style as never) as { fontSize?: number } | undefined;
      const size = flat?.fontSize;
      /* No explicit size means the platform default, which the OS already
         scales. Multiplying an assumed 14 would move text nobody sized. */
      if (typeof size !== "number") return element;
      return {
        ...element,
        props: { ...element.props, style: [style, { fontSize: size * currentScale }] },
      } as React.ReactElement;
    };
  }
}

export async function loadViewSettings(): Promise<ViewSettings> {
  try {
    return parseViewSettings(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    return DEFAULT_VIEW_SETTINGS;
  }
}

export async function saveViewSettings(next: ViewSettings): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* Storage can fail; the setting still applies for this session. */
  }
}

/** Platform note shown under the control; the two OSes name it differently. */
export const OS_SCALE_NOTE =
  Platform.OS === "ios"
    ? "Applies on top of the iOS Display & Text Size setting."
    : "Applies on top of the Android font size setting.";
