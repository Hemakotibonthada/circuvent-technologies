"use client";

// Per-user console preferences (channel names, dashboard widget layout).
//
// Local-first: a cached copy in localStorage paints on the very first frame so
// custom switch names never flash their defaults, while the authoritative copy
// is fetched from /api/smarthome/prefs and written back on every change. That
// keeps the UI instant and still syncs the account across browsers.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getToken } from "./control-plane";

export type PrefScope = "channel-labels" | "dashboard" | "device-widgets" | "profile" | "ui";

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
  /*
   * True from the moment an edit is made until its save has been sent.
   * A refresh that landed in that window would overwrite what the person is
   * in the middle of typing with the server's older copy — which reads as the
   * field undoing itself.
   */
  const pending = useRef(false);
  /*
   * Set once this device has offered its cached copy to an empty server.
   * See the adoption branch in `pull`.
   */
  const seeded = useRef(false);
  const persistRef = useRef<(next: T) => void>(() => {});

  /** True for a document that is worth keeping — `{}` is not. */
  const hasContent = (v: unknown): boolean =>
    v !== null && typeof v === "object" && Object.keys(v as object).length > 0;

  /** Fetches the authoritative copy and adopts it unless an edit is in flight. */
  const pull = useCallback(async (): Promise<void> => {
    const token = getToken();
    if (!token) return;
    try {
      const r = await fetch(`/api/smarthome/prefs?scope=${scope}`, {
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!r.ok) return;
      const d = await r.json();
      if (!d?.ok || pending.current) return;

      if (d.value !== null && d.value !== undefined) {
        setValue(d.value as T);
        writeCache(scope, d.value);
        return;
      }

      /*
       * The server has nothing and this device does.
       *
       * That combination used to be permanent: preferences were written to a
       * JSON file that Vercel cannot keep, so every rename ever made lives
       * only in the localStorage of the browser — or the AsyncStorage of the
       * phone — that made it. Now that there is somewhere durable to put them,
       * the first client to notice hands its copy over, and the names appear
       * on every other device without anybody having to rename anything twice.
       *
       * Once only, and only when there is something to offer, so two tabs do
       * not take turns re-uploading an empty document.
       */
      if (!seeded.current && hasContent(latest.current)) {
        seeded.current = true;
        persistRef.current(latest.current);
      }
    } catch {
      /* offline — keep the cached copy */
    }
  }, [scope]);

  // Pull the authoritative copy once the token is available.
  useEffect(() => {
    let cancelled = false;
    if (!getToken()) {
      // No console session yet; nothing to load and nothing to wait for.
      const t = setTimeout(() => setLoading(false), 0);
      return () => clearTimeout(t);
    }
    void (async () => {
      await pull();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [pull]);

  /*
   * Re-read when the tab comes back to the front.
   *
   * These names are edited from several devices belonging to one person — the
   * phone in the room with the switch, the browser at a desk. Fetching only on
   * mount means a tab left open all day keeps showing the name a channel had
   * when it was opened, and the person renaming it on their phone concludes it
   * did not work. Focus is the moment they look at it again, which is exactly
   * when it needs to be right.
   */
  useEffect(() => {
    const onFocus = () => {
      if (typeof document !== "undefined" && document.hidden) return;
      void pull();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [pull]);

  const persist = useCallback(
    (next: T) => {
      writeCache(scope, next);
      const token = getToken();
      if (!token) return;
      pending.current = true;
      clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        fetch(`/api/smarthome/prefs?scope=${scope}`, {
          method: "PUT",
          headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
          body: JSON.stringify({ value: next }),
        })
          .then(async (r) => {
            /*
             * `durable` is the server saying whether this outlives the instance
             * that handled the request. It used to be able to answer "no" and
             * still return ok, so a rename could be reported as saved and be
             * gone by the next cold start. Treated as a failure here, because
             * from the user's point of view that is what it is.
             */
            const body = await r.json().catch(() => null);
            if (!r.ok) setError("Saved on this device only — could not reach the server.");
            else if (body && body.durable === false) {
              setError("Saved on this device only — the server has nowhere durable to keep it.");
            } else setError("");
          })
          .catch(() => setError("Saved on this device only — you appear to be offline."))
          .finally(() => {
            pending.current = false;
          });
      }, 350);
    },
    [scope]
  );
  /* Assigned in an effect rather than during render: `pull` needs to call the
     current `persist` without taking it as a dependency, which would rebuild
     the fetch — and re-run it — on every render. */
  useEffect(() => {
    persistRef.current = persist;
  }, [persist]);

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

// -------------------------------------------------------- channel widgets ---

/**
 * How a single relay channel is presented and driven.
 *
 * A relay board is electrically just on/off, so the "model" is the affordance
 * the user gets: which icon identifies it, and whether it latches (a light),
 * reads as an appliance power button, or fires a timed pulse (a gate trigger
 * or motor jog, where holding the relay closed would be wrong).
 */
export type ChannelKind =
  | "generic"
  | "light"
  | "fan"
  | "socket"
  | "geyser"
  | "pump"
  | "tv"
  | "ac"
  | "curtain"
  | "gate";

export type ChannelStyle = "toggle" | "button" | "momentary";

export interface ChannelConfig {
  kind: ChannelKind;
  style: ChannelStyle;
  /** Relay closed time for `momentary`, in milliseconds. */
  pulseMs: number;
}

export const DEFAULT_CHANNEL_CONFIG: ChannelConfig = { kind: "generic", style: "toggle", pulseMs: 600 };

/** `{ [deviceId]: { [stateField]: Partial<ChannelConfig> } }` */
export type ChannelConfigs = Record<string, Record<string, Partial<ChannelConfig>>>;

export interface ChannelConfigApi {
  configFor: (deviceId: string, field: string) => ChannelConfig;
  setConfig: (deviceId: string, field: string, patch: Partial<ChannelConfig>) => void;
  resetDevice: (deviceId: string) => void;
  hasCustom: (deviceId: string) => boolean;
  error: string;
}

export function useChannelConfig(): ChannelConfigApi {
  const { value, update, error } = useUserPrefs<ChannelConfigs>("device-widgets", {});

  const configFor = useCallback(
    (deviceId: string, field: string): ChannelConfig => ({
      ...DEFAULT_CHANNEL_CONFIG,
      ...(value[deviceId]?.[field] ?? {}),
    }),
    [value]
  );

  const setConfig = useCallback(
    (deviceId: string, field: string, patch: Partial<ChannelConfig>) => {
      update((prev) => {
        const forDevice = { ...(prev[deviceId] ?? {}) };
        const merged = { ...(forDevice[field] ?? {}), ...patch };
        // Drop entries that are back to the default so the stored document
        // stays a diff rather than a copy of the defaults.
        for (const k of Object.keys(merged) as (keyof ChannelConfig)[]) {
          if (merged[k] === DEFAULT_CHANNEL_CONFIG[k]) delete merged[k];
        }
        if (Object.keys(merged).length) forDevice[field] = merged;
        else delete forDevice[field];
        const next = { ...prev };
        if (Object.keys(forDevice).length) next[deviceId] = forDevice;
        else delete next[deviceId];
        return next;
      });
    },
    [update]
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

  const hasCustom = useCallback((deviceId: string) => Object.keys(value[deviceId] ?? {}).length > 0, [value]);

  return { configFor, setConfig, resetDevice, hasCustom, error };
}

// ---------------------------------------------------------------- profile ----

/**
 * Console profile card.
 *
 * The control plane owns identity (id / email / the name on the account) and
 * exposes no endpoint to change it, so nothing here pretends to. These are
 * presentation preferences that follow the account across browsers: how the
 * user wants to be shown in this console, and how to reach them.
 */
export interface ProfilePrefs {
  /** Preferred display name. Empty falls back to the account name. */
  displayName: string;
  /** Data URL of an uploaded picture. Empty falls back to initials. */
  photo: string;
  /** Hex colour behind the initials when there is no photo. */
  avatarColor: string;
  phone: string;
  /** IANA zone, e.g. "Asia/Kolkata". Empty means follow the browser. */
  timeZone: string;
  /** Free-text note shown under the name, e.g. "Ground floor, Block B". */
  headline: string;
}

export const DEFAULT_PROFILE: ProfilePrefs = {
  displayName: "",
  photo: "",
  avatarColor: "",
  phone: "",
  timeZone: "",
  headline: "",
};

export interface ProfileApi {
  profile: ProfilePrefs;
  loading: boolean;
  error: string;
  setProfile: (patch: Partial<ProfilePrefs>) => void;
  reset: () => void;
}

export function useProfilePrefs(): ProfileApi {
  const { value, update, save, loading, error } = useUserPrefs<Partial<ProfilePrefs>>("profile", {});
  const profile = useMemo(() => ({ ...DEFAULT_PROFILE, ...value }), [value]);

  const setProfile = useCallback(
    (patch: Partial<ProfilePrefs>) => {
      update((prev) => {
        const merged = { ...prev, ...patch };
        for (const k of Object.keys(merged) as (keyof ProfilePrefs)[]) {
          if (merged[k] === DEFAULT_PROFILE[k]) delete merged[k];
        }
        return merged;
      });
    },
    [update]
  );

  const reset = useCallback(() => save({}), [save]);

  return { profile, loading, error, setProfile, reset };
}
