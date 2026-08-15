/**
 * Every section padding used on a page must be mapped to the density system.
 *
 * WHAT WENT WRONG
 *
 * `globals.css` resolves section rhythm from `data-density`, so that one
 * setting moves the whole site's vertical spacing. It mapped three padding
 * steps — py-20, py-24, py-32 — and the site uses six. The other forty-six
 * sections kept their raw Tailwind values and ignored the density control
 * completely.
 *
 * Nothing errored. The setting moved, a third of the page responded, and the
 * sections that stayed put ended up tighter than their neighbours at every
 * density. It surfaced as the team page's "Founding Team" heading looking
 * cramped: py-12 between two py-20 siblings is 48px against 56px at cozy
 * density, and 48px against 80px at default.
 *
 * That is this codebase's signature defect — a control that is present, wired,
 * and quietly does nothing to most of what it claims to govern. So the mapping
 * is asserted rather than trusted.
 */
import fs from "node:fs";
import path from "node:path";

const root = path.join(__dirname, "..");
const css = fs.readFileSync(path.join(root, "src", "app", "globals.css"), "utf8");

/*
 * Printable documents are deliberately outside the density system. An invoice
 * or warranty certificate is printed at a fixed size, so its geometry must not
 * move with a reader's browsing-comfort preference. This is an exclusion, not
 * an oversight — anything added here needs the same justification.
 */
const NOT_DENSITY_SCALED = [path.join("shop", "invoice")];

/** Every `py-N` used on a <section> in the app tree. */
function sectionPaddings(): Map<number, string[]> {
  const found = new Map<number, string[]>();
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
        walk(p);
        continue;
      }
      if (!entry.name.endsWith(".tsx")) continue;
      const rel = path.relative(root, p);
      if (NOT_DENSITY_SCALED.some((skip) => rel.includes(skip))) continue;
      const src = fs.readFileSync(p, "utf8");
      for (const m of src.matchAll(/<section[^>]*className="[^"]*\bpy-(\d+)\b/g)) {
        const n = Number(m[1]);
        const list = found.get(n) ?? [];
        list.push(rel);
        found.set(n, list);
      }
    }
  };
  walk(path.join(root, "src", "app"));
  return found;
}

/** Padding steps globals.css actually resolves from the density variables. */
function mappedSteps(): Set<number> {
  const out = new Set<number>();
  for (const m of css.matchAll(/section\.py-(\d+)\s*\{[^}]*--cv-sec-py/g)) {
    out.add(Number(m[1]));
  }
  return out;
}

describe("section padding is density-aware", () => {
  it("finds the sections and the mapping", () => {
    expect(sectionPaddings().size).toBeGreaterThan(2);
    expect(mappedSteps().size).toBeGreaterThan(2);
  });

  it("maps every padding step a section actually uses", () => {
    /*
     * The failure this catches is silent by construction: an unmapped step
     * renders at its raw Tailwind value and simply stops responding to the
     * density control. Nobody sees an error, and the page just looks
     * inconsistent at one setting.
     */
    const mapped = mappedSteps();
    const unmapped = [...sectionPaddings().entries()]
      .filter(([step]) => !mapped.has(step))
      .map(([step, files]) => `py-${step} (${files.length} sections, e.g. ${files[0]})`);

    expect(unmapped).toEqual([]);
  });

  it("scales every mapped step down as density tightens", () => {
    /*
     * A variable that is declared at the root and never redeclared for cozy or
     * compact is mapped in name only — the section would be density-aware and
     * still never move.
     */
    const vars = [...css.matchAll(/section\.py-\d+\s*\{[^}]*var\((--cv-sec-py[\w-]*)\)/g)]
      .map((m) => m[1]);
    expect(vars.length).toBeGreaterThan(2);

    for (const v of new Set(vars)) {
      for (const density of ["cozy", "compact"]) {
        const block = css.match(
          new RegExp(`html\\[data-density="${density}"\\]\\s*\\{([^}]*)\\}`)
        );
        expect(block).not.toBeNull();
        expect(block![1]).toContain(`${v}:`);
      }
    }
  });
});

describe("the team page reads evenly", () => {
  const page = fs.readFileSync(path.join(root, "src", "app", "team", "page.tsx"), "utf8");

  it("gives every content section on the page the same rhythm", () => {
    /*
     * The reported symptom. Founding Team was py-12 between py-20 siblings, so
     * its heading sat closer to the block above than any other on the page.
     * The hero is deliberately excluded: it carries pt-32 to clear the fixed
     * nav, which is a different job.
     */
    const steps = [...page.matchAll(/<section[^>]*className="[^"]*\bpy-(\d+)\b/g)]
      .map((m) => Number(m[1]));
    expect(steps.length).toBeGreaterThan(2);
    expect(new Set(steps).size).toBe(1);
  });
});
