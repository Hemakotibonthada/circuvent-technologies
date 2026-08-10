/**
 * Channel names and roles, shared with the web console.
 *
 * A relay board ships with four channels called "Channel 1".."Channel 4", and
 * the first thing anybody does is rename them to what is actually wired: the
 * porch light, the geyser, the pump. The console has always let them, and the
 * app has always ignored it — the names were hardcoded here, so the same relay
 * read "Relay" on a phone and "Kitchen light" in a browser, and neither told
 * the user which was right.
 *
 * The names were never local to the console. They live behind
 * /api/smarthome/prefs, keyed on the same console token this app already
 * holds; nothing new had to be stored, the app simply was not asking. The
 * website is the right source rather than the control plane because that is
 * where they already are, and moving them would break every console that has
 * some saved.
 *
 * Cached to disk, because a device grid that renders "Channel 1" for a second
 * on every cold start and then renames itself is worse than one that is
 * briefly stale: the flicker reads as the app losing the setting.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SITE_URL } from "./config";
import { getToken } from "./api";

/** `{ [deviceId]: { [stateField]: "Kitchen light" } }` */
export type ChannelLabels = Record<string, Record<string, string>>;

/** `{ [deviceId]: { [stateField]: { kind, style, … } } }` */
export type ChannelConfig = Record<string, Record<string, { kind?: string; style?: string; icon?: string }>>;

const CACHE_KEY = "cv-channel-prefs-v1";

let labels: ChannelLabels = {};
let config: ChannelConfig = {};
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

/** Subscribe to changes so a screen re-renders when the names arrive. */
export function onChannelPrefsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function fetchScope<T>(scope: string, token: string): Promise<T | null> {
  try {
    const res = await fetch(`${SITE_URL}/api/smarthome/prefs?scope=${encodeURIComponent(scope)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { ok?: boolean; value?: T };
    return body?.ok ? (body.value ?? null) : null;
  } catch {
    // Offline, or the site is unreachable. The cache below is the answer;
    // showing default names is better than showing an error over a light
    // switch that still works.
    return null;
  }
}

/** Paint from cache immediately, then refresh from the server. */
export async function loadChannelPrefs(): Promise<void> {
  if (!loaded) {
    loaded = true;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        const cached = JSON.parse(raw) as { labels?: ChannelLabels; config?: ChannelConfig };
        labels = cached.labels ?? {};
        config = cached.config ?? {};
        emit();
      }
    } catch {
      /* corrupt cache is not worth a crash */
    }
  }

  const token = await getToken();
  if (!token) return;

  const [nextLabels, nextConfig] = await Promise.all([
    fetchScope<ChannelLabels>("channel-labels", token),
    fetchScope<ChannelConfig>("channel-config", token),
  ]);

  let changed = false;
  if (nextLabels) {
    labels = nextLabels;
    changed = true;
  }
  if (nextConfig) {
    config = nextConfig;
    changed = true;
  }
  if (!changed) return;

  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ labels, config }));
  } catch {
    /* a full disk should not break the screen */
  }
  emit();
}

/**
 * The name the user gave this channel, or the supplied fallback.
 *
 * Same signature as the console's labelFor, deliberately: the two are the same
 * question and answering it differently is how they drifted apart.
 */
export function channelLabel(deviceId: string, field: string, fallback: string): string {
  return labels[deviceId]?.[field]?.trim() || fallback;
}

/** What kind of load is on this channel — light, fan, socket — when set. */
export function channelKind(deviceId: string, field: string): string | undefined {
  return config[deviceId]?.[field]?.kind;
}

/** True when this device has any customisation, for a "reset" affordance. */
export function hasChannelCustomisation(deviceId: string): boolean {
  return Object.keys(labels[deviceId] ?? {}).length > 0 || Object.keys(config[deviceId] ?? {}).length > 0;
}
