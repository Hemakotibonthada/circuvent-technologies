// Per-device widget customization for multi-gang controls (smart-switch,
// touchboard, home-hub). Lets the user rename each gang and hide the ones they
// don't use. Stored locally per device id.
import { useCallback, useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Device } from "./api";

export interface Gang { field: string; label: string; visible: boolean }

// The switchable fields a device exposes, with sensible default labels.
export function defaultGangs(d: Device): Gang[] {
  const s = d.state || {};
  const mk = (field: string, label: string): Gang => ({ field, label, visible: true });
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

// Merge saved overrides (labels/visibility) onto the current default set so new
// firmware fields still appear and removed ones drop out.
function merge(defaults: Gang[], saved: Gang[] | null): Gang[] {
  if (!saved || !saved.length) return defaults;
  const byField = new Map(saved.map((g) => [g.field, g]));
  return defaults.map((d) => {
    const s = byField.get(d.field);
    return s ? { field: d.field, label: s.label || d.label, visible: s.visible !== false } : d;
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

  const reset = useCallback(() => persist(defaultGangs(device)), [device, persist]);

  return { gangs, visible: gangs.filter((g) => g.visible), rename, setVisible, reset };
}
