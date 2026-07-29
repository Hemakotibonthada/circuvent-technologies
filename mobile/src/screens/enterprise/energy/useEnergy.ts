import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../api";
import type { Device, EnergySeries, EnergySummary, TelemetryRow } from "../../../api";
import {
  budgetStore,
  createStore,
  DEFAULT_TARIFF,
  tariffStore,
  telemetryFields,
  type EnergyBudget,
  type Tariff,
} from "../../../enterprise";

type ApiResult<T> = { ok: boolean; status: number; data: T & { error?: string } };

export type LoadState<T> = { loading: boolean; refreshing: boolean; error: string | null; data: T | null };

export interface DailyEnergyRollups {
  startedAt: string;
  days: Record<string, number>;
}

export const dailyEnergyStore = createStore<DailyEnergyRollups>("energy-daily-rollups", { startedAt: "", days: {} });

export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function daysElapsedInMonth(date = new Date()): number {
  return Math.max(1, date.getDate());
}

export function daysInMonth(date = new Date()): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

export function daysRemainingInMonth(date = new Date()): number {
  return Math.max(0, daysInMonth(date) - date.getDate());
}

export async function unwrap<T>(promise: Promise<ApiResult<T>>): Promise<T> {
  const res = await promise;
  if (!res.ok) throw new Error(res.data?.error || (res.status ? `Request failed (${res.status})` : "Network error"));
  return res.data;
}

export function useAsyncData<T>(loader: () => Promise<T>, deps: React.DependencyList = []) {
  const [state, setState] = useState<LoadState<T>>({ loading: true, refreshing: false, error: null, data: null });

  const run = useCallback(
    async (refreshing = false) => {
      setState((s) => ({ ...s, loading: !s.data && !refreshing, refreshing, error: null }));
      try {
        const data = await loader();
        setState({ loading: false, refreshing: false, error: null, data });
      } catch (e) {
        setState((s) => ({ ...s, loading: false, refreshing: false, error: e instanceof Error ? e.message : "Something went wrong" }));
      }
    },
    deps
  );

  useEffect(() => {
    run(false);
  }, [run]);

  return { ...state, reload: () => run(false), refresh: () => run(true) };
}

export function useTariff() {
  const [tariff, setTariff] = useState<Tariff>(DEFAULT_TARIFF);
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    const next = await tariffStore.load();
    setTariff(normalizeTariff(next));
    setLoading(false);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  const save = useCallback(async (next: Tariff) => {
    const normalized = normalizeTariff(next);
    await tariffStore.save(normalized);
    setTariff(normalized);
  }, []);
  const reset = useCallback(async () => {
    await tariffStore.save(DEFAULT_TARIFF);
    setTariff(DEFAULT_TARIFF);
  }, []);
  return { tariff, loading, reload, save, reset, setTariff };
}

export function useBudget() {
  const [budget, setBudget] = useState<EnergyBudget>({ monthlyKwh: 300, monthlyCost: 3000, alertAtPct: 80, enabled: false });
  const [loading, setLoading] = useState(true);
  const reload = useCallback(async () => {
    setLoading(true);
    const next = await budgetStore.load();
    setBudget(next);
    setLoading(false);
  }, []);
  useEffect(() => {
    reload();
  }, [reload]);
  const save = useCallback(async (next: EnergyBudget) => {
    await budgetStore.save(next);
    setBudget(next);
  }, []);
  return { budget, loading, reload, save, setBudget };
}

export async function loadEnergyDashboardData() {
  const [summary, tariff, budget] = await Promise.all([unwrap(api.energySummary()), tariffStore.load(), budgetStore.load()]);
  await rememberToday(summary.todayKwh);
  return { summary, tariff: normalizeTariff(tariff), budget };
}

export async function loadCostBreakdownData() {
  const [summary, devices, tariff] = await Promise.all([unwrap(api.energySummary()), unwrap(api.devices()), tariffStore.load()]);
  return { summary, devices: devices.devices, tariff: normalizeTariff(tariff) };
}

