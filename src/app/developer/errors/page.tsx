import type { Metadata } from "next";
import { ERRORS, docPage } from "@/lib/developer-docs";
import { C, DocTitle, P, PrevNext } from "../_components/prose";
import { CodeBlock } from "../_components/code";

const page = docPage("errors")!;
export const metadata: Metadata = { title: page.title, description: page.blurb };

export default function Errors() {
  return (
    <>
      <DocTitle title={page.title} blurb={page.blurb} />

      <div className="space-y-4">
        <P>
          Failures return a JSON body with a human <C>error</C> and a stable <C>code</C>.
          Branch on the code, not the message — messages get reworded.
        </P>

        <CodeBlock
          label="403"
          code={`{
  "error": "This key is missing the 'devices:control' scope.",
  "code": "insufficient_scope",
  "required": "devices:control",
  "granted": ["devices:read", "telemetry:read"]
}`}
        />

        <div className="overflow-x-auto rounded-xl border" style={{ borderColor: "var(--border-subtle)" }}>
          <table className="w-full min-w-[620px] text-left">
            <thead>
              <tr style={{ background: "var(--bg-elevated)" }}>
                {["Status", "Code", "Meaning"].map((h) => (
                  <th
                    key={h}
                    className="px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider"
                    style={{ color: "var(--text-tertiary)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ERRORS.map((e, i) => (
                <tr key={e.code} style={{ borderTop: i ? "1px solid var(--border-subtle)" : undefined }}>
                  <td
                    className="px-4 py-2.5 font-mono text-[12.5px] font-bold"
                    style={{ color: "var(--text-primary)" }}
                  >
                    {e.status}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[12px]" style={{ color: "var(--code-accent)" }}>
                    {e.code}
                  </td>
                  <td className="px-4 py-2.5 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                    {e.meaning}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <P>
          A device that belongs to another account returns <C>404</C>, not <C>403</C>. That
          is deliberate: a 403 would confirm the id exists.
        </P>
      </div>

      <PrevNext slug="errors" />
    </>
  );
}
