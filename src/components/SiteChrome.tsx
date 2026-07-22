"use client";

import { usePathname } from "next/navigation";

/**
 * Renders the corporate site chrome (top nav + footer) on every route except
 * the dedicated store (/shop*), where the ShopHeader is the only header — this
 * avoids two stacked toolbars. nav/footer are passed as props so this client
 * gate works even if they are server components.
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

  return (
    <>
      {!isStore && nav}
      <main id="main-content" className="relative z-[1]">
        {children}
      </main>
      {!isStore && footer}
    </>
  );
}
