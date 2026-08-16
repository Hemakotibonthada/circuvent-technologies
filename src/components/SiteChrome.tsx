"use client";

import { usePathname } from "next/navigation";
import { isConsoleHost } from "@/lib/smarthome-host";

/**
 * Renders the corporate site chrome (top nav + footer) on every route except
 * the dedicated store (/shop*) and the device console (/smarthome*), where a
 * self-contained app shell is the only chrome — this avoids stacked toolbars.
 * nav/footer are passed as props so this client gate works even if they are
 * server components.
 *
 * The console is also mounted on its own hostname, where the path alone is not
 * enough to recognise it: the proxy rewrites `home.circuvent.com/` to
 * `/smarthome`, but the browser URL stays `/`, so after hydration the path gate
 * flips to false and puts the nav bar back. Asking about the hostname too is
 * what keeps the server and client answers the same.
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
  // On the server `pathname` is already the rewritten `/smarthome…`; in the
  // browser the hostname is what gives the game away. Each side has one of the
  // two signals, and both reach the same answer — so nothing changes at
  // hydration.
  const isConsole =
    (pathname?.startsWith("/smarthome") ?? false) ||
    isConsoleHost(typeof window === "undefined" ? null : window.location.hostname);
  const bare = isStore || isConsole;

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
