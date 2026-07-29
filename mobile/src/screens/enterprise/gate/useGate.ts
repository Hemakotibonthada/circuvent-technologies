/**
 * Data hooks for the Gate access module.
 *
 * There is one primary hook — `useGateData` — which every screen shares so we
 * make one round-trip for passes, gate devices, and events rather than three
 * copies. It also polls while the app is foregrounded, which is what makes the
 * overview KPIs feel live without a WebSocket.
 *
 * Every mutation returns a `GateOpResult` rather than throwing so screens can
 * display an inline error next to the button they came from, instead of an
 * unhandled promise rejection reaching the toast host.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, type AppEvent, type Device, type GatePass, type GatePassBody } from "../../../api";
import { triageEvents } from "../../../enterprise";
import { useAppActive } from "../../../ui";
import {
  DEFAULT_GATE_CONFIG,
  apiErrorMessage,
  gateConfigStore,
  isGateDevice,
  isGateEvent,
  pushRedemption,
  sortPasses,
  type GateConfig,
  type RedemptionLogEntry,
} from "./types";

/** How often to poll while foregrounded. Long enough to be gentle, short
 *  enough that a redeemed pass shows up before the guard puts the phone down. */
const POLL_INTERVAL_MS = 20_000;

/** Endpoint to page in when reading gate-related events. */
const EVENTS_PAGE_SIZE = 100;

export interface GateData {
  passes: GatePass[];
  devices: Device[];
  gateDevices: Device[];
  events: AppEvent[];
  gateEvents: AppEvent[];
  config: GateConfig;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastUpdated: number;
}

export interface GateActions {
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  createPass: (body: GatePassBody) => Promise<CreatePassResult>;
  revokePass: (id: number) => Promise<GateOpResult>;
  redeemCode: (code: string) => Promise<RedeemResult>;
  sendGateCommand: (deviceId: string, cmd: Record<string, unknown>) => Promise<GateOpResult>;
  saveConfig: (next: GateConfig) => Promise<void>;
}

export interface GateOpResult {
  ok: boolean;
  message: string;
}

export interface CreatePassResult extends GateOpResult {
  pass: GatePass | null;
}

export interface RedeemResult extends GateOpResult {
  opened?: boolean;
  label?: string;
  usesLeft?: number;
}

interface InternalState {
  passes: GatePass[];
  devices: Device[];
  events: AppEvent[];
  config: GateConfig;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  lastUpdated: number;
}

const INITIAL: InternalState = {
  passes: [],
  devices: [],
  events: [],
  config: DEFAULT_GATE_CONFIG,
  loading: true,
  refreshing: false,
  error: null,
  lastUpdated: 0,
};

/**
 * Main gate hook. Combines pass, device and event data with the local config
 * store, exposes a small mutation surface, and polls when the app is active.
 */
