/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * The admin console decides what to show twice.
 *
 * `src/lib/admin-auth.ts` holds ROLE_AREAS for the server, which is what the
 * API guard enforces. `src/app/admin/page.tsx` holds a second ROLE_AREAS for
 * the browser, which is what decides whether a tab is drawn. They are separate
 * literals with no type shared between them.
 *
 * Adding an area to one and not the other produces the worst kind of failure:
 * nothing errors, nothing logs, the tests pass, the API works perfectly — and
 * the feature is simply invisible, because the button that would reach it is
 * never rendered. That is exactly what happened when the ICM and App Insights
 * areas were added: the routes were live and guarded, and the nav had no entry
 * for them at all.
 *
 * It was only caught by loading the page in a browser and reading the buttons.
 * This test is the cheaper version of that.
 */
const read = (...p: string[]) => readFileSync(join(__dirname, "..", "src", ...p), "utf8");

/** Pulls one role's area list out of a ROLE_AREAS literal. */
function areasIn(src: string, role: string): string[] {
  const marker = new RegExp(`\\b${role}\\s*:\\s*\\[`);
  const m = marker.exec(src);
  if (!m) return [];
  const start = m.index + m[0].length;
  const end = src.indexOf("]", start);
  return [...src.slice(start, end).matchAll(/"([a-z]+)"/g)].map((x) => x[1]);
}

const server = read("lib", "admin-auth.ts");
const client = read("app", "admin", "page.tsx");

/*
 * The client table is the smaller of the two: it also carries tab-only keys
 * like "messages", "devices" and "users" that are not server areas, because
 * some tabs read endpoints guarded under a different area. So the invariant is
 * one-directional — anything the server grants a role must be reachable in the
 * nav, not the reverse.
 */
const ROLES = ["superadmin", "manager", "inventory", "orders", "support"];

/*
 * Server areas that are deliberately not tabs.
 *
 * "settings" guards the account endpoints — 2FA, passkeys, password rotation —
 * which are reached from the buttons in the console header rather than from a
 * tab in the nav. It is a real area with a real guard and no tab, so it has to
 * be named here rather than silently widening the check for everything.
 */
const NOT_TABS = new Set(["settings"]);

describe("the two role tables agree", () => {
  it.each(ROLES)("%s can reach every area the server grants it", (role) => {
    const granted = areasIn(server, role).filter((a) => !NOT_TABS.has(a));
    const visible = areasIn(client, role);
    expect(granted.length).toBeGreaterThan(0);
    expect(visible.length).toBeGreaterThan(0);

    const unreachable = granted.filter((a) => !visible.includes(a));
    expect(unreachable).toEqual([]);
  });

  /*
   * The specific regression, named. These two are the reason this file exists.
   */
  it("shows incidents and telemetry to superadmin", () => {
    const visible = areasIn(client, "superadmin");
    expect(visible).toContain("icm");
    expect(visible).toContain("insights");
  });

  it("shows incidents to support without showing them telemetry", () => {
    const visible = areasIn(client, "support");
    expect(visible).toContain("icm");
    expect(visible).not.toContain("insights");
  });
});

describe("every tab is reachable", () => {
  /*
   * A tab in TAB_META that no role can see is dead code that looks like a
   * feature. A category with no tabs renders as an empty heading.
   */
  const tabKeys = [...client.matchAll(/^\s{2}([a-z]+):\s*\{\s*label:/gm)].map((m) => m[1]);
  const allVisible = new Set(ROLES.flatMap((r) => areasIn(client, r)));

  it("found the tab registry", () => {
    expect(tabKeys.length).toBeGreaterThan(20);
  });

  it("has no tab that nobody can see", () => {
    const orphans = tabKeys.filter((k) => !allVisible.has(k));
    expect(orphans).toEqual([]);
  });

  it("puts every tab in a category that exists", () => {
    const categories = new Set(
      [...client.matchAll(/\{\s*id:\s*"([a-z]+)",\s*label:/g)].map((m) => m[1])
    );
    const used = new Set([...client.matchAll(/category:\s*"([a-z]+)"/g)].map((m) => m[1]));
    for (const c of used) expect(categories.has(c)).toBe(true);
  });

  it("has no category with no tabs", () => {
    const categories = [...client.matchAll(/\{\s*id:\s*"([a-z]+)",\s*label:/g)].map((m) => m[1]);
    const used = new Set([...client.matchAll(/category:\s*"([a-z]+)"/g)].map((m) => m[1]));
    const empty = categories.filter((c) => !used.has(c));
    expect(empty).toEqual([]);
  });
});
