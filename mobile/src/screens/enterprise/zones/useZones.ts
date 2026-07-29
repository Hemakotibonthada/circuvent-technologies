import { useCallback, useEffect, useMemo, useState } from "react";
import { api, type Device, type Room, type EnergySeries } from "../../../api";
import { createStore, telemetryFields } from "../../../enterprise";
import { environmentalFields, type DeviceFields } from "./fields";

export interface TankConfig { capacityL: number; sensorOffsetCm: number; onBelow: number; offAbove: number }
export interface AirThresholds { aqi: number; pm25: number; pm10: number; co2: number; voc: number }
export interface ClimateTarget { temperature: number; humidity: number }
export interface VacancyConfig { minutes: number }
export interface ZoneSettings {
  tanks: Record<string, TankConfig>;
  air: AirThresholds;
  climate: ClimateTarget;
  vacancy: VacancyConfig;
}

export const DEFAULT_ZONE_SETTINGS: ZoneSettings = {
  tanks: {},
  air: { aqi: 100, pm25: 35, pm10: 150, co2: 1000, voc: 500 },
  climate: { temperature: 24, humidity: 55 },
  vacancy: { minutes: 60 },
};

export const zoneSettingsStore = createStore<ZoneSettings>("zones-environment-v1", DEFAULT_ZONE_SETTINGS);

export interface ZoneModel {
  devices: Device[];
  rooms: Room[];
  fieldMap: Record<string, DeviceFields>;
  settings: ZoneSettings;
}

function okData<T>(res: any, fallback: T): T {
  if (res?.ok === false) throw new Error(res?.data?.error || `Request failed (${res.status || 0})`);
  return (res?.data ?? res ?? fallback) as T;
}

export function tankConfig(settings: ZoneSettings, id: string): TankConfig {
  return settings.tanks[id] ?? { capacityL: 1000, sensorOffsetCm: 0, onBelow: 25, offAbove: 90 };
}

export function useZones(limit = 80) {
  const [data, setData] = useState<ZoneModel | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (spin = true) => {
    if (spin) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const [devRes, roomRes, settings] = await Promise.all([api.devices(), api.rooms(), zoneSettingsStore.load()]);
      const devices = okData<{ devices: Device[] }>(devRes, { devices: [] }).devices ?? [];
      const rooms = okData<{ rooms: Room[] }>(roomRes, { rooms: [] }).rooms ?? [];
      const telemetryRows = await Promise.all(devices.map(async (d) => {
        try {
          const res = await api.telemetry(d.id, limit);
          return [d.id, okData<{ telemetry: { ts: string; payload: any }[] }>(res, { telemetry: [] }).telemetry ?? []] as const;
        } catch {
          return [d.id, [] as { ts: string; payload: any }[]] as const;
        }
      }));
      const fieldMap: Record<string, DeviceFields> = {};
      for (const d of devices) {
        const rows = telemetryRows.find(([id]) => id === d.id)?.[1] ?? ([] as { ts: string; payload: any }[]);
        fieldMap[d.id] = environmentalFields(d, telemetryFields(rows));
      }
      setData({ devices, rooms, fieldMap, settings });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to load zones data");
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [limit]);

  useEffect(() => { load(true); }, [load]);

  const saveSettings = useCallback(async (next: ZoneSettings) => {
    await zoneSettingsStore.save(next);
    setData((cur) => cur ? { ...cur, settings: next } : cur);
  }, []);

  return { data, loading, refreshing, error, reload: () => load(true), refresh: () => load(false), saveSettings };
}

export async function loadEnergySeries(deviceId: string, field: string, hours = 24): Promise<EnergySeries | null> {
  try {
    const res = await api.deviceEnergy(deviceId, hours, field);
    return okData<EnergySeries | null>(res, null);
  } catch {
    return null;
  }
}

export async function loadTelemetryRows(deviceId: string, limit = 300): Promise<{ ts: string; payload: any }[]> {
  try {
    const res = await api.telemetry(deviceId, limit);
    return okData<{ telemetry: { ts: string; payload: any }[] }>(res, { telemetry: [] }).telemetry ?? [];
  } catch {
    return [];
  }
}

export function roomNameOf(device: Device): string { return device.room || "Unassigned"; }
export function devicesForRoom(devices: Device[], room: Room | string): Device[] {
  const name = typeof room === "string" ? room : room.name;
  return devices.filter((d) => (d.room || "Unassigned") === name);
}

export function numericState(d: Device, field?: string): number | undefined {
  if (!field) return undefined;
  const raw = d.state?.[field];
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

export function seriesValues(series: EnergySeries | null): number[] {
  return series?.series?.map((p) => p.avg).filter((n) => Number.isFinite(n)) ?? [];
}

export { okData };
