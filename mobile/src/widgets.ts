// Per-device widget customization for multi-gang controls (smart-switch,
// touchboard, home-hub). Lets the user name each channel, say what it is wired
// to, and hide the ones they don't use. Stored locally per device id.
import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Device } from "./api";
import type { IconName } from "./icons";
import { channelLabel, channelKind as savedChannelKind } from "./channel-prefs";

/**
 * What a relay is actually wired to.
 *
 * A relay board has no idea whether channel 2 feeds a ceiling fan or a geyser,
 * and it never will — so this is the user telling us, stored on the phone. It
 * is what turns a row of identical "Channel 3" switches into something you can
 * read at a glance.
 *
 * The names match the web console's ChannelKind so the two agree about a home.
 */
export type ChannelKind =
  | "generic" | "light" | "fan" | "socket" | "geyser"
  | "pump" | "tv" | "ac" | "curtain" | "gate";

export interface ChannelKindMeta {
  id: ChannelKind;
  label: string;
  icon: IconName;
  accent: string;
  /** Matches the hardware: a fan spins, a lamp glows. */
  motion: "spin" | "glow" | "none";
}

export const CHANNEL_KINDS: ChannelKindMeta[] = [
  { id: "generic", label: "Switch",    icon: "chGeneric", accent: "#94a3b8", motion: "none" },
  { id: "light",   label: "Light",     icon: "chLight",   accent: "#f59e0b", motion: "glow" },
  { id: "fan",     label: "Fan",       icon: "chFan",     accent: "#22d3ee", motion: "spin" },
  { id: "socket",  label: "Socket",    icon: "chSocket",  accent: "#06b6d4", motion: "glow" },
  { id: "geyser",  label: "Geyser",    icon: "chGeyser",  accent: "#ef4444", motion: "glow" },
  { id: "pump",    label: "Pump",      icon: "chPump",    accent: "#38bdf8", motion: "spin" },
  { id: "tv",      label: "TV",        icon: "chTv",      accent: "#8b5cf6", motion: "glow" },
  { id: "ac",      label: "AC",        icon: "chAc",      accent: "#2dd4bf", motion: "none" },
  { id: "curtain", label: "Curtain",   icon: "chCurtain", accent: "#a78bfa", motion: "none" },
  { id: "gate",    label: "Gate",      icon: "chGate",    accent: "#f59e0b", motion: "none" },
];

export function channelKind(kind: ChannelKind | undefined): ChannelKindMeta {
  return CHANNEL_KINDS.find((k) => k.id === kind) ?? CHANNEL_KINDS[0];
}

export interface Gang { field: string; label: string; visible: boolean; kind: ChannelKind }

// The switchable fields a device exposes, with sensible default labels.
export function defaultGangs(d: Device): Gang[] {
  const s = d.state || {};
  /*
   * The user's own name wins over the generic one.
   *
   * These defaults are what a board ships with, not what anybody calls it once
   * it is wired to something. The console has always let people rename a
   * channel; this simply asks for the answer instead of assuming "Channel 1".
   */
  const mk = (field: string, label: string, kind: ChannelKind = "generic"): Gang =>
    ({ field, label: channelLabel(d.id, field, label), visible: true, kind: (savedChannelKind(d.id, field) as ChannelKind) ?? kind });
  switch (d.type) {
    case "touchboard":
      return [mk("g1", "Gang 1"), mk("g2", "Gang 2"), mk("g3", "Gang 3")];
    case "smart-switch":
      return [mk("power", "Gang 1"), mk("power2", "Gang 2")];
    case "home-hub":
      return [mk("power", "Channel 1"), mk("power2", "Channel 2"), mk("power3", "Channel 3"), mk("power4", "Channel 4")];
    case "sentinel": {
      // Relay count differs by board (the camera build gives up two relays to
      // the sensor bus), so trust what the firmware reports over a constant.
      const n = Math.max(1, Math.min(32, Number(s.relays ?? 4)));
      return Array.from({ length: n }, (_, i) => mk(`r${i + 1}`, `Relay ${i + 1}`));
    }
    default: {
      // Any device: expose its boolean state fields as gangs.
      const fields = Object.keys(s).filter((k) => typeof s[k] === "boolean" && !["auto", "dryRun", "overflow", "armed", "motion"].includes(k));
      return fields.map((f) => mk(f, f.replace(/([A-Z])/g, " $1").replace(/^./, (m) => m.toUpperCase())));
    }
  }
}

const key = (id: string) => `cv-gangs-${id}`;

// Merge saved overrides (labels/visibility/kind) onto the current default set so
// new firmware fields still appear and removed ones drop out.
function merge(defaults: Gang[], saved: Gang[] | null): Gang[] {
  if (!saved || !saved.length) return defaults;
  const byField = new Map(saved.map((g) => [g.field, g]));
  return defaults.map((d) => {
    const s = byField.get(d.field);
    if (!s) return d;
    return {
      field: d.field,
      label: s.label || d.label,
      visible: s.visible !== false,
      // Saved before kinds existed, so absent means "not chosen yet" rather
      // than a value to trust.
      kind: s.kind ?? d.kind,
    };
  });
}

export function useSwitchWidgets(device: Device) {
  const [gangs, setGangs] = useState<Gang[]>(() => defaultGangs(device));

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(key(device.id));
        const saved = raw ? (JSON.parse(raw) as Gang[]) : null;
        if (alive) setGangs(merge(defaultGangs(device), saved));
      } catch {
        if (alive) setGangs(defaultGangs(device));
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [device.id, device.type]);

  /**
   * Applies a change and saves it.
   *
   * Two things were wrong with doing this directly from `gangs`.
   *
   * The update is functional because `rename` closed over `gangs`, so two
   * keystrokes landing before a re-render both computed from the same stale
   * array and the first character was lost. Typing a channel name at speed
   * silently dropped letters.
   *
   * The write is debounced because it wrote the whole array to AsyncStorage on
   * every keystroke — a bridge hop and a disk write per character, which is
   * exactly the kind of per-keystroke work that makes a keyboard feel like it
   * is fighting back. State still updates immediately, so the field stays
   * responsive; only the save waits.
   */
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const update = useCallback((fn: (prev: Gang[]) => Gang[]) => {
    setGangs((prev) => {
      const next = fn(prev);
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        AsyncStorage.setItem(key(device.id), JSON.stringify(next)).catch(() => { /* ignore */ });
      }, 400);
      return next;
    });
  }, [device.id]);

  // A pending save must not be lost because the user navigated away, which is
  // the obvious way for a debounce to eat someone's work.
  useEffect(() => () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
  }, []);

  const rename = useCallback((field: string, label: string) => {
    update((prev) => prev.map((g) => (g.field === field ? { ...g, label } : g)));
  }, [update]);

  const setVisible = useCallback((field: string, visible: boolean) => {
    update((prev) => prev.map((g) => (g.field === field ? { ...g, visible } : g)));
  }, [update]);

  const setKind = useCallback((field: string, kind: ChannelKind) => {
    update((prev) => prev.map((g) => (g.field === field ? { ...g, kind } : g)));
  }, [update]);

  const reset = useCallback(() => {
    const defaults = defaultGangs(device);
    setGangs(defaults);
    if (saveTimer.current) clearTimeout(saveTimer.current);
    AsyncStorage.setItem(key(device.id), JSON.stringify(defaults)).catch(() => { /* ignore */ });
  }, [device]);

  return { gangs, visible: gangs.filter((g) => g.visible), rename, setVisible, setKind, reset };
}
