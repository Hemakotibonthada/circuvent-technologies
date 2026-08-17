import Link from "next/link";
import type { Metadata } from "next";
import { API_BASE, SAMPLES, docPage } from "@/lib/developer-docs";
import { C, DocTitle, P, PrevNext } from "../_components/prose";
import { SampleTabs } from "../_components/code";

const page = docPage("quickstart")!;
export const metadata: Metadata = { title: page.title, description: page.blurb };

export default function Quickstart() {
  return (
    <>
      <DocTitle title={page.title} blurb={page.blurb} />

      <P>
        Every request goes to <C>{API_BASE}/v1</C> and carries an API key. Three steps and
        you are reading real devices.
      </P>

      <ol className="ml-5 mt-4 list-decimal space-y-2 text-[15px]" style={{ color: "var(--text-secondary)" }}>
        <li>
          Open{" "}
          <Link
            href="/smarthome/settings?tab=developer"
            className="font-semibold underline"
            style={{ color: "var(--accent-cyan-text)" }}
          >
            Console → Settings → Developer
          </Link>{" "}
          and create a key. Grant only the scopes you need.
        </li>
        <li>Copy the key when it is shown — we store a hash, so it cannot be displayed again.</li>
        <li>
          Send it as <C>Authorization: Bearer &lt;key&gt;</C> on every request.
        </li>
      </ol>

      <div className="mt-6">
        <SampleTabs samples={SAMPLES} />
      </div>

      <PrevNext slug="quickstart" />
    </>
  );
}
