/**
 * The documentation cannot drift from the API it describes.
 *
 * The same facts were written down three times — `public/openapi.json`, the
 * `/v1` index the server publishes, and a hand-maintained array inside the
 * documentation page — and the documentation copy is the one nobody notices
 * going stale. It had already happened: the page advertised "16 endpoints, 10
 * scopes, 4 webhook events" directly above a table listing 24, 12 and 5.
 *
 * So the endpoint table is generated from the specification, and this
 * regenerates it and compares — the same guard the firmware catalogue has.
 */
import fs from "node:fs";
import path from "node:path";

import { API_ENDPOINTS, API_SCOPES } from "@/lib/developer-api.generated";
import { DOC_PAGES, SCOPE_DESCRIPTIONS } from "@/lib/developer-docs";

/* tests/ sits at the repo root, so one level up is the repo — not two. */
const root = path.join(__dirname, "..");
const generator = require(path.join(root, "scripts", "generate-developer-docs.cjs"));

describe("the generated endpoint table", () => {
  it("matches what the OpenAPI description says today", () => {
    const fresh = generator.render(generator.build());
    const onDisk = fs.readFileSync(
      path.join(root, "src", "lib", "developer-api.generated.ts"),
      "utf8"
    );
    /*
     * Compared after normalising line endings: the file is written with \n and
     * git may check it out with \r\n on Windows, which would fail this for a
     * reason that has nothing to do with the API.
     */
    expect(onDisk.replace(/\r\n/g, "\n")).toBe(fresh.replace(/\r\n/g, "\n"));
  });

  it("describes a real surface rather than an empty one", () => {
    expect(API_ENDPOINTS.length).toBeGreaterThan(0);
    for (const e of API_ENDPOINTS) {
      expect(e.path.startsWith("/")).toBe(true);
      expect(e.method).toMatch(/^[A-Z]+$/);
      expect(e.summary.length).toBeGreaterThan(0);
    }
  });

  /*
   * `/v1` is the discovery endpoint and is deliberately open — it is how a
   * client finds everything else. Every other endpoint must require a scope,
   * because an endpoint that reaches somebody's devices without one is a bug
   * in the specification worth failing a build over.
   */
  it("leaves only the discovery endpoint unauthenticated", () => {
    const open = API_ENDPOINTS.filter((e) => !e.scope).map((e) => `${e.method} ${e.path}`);
    expect(open).toEqual(["GET /v1"]);
  });
});

describe("scope documentation", () => {
  it("describes every scope the API requires", () => {
    const described = new Set(SCOPE_DESCRIPTIONS.map((s) => s.scope));
    const missing = API_SCOPES.filter((s) => !described.has(s));
    expect(missing).toEqual([]);
  });

  /*
   * The other direction matters too. A description left behind for a scope the
   * server no longer requires tells a reader they can ask for a permission
   * that will be refused.
   */
  it("does not describe scopes the API no longer has", () => {
    const required = new Set(API_SCOPES);
    const stale = SCOPE_DESCRIPTIONS.map((s) => s.scope).filter((s) => !required.has(s));
    expect(stale).toEqual([]);
  });

  it("gives each scope a distinct, non-empty sentence", () => {
    const seen = new Set<string>();
    for (const s of SCOPE_DESCRIPTIONS) {
      expect(s.description.trim().length).toBeGreaterThan(0);
      expect(seen.has(s.scope)).toBe(false);
      seen.add(s.scope);
    }
  });
});

describe("the portal's pages", () => {
  /*
   * DOC_PAGES drives the sidebar, the overview cards and the previous/next
   * links. A page in the list without a route is a link to a 404; a route
   * missing from the list is a page nothing navigates to.
   */
  it("has a route on disk for every page it advertises", () => {
    for (const p of DOC_PAGES) {
      const file = path.join(root, "src", "app", "developer", p.slug, "page.tsx");
      expect(fs.existsSync(file)).toBe(true);
    }
  });

  it("advertises every route that exists", () => {
    const dir = path.join(root, "src", "app", "developer");
    const routes = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith("_"))
      .map((e) => e.name)
      .sort();
    expect(routes).toEqual(DOC_PAGES.map((p) => p.slug).sort());
  });

  it("gives each page a unique slug and a blurb", () => {
    const slugs = DOC_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    for (const p of DOC_PAGES) {
      expect(p.title.trim().length).toBeGreaterThan(0);
      expect(p.blurb.trim().length).toBeGreaterThan(0);
    }
  });
});
