import type { Metadata } from "next";
import { API_ENDPOINTS, API_TAGS } from "@/lib/developer-api.generated";
import { API_BASE, docPage } from "@/lib/developer-docs";
import { C, DocTitle, Method, P, PrevNext } from "../_components/prose";
import { CodeBlock } from "../_components/code";

const page = docPage("endpoints")!;
export const metadata: Metadata = { title: page.title, description: page.blurb };

export default function Endpoints() {
  /*
   * Grouped by the specification's own tags, in the order it declares them,
   * with anything untagged last. Twenty-four rows in one undifferentiated
   * table is a list you scroll past rather than read.
   */
  const order = API_TAGS.map((t) => t.name);
  const groups = [...new Set([...order, ...API_ENDPOINTS.map((e) => e.tag)])]
    .map((name) => ({
      name,
      description: API_TAGS.find((t) => t.name === name)?.description ?? "",
      rows: API_ENDPOINTS.filter((e) => e.tag === name),
    }))
    .filter((g) => g.rows.length);

  return (
    <>
      <DocTitle title={page.title} blurb={page.blurb} />

      <div className="space-y-4">
        <P>
          All paths are relative to <C>{API_BASE}</C>. Responses are JSON. <C>GET /v1</C>{" "}
          returns this same list machine-readably, and{" "}
          <a href="/openapi.json" className="font-semibold underline" style={{ color: "var(--accent-cyan-text)" }}>
            an OpenAPI 3.1 document
          </a>{" "}
          is published if you would rather generate a client.
        </P>

        {groups.map((g) => (
          <section key={g.name} className="pt-4">
            <h2 className="text-[17px] font-bold" style={{ color: "var(--text-primary)" }}>
              {g.name}
            </h2>
            {g.description && (
              <p className="mb-3 mt-0.5 text-[13.5px]" style={{ color: "var(--text-tertiary)" }}>
                {g.description}
              </p>
            )}
            <div
              className="overflow-x-auto rounded-xl border"
              style={{ borderColor: "var(--border-subtle)" }}
            >
              <table className="w-full min-w-[720px] text-left">
                <thead>
                  <tr style={{ background: "var(--bg-elevated)" }}>
                    {["Method", "Path", "Scope", "Description"].map((h) => (
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
                  {g.rows.map((e, i) => (
                    <tr
                      key={`${e.method}${e.path}`}
                      style={{ borderTop: i ? "1px solid var(--border-subtle)" : undefined }}
                    >
                      <td className="px-4 py-2.5">
                        <Method method={e.method} />
                      </td>
                      <td
                        className="px-4 py-2.5 font-mono text-[12.5px]"
                        style={{ color: "var(--text-primary)" }}
                      >
                        {e.path}
                      </td>
                      <td
                        className="px-4 py-2.5 font-mono text-[11.5px]"
                        style={{ color: "var(--text-tertiary)" }}
                      >
                        {/* An open endpoint shows a dash, not an empty cell. */}
                        {e.scope ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[13px]" style={{ color: "var(--text-secondary)" }}>
                        {e.summary}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ))}

        <div className="pt-4">
          <CodeBlock
            label="GET /v1/devices"
            code={`{
  "devices": [
    {
      "id": "hub-a1b2",
      "name": "Living room hub",
      "type": "home-hub",
      "room": "Living Room",
      "favorite": true,
      "online": true,
      "lastSeen": "2026-08-03T09:12:44.201Z",
      "firmware": "1.4.2",
      "state": { "power": true, "power2": false, "power3": false, "power4": false }
    }
  ]
}`}
          />
        </div>
      </div>

      <PrevNext slug="endpoints" />
    </>
  );
}
