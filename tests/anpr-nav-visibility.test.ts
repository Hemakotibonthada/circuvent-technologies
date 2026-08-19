/**
 * @jest-environment node
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { NAV, visibleNav, type NavItem } from "@/app/smarthome/ConsoleChrome";

/**
 * The ANPR Camera section: it must appear for the accounts that have one, and
 * for nobody else.
 *
 * Both failure directions are silent, which is why they are pinned here rather
 * than left to be noticed:
 *
 *   - hidden when it should show → indistinguishable from a feature that was
 *     never shipped. The control plane is reading plates, storing them and
 *     emailing a daily report, and the console shows no sign of it.
 *   - shown when it should not → a household with two lamps gets a
 *     gate-management section whose plate log is permanently empty, which
 *     reads as broken rather than as unbought.
 *
 * The third case is the one that actually bit during development: *both* homes
 * visible at once. Security's Vehicles tab and the dedicated section render the
 * same component, so two copies disagree about which tab they are on and
 * whichever the user bookmarked is the one that appears not to save.
 */

const item = (nav: NavItem[], href: string) => nav.find((n) => n.href === href);
const security = (nav: NavItem[]) => item(nav, "/smarthome/security");
const anpr = (nav: NavItem[]) => item(nav, "/smarthome/anpr");
const hasVehiclesTab = (n: NavItem | undefined) => !!n?.tabs?.some((t) => t.id === "vehicles");

describe("the ANPR Camera section", () => {
  it("is declared, and declared as conditional", () => {
    // A section added without `requires` is shown to everybody, which is the
    // failure this whole mechanism exists to prevent.
    const declared = anpr(NAV);
    expect(declared).toBeDefined();
    expect(declared?.label).toBe("ANPR Camera");
    expect(declared?.requires).toBe("anpr");
  });

  it("has a route behind it", () => {
    // A nav entry pointing at nothing is worse than no nav entry: it is a
    // 404 the user believes is their fault.
    const route = join(__dirname, "..", "src", "app", "smarthome", "anpr", "page.tsx");
    expect(existsSync(route)).toBe(true);
  });

  it("is hidden from an account with no number-plate camera", () => {
    const nav = visibleNav(NAV, { isAdmin: false, hasAnpr: false });
    expect(anpr(nav)).toBeUndefined();
  });

  it("appears once the account has one", () => {
    const nav = visibleNav(NAV, { isAdmin: false, hasAnpr: true });
    expect(anpr(nav)).toBeDefined();
  });

  it("does not depend on being an administrator", () => {
    /*
     * `adminOnly` is about the person and `requires` about the fleet. Conflating
     * them would hide a household's own gate log from the household.
     */
    expect(anpr(visibleNav(NAV, { isAdmin: false, hasAnpr: true }))).toBeDefined();
    expect(item(visibleNav(NAV, { isAdmin: false, hasAnpr: true }), "/smarthome/admin")).toBeUndefined();
    expect(item(visibleNav(NAV, { isAdmin: true, hasAnpr: true }), "/smarthome/admin")).toBeDefined();
  });
});

describe("exactly one home for vehicles", () => {
  it("keeps Security's Vehicles tab while there is no dedicated section", () => {
    /*
     * This is the way in. The Cameras view inside it is where an ordinary
     * camera is enrolled as an ANPR lane, so removing it before the dedicated
     * section exists would leave no route to switching the feature on at all —
     * and the section that would offer it only appears *after* it is on.
     */
    const nav = visibleNav(NAV, { isAdmin: false, hasAnpr: false });
    expect(hasVehiclesTab(security(nav))).toBe(true);
  });

  it("gives it up once the dedicated section is showing", () => {
    const nav = visibleNav(NAV, { isAdmin: false, hasAnpr: true });
    expect(hasVehiclesTab(security(nav))).toBe(false);
  });

  it("never shows both at once", () => {
    for (const hasAnpr of [false, true]) {
      const nav = visibleNav(NAV, { isAdmin: true, hasAnpr });
      const homes = [anpr(nav) ? 1 : 0, hasVehiclesTab(security(nav)) ? 1 : 0].reduce((a, b) => a + b, 0);
      expect(homes).toBe(1);
    }
  });

  it("leaves the rest of Security alone", () => {
    // Filtering one tab must not disturb the others, and must not mutate the
    // shared NAV literal — the next render would then filter an already
    // filtered list and drop a second tab.
    const nav = visibleNav(NAV, { isAdmin: false, hasAnpr: true });
    expect(security(nav)?.tabs?.map((t) => t.id)).toEqual(["alerts", "access", "cameras", "modes"]);
    expect(hasVehiclesTab(security(NAV))).toBe(true);
  });
});

describe("the section's tabs", () => {
  it("match the panels the page actually renders", () => {
    /*
     * The chrome declares the tabs for the command palette and the page
     * declares them again for its own tab strip. A palette entry for a tab the
     * page has no panel for silently lands on the first tab instead, which
     * reads as the link being broken.
     */
    const page = readFileSync(
      join(__dirname, "..", "src", "app", "smarthome", "anpr", "page.tsx"),
      "utf8"
    );
    for (const tab of anpr(NAV)?.tabs ?? []) {
      expect(page).toContain(`id: "${tab.id}"`);
      expect(page).toMatch(new RegExp(`\\b${tab.id}:\\s*\\(\\)\\s*=>`));
    }
  });
});
