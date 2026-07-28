"use client";

// Tiny reactive store built on useSyncExternalStore so admin UI state that is
// genuinely client-owned (column choices, saved filters, layout) survives route
// changes and reloads via localStorage. Device/telemetry data does NOT live
// here — that comes from the control plane through `_lib/api.ts`.

import { useEffect, useSyncExternalStore } from "react";

type Listener = () => void;

export interface Store<T> {
  get: () => T;
  getServer: () => T;
  set: (updater: T | ((prev: T) => T)) => void;
  subscribe: (l: Listener) => () => void;
  hydrate: () => void;
  reset: () => void;
}

function persistKey(key: string) {
  return `cv-admin:${key}`;
}

function load<T>(key: string): T | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.localStorage.getItem(persistKey(key));
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

function save<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(persistKey(key), JSON.stringify(value));
  } catch {
    /* quota / serialization errors are non-fatal for a demo store */
  }
}

/**
 * Create a persisted reactive store. `initial` is evaluated once for the
 * deterministic server/hydration snapshot. localStorage is NOT read at init
 * (that would desync server and client HTML) — it is loaded post-mount via
 * hydrate(), so the first client render always matches the server.
 */
export function createStore<T>(key: string, initial: () => T, opts: { persist?: boolean } = {}): Store<T> {
  const persist = opts.persist ?? true;
  const serverSnapshot = initial();
  let value: T = serverSnapshot;
  let hydrated = !persist;
  const listeners = new Set<Listener>();
  const emit = () => listeners.forEach((l) => l());

  return {
    get: () => value,
    getServer: () => serverSnapshot,
    set: (updater) => {
      hydrated = true;
      value = typeof updater === "function" ? (updater as (p: T) => T)(value) : updater;
      if (persist) save(key, value);
      emit();
    },
    subscribe: (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    hydrate: () => {
      if (hydrated || typeof window === "undefined") return;
      hydrated = true;
      const loaded = load<T>(key);
      if (loaded !== undefined) {
        value = loaded;
        emit();
      }
    },
    reset: () => {
      hydrated = true;
      value = initial();
      if (persist) save(key, value);
      emit();
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  const v = useSyncExternalStore(store.subscribe, store.get, store.getServer);
  useEffect(() => {
    store.hydrate();
  }, [store]);
  return v;
}

// --------------------------------------------------------------- ids

/** Stable id generator for new records created at runtime. */
let counter = Date.now() % 100000;
export function uid(prefix = "id"): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}
