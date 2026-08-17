import type { Metadata } from "next";
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
  );
}
