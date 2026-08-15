/**
 * The knowledge-transfer pack must stay buildable, and stay honest.
 *
 * WHY A JEST TEST FOR PYTHON-GENERATED DOCUMENTS
 *
 * `npm run docs:kt:verify` opens the artifacts and asserts on their contents,
 * which is the real check — but nobody runs it, because it is not part of the
 * suite that gates a pull request. What this file guards is narrower and
 * cheaper: that the generator still exists, is still reachable through npm, and
 * still derives its facts instead of carrying its own copies.
 *
 * The failure it prevents is the one the pack exists to prevent, turned on
 * itself: handover material that quietly stops matching the system it
 * describes. A device is added, nobody rebuilds, and a new engineer is handed a
 * deck that is confidently wrong about the fleet.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..");
const KT = path.join(root, "Docs", "kt");

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

describe("the KT pack is wired up", () => {
  it("is reachable through npm, like everything else in this repository", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["docs:kt"]).toContain("build_kt_docs.py");
    expect(pkg.scripts["docs:kt:verify"]).toContain("verify_kt_docs.py");
  });

  it("has every module the entry point imports", () => {
    const entry = read("scripts/build_kt_docs.py");
    for (const mod of ["facts", "deck", "handbook", "quickref"]) {
      // Either import form is fine; what matters is that the module is named
      // and present.
      expect(entry).toMatch(new RegExp(`kt_docs(\\.${mod}\\b|\\s+import\\s+${mod}\\b)`));
      expect(fs.existsSync(path.join(root, "scripts", "kt_docs", `${mod}.py`))).toBe(true);
    }
  });

  it("ships the three artifacts it documents", () => {
    /*
     * These are committed on purpose, exactly like Docs/business. A handover
     * pack that has to be built before it can be read is one that gets skipped
     * on the morning somebody actually needs it.
     */
    for (const f of [
      "Circuvent-KT-Deck.pptx",
      "Circuvent-KT-Handbook.docx",
      "Circuvent-KT-Quick-Reference.pdf",
      "README.md",
    ]) {
      const p = path.join(KT, f);
      expect(fs.existsSync(p)).toBe(true);
      expect(fs.statSync(p).size).toBeGreaterThan(1000);
    }
  });
});

describe("the pack derives rather than restates", () => {
  const facts = read("scripts/kt_docs/facts.py");

  it("reads the device list from the firmware tree", () => {
    // A hand-typed device list is wrong the first time somebody adds a sketch,
    // and a handover deck is the last place that gets corrected.
    expect(facts).toMatch(/ROOT \/ "firmware"/);
    expect(facts).toMatch(/\*\.ino/);
  });

  it("reads the document index from Docs/", () => {
    expect(facts).toMatch(/DOCS\.glob\("\*\.md"\)/);
  });

  it("parses the traps table instead of copying it", () => {
    /*
     * That table is maintained in Docs/00 where new joiners already read it. A
     * second hand-typed copy would be stale the first time a row is added,
     * which is the exact failure this pack is supposed to prevent.
     */
    expect(facts).toMatch(/00-start-here\.md/);
    expect(facts).toMatch(/Traps/);
  });

  it("strips markdown so it cannot reach the page", () => {
    // Found by building the pack and looking at it: backticks and ** rendered
    // literally, and a link target printed beside its own text.
    expect(facts).toMatch(/def _plain/);
  });

  it("counts rather than remembers", () => {
    expect(facts).toMatch(/def counts/);
    expect(facts).not.toMatch(/"devices":\s*\d+/);
  });
});

describe("the pack does not borrow claims it cannot make", () => {
  it("stamps the repository and commit, not the product catalogue", () => {
    /*
     * The business documents are generated from the live catalogue and say so.
     * This pack is generated from the repository. Inheriting the other stamp
     * would have it assert a provenance nobody checked — so the deck, handbook
     * and quick reference each render their own.
     */
    for (const f of ["deck.py", "handbook.py", "quickref.py"]) {
      const src = read(path.join("scripts", "kt_docs", f));
      expect(src).toMatch(/from the repository/);
      expect(src).not.toMatch(/generated_stamp\(/);
    }
  });

  it("points at Docs/ as the source of truth", () => {
    expect(read("Docs/kt/README.md")).toMatch(/source of truth/i);
  });
});
