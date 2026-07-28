"use client";

// Per-user console preferences (channel names, dashboard widget layout).
//
// Local-first: a cached copy in localStorage paints on the very first frame so
// custom switch names never flash their defaults, while the authoritative copy
// is fetched from /api/smarthome/prefs and written back on every change. That
// keeps the UI instant and still syncs the account across browsers.

import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "./control-plane";

export type PrefScope = "channel-labels" | "dashboard" | "device-widgets" | "ui";

const cacheKey = (scope: PrefScope) => `cv-prefs-${scope}`;

function readCache<T>(scope: PrefScope): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(cacheKey(scope));
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeCache(scope: PrefScope, value: unknown): void {
  try {
    localStorage.setItem(cacheKey(scope), JSON.stringify(value));
  } catch {
    /* quota or private mode — the server copy is still authoritative */
  }
}

export interface PrefsApi<T> {
  value: T;
  /** True until the authoritative server copy has been merged in. */
  loading: boolean;
  /** Set to a message when the last save could not be persisted server-side. */
  error: string;
  /** Replaces the whole document (optimistic, then persisted). */
  save: (next: T) => void;
  /** Applies a functional update. */
  update: (fn: (prev: T) => T) => void;
}

/**
 * Reads and writes one preference scope.
 *
 * @param scope    Preference bucket on the server.
 * @param fallback Value used before anything has been stored.
 */
export function useUserPrefs<T>(scope: PrefScope, fallback: T): PrefsApi<T> {
  const [value, setValue] = useState<T>(() => readCache<T>(scope) ?? fallback);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef<T>(value);
  latest.current = value;

  // Pull the authoritative copy once the token is available.
  useEffect(() => {
    let cancelled = false;
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetch(`/api/smarthome/prefs?scope=${scope}`, {
      headers: { authorization: `Bearer ${token}` },
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.ok) return;
        if (d.value !== null && d.value !== undefined) {
          setValue(d.value as T);
          writeCache(scope, d.value);
        }
      })
      .catch(() => {
        /* offline — keep the cached copy */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [scope]);

  const persist = useCallback(
    (next: T) => {
      writeCache(scope, next);
      const token = getToken();
      if (!token) return;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fetch(`/api/smarthome/prefs?scope=${scope}`, {
          method: "PUT",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ value: next }),
        })
          .then((r) => {
            setError(r.ok ? "" : "Saved on this device only — could not reach the server.");
          })
          .catch(() => setError("Saved on this device only — you appear to be offline."));
      }, 350);
    },
    [scope]
  );

  const save = useCallback(
    (next: T) => {
      setValue(next);
      persist(next);
    },
    [persist]
  );

  const update = useCallback(
    (fn: (prev: T) => T) => {
      const next = fn(latest.current);
      setValue(next);
      persist(next);
    },
    [persist]
  );

  useEffect(() => () => clearTimeout(saveTimer.current), []);

  return { value, loading, error, save, update };
}

// -------------------------------------------------------- channel labels ----

/** `{ [deviceId]: { [stateField]: "Kitchen light" } }` */
export type ChannelLabels = Record<string, Record<string, string>>;

export interface ChannelLabelApi {
  /** Custom name for a field, or `fallback` when the user hasn't set one. */
  labelFor: (deviceId: string, field: string, fallback: string) => string;
  /** Stores (or clears, when blank) a custom name. */
  setLabel: (deviceId: string, field: string, name: string) => void;
  /** True when this device has at least one custom name. */
  hasCustom: (deviceId: string) => boolean;
  /** Removes every custom name for a device. */
  resetDevice: (deviceId: string) => void;
  error: string;
}

export function useChannelLabels(): ChannelLabelApi {
  const { value, update, error } = useUserPrefs<ChannelLabels>("channel-labels", {});

  const labelFor = useCallback(
    (deviceId: string, field: string, fallback: string) => value[deviceId]?.[field]?.trim() || fallback,
    [value]
  );

  const setLabel = useCallback(
    (deviceId: string, field: string, name: string) => {
      update((prev) => {
        const forDevice = { ...(prev[deviceId] ?? {}) };
        const clean = name.trim();
        if (clean) forDevice[field] = clean;
        else delete forDevice[field];
        const next = { ...prev };
        if (Object.keys(forDevice).length) next[deviceId] = forDevice;
        else delete next[deviceId];
        return next;
      });
    },
    [update]
  );

  const hasCustom = useCallback(
    (deviceId: string) => Object.keys(value[deviceId] ?? {}).length > 0,
    [value]
  );

  const resetDevice = useCallback(
    (deviceId: string) => {
      update((prev) => {
        const next = { ...prev };
        delete next[deviceId];
        return next;
      });
    },
    [update]
  );

  return { labelFor, setLabel, hasCustom, resetDevice, error };
}
