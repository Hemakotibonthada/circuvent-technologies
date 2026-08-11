import fs from "node:fs";
import path from "node:path";
import { WARRANTY_MONTHS, RETURN_DAYS, POLICY_LINKS } from "@/lib/shop-policy";
import { SHIPPING } from "@/lib/shop-data";

const APP = path.join(process.cwd(), "src", "app");
const read = (p: string) => fs.readFileSync(path.join(APP, p), "utf8");

/*
 * The product page quotes these terms beside the buy button. If a policy page
 * is edited without updating `shop-policy.ts`, the storefront would keep
 * advertising terms the company no longer offers — so pin them together.
 */
describe("shop policy terms match the policy pages", () => {
  it("warranty length matches /warranty", () => {
    const page = read("warranty/page.tsx");
    expect(page).toContain(`${WARRANTY_MONTHS}-month limited`);
    // Guard against a second, different figure being introduced on the page.
    const others = page.match(/(\d+)-month limited/g) ?? [];
    expect(new Set(others)).toEqual(new Set([`${WARRANTY_MONTHS}-month limited`]));
  });

  it("return window matches /returns-policy", () => {
    expect(read("returns-policy/page.tsx")).toContain(`within ${RETURN_DAYS} days of delivery`);
  });

  it("return window matches the FAQ answer", () => {
    expect(read("faq/page.tsx")).toContain(`${RETURN_DAYS} days from delivery`);
  });

  it("every policy page linked from the product page exists", () => {
    for (const href of Object.values(POLICY_LINKS)) {
      const dir = path.join(APP, href.replace(/^\//, ""));
      expect(fs.existsSync(path.join(dir, "page.tsx"))).toBe(true);
    }
  });

  it("free-shipping threshold is a real number the cart also uses", () => {
    expect(SHIPPING.freeOver).toBeGreaterThan(0);
    expect(SHIPPING.symbol).toBe("₹");
  });

  /*
   * The warranty length was previously spelled out as a literal in three
   * separate shop components. Each was a copy that would not have been updated
   * with the policy, so a change to /warranty would have left the storefront
   * advertising cover the company no longer gives.
   */
  it("no shop component hardcodes the warranty length", () => {
    const dir = path.join(process.cwd(), "src", "components", "shop");
    const offenders = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith(".tsx"))
      .filter((f) => /\b\d+-month warranty/.test(fs.readFileSync(path.join(dir, f), "utf8")));
    expect(offenders).toEqual([]);
  });
});
