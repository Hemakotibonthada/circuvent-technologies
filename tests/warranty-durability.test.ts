import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * Warranty data has to outlive the lambda that wrote it.
 *
 * The whole Warranty & RMA module was memory-only in production. The serverless
 * host has no writable disk, so `createFileStore` degraded to memory for the
 * life of one instance: a warranty registered when an order was marked
 * delivered went into whichever instance handled that click, and the panel —
 * served by a different instance — read an empty document. Every request
 * succeeded. Nothing was ever logged. The registrations were simply gone.
 *
 * Two halves have to stay true together, and each is silent on its own:
 *   - the store is created with `durable: true`, and
 *   - every route touching it awaits `revalidateWarranty()` first.
 *
 * A route that forgets the second reads an empty document and has its writes
 * refused, which is the original bug wearing a different hat.
 */

const ROOT = process.cwd();
const LIB = join(ROOT, "src", "lib", "admin-warranty.ts");

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe("warranty durability", () => {
  it("keeps the registrations in the database, not one instance's memory", () => {
    const source = readFileSync(LIB, "utf8");
    const call = source.match(/createFileStore<WarrantyDB>\([\s\S]*?\n\);/);
    expect(call).not.toBeNull();
    expect(call![0]).toMatch(/durable:\s*true/);
  });

  it("exposes the hydrate and flush a route needs", () => {
    const source = readFileSync(LIB, "utf8");
    expect(source).toMatch(/export async function revalidateWarranty/);
    expect(source).toMatch(/export async function flushWarranty/);
  });

  /*
   * Found by scanning rather than by listing the three routes that exist
   * today, so the next one to import this module is covered without anybody
   * remembering to come back here.
   */
  const consumers = walk(join(ROOT, "src", "app")).filter((f) =>
    /from "@\/lib\/admin-warranty"/.test(readFileSync(f, "utf8"))
  );

  it("finds the routes, so this cannot pass by scanning nothing", () => {
    expect(consumers.length).toBeGreaterThan(0);
  });

  it.each(consumers.map((f) => [f.slice(ROOT.length + 1).replace(/\\/g, "/"), f] as const))(
    "%s loads the document before using it",
    (_name, file) => {
      const source = readFileSync(file, "utf8");
      expect(source).toMatch(/await revalidateWarranty\(\)/);
    }
  );

  it("awaits the write on the delivery path before responding", () => {
    /*
     * The orders route is where delivery starts cover. Returning before the
     * write lands freezes the lambda mid-flush and loses exactly the rows this
     * whole fix exists to create.
     */
    const orders = readFileSync(
      join(ROOT, "src", "app", "api", "admin", "orders", "route.ts"),
      "utf8"
    );
    expect(orders).toMatch(/await flushWarranty\(\)/);
  });
});