export function useGateData(): GateData & GateActions {
  const [state, setState] = useState<InternalState>(INITIAL);
  const stateRef = useRef(state);
  stateRef.current = state;
  const appActive = useAppActive();
  const configLoaded = useRef(false);

  const load = useCallback(async (refreshing: boolean) => {
    setState((s) => ({ ...s, loading: !refreshing && !s.lastUpdated, refreshing, error: null }));
    try {
      // AsyncStorage is cheap but not free, so we only reload the config on
      // the first pass. Later mutations flow through `saveConfig`.
      const configPromise = configLoaded.current
        ? Promise.resolve(stateRef.current.config)
        : gateConfigStore.load().then((c) => {
            configLoaded.current = true;
            return c;
          });

      const [passesRes, devicesRes, eventsRes, config] = await Promise.all([
        api.gatePasses(),
        api.devices(),
        api.events(EVENTS_PAGE_SIZE),
        configPromise,
      ]);

      // Only pass errors are hard-blocking. Devices and events are useful
      // even without each other and the overview should degrade gracefully.
      if (!passesRes.ok) {
        throw new Error(apiErrorMessage(passesRes, "Unable to load passes"));
      }

      const passes = passesRes.data.passes ?? [];
      const devices = devicesRes.ok ? devicesRes.data.devices ?? [] : [];
      const events = eventsRes.ok ? triageEvents(eventsRes.data.events ?? []) : [];

      setState({
        passes: sortPasses(passes),
        devices,
        events,
        config,
        loading: false,
        refreshing: false,
        error: null,
        lastUpdated: Date.now(),
      });
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        refreshing: false,
        error: err instanceof Error ? err.message : String(err),
      }));
    }
  }, []);

  useEffect(() => {
    load(false);
  }, [load]);

  useEffect(() => {
    if (!appActive) return;
    const id = setInterval(() => {
      // A live poll after an error keeps showing the last-known state instead
      // of blowing out to the error screen, which is what the operator wants
      // during a flaky network moment.
      load(true);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [appActive, load]);

  const saveConfig = useCallback(async (next: GateConfig) => {
    setState((s) => ({ ...s, config: next }));
    await gateConfigStore.save(next);
  }, []);

  const createPass = useCallback(async (body: GatePassBody): Promise<CreatePassResult> => {
    const res = await api.createGatePass(body);
    if (!res.ok || !res.data.pass) {
      return { ok: false, message: apiErrorMessage(res, "Could not create pass"), pass: null };
    }
    const created = res.data.pass;
    // Optimistically prepend so the passes list feels responsive; the next
    // poll will reconcile if the server row differs.
    setState((s) => ({ ...s, passes: sortPasses([created, ...s.passes.filter((p) => p.id !== created.id)]) }));
    return { ok: true, message: `Created ${created.label}`, pass: created };
  }, []);

  const revokePass = useCallback(async (id: number): Promise<GateOpResult> => {
    const res = await api.revokeGatePass(id);
    if (!res.ok) return { ok: false, message: apiErrorMessage(res, "Could not revoke pass") };
    // Mirror the server-side effect locally without waiting for the next
    // poll — a revoked pass must never show as active for a single frame.
    setState((s) => ({
      ...s,
      passes: sortPasses(s.passes.map((p) => (p.id === id ? { ...p, revoked: true, status: "revoked" } : p))),
    }));
    return { ok: true, message: "Pass revoked" };
  }, []);

  const redeemCode = useCallback(async (code: string): Promise<RedeemResult> => {
    const res = await api.redeemGatePass(code);
    const message = res.ok && res.data.ok
      ? `Gate opened for ${res.data.label ?? "guest"}`
      : apiErrorMessage(res, "Redeem failed") || (res.data.error ?? "Redeem failed");
    const outcome: RedeemResult = {
      ok: res.ok && !!res.data.ok,
      message,
      opened: res.data.opened,
      label: res.data.label,
      usesLeft: res.data.usesLeft,
    };
    const entry: RedemptionLogEntry = {
      code,
      ts: new Date().toISOString(),
      ok: outcome.ok,
      message,
      label: res.data.label,
    };
    setState((s) => {
      const next = pushRedemption(s.config, entry);
      // Save on a background microtask so the UI updates immediately.
      gateConfigStore.save(next).catch(() => {
        /* storage failures are non-fatal; the log just does not persist */
      });
      return { ...s, config: next };
    });
    return outcome;
  }, []);

  const sendGateCommand = useCallback(async (deviceId: string, cmd: Record<string, unknown>): Promise<GateOpResult> => {
    const res = await api.command(deviceId, cmd);
    if (!res.ok) return { ok: false, message: apiErrorMessage(res, "Command failed") };
    return { ok: true, message: "Command sent" };
  }, []);

  const derived: GateData = useMemo(() => {
    const gateDevices = state.devices.filter(isGateDevice);
    const gateDeviceIds = new Set(gateDevices.map((d) => d.id));
    const gateEvents = state.events.filter((e) => isGateEvent(e, gateDeviceIds));
    return {
      passes: state.passes,
      devices: state.devices,
      gateDevices,
      events: state.events,
      gateEvents,
      config: state.config,
      loading: state.loading,
      refreshing: state.refreshing,
      error: state.error,
      lastUpdated: state.lastUpdated,
    };
  }, [state]);

  const actions: GateActions = useMemo(
    () => ({
      reload: () => load(false),
      refresh: () => load(true),
      createPass,
      revokePass,
      redeemCode,
      sendGateCommand,
      saveConfig,
    }),
    [load, createPass, revokePass, redeemCode, sendGateCommand, saveConfig],
  );

  return { ...derived, ...actions };
}

/**
 * A single-pass detail hook. Screens with a live QR use it to refresh the
 * countdown label without needing the whole `useGateData` bundle.
 */
export function usePassCountdown(pass: GatePass | null): number {
  const [now, setNow] = useState(Date.now());
  const active = pass && (pass.status === "active" || pass.status === "scheduled");
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

/**
 * The most-recent successful redemption's message, used as an unobtrusive
 * status line on the scan screen. Nulls out when the last attempt was a
 * failure so the screen can re-focus on the fresh error.
 */
export function useLatestSuccess(entries: RedemptionLogEntry[]): RedemptionLogEntry | null {
  return useMemo(() => entries.find((e) => e.ok) ?? null, [entries]);
}
