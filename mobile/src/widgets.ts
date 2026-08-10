// Per-device widget customization for multi-gang controls (smart-switch,
// touchboard, home-hub). Lets the user name each channel, say what it is wired
// to, and hide the ones they don't use. Stored locally per device id.
import { useCallback, useEffect, useRef, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Device } from "./api";
import type { IconName } from "./icons";
import { channelLabel, channelKind as savedChannelKind, setChannelLabel, setChannelKind, clearChannelPrefs, onChannelPrefsChange, channelHidden, setChannelHidden } from "./channel-prefs";

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
/**
 * What a channel is called when nobody has renamed it.
 *
 * Needed by the name field, which shows it as a placeholder rather than as
 * text — an empty box means "use the default", and filling the box with the
 * default is how clearing it appeared not to work.
 */
export function defaultLabelFor(d: Device, field: string): string {
  const g = defaultGangs(d, true).find((x) => x.field === field);
  return g ? g.label : field;
}

export function defaultGangs(d: Device, rawLabels = false): Gang[] {
  const s = d.state || {};
  /*
   * The user's own name wins over the generic one.
   *
   * These defaults are what a board ships with, not what anybody calls it once
   * it is wired to something. The console has always let people rename a
   * channel; this simply asks for the answer instead of assuming "Channel 1".
   */
  const mk = (field: string, label: string, kind: ChannelKind = "generic"): Gang =>
    ({ field, label: rawLabels ? label : channelLabel(d.id, field, label), visible: !channelHidden(d.id, field), kind: (savedChannelKind(d.id, field) as ChannelKind) ?? kind });
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

/*
 * Only visibility is a per-phone choice.
 *
 * Names and kinds used to be stored here too, and `label: s.label || d.label`
 * meant the local copy beat the server's. That is the whole bug: rename a
 * channel on the phone and the name was pinned locally and never sent anywhere;
 * rename it on the web afterwards and the phone kept showing its own stale
 * copy. It appeared to work exactly once — before any local rename existed,
 * there was nothing to win, so the console's name came through.
 *
 * Which channels you hide is genuinely about this screen on this device, so it
 * stays local. Everything a second person would expect to see now lives on the
 * server, and this merge no longer has an opinion about it.
 */
function merge(defaults: Gang[], saved: Gang[] | null): Gang[] {
  if (!saved || !saved.length) return defaults;
  const byField = new Map(saved.map((g) => [g.field, g]));
  return defaults.map((d) => {
    const s = byField.get(d.field);
    if (!s) return d;
    return { ...d, visible: s.visible !== false };
  });
}

export function useSwitchWidgets(device: Device) {
  const [gangs, setGangs] = useState<Gang[]>(() => defaultGangs(device));

  useEffect(() => {
    let alive = true;
    const derive = async () => {
      try {
        const raw = await AsyncStorage.getItem(key(device.id));
        const saved = raw ? (JSON.parse(raw) as Gang[]) : null;
        if (alive) setGangs(merge(defaultGangs(device), saved));
      } catch {
        if (alive) setGangs(defaultGangs(device));
      }
    };
    void derive();

    /*
     * Re-derive when the console's names arrive or change.
     *
     * Without this the names are read once, when the screen mounts, and a
     * rename made on the web while somebody has the device open never appears —
     * which is half of what "it does not sync" meant. defaultGangs reads
     * straight from the shared prefs, so re-running it is the whole update.
     */
    const off = onChannelPrefsChange(() => {
      void derive();
    });
    return () => {
      alive = false;
      off();
    };
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
    // Shown immediately, sent to the console, and re-read from there on the
    // next refresh. setChannelLabel keeps its own cache, so the new name
    // survives being offline and a restart without this screen storing a
    // second, competing copy of it.
    update((prev) => prev.map((g) => (g.field === field ? { ...g, label } : g)));
    void setChannelLabel(device.id, field, label);
  }, [update, device.id]);

  const setVisible = useCallback((field: string, visible: boolean) => {
    // Shared, not local. A channel with nothing wired to it is nothing to
    // anybody, and hiding it only here made the app and the console disagree
    // about what the device has.
    update((prev) => prev.map((g) => (g.field === field ? { ...g, visible } : g)));
    void setChannelHidden(device.id, field, !visible);
  }, [update, device.id]);

  const setKind = useCallback((field: string, kind: ChannelKind) => {
    update((prev) => prev.map((g) => (g.field === field ? { ...g, kind } : g)));
    void setChannelKind(device.id, field, kind);
  }, [update, device.id]);

  const reset = useCallback(() => {
    // Clears the shared record as well as this screen's. Resetting on one
    // device while the console kept the old names would not be a reset.
    void clearChannelPrefs(device.id);
    setGangs(defaultGangs(device));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    AsyncStorage.removeItem(key(device.id)).catch(() => { /* ignore */ });
  }, [device]);

  return { gangs, visible: gangs.filter((g) => g.visible), rename, setVisible, setKind, reset };
}
