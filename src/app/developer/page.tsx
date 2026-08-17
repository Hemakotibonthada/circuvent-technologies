import Link from "next/link";
import type { Metadata } from "next";
import { API_ENDPOINTS, API_SCOPES, API_VERSION } from "@/lib/developer-api.generated";
import { API_BASE, DOC_PAGES, WEBHOOK_EVENTS } from "@/lib/developer-docs";
import { C, Note, P } from "./_components/prose";
import { SampleTabs } from "./_components/code";
import { SAMPLES } from "@/lib/developer-docs";

export const metadata: Metadata = {
  title: "Circuvent Developer Platform",
  description:
    "A REST API and signed webhooks for the same control plane our own console and apps run on.",
};

/**
 * The portal's front page.
 *
 * The counts are read off the generated tables rather than typed in. The page
 * this replaced advertised "16 endpoints, 10 scopes, 4 webhook events" beside
 * a table listing 24, 12 and 5 — numbers written once and then left behind by
 * the API they described.
 */
export default function DeveloperHome() {
  const stats = [
    { value: String(API_ENDPOINTS.length), label: "Endpoints" },
    { value: String(API_SCOPES.length), label: "Scopes" },
    { value: String(WEBHOOK_EVENTS.length), label: "Webhook events" },
    { value: "600/min", label: "Rate limit" },
  ];

  return (
    <>
      <header className="mb-10">
        <div
          className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em]"
          style={{ color: "var(--text-tertiary)" }}
        >
          Developer Platform · v{API_VERSION}
        </div>
        <h1
          className="text-4xl font-bold tracking-tight sm:text-5xl"
          style={{ color: "var(--text-primary)" }}
        >
          Build on Circuvent
        </h1>
        <p className="mt-4 max-w-2xl text-[16px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          A REST API and signed webhooks for the same control plane our own console and
          apps run on. Read device state, send commands, and stream events straight into
          your dashboard.
        </p>

        <dl className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="rounded-xl border px-4 py-3"
              style={{ borderColor: "var(--border-subtle)", background: "var(--bg-elevated)" }}
            >
              <dt className="text-[11px] uppercase tracking-wider" style={{ color: "var(--text-tertiary)" }}>
                {s.label}
              </dt>
              <dd className="mt-1 text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      </header>

      <P>
        Every request goes to <C>{API_BASE}/v1</C> and carries an API key. Start with the{" "}
        <Link
          href="/developer/quickstart"
          className="font-semibold underline"
          style={{ color: "var(--accent-cyan-text)" }}
        >
          quickstart
        </Link>
        , or jump to whichever part you need.
      </P>

      <div className="mt-6">
        <SampleTabs samples={SAMPLES} />
      </div>

      <ul className="mt-10 grid gap-3 sm:grid-cols-2">
        {DOC_PAGES.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/developer/${p.slug}`}
              className="block h-full rounded-xl border p-4 transition hover:opacity-80"
              style={{ borderColor: "var(--border-subtle)", background: "var(--bg-elevated)" }}
            >
              <span className="block text-[15px] font-bold" style={{ color: "var(--text-primary)" }}>
                {p.title}
              </span>
              <span className="mt-1 block text-[13.5px]" style={{ color: "var(--text-secondary)" }}>
                {p.blurb}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-10">
        <Note title="Prefer to generate a client?">
          The full surface is published as an{" "}
          <a href="/openapi.json" className="font-semibold underline">
            OpenAPI 3.1 document
          </a>
          , and <C>GET /v1</C> returns the same index machine-readably with no
          authentication. The tables in these pages are generated from that description, so
          they cannot fall behind it.
        </Note>
      </div>
    </>
  );
}
