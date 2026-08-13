/**
 * The documentation is only useful if what it points at exists.
 *
 * These documents send a new joiner to specific files and specific commands —
 * "run `npm run docs:business`", "read `Docs/07-adding-a-new-device.md`",
 * "edit `src/lib/brand.ts`". A link that rots does not fail anything; it fails
 * a person, on their first week, when they have the least context to work out
 * that the document is wrong rather than their machine.
 *
 * That is the same silent-failure class the rest of this repository guards
 * against, so it gets the same treatment: a test that fails when a document
 * and the tree disagree.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";

const ROOT = resolve(__dirname, "..");
const DOCS = join(ROOT, "Docs");

function markdownFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...markdownFiles(full));
    else if (entry.name.endsWith(".md")) out.push(full);
  }
  return out;
}

const files = markdownFiles(DOCS);

describe("documentation", () => {
  it("finds documents to check", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  describe.each(files.map((f) => [f.slice(ROOT.length + 1).replace(/\\/g, "/"), f]))(
    "%s",
    (_label, file) => {
      const body = readFileSync(file, "utf8");

      it("has no broken relative links", () => {
        // Markdown links to a local path. Skips URLs, anchors and mailto.
        const broken: string[] = [];
        for (const m of body.matchAll(/\[[^\]]*\]\(([^)\s]+)\)/g)) {
          const target = m[1];
          if (/^(https?:|mailto:|#|tel:)/.test(target)) continue;
          const clean = target.split("#")[0];
          if (!clean) continue;
          if (!existsSync(resolve(dirname(file), clean))) broken.push(target);
        }
        expect(broken).toEqual([]);
      });

      it("references only files that exist", () => {
        /*
         * Backticked paths that look like real repository files. Deliberately
         * narrow: it requires a known directory prefix and a file extension,
         * so prose like `npm run dev` is not mistaken for a path.
         *
         * Paths are resolved against the sub-project roots as well as the
         * repository root, because a document about the mobile app writes
         * `src/api.ts` meaning `mobile/src/api.ts`. Requiring the full path
         * would be pedantry that makes the documents worse to read; not
         * resolving it at all would report every one of them as missing.
         */
        const PROJECT_ROOTS = ["", "mobile", "platform/api", "platform"];
        const missing: string[] = [];
        const pattern =
          /`((?:src|platform|mobile|firmware|hardware|scripts|tests|e2e|Docs|\.github)\/[A-Za-z0-9_\-./]+\.[A-Za-z0-9]{1,5})`/g;
        for (const m of body.matchAll(pattern)) {
          const p = m[1];
          // Wildcards and globs describe a shape, not one file.
          if (p.includes("*")) continue;
          const found = PROJECT_ROOTS.some((r) => existsSync(join(ROOT, r, p)));
          if (!found) missing.push(p);
        }
        expect(missing).toEqual([]);
      });
    },
  );
});

describe("start-here guide", () => {
  const body = readFileSync(join(DOCS, "00-start-here.md"), "utf8");
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

  it("only tells a new joiner to run scripts that exist", () => {
    /*
     * The whole point of the day-one guide is that every command in it works.
     * A command that was renamed leaves someone stuck before they have any way
     * to tell whether they broke it.
     *
     * Scripts are looked up across all three packages, because the guide
     * legitimately says `cd mobile && npm run typecheck` — a script that
     * exists in mobile/package.json and deliberately not at the root.
     */
    const packages = ["package.json", "mobile/package.json", "platform/api/package.json"]
      .map((p) => JSON.parse(readFileSync(join(ROOT, p), "utf8")).scripts ?? {});
    const referenced = new Set<string>();
    for (const m of body.matchAll(/npm run ([a-z][a-z0-9:-]*)/g)) referenced.add(m[1]);
    const unknown = [...referenced].filter((s) => !packages.some((p) => s in p));
    expect(unknown).toEqual([]);
  });

  it("points at the documents it promises in the reading table", () => {
    for (const doc of ["01-architecture", "23-conventions", "24-testing",
                       "26-glossary", "27-first-tasks"]) {
      expect(body).toContain(doc);
    }
  });
});

describe("business document generator", () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8"));

  it("is runnable through npm, like everything else in the repository", () => {
    expect(pkg.scripts["docs:business"]).toBeTruthy();
    expect(pkg.scripts["docs:business:verify"]).toBeTruthy();
  });

  it("has every module the entry point imports", () => {
    for (const f of [
      "scripts/build_business_docs.py",
      "scripts/verify_business_docs.py",
      "scripts/export-business-data.ts",
      "scripts/business_docs/brand.py",
      "scripts/business_docs/decks.py",
      "scripts/business_docs/documents.py",
      "scripts/business_docs/pdfs.py",
    ]) {
      expect({ file: f, exists: existsSync(join(ROOT, f)) })
        .toEqual({ file: f, exists: true });
    }
  });

  it("types no price into the generators", () => {
    /*
     * The generators exist so documents cannot drift from the catalogue. A
     * hard-coded rupee amount in one of them silently reintroduces exactly the
     * drift they were written to prevent, and it would be invisible on the
     * page — it renders like every other price.
     */
    for (const f of ["brand.py", "decks.py", "documents.py", "pdfs.py"]) {
      const src = readFileSync(join(ROOT, "scripts", "business_docs", f), "utf8");
      const hardcoded = [...src.matchAll(/["'](?:\u20b9|Rs\.?\s?)\d[\d,]*["']/g)]
        .map((m) => m[0]);
      expect({ file: f, hardcoded }).toEqual({ file: f, hardcoded: [] });
    }
  });
});
