"use client";

import { useSyncExternalStore } from "react";
import { mountPrefixFor } from "@/lib/host-mounts";

/**
 * The subtree this browser's hostname is mounted onto, or null on the main site.
 *
 * `usePathname()` reports the address bar, and a rewrite deliberately does not
 * change it: on home.circuvent.com the browser stays at `/admin` while the
 * server renders `/smarthome/admin`. Anything on the client that reasons about
 * *which page this is* therefore has to add the prefix back, or it is asking a
 * question about a path that only exists on the other side of the proxy.
 *
 * That mismatch is not theoretical. ConsoleChrome waives the consumer sign-in
 * for `/smarthome/admin`, and on the mounted hostname the test simply never
 * matched -- so the staff control plane rendered the *consumer* device login,
 * with no way to reach single sign-on at all.
 *
 * `useSyncExternalStore` rather than an effect: the answer differs between the
 * server render and the browser, and the third argument is what the server is
 * told. A `useState` plus an effect would work and render twice, and the lint
 * rule that forbids it is right to.
 *
 * The store never changes -- a document does not move to another hostname --
 * so `subscribe` hands back a no-op.
 */
const noop = () => () => {};

export function useMountPrefix(): string | null {
  return useSyncExternalStore(
    noop,
    () => mountPrefixFor(window.location.host),
    () => null
  );
}

/**
 * The path the *server* is rendering, given the mount prefix and the address bar.
 *
 * Pure, and exported separately from the hook so it can be tested without
 * React. This is the piece that fails silently when it is wrong.
 */
export function renderedPathFor(prefix: string | null, pathname: string | null): string {
  const path = pathname ?? "/";
  if (!prefix) return path;
  // Already prefixed: a link written for the main site, followed on the
  // subdomain, arrives as /smarthome/admin and must not become
  // /smarthome/smarthome/admin.
  if (path === prefix || path.startsWith(`${prefix}/`)) return path;
  return `${prefix}${path === "/" ? "" : path}`;
}

/**
 * The path the *server* is rendering, which is what route checks should use.
 *
 * On the main site this is the address bar. On a mounted hostname it is the
 * address bar with the mount prefix put back.
 */
export function useRenderedPath(pathname: string | null): string {
  const prefix = useMountPrefix();
  return renderedPathFor(prefix, pathname);
}
