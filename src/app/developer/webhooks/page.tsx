import Link from "next/link";
import type { Metadata } from "next";
import { WEBHOOK_EVENTS, WEBHOOK_VERIFY, docPage } from "@/lib/developer-docs";
import { DefList, DocTitle, P, PrevNext } from "../_components/prose";
import { CodeBlock } from "../_components/code";

const page = docPage("webhooks")!;
export const metadata: Metadata = { title: page.title, description: page.blurb };

export default function Webhooks() {
  return (
    <>
      <DocTitle title={page.title} blurb={page.blurb} />

      <div className="space-y-4">
        <P>
          Rather than polling, register an https endpoint and we will POST to it as devices
          report. Add one in{" "}
          <Link
            href="/smarthome/settings?tab=developer"
            className="font-semibold underline"
            style={{ color: "var(--accent-cyan-text)" }}
          >
            Settings → Developer
          </Link>
          , then use the <em>Send test</em> button to check your receiver before a real
          device depends on it.
        </P>

        <DefList rows={WEBHOOK_EVENTS.map((e) => ({ term: e.event, body: e.when }))} />

        <CodeBlock
          label="delivery body"
          code={`POST /your/endpoint
X-Circuvent-Event: device.state
X-Circuvent-Signature: t=1785312764,v1=8f3c…

{
  "id": "evt_9Kd2mQpX7bTz",
  "event": "device.state",
  "deviceId": "hub-a1b2",
  "data": { "power": true, "power2": false },
  "at": "2026-08-03T09:12:44.201Z"
}`}
        />

        <P>
          <strong>Always verify the signature before trusting the body.</strong> Anyone can
          POST to your URL; the HMAC is what proves it came from us. The timestamp is
          inside the signed material, so a captured delivery cannot be replayed later with
          a fresh one.
        </P>

        <CodeBlock code={WEBHOOK_VERIFY} label="node — verifying a delivery" />

        <P>
          We wait 5 seconds for a 2xx. Non-2xx responses count as failures, and 20
          consecutive failures disable the webhook — a dead endpoint would otherwise burn a
          socket and five seconds for every device message, forever. Re-enable it in the
          console once the receiver is healthy; that also resets the counter. Redirects are
          not followed, and the URL must resolve to a publicly routable address.
        </P>
      </div>

      <PrevNext slug="webhooks" />
    </>
  );
}
