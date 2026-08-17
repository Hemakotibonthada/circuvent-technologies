import Link from "next/link";
import type { Metadata } from "next";
import { docPage } from "@/lib/developer-docs";
import { C, DocTitle, Note, P, PrevNext } from "../_components/prose";

const page = docPage("limits")!;
export const metadata: Metadata = { title: page.title, description: page.blurb };

export default function Limits() {
  return (
    <>
      <DocTitle title={page.title} blurb={page.blurb} />

      <div className="space-y-4">
        <P>
          600 requests per minute, counted per key rather than per IP — an integration
          running from one server should not have to share a budget with every other caller
          on that address. Over the limit you get <C>429</C> with{" "}
          <C>code: &quot;rate_limited&quot;</C>. Standard <C>RateLimit-*</C> headers are on
          every response, so you can back off before hitting it.
        </P>
        <P>
          If you need per-device updates faster than polling allows, use{" "}
          <Link
            href="/developer/webhooks"
            className="font-semibold underline"
            style={{ color: "var(--accent-cyan-text)" }}
          >
            webhooks
          </Link>{" "}
          — they are pushed as the device reports and do not count against this budget.
        </P>

        <Note title="Our compatibility promise for /v1">
          <ul className="ml-4 list-disc space-y-1">
            <li>Fields are added, never removed or retyped within a version.</li>
            <li>Unknown fields in a request body are ignored, not rejected.</li>
            <li>
              A breaking change means <C>/v2</C>, with <C>/v1</C> kept working.
            </li>
          </ul>
          <p className="mt-2">
            Parse defensively anyway: tolerate fields you do not recognise rather than
            rejecting the response.
          </p>
        </Note>
      </div>

      <PrevNext slug="limits" />
    </>
  );
}
