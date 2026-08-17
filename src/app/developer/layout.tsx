import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { DOC_PAGES } from "@/lib/developer-docs";
import { DocNav } from "./_components/nav";

export const metadata: Metadata = {
  title: {
    default: "Circuvent Developer Platform",
    template: "%s — Circuvent Developers",
  },
  description:
    "REST API and signed webhooks for the Circuvent control plane. Read device state, send commands, and stream events into your own systems.",
};

/**
 * The developer portal shell.
 *
 * Served at `/developer` on the main site and at the root of
 * developer.circuvent.com, which the proxy rewrites onto this subtree — one
 * build, one copy of the documentation, and the subdomain is a DNS record
 * rather than a second deployment to keep in step.
 */
export default function DeveloperLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/*
        The portal's own header.
       
        The corporate bar is deliberately not rendered here — see SiteChrome.
        Something has to take its place, though: without it there is no brand,
        and no way back to the rest of the site from a subdomain that only
        serves documentation.
       
        The link out is absolute rather than "/", because on
        developer.circuvent.com "/" is this portal's own front page.
      */}
      <header
        className="sticky top-0 z-30 border-b backdrop-blur"
        style={{
          borderColor: "var(--border-subtle)",
          background: "color-mix(in srgb, var(--bg-primary) 88%, transparent)",
        }}
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-3 lg:px-8">
          <Link href="/developer" className="flex items-center gap-2.5">
            <Image
              src="/logo-mark-64.png"
              alt=""
              width={26}
              height={26}
              className="h-[26px] w-[26px]"
              priority
            />
            <span className="text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
              Circuvent{" "}
              <span style={{ color: "var(--text-tertiary)", fontWeight: 500 }}>Developers</span>
            </span>
          </Link>

          <nav className="flex items-center gap-1 text-[13px]">
            <a
              href="/openapi.json"
              className="hidden rounded-lg px-3 py-2 transition hover:opacity-70 sm:inline-block"
              style={{ color: "var(--text-secondary)" }}
            >
              OpenAPI
            </a>
            <a
              href="https://circuvent.com"
              className="hidden rounded-lg px-3 py-2 transition hover:opacity-70 sm:inline-block"
              style={{ color: "var(--text-secondary)" }}
            >
              circuvent.com
            </a>
            <Link
              href="/smarthome/settings?tab=developer"
              className="rounded-lg px-3 py-2 font-semibold transition hover:opacity-80"
              style={{ color: "var(--accent-cyan-text)" }}
            >
              Create a key
            </Link>
          </nav>
        </div>
      </header>

      <div className="relative z-10 mx-auto max-w-7xl px-6 py-12 lg:px-8 lg:py-16">
        <div className="lg:grid lg:grid-cols-[240px_1fr] lg:gap-12">
          <aside className="mb-10 lg:sticky lg:top-24 lg:mb-0 lg:self-start">
            <Link
              href="/developer"
              className="mb-5 block text-[15px] font-bold"
              style={{ color: "var(--text-primary)" }}
            >
              Developer Platform
            </Link>
            <DocNav pages={DOC_PAGES} />
            <div
              className="mt-6 border-t pt-4 text-[12.5px]"
              style={{ borderColor: "var(--border-subtle)", color: "var(--text-tertiary)" }}
            >
              <a href="/openapi.json" className="block py-1 underline">
                OpenAPI 3.1 document
              </a>
              <Link href="/smarthome/settings?tab=developer" className="block py-1 underline">
                Create an API key
              </Link>
              <Link href="/contact" className="block py-1 underline">
                Talk to us
              </Link>
            </div>
          </aside>

          <main className="min-w-0">{children}</main>
        </div>
      </div>
    </>
  );
}