export async function loadBudgetData() {
  const [summary, tariff, budget, rollups] = await Promise.all([
    unwrap(api.energySummary()),
    tariffStore.load(),
    budgetStore.load(),
    dailyEnergyStore.load(),
  ]);
  const saved = await rememberToday(summary.todayKwh, rollups);
  return { summary, tariff: normalizeTariff(tariff), budget, rollups: saved };
}

export async function loadDeviceEnergyData(id: string, hours: number, metric: string) {
  const [energy, tariff, telemetry] = await Promise.all([
    unwrap(api.deviceEnergy(id, hours, metric)),
    tariffStore.load(),
    unwrap(api.telemetry(id, 200)),
  ]);
  return { energy, tariff: normalizeTariff(tariff), telemetry: telemetry.telemetry as TelemetryRow[], fields: telemetryFields(telemetry.telemetry) };
}

export async function loadDeviceChoices() {
  const [summary, devices] = await Promise.all([unwrap(api.energySummary()), unwrap(api.devices())]);
  return { summary, devices: devices.devices };
}

export async function rememberToday(kwh: number, existing?: DailyEnergyRollups): Promise<DailyEnergyRollups> {
  const current = existing ?? (await dailyEnergyStore.load());
  const key = todayKey();
  const startedAt = current.startedAt || new Date().toISOString();
  const safe = Number.isFinite(kwh) ? Math.max(0, kwh) : 0;
  const next = { startedAt, days: { ...current.days, [key]: Math.max(current.days[key] ?? 0, safe) } };
  await dailyEnergyStore.save(next);
  return next;
}

export function monthToDateFromRollups(rollups: DailyEnergyRollups, todayKwh: number, date = new Date()): number {
  const prefix = date.toISOString().slice(0, 8);
  const key = todayKey(date);
  return Object.entries(rollups.days).reduce((sum, [day, kwh]) => {
    if (!day.startsWith(prefix)) return sum;
    if (day === key) return sum + Math.max(kwh, todayKwh || 0);
    return sum + Math.max(0, kwh || 0);
  }, 0);
}

export function normalizeTariff(t: Tariff): Tariff {
  return {
    ...DEFAULT_TARIFF,
    ...t,
    windows: (t.windows ?? DEFAULT_TARIFF.windows).map((w) => ({ label: w.label || "Window", from: Number(w.from), to: Number(w.to), rate: Number(w.rate) })),
    slabs: (t.slabs ?? DEFAULT_TARIFF.slabs).map((s) => ({ upTo: Number(s.upTo), rate: Number(s.rate) })),
    standingCharge: Number(t.standingCharge ?? DEFAULT_TARIFF.standingCharge),
    carbonIntensity: Number(t.carbonIntensity ?? DEFAULT_TARIFF.carbonIntensity),
    flatRate: Number(t.flatRate ?? DEFAULT_TARIFF.flatRate),
    currency: t.currency || DEFAULT_TARIFF.currency,
  };
}

export function deviceName(summary: EnergySummary | null, devices: Device[], id: string): string {
  return summary?.byDevice.find((d) => d.id === id)?.name || devices.find((d) => d.id === id)?.name || id;
}

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

export function labelForPoint(t: string, hours: number): string {
  const d = new Date(t);
  if (!Number.isFinite(d.getTime())) return "—";
  if (hours <= 24) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function numericText(v: number, digits = 2): string {
  if (!Number.isFinite(v)) return "—";
  return v.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function isOffLikeState(device: Device): boolean {
  const state = device.state ?? {};
  const keys = ["power", "on", "state", "switch", "mode", "running", "active"];
  return keys.some((key) => {
    const raw = state[key];
    if (raw == null) return false;
    if (typeof raw === "boolean") return raw === false;
    const text = String(raw).toLowerCase();
    return ["off", "false", "0", "idle", "standby", "stopped", "closed"].includes(text);
  });
}

export type EnergyDashboardData = Awaited<ReturnType<typeof loadEnergyDashboardData>>;
export type CostBreakdownData = Awaited<ReturnType<typeof loadCostBreakdownData>>;
export type BudgetData = Awaited<ReturnType<typeof loadBudgetData>>;
export type DeviceEnergyData = { energy: EnergySeries; tariff: Tariff; telemetry: TelemetryRow[]; fields: string[] };
