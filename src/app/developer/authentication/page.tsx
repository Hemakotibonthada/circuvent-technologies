import type { Metadata } from "next";
import { docPage } from "@/lib/developer-docs";
import { C, DocTitle, P, PrevNext } from "../_components/prose";
import { CodeBlock } from "../_components/code";

const page = docPage("authentication")!;
export const metadata: Metadata = { title: page.title, description: page.blurb };

export default function Authentication() {
  return (
    <>
      <DocTitle title={page.title} blurb={page.blurb} />

      <div className="space-y-4">
        <P>
          Keys look like <C>cvk_live_…</C> or <C>cvk_test_…</C>. Both are real keys against
          real devices — the environment marker is a label to help you tell a staging
          integration from a production one, not a sandbox.
        </P>
        <P>
          Send the key in the <C>Authorization</C> header as a bearer token. An{" "}
          <C>X-API-Key</C> header works too, if that is what your HTTP client makes easy.
        </P>

        <CodeBlock
          label="http"
          code={`GET /v1/devices HTTP/1.1
Host: api.circuvent.com
Authorization: Bearer cvk_live_your_key_here`}
        />

        <P>
          A key is tied to the account that created it and can do nothing that account
          cannot. It is <strong>not</strong> able to manage keys, provision or unclaim
          devices, change account settings, or reach admin endpoints — those require a
          signed-in session. That boundary is what stops a leaked read-only key from
          issuing itself a broader one.
        </P>
        <P>
          Keys never expire unless you give them an expiry, and revoking one in the console
          takes effect immediately. Call <C>GET /v1/me</C> at any time to see which account
          and scopes a key resolves to — it is the fastest way to debug a 403.
        </P>
      </div>

      <PrevNext slug="authentication" />
    </>
  );
}
