"use client";

/**
 * Circuvent Console — shared polled resource.
 *
 * The console renders several panels per screen that all need the same handful
 * of endpoints (devices, energy, events, rooms, scenes). Giving each panel its
 * own `useEffect` + `setInterval` meant the old console fired the same request
 * five or six times per cycle. This is a module-level, reference-counted cache:
 * every consumer of a given key shares one in-flight request and one timer, the
 * timer stops when the last consumer unmounts, and polling pauses while the tab
 * is hidden.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  /** Human-readable failure, or null. Cleared on the next success. */
  error: string | null;
  /** Epoch ms of the last successful load. */
  lastSync: number | null;
}

interface Entry<T> {
  state: ResourceState<T>;
  listeners: Set<(s: ResourceState<T>) => void>;
  timer: ReturnType<typeof setInterval> | null;
  inflight: Promise<void> | null;
  fetcher: () => Promise<{ ok: boolean; status: number; data: unknown }>;
  select: (raw: unknown) => T;
  intervalMs: number;
  refs: number;
}

const registry = new Map<string, Entry<unknown>>();

function describe(status: number): string {
  if (status === 0) return "Can't reach the control plane. Check your connection.";
  if (status === 401 || status === 403) return "Session expired. Sign in again.";
  if (status === 404) return "Not found.";
  if (status >= 500) return "The control plane returned an error.";
  return "Request failed.";
}

function emit<T>(entry: Entry<T>) {
  entry.listeners.forEach((fn) => {
    try {
      fn(entry.state);
    } catch {
      /* a bad listener must not stall the rest */
    }
  });
}

async function run<T>(entry: Entry<T>): Promise<void> {
  if (entry.inflight) return entry.inflight;
  const p = (async () => {
    try {
      const res = await entry.fetcher();
      if (res.ok) {
        entry.state = { data: entry.select(res.data), loading: false, error: null, lastSync: Date.now() };
      } else {
        // Keep the last good payload on screen; surface the error alongside it
        // so a transient blip doesn't blank an operator's dashboard.
        entry.state = { ...entry.state, loading: false, error: describe(res.status) };
      }
    } catch {
      entry.state = { ...entry.state, loading: false, error: "Unexpected client error." };
    }
    emit(entry);
  })();
  entry.inflight = p;
  await p;
  entry.inflight = null;
}

function startTimer<T>(entry: Entry<T>) {
  if (entry.timer || entry.intervalMs <= 0) return;
  entry.timer = setInterval(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    void run(entry);
  }, entry.intervalMs);
}

function stopTimer<T>(entry: Entry<T>) {
  if (entry.timer) clearInterval(entry.timer);
  entry.timer = null;
}

/**
 * Subscribe to a shared polled endpoint.
 *
 * @param key        Cache identity. Include any query parameters.
 * @param fetcher    Returns the raw `ApiResult` from `controlPlane`.
 * @param select     Narrows the envelope to the value consumers want.
 * @param intervalMs Poll cadence; `0` fetches once.
 * @param enabled    Skip entirely (e.g. before auth is ready).
 */
export function useResource<T>(
  key: string,
  fetcher: () => Promise<{ ok: boolean; status: number; data: unknown }>,
  select: (raw: unknown) => T,
  intervalMs = 20_000,
  enabled = true
): ResourceState<T> & { refresh: () => Promise<void>; set: (updater: (prev: T | null) => T | null) => void } {
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const selectRef = useRef(select);
  selectRef.current = select;

  const getEntry = useCallback((): Entry<T> => {
    let e = registry.get(key) as Entry<T> | undefined;
    if (!e) {
      e = {
        state: { data: null, loading: true, error: null, lastSync: null },
        listeners: new Set(),
        timer: null,
        inflight: null,
        fetcher: () => fetcherRef.current(),
        select: (raw) => selectRef.current(raw),
        intervalMs,
        refs: 0,
      };
      registry.set(key, e as Entry<unknown>);
    }
    // Keep the closures fresh — a remount must not pin a stale fetcher.
    e.fetcher = () => fetcherRef.current();
    e.select = (raw) => selectRef.current(raw);
    e.intervalMs = intervalMs;
    return e;
  }, [key, intervalMs]);

  const [state, setState] = useState<ResourceState<T>>(() => (enabled ? getEntry().state : { data: null, loading: false, error: null, lastSync: null }));

  useEffect(() => {
    if (!enabled) return;
    const entry = getEntry();
    entry.refs += 1;
    entry.listeners.add(setState);
    setState(entry.state);

    // Refetch when the payload is missing or older than one full interval.
    const stale = entry.state.lastSync == null || Date.now() - entry.state.lastSync > Math.max(intervalMs, 5_000);
    if (stale) void run(entry);
    startTimer(entry);

    const onVis = () => {
      if (document.visibilityState === "visible") void run(entry);
    };
    document.addEventListener("visibilitychange", onVis);

    return () => {
      document.removeEventListener("visibilitychange", onVis);
      entry.listeners.delete(setState);
      entry.refs -= 1;
      if (entry.refs <= 0) {
        stopTimer(entry);
        entry.refs = 0;
      }
    };
  }, [key, enabled, getEntry, intervalMs]);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    await run(getEntry());
  }, [enabled, getEntry]);

  /** Apply a local change immediately (optimistic edits, live pushes). */
  const set = useCallback(
    (updater: (prev: T | null) => T | null) => {
      const entry = getEntry();
      entry.state = { ...entry.state, data: updater(entry.state.data) };
      emit(entry);
    },
    [getEntry]
  );

  return { ...state, refresh, set };
}

/** Drop cached payloads — called on sign-out so the next user starts clean. */
export function resetResources(): void {
  registry.forEach((e) => {
    stopTimer(e);
    e.listeners.clear();
  });
  registry.clear();
}
