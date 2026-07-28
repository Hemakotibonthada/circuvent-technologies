"use client";

// Tiny reactive store built on useSyncExternalStore so the whole admin app can
// share mutable simulation state (add/edit/delete persists across routes) with
// localStorage persistence. Deterministic RNG keeps generated fleets/telemetry
// stable across renders and reloads until the user mutates them.

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

// --------------------------------------------------------------- deterministic

/** Mulberry32 — small, fast, deterministic PRNG seeded from a string. */
export function rng(seed: string | number) {
  let a = typeof seed === "number" ? seed : hashStr(seed);
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick<T>(r: () => number, arr: readonly T[]): T {
  return arr[Math.floor(r() * arr.length) % arr.length];
}

export function int(r: () => number, min: number, max: number): number {
  return Math.floor(r() * (max - min + 1)) + min;
}

export function float(r: () => number, min: number, max: number, dp = 1): number {
  const v = r() * (max - min) + min;
  const f = Math.pow(10, dp);
  return Math.round(v * f) / f;
}

export function chance(r: () => number, p: number): boolean {
  return r() < p;
}

/** Stable id generator for new records created at runtime. */
let counter = Date.now() % 100000;
export function uid(prefix = "id"): string {
  counter += 1;
  return `${prefix}-${counter.toString(36)}${Math.floor(Math.random() * 1e4).toString(36)}`;
}

/** Deterministic time-series walk for charts. */
export function walk(seed: string, points: number, base: number, vol: number, min = 0, max = Infinity): number[] {
  const r = rng(seed);
  let v = base;
  const out: number[] = [];
  for (let i = 0; i < points; i++) {
    v += (r() - 0.5) * vol;
    v = Math.max(min, Math.min(max, v));
    out.push(Math.round(v * 100) / 100);
  }
  return out;
}
