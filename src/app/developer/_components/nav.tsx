"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DocPage } from "@/lib/developer-docs";

/**
 * Sidebar navigation.
 *
 * The current page is marked from `usePathname` rather than passed down, so it
 * stays correct on the subdomain too: there the browser's path is `/scopes`
 * while the server rendered `/developer/scopes`, and a marker keyed on the
 * server's path would light up nothing after hydration.
 */
export function DocNav({ pages }: { pages: DocPage[] }) {
  const pathname = usePathname() ?? "";

  const isCurrent = (slug: string) =>
    pathname === `/developer/${slug}` || pathname === `/${slug}`;

  return (
    <nav aria-label="Documentation">
      <ul className="space-y-0.5">
        {pages.map((p) => {
          const current = isCurrent(p.slug);
          return (
            <li key={p.slug}>
              <Link
                href={`/developer/${p.slug}`}
                aria-current={current ? "page" : undefined}
                className="flex min-h-[40px] items-center rounded-lg px-3 text-[13.5px] transition hover:opacity-75"
                style={{
                  color: current ? "var(--accent-cyan-text)" : "var(--text-secondary)",
                  background: current ? "var(--bg-elevated)" : "transparent",
                  fontWeight: current ? 600 : 400,
                }}
              >
                {p.title}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
