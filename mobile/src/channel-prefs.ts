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
export type ChannelConfig = Record<string, Record<string, { kind?: string; style?: string; icon?: string; hidden?: boolean }>>;

/*
 * The scope names the console actually stores under.
 *
 * These are two independently-written applications agreeing on a string, with
 * nothing in either compiler to check it — and they did not agree. The app asked
 * for "channel-config", which the site has never had: the request returned 400
 * "Unknown scope" every single time, the failure was indistinguishable from
 * being offline, and so every channel in the app showed a default type forever
 * while the console showed the one the user had chosen.
 *
 * Exported so a test can assert they exist on the other side, because that is
 * the only place this class of mistake can be caught.
 */
export const LABEL_SCOPE = "channel-labels";
export const CONFIG_SCOPE = "device-widgets";

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
    if (!res.ok) {
      /*
       * Worth saying out loud rather than swallowing.
       *
       * A 400 here means this build is asking for a scope the site does not
       * have, which is a permanent mismatch between two applications and looks
       * exactly like being offline — which is how it went unnoticed. A log line
       * is the difference between "the network is flaky" and "these two
       * disagree about a name".
       */
      console.warn(`[channel-prefs] ${scope} refused with ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { ok?: boolean; value?: T };
    return body?.ok ? (body.value ?? null) : null;
  } catch {
    // Offline, or the site is unreachable. The cache below is the answer;
    // showing default names is better than showing an error over a light
    // switch that still works.
    return null;
  }
}

/**
 * Sends a scope back to the console.
 *
 * The whole document, not a patch, because that is what the endpoint stores and
 * what the console's own writer sends. Whoever saves last wins, which is the
 * right resolution for a person renaming their own switch on one of their own
 * devices; anything cleverer would be inventing conflicts that do not happen.
 */
async function putScope(scope: string, value: unknown, token: string): Promise<boolean> {
  try {
    const res = await fetch(`${SITE_URL}/api/smarthome/prefs?scope=${encodeURIComponent(scope)}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ value }),
    });
    if (!res.ok) console.warn(`[channel-prefs] saving ${scope} failed with ${res.status}`);
    return res.ok;
  } catch {
    return false;
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
    fetchScope<ChannelLabels>(LABEL_SCOPE, token),
    fetchScope<ChannelConfig>(CONFIG_SCOPE, token),
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

/* ----------------------------------------------------------------- saving -- */

/**
 * Applied locally first, then sent.
 *
 * The switch is in front of the person's hand and the network is not, so the
 * new name appears immediately and the request follows. If the request fails
 * the local value stays: it is written to the same cache the app paints from,
 * so it survives a restart and is re-sent by the next successful save rather
 * than silently reverting to the old name while the user is looking at it.
 */
async function persist(token: string | null): Promise<boolean> {
  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify({ labels, config }));
  } catch {
    /* a full disk should not lose the on-screen value */
  }
  emit();
  if (!token) return false;
  const [a, b] = await Promise.all([
    putScope(LABEL_SCOPE, labels, token),
    putScope(CONFIG_SCOPE, config, token),
  ]);
  return a && b;
}

/**
 * Renames a channel, everywhere.
 *
 * The app could not do this at all before: it read the console's names and had
 * no way to write one back, so renaming in the app was a screen that accepted
 * an edit and discarded it.
 *
 * An empty name removes the override rather than storing "", which is how the
 * default comes back — otherwise a cleared field would pin an empty label and
 * the channel would render with no name at all.
 */
export async function setChannelLabel(deviceId: string, field: string, name: string): Promise<boolean> {
  const clean = name.trim().slice(0, 40);
  const forDevice = { ...(labels[deviceId] ?? {}) };
  if (clean) forDevice[field] = clean;
  else delete forDevice[field];

  labels = { ...labels };
  if (Object.keys(forDevice).length) labels[deviceId] = forDevice;
  else delete labels[deviceId];

  return persist(await getToken());
}

/** Removes every stored name and kind for a device, on this phone and the server. */
export async function clearChannelPrefs(deviceId: string): Promise<boolean> {
  labels = { ...labels };
  config = { ...config };
  delete labels[deviceId];
  delete config[deviceId];
  return persist(await getToken());
}
export async function setChannelKind(deviceId: string, field: string, kind: string | null): Promise<boolean> {
  const forDevice = { ...(config[deviceId] ?? {}) };
  const entry = { ...(forDevice[field] ?? {}) };
  if (kind) entry.kind = kind;
  else delete entry.kind;

  if (Object.keys(entry).length) forDevice[field] = entry;
  else delete forDevice[field];

  config = { ...config };
  if (Object.keys(forDevice).length) config[deviceId] = forDevice;
  else delete config[deviceId];

  return persist(await getToken());
}

/** Whether this channel has been hidden from the controls. */
export function channelHidden(deviceId: string, field: string): boolean {
  return config[deviceId]?.[field]?.hidden === true;
}

/**
 * Hides or shows a channel, for everyone.
 *
 * This used to live only on the phone, on the reasoning that hiding something
 * is about this screen. It is not: a channel with nothing wired to it is
 * nothing to anybody, and hiding it here while the console kept showing it made
 * the two disagree about what the device even has.
 */
export async function setChannelHidden(deviceId: string, field: string, hidden: boolean): Promise<boolean> {
  const forDevice = { ...(config[deviceId] ?? {}) };
  const entry = { ...(forDevice[field] ?? {}) };
  if (hidden) entry.hidden = true;
  else delete entry.hidden;

  if (Object.keys(entry).length) forDevice[field] = entry;
  else delete forDevice[field];

  config = { ...config };
  if (Object.keys(forDevice).length) config[deviceId] = forDevice;
  else delete config[deviceId];

  return persist(await getToken());
}