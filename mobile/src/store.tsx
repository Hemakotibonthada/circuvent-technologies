import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { api, Device } from "./api";
import { projectCommand } from "./command-map";
import { useLive, refreshLiveSubscription } from "./live";

interface DevicesCtx {
  devices: Device[];
  loading: boolean;
  unread: number;
  refresh: () => Promise<void>;
  refreshUnread: () => Promise<void>;
  toggle: (id: string, field: string, value: boolean) => void;
  command: (id: string, cmd: Record<string, unknown>) => void;
  patch: (id: string, body: { name?: string; room?: string; favorite?: boolean }) => void;
  byId: (id: string) => Device | undefined;
}

const Ctx = createContext<DevicesCtx | null>(null);

export function DevicesProvider({ children }: { children: React.ReactNode }) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [unread, setUnread] = useState(0);
  const mounted = useRef(true);

  const refresh = useCallback(async () => {
    const r = await api.devices();
    if (r.ok && mounted.current) {
      setDevices((prev) => {
        const next = r.data.devices || [];
        // A device the socket doesn't know about yet gets no live pushes, so
        // nudge the server to re-read ownership whenever the list changes.
        if (next.length !== prev.length) refreshLiveSubscription();
        return next;
      });
    }
    setLoading(false);
  }, []);

  const refreshUnread = useCallback(async () => {
    const r = await api.unreadCount();
    if (r.ok && mounted.current) setUnread(r.data.count || 0);
  }, []);

  useEffect(() => {
    mounted.current = true;
    refresh();
    refreshUnread();
    const t = setInterval(refresh, 15000);
    const u = setInterval(refreshUnread, 20000);
    return () => {
      mounted.current = false;
      clearInterval(t);
      clearInterval(u);
    };
  }, [refresh, refreshUnread]);

  // Single live channel for the whole app — physical/manual changes land here.
  useLive((upd) => {
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== upd.deviceId) return d;
        if (upd.kind === "status") return { ...d, online: !!upd.payload?.online };
        if (upd.kind === "state") return { ...d, online: true, state: { ...d.state, ...upd.payload } };
        return { ...d, online: true };
      })
    );
    if (upd.kind === "state") refreshUnread();
  });

  const toggle = useCallback((id: string, field: string, value: boolean) => {
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, state: { ...d.state, [field]: value } } : d)));
    api.command(id, { action: "set", [field]: value });
  }, []);

  const command = useCallback((id: string, cmd: Record<string, unknown>) => {
    setDevices((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        // Projected rather than merged. A raw merge wrote the command's own
        // addressing into state — a Home Hub's { ch, on } became state.ch and
        // state.on while `power` never moved, so the switch snapped back and
        // stayed wrong until the device echoed. See command-map.ts.
        const patch = projectCommand(d.type, cmd, d.state);
        if (!Object.keys(patch).length) return d;
        return { ...d, state: { ...d.state, ...patch } };
      })
    );
    api.command(id, cmd);
  }, []);

  const patch = useCallback((id: string, body: { name?: string; room?: string; favorite?: boolean }) => {
    setDevices((prev) => prev.map((d) => (d.id === id ? { ...d, ...body } : d)));
    api.patchDevice(id, body);
  }, []);

  const byId = useCallback((id: string) => devices.find((d) => d.id === id), [devices]);

  const value = useMemo<DevicesCtx>(
    () => ({ devices, loading, unread, refresh, refreshUnread, toggle, command, patch, byId }),
    [devices, loading, unread, refresh, refreshUnread, toggle, command, patch, byId]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDevices(): DevicesCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useDevices must be used within DevicesProvider");
  return v;
}

// ------------------------------------------------------------ capabilities ---

export interface Capability {
  power?: { field: string; label: string };
  dimmer?: { field: string; label: string; min: number; max: number };
  fan?: { field: string; label: string; steps: number; legacyField?: string };
  color?: { field: string };
  thermostat?: { field: string; label: string; min: number; max: number };
  metric?: (d: Device) => string;
}

