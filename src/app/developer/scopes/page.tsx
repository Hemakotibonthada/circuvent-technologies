import type { Metadata } from "next";
import { SCOPE_DESCRIPTIONS, docPage } from "@/lib/developer-docs";
import { API_SCOPES } from "@/lib/developer-api.generated";
import { C, DefList, DocTitle, Note, P, PrevNext } from "../_components/prose";

const page = docPage("scopes")!;
export const metadata: Metadata = { title: page.title, description: page.blurb };

export default function Scopes() {
  /*
   * Ordered by the specification, so the page follows whatever the server
   * actually requires. A scope the specification uses but nobody has described
   * still appears — with its name — rather than being dropped silently; the
   * parity test fails on that case, but a reader should not be told a
   * permission does not exist because a sentence is missing.
   */
  const described = new Map(SCOPE_DESCRIPTIONS.map((s) => [s.scope, s.description]));
  const rows = API_SCOPES.map((scope) => ({
    term: scope,
    body: described.get(scope) ?? "—",
  }));

  return (
    <>
      <DocTitle title={page.title} blurb={page.blurb} />

      <div className="space-y-4">
        <P>
          A key carries exactly the scopes you grant it. Scopes do not imply one another:{" "}
          <C>devices:read</C> does not confer <C>devices:control</C>, so a dashboard that
          only displays state cannot switch anything even if its key leaks.
        </P>

        <DefList rows={rows} />

        <Note title="Where this list comes from">
          Every scope here is one the API actually requires on at least one endpoint,
          read out of the OpenAPI description rather than maintained by hand. If the
          server starts requiring a new one, it appears here without anybody remembering
          to add it.
        </Note>
      </div>

      <PrevNext slug="scopes" />
    </>
  );
}
