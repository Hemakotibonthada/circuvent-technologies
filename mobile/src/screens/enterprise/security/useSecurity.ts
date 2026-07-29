import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../api";
import type { Device, AppEvent, Scene, Automation } from "../../../api";
import { triageEvents } from "../../../enterprise";
import { deriveZones, isAlarmCapable, isSecurityCapable, securityConfigStore, type ArmMode, type SecurityConfig, DEFAULT_SECURITY_CONFIG } from "./zones";

interface LoadState {
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  devices: Device[];
  events: AppEvent[];
  scenes: Scene[];
  automations: Automation[];
  config: SecurityConfig;
}

function messageFrom(x: unknown): string {
  if (x instanceof Error) return x.message;
  return String(x || "Request failed");
}

async function unwrap<T>(promise: Promise<{ ok: boolean; status: number; data: T }>, label: string): Promise<T> {
  const res = await promise;
  if (!res.ok) throw new Error(`${label} failed (${res.status || "network"})`);
  return res.data;
}

export function useSecurityData(loadExtras = true) {
  const [state, setState] = useState<LoadState>({
    loading: true,
    refreshing: false,
    error: null,
    devices: [],
    events: [],
    scenes: [],
    automations: [],
    config: DEFAULT_SECURITY_CONFIG,
  });

  const load = useCallback(async (refreshing = false) => {
    setState((s) => ({ ...s, loading: !refreshing && s.devices.length === 0, refreshing, error: null }));
    try {
      const [cfg, deviceData, eventData, sceneData, automationData] = await Promise.all([
        securityConfigStore.load(),
        unwrap(api.devices(), "Devices"),
        unwrap(api.events(200), "Events"),
        loadExtras ? unwrap(api.scenes(), "Scenes") : Promise.resolve({ scenes: [] }),
        loadExtras ? unwrap(api.automations(), "Automations") : Promise.resolve({ automations: [] }),
      ]);
      setState({ loading: false, refreshing: false, error: null, devices: deviceData.devices ?? [], events: triageEvents(eventData.events ?? []), scenes: sceneData.scenes ?? [], automations: automationData.automations ?? [], config: cfg });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, refreshing: false, error: messageFrom(e) }));
    }
  }, [loadExtras]);

  useEffect(() => { load(false); }, [load]);

  const saveConfig = useCallback(async (config: SecurityConfig) => {
    await securityConfigStore.save(config);
    setState((s) => ({ ...s, config }));
  }, []);

  const zones = useMemo(() => deriveZones(state.devices), [state.devices]);
  const securityDevices = useMemo(() => state.devices.filter(isSecurityCapable), [state.devices]);
  const alarmDevices = useMemo(() => state.devices.filter(isAlarmCapable), [state.devices]);

  const publishArm = useCallback(async (mode: ArmMode, reason: string) => {
    const targets = state.devices.filter(isSecurityCapable);
    const acknowledgedBy: string[] = [];
    const failedBy: { id: string; name: string; error: string }[] = [];
    await Promise.all(targets.map(async (d) => {
      try {
        const res = await api.command(d.id, { action: mode === "disarmed" ? "disarm" : "arm", mode });
        if ((res as any).ok) acknowledgedBy.push(d.id);
        else failedBy.push({ id: d.id, name: d.name, error: `Command failed (${(res as any).status || "network"})` });
      } catch (e) {
        failedBy.push({ id: d.id, name: d.name, error: messageFrom(e) });
      }
    }));
    const next: SecurityConfig = { ...state.config, arm: { mode: acknowledgedBy.length > 0 ? mode : state.config.arm.mode, reason, changedAt: new Date().toISOString(), acknowledgedBy, failedBy } };
    await securityConfigStore.save(next);
    setState((s) => ({ ...s, config: next }));
    return next.arm;
  }, [state.devices, state.config]);

  const triggerPanic = useCallback(async () => {
    const targets = state.devices.filter(isAlarmCapable);
    const results = await Promise.all(targets.map(async (d) => {
      try {
        const res = await api.command(d.id, { action: "panic", siren: true, alarm: true });
        return { id: d.id, name: d.name, ok: (res as any).ok, error: (res as any).ok ? undefined : `Command failed (${(res as any).status || "network"})` };
      } catch (e) {
        return { id: d.id, name: d.name, ok: false, error: messageFrom(e) };
      }
    }));
    return results;
  }, [state.devices]);

  const setBypass = useCallback(async (zoneId: string, bypassed: boolean) => {
    const next: SecurityConfig = { ...state.config, bypassedZones: { ...state.config.bypassedZones, [zoneId]: bypassed } };
    if (!bypassed) delete next.bypassedZones[zoneId];
    await saveConfig(next);
  }, [state.config, saveConfig]);

  return { ...state, zones, securityDevices, alarmDevices, reload: () => load(true), saveConfig, publishArm, triggerPanic, setBypass };
}
