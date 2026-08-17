import type { Metadata } from "next";
import { docPage } from "@/lib/developer-docs";
import { C, DocTitle, Note, P, PrevNext } from "../_components/prose";

const page = docPage("browser")!;
export const metadata: Metadata = { title: page.title, description: page.blurb };

export default function Browser() {
  return (
    <>
      <DocTitle title={page.title} blurb={page.blurb} />

      <div className="space-y-4">
        <P>
          By default a key is refused if it arrives with an <C>Origin</C> header — that is,
          from browser JavaScript. Pasting a server key into front-end code should break
          loudly rather than quietly publish your credential.
        </P>
        <P>
          If you do want to call the API directly from your website, register that site as
          an allowed origin when you create the key. We will then accept it from that
          origin and answer with the matching CORS headers.
        </P>

        <Note tone="warn" title="What the origin allowlist actually protects">
          The <C>Origin</C> header is set by the browser and cannot be forged by page
          JavaScript, so the allowlist genuinely stops somebody embedding a key scraped
          from your site into a page on their own domain. It is <strong>not</strong> a
          defence against a server-side caller — <C>curl</C> can send any origin it likes.
          A key shipped to a browser is readable by every visitor, so treat it as public:
          grant it <C>devices:read</C> and nothing more, and keep anything that switches
          hardware on your own backend.
        </Note>

        <P>
          The pattern we would recommend for a customer-facing dashboard: hold a full-scope
          key on your server, expose your own endpoint that applies your own authorisation
          rules, and let the browser talk to that. Your users never see a Circuvent
          credential at all.
        </P>
      </div>

      <PrevNext slug="browser" />
    </>
  );
}