/** What a device type can do — drives the richer Control screen UI. */
export function capabilities(type: string): Capability {
  switch (type) {
    case "smart-plug":
      return { power: { field: "power", label: "Power" }, metric: (d) => `${Number(d.state.watts ?? 0).toFixed(0)} W` };
    case "energy-monitor":
      return { metric: (d) => `${Number(d.state.watts ?? 0).toFixed(0)} W` };
    case "smart-switch":
      return { power: { field: "power", label: "Gang 1" } };
    case "home-hub":
      return { power: { field: "power", label: "Channel 1" } };
    case "sentinel":
      // Relay 1 is the primary toggle; the metric leads with whatever the
      // person most needs to know, which is the alarm before the weather.
      return {
        power: { field: "r1", label: "Relay 1" },
        metric: (d) => {
          const s = d.state;
          if (s.gasAlarm) return "Gas alarm";
          if (s.hasGas && s.gasWarmingUp) return "Warming up";
          if (s.climateOk) return `${Number(s.temp ?? 0).toFixed(0)}° · ${Number(s.humidity ?? 0).toFixed(0)}%`;
          return "Monitoring";
        },
      };
    case "aquaguard":
      return { power: { field: "pump", label: "Pump" }, metric: (d) => `${Number(d.state.level ?? 0)}%` };
    case "agri-starter":
      return { power: { field: "pump", label: "Pump" } };
    case "guardian":
      return { metric: (d) => (d.state.sos ? "SOS" : d.state.armed ? "Armed" : "Disarmed") };
    case "motion-sensor":
      return { metric: (d) => (d.state.motion ? "Motion" : d.state.armed ? "Armed" : "Clear") };
    case "camera":
    case "cctv":
    case "doorbell":
      // No `power` field: a camera's primary tile action is "watch", not
      // "toggle", and offering a switch that maps to nothing would lie.
      return { metric: (d) => (d.state.motionActive ? "Motion" : d.state.streaming ? "Live" : "Idle") };
    case "anpr-cam":
      /*
       * No `power`, for the same reason as a camera and one more: this
       * device's only boolean is `armed`, which is a mode rather than a load.
       * Exposing it as the tile switch would put "stop watching the gate" one
       * accidental tap away, in a grid of lamps.
       *
       * The metric leads with the plate, because that is the thing somebody
       * opening the app actually wants to know.
       */
      return {
        metric: (d) => {
          if (d.state.ready === false) return "No sensor";
          if (!d.state.armed) return "Disarmed";
          if (d.state.lastPlate) return String(d.state.lastPlate);
          const phase = String(d.state.phase ?? "idle");
          return phase === "settle" || phase === "burst" ? "Vehicle" : "Watching";
        },
      };
    // Dimmable / speed / motorised device types (match firmware type ids).
    case "smart-light":
    case "light":
      return {
        power: { field: "power", label: "Power" },
        dimmer: { field: "brightness", label: "Brightness", min: 0, max: 100 },
        color: { field: "color" },
      };
    case "smart-fan":
    case "fan":
    case "ceiling-fan":
      // `level` is the continuous 0..100 the hardware always had; `speed` is
      // the four-position table it used to be limited to. Both are sent, so
      // the same control works on a fan that has not been updated.
      return { power: { field: "power", label: "Power" }, fan: { field: "level", label: "Speed", steps: 3, legacyField: "speed" } };
    case "curtain":
      return { dimmer: { field: "position", label: "Position", min: 0, max: 100 }, metric: (d) => `${Number(d.state.position ?? 0)}%` };
    case "smart-lock":
      return { power: { field: "locked", label: "Lock" }, metric: (d) => (d.state.locked ? "Locked" : "Unlocked") };
    case "thermostat":
    case "ac":
      return { power: { field: "power", label: "Power" }, thermostat: { field: "target", label: "Target", min: 16, max: 30 } };
    default:
      return { power: { field: "power", label: "Power" } };
  }
}
