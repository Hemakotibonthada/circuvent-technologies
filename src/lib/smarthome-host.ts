// ═══════════════════════════════════════════════════════════════
// SMART HOME HOSTNAME — which requests are the console
// ═══════════════════════════════════════════════════════════════
// The mounting mechanism now lives in host-mounts.ts, which the developer
// portal shares. What stays here is the console's own question — "am I being
// served as home.circuvent.com?" — which several components ask.

import {
  HOST_MOUNTS,
  mountedPath,
  servedFromRoot as sharedServedFromRoot,
} from "./host-mounts";

/**
 * Hostnames that serve the smart home console at their root.
 *
 * The console lives at /smarthome in this app and is mounted onto its own
 * subdomain rather than deployed a second time — one build, one source of
 * truth, nothing to drift. Both names are accepted so the subdomain can be
 * chosen with a DNS record alone.
 *
 * Read from the shared table rather than declared twice; that table is what
 * the proxy actually consults, so a second copy here could disagree with the
 * routing it is supposed to describe.
 */
export const HOME_HOSTS = HOST_MOUNTS.find((m) => m.prefix === "/smarthome")!.hosts;

/**
 * Is this request being served as the console's own site?
 *
 * Needed on both sides of hydration, and for a reason worth writing down.
 * The proxy rewrites `home.circuvent.com/` to `/smarthome`, so the server sees
 * the rewritten path while the browser's URL — and therefore `usePathname()`
 * after hydration — stays `/`. A gate keyed only on the path agrees with
 * itself on the server, renders no navigation, and then changes its mind the
 * moment React hydrates: the corporate nav bar drops in on top of the console.
 *
 * The hostname is the one fact both sides can read identically, so the gate is
 * keyed on that as well as the path.
 */
export function isConsoleHost(host: string | null | undefined): boolean {
  if (!host) return false;
  return HOME_HOSTS.test(host.split(":")[0]);
}

/** Paths that mean the same thing on every hostname. See host-mounts.ts. */
export const servedFromRoot = sharedServedFromRoot;

/** The path this request should actually render, or null to leave it alone. */
export function smartHomePath(host: string, pathname: string): string | null {
  if (!HOME_HOSTS.test(host.split(":")[0])) return null;
  return mountedPath(host, pathname);
}