import Link from "next/link";
import type { Metadata } from "next";
import { docPage } from "@/lib/developer-docs";
import { C, DocTitle, P, PrevNext } from "../_components/prose";
import { CodeBlock } from "../_components/code";

const page = docPage("commands")!;
export const metadata: Metadata = { title: page.title, description: page.blurb };

export default function Commands() {
  return (
    <>
      <DocTitle title={page.title} blurb={page.blurb} />

      <div className="space-y-4">
        <P>
          <C>POST /v1/devices/{"{id}"}/commands</C> forwards the body to the device
          unchanged. We deliberately do not validate it against a per-type schema: what a
          board accepts is defined by its firmware, which ships independently of this API,
          so a whitelist here would silently block every new capability until somebody
          remembered to update it.
        </P>
        <P>
          The response is <strong>202 Accepted</strong>, not 200. It means the broker has
          taken the command for delivery — not that the relay has closed. To observe the
          result, either read the device back a moment later or take a{" "}
          <Link
            href="/developer/webhooks"
            className="font-semibold underline"
            style={{ color: "var(--accent-cyan-text)" }}
          >
            webhook
          </Link>
          , which is pushed as soon as the device reports.
        </P>

        <CodeBlock
          label="common commands"
          code={`// Multi-channel hub / touch switchboard — channel index is zero-based
{ "ch": 0, "on": true }

// Everything on, in one message
{ "relays": [true, true, true, true] }

// Single-relay devices (plug, light, switch)
{ "power": true }

// Dimmable light — 0-100
{ "power": true, "brightness": 60 }

// Fan speed — 0-5
{ "speed": 3 }

// Named scene on a hub
{ "scene": "movie" }`}
        />

        <P>
          Fields a device does not understand are ignored by the firmware rather than
          rejected, so sending an extra key is safe. The exact fields each product accepts
          are listed on its page in the shop and in <C>firmware/&lt;type&gt;/</C> in the
          open-source repository.
        </P>
      </div>

      <PrevNext slug="commands" />
    </>
  );
}
