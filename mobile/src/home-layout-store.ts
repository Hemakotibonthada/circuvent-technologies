/**
 * Where the home layout is kept.
 *
 * Three places, deliberately, and the order matters:
 *
 *   1. memory — so a re-render is free and the editor feels immediate;
 *   2. disk   — so the home screen paints the *user's* arrangement on a cold
 *               start, not the default followed by a jump once the network
 *               answers. A layout that rearranges itself a second after launch
 *               reads as the app having lost the setting;
 *   3. the account — so it follows them to the web console and to a new phone.
 *
 * The account copy goes through the same /api/smarthome/prefs endpoint the
 * channel names use, under the `dashboard` scope, which has existed and been
 * unused since the prefs API was written.
 *
 * Saving is optimistic and last-writer-wins. Somebody rearranging their own
 * home screen on their own devices does not have conflicts worth resolving, and
 * a spinner on an arrow button would be absurd.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SITE_URL } from "./config";
import { getToken } from "./api";
import { DEFAULT_LAYOUT, resolveLayout, type HomeLayout } from "./home-layout";

/*
 * Exported so a test can assert the site actually has this scope. The app and
 * the site are separate applications agreeing on a string with nothing in
 * either compiler to check it — asking for a scope that does not exist returns
 * 400 forever and looks exactly like being offline, which is how the channel
 * names silently failed to sync for months.
 */
export const LAYOUT_SCOPE = "dashboard";

/*
 * The key inside the scope.
 *
 * The console has its own dashboard with its own sections — health strips and
 * latency footers that mean nothing on a phone — so the two cannot share one
 * layout. They do share the scope, which means a naive writer would clobber the
 * other platform's arrangement every time: the app would PUT its layout as the
 * whole document, the console would read it, find none of its own keys, fall
 * back to defaults, and save those back.
 *
 * So the scope holds `{ home: …, console: … }` and each side touches only its
 * own key, preserving whatever else it found. Namespaced from the start rather
 * than after somebody loses a layout they spent ten minutes on.
 */
export const LAYOUT_KEY = "home";

const CACHE_KEY = "cv-home-layout-v1";

let layout: HomeLayout = { ...DEFAULT_LAYOUT, order: [...DEFAULT_LAYOUT.order] };
/*
 * Everything else that was in the scope when we last read it, kept verbatim so
 * a save does not delete the console's layout.
 */
let siblings: Record<string, unknown> = {};
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

export function onLayoutChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getLayout(): HomeLayout {
  return layout;
}

/** Paint from cache immediately, then reconcile with the account. */
export async function loadLayout(): Promise<void> {
  if (!loaded) {
    loaded = true;
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) {
        layout = resolveLayout(JSON.parse(raw));
        emit();
      }
    } catch {
      /* A corrupt cache is not worth a crash on the home screen; the default
         is a perfectly good layout. */
    }
  }

  const token = await getToken();
  if (!token) return;

  try {
    const res = await fetch(`${SITE_URL}/api/smarthome/prefs?scope=${encodeURIComponent(LAYOUT_SCOPE)}`, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      /* Said out loud: a 400 means this build is asking for a scope the site
         does not have, which is permanent and otherwise indistinguishable from
         being offline. */
      console.warn(`[home-layout] ${LAYOUT_SCOPE} refused with ${res.status}`);
      return;
    }
    const body = (await res.json()) as { ok?: boolean; value?: unknown };
    if (!body?.ok || body.value == null) return;

    /*
     * Remember the console's half before touching ours, so the next save puts
     * it back exactly as it was.
     */
    const doc = typeof body.value === "object" && body.value ? (body.value as Record<string, unknown>) : {};
    const { [LAYOUT_KEY]: mine, ...rest } = doc;
    siblings = rest;

    const next = resolveLayout(mine);
    layout = next;
    emit();
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
  } catch {
    /* Offline. The cached layout is already on screen and is the right answer. */
  }
}

/**
 * Saves a new layout.
 *
 * Memory and disk first so the UI never waits on the network, then the account
 * in the background. A failed upload leaves the local layout in place — the
 * arrangement is still theirs on this device, and the next successful save or
 * load reconciles it.
 */
export async function saveLayout(next: HomeLayout): Promise<void> {
  layout = resolveLayout(next);
  emit();

  try {
    await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(layout));
  } catch {
    /* Out of space, most likely. Not worth interrupting the edit. */
  }

  const token = await getToken();
  if (!token) return;
  try {
    const res = await fetch(`${SITE_URL}/api/smarthome/prefs?scope=${encodeURIComponent(LAYOUT_SCOPE)}`, {
      method: "PUT",
      headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
      body: JSON.stringify({ value: { ...siblings, [LAYOUT_KEY]: layout } }),
    });
    if (!res.ok) console.warn(`[home-layout] saving failed with ${res.status}`);
  } catch {
    /* Offline; the local copy stands. */
  }
}
