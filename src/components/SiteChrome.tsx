"use client";

import { usePathname } from "next/navigation";
import { HOST_MOUNTS, isMountedHost } from "@/lib/host-mounts";

/**
 * Renders the corporate site chrome (top nav + footer) on every route except
 * the dedicated store (/shop*), the business admin (/admin*), and any subtree
 * mounted on its own hostname — the device console (/smarthome*) and the
 * developer portal (/developer*) — where a self-contained app shell is the
 * only chrome. This avoids stacked toolbars.
 *
 * `/admin` was missing from that list, so the marketing nav sat above the
 * admin dashboard's own header: two toolbars, ~120px of chrome before any
 * data, and a Shop link on an operations console. The admin shell carries its
 * own identity, navigation and sign-out, so the marketing bar was duplicating
 * every one of those with different answers.
 *
 * The developer portal had the same problem and a worse symptom: on
 * developer.circuvent.com the marketing bar rendered above the documentation,
 * and its links pointed at corporate pages — so "Domains" led to
 * developer.circuvent.com/domains, a path that does not exist under the mount.
 * The bar was not just redundant there, it was a set of broken links.
 *
 * nav/footer are passed as props so this client gate works even if they are
 * server components.
 *
 * A mounted subtree is also reachable on its own hostname, where the path
 * alone is not enough to recognise it: the proxy rewrites
 * `home.circuvent.com/` to `/smarthome`, but the browser URL stays `/`, so
 * after hydration a path-only gate flips to false and puts the nav bar back.
 * Asking about the hostname too is what keeps the server and client answers
 * the same.
 */
export default function SiteChrome({
  nav,
  footer,
  children,
}: {
  nav: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isStore = pathname?.startsWith("/shop") ?? false;
  const isAdmin = pathname?.startsWith("/admin") ?? false;
  // On the server `pathname` is already the rewritten `/smarthome…` or
  // `/developer…`; in the browser the hostname is what gives the game away.
  // Each side has one of the two signals, and both reach the same answer — so
  // nothing changes at hydration.
  const isMountedApp =
    HOST_MOUNTS.some((m) => pathname?.startsWith(m.prefix) ?? false) ||
    isMountedHost(typeof window === "undefined" ? null : window.location.hostname);
  const bare = isStore || isMountedApp || isAdmin;

  return (
    <>
      {!bare && nav}
      <main id="main-content" className="relative z-[1]">
        {children}
      </main>
      {!bare && footer}
    </>
  );
}
