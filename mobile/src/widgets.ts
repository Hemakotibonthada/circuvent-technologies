// Per-device widget customization for multi-gang controls (smart-switch,
// touchboard, home-hub). Lets the user name each channel, say what it is wired
// to, and hide the ones they don't use. Stored locally per device id.
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Device } from "./api";
import type { IconName } from "./icons";

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
  const mk = (field: string, label: string, kind: ChannelKind = "generic"): Gang =>
    ({ field, label, visible: true, kind });
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

  const persist = useCallback(async (next: Gang[]) => {
    setGangs(next);
    try { await AsyncStorage.setItem(key(device.id), JSON.stringify(next)); } catch { /* ignore */ }
  }, [device.id]);

  const rename = useCallback((field: string, label: string) => {
    persist(gangs.map((g) => (g.field === field ? { ...g, label } : g)));
  }, [gangs, persist]);

  const setVisible = useCallback((field: string, visible: boolean) => {
    persist(gangs.map((g) => (g.field === field ? { ...g, visible } : g)));
  }, [gangs, persist]);

  const setKind = useCallback((field: string, kind: ChannelKind) => {
    persist(gangs.map((g) => (g.field === field ? { ...g, kind } : g)));
  }, [gangs, persist]);

  const reset = useCallback(() => persist(defaultGangs(device)), [device, persist]);

  return { gangs, visible: gangs.filter((g) => g.visible), rename, setVisible, setKind, reset };
}
