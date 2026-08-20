/**
 * @jest-environment node
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { NAV, visibleNav, type NavItem } from "@/app/smarthome/ConsoleChrome";

/**
 * The Attendance section: it must appear for the accounts that run one, and
 * for nobody else.
 *
 * Both failure directions are silent, which is why they are pinned rather than
 * eyeballed:
 *
 *   - hidden when it should show → a school has readers on its doors, the
 *     control plane is recording every scan and computing a register, and the
 *     console shows no sign that any of it exists.
 *   - shown when it should not → a household with two lamps gets a school
 *     register whose every screen is empty, which reads as broken rather than
 *     as unbought.
 *
 * The ANPR section learned both of these the hard way; this is the same
 * mechanism, so the same guarantees are asserted rather than assumed to have
 * been inherited.
 */

const item = (nav: NavItem[], href: string) => nav.find((n) => n.href === href);
const attendance = (nav: NavItem[]) => item(nav, "/smarthome/attendance");

describe("the Attendance section", () => {
  it("is declared, and declared as conditional", () => {
    // A section added without `requires` is shown to everybody, which is the
    // failure the mechanism exists to prevent.
    const declared = attendance(NAV);
    expect(declared).toBeDefined();
    expect(declared?.label).toBe("Attendance");
    expect(declared?.requires).toBe("attendance");
  });

  it("has a route behind it", () => {
    // A nav entry pointing at nothing is worse than no nav entry: it is a 404
    // the user believes is their fault.
    const page = join(process.cwd(), "src/app/smarthome/attendance/page.tsx");
    expect(existsSync(page)).toBe(true);
  });

  it("is hidden from an account with no attendance system", () => {
    const nav = visibleNav(NAV, { isAdmin: false, hasAnpr: false, hasAttendance: false });
    expect(attendance(nav)).toBeUndefined();
  });

  it("appears once there is a reader or a site", () => {
    const nav = visibleNav(NAV, { isAdmin: false, hasAnpr: false, hasAttendance: true });
    expect(attendance(nav)).toBeDefined();
  });

  it("is hidden when the flag is simply missing", () => {
    /*
     * The default matters. `visibleNav` is called from more than one place and
     * an older caller that does not pass the flag must not accidentally show
     * the section to every household on the platform.
     */
    const nav = visibleNav(NAV, { isAdmin: false, hasAnpr: false });
    expect(attendance(nav)).toBeUndefined();
  });

  it("does not affect any other section", () => {
    const without = visibleNav(NAV, { isAdmin: false, hasAnpr: false, hasAttendance: false });
    const with_ = visibleNav(NAV, { isAdmin: false, hasAnpr: false, hasAttendance: true });
    const others = (nav: NavItem[]) =>
      nav.filter((n) => n.href !== "/smarthome/attendance").map((n) => n.href);
    expect(others(with_)).toEqual(others(without));
  });

  it("keeps the admin rule independent of it", () => {
    // Two orthogonal questions — one about the fleet, one about the person —
    // and a filter that conflated them would leak the admin section.
    const nav = visibleNav(NAV, { isAdmin: false, hasAnpr: false, hasAttendance: true });
    expect(item(nav, "/smarthome/admin")).toBeUndefined();
  });

  it("offers every tab the page implements", () => {
    /*
     * A tab in the nav with no panel behind it renders an empty section, and a
     * panel with no tab is unreachable. Both look like a bug in the feature
     * rather than in the wiring.
     */
    const tabs = attendance(NAV)?.tabs?.map((t) => t.id) ?? [];
    expect(tabs).toEqual([
      "live", "register", "people", "cards", "terminals", "schedules", "reports",
    ]);
  });
});

/**
 * The nav on a section-mounted hostname.
 *
 * attendance.circuvent.com serves one section. Every other entry in this nav
 * points at a path that hostname does not serve, and following one redirects
 * the operator off to the main site in the middle of what they were doing --
 * so the nav must not offer them.
 *
 * Both directions are silent again: too many entries is a nav that walks you
 * out of the product, too few on the main site is a console that lost its
 * sections.
 */
describe("nav on a mounted hostname", () => {
  const all = { isAdmin: true, hasAnpr: true, hasAttendance: true };

  it("shows only the attendance section on the attendance hostname", () => {
    const nav = visibleNav(NAV, { ...all, mountPrefix: "/smarthome/attendance" });
    expect(nav.map((n) => n.href)).toEqual(["/smarthome/attendance"]);
  });

  /*
   * home.circuvent.com mounts the whole console, not a section. Filtering it
   * to items under "/smarthome" would leave only the overview and strip every
   * other section from the console people actually use daily.
   */
  it("leaves the whole console intact on the console hostname", () => {
    const mounted = visibleNav(NAV, { ...all, mountPrefix: "/smarthome" });
    const main = visibleNav(NAV, { ...all, mountPrefix: null });
    expect(mounted).toEqual(main);
    expect(mounted.length).toBeGreaterThan(1);
  });

  it("is unchanged on the main site", () => {
    const withUndefined = visibleNav(NAV, all);
    const withNull = visibleNav(NAV, { ...all, mountPrefix: null });
    expect(withUndefined).toEqual(withNull);
    expect(withUndefined.length).toBeGreaterThan(1);
  });

  /*
   * The mount cannot resurrect a section the account should not see. A home
   * with no readers reaching attendance.circuvent.com gets an empty nav, not a
   * register it never bought.
   */
  it("still respects what the account has", () => {
    const nav = visibleNav(NAV, {
      isAdmin: true,
      hasAnpr: false,
      hasAttendance: false,
      mountPrefix: "/smarthome/attendance",
    });
    expect(nav).toEqual([]);
  });

  it("matches a section's own sub-paths, not a sibling with the same prefix", () => {
    const nav = visibleNav(
      [
        { href: "/smarthome/attendance", label: "Attendance" },
        { href: "/smarthome/attendance-archive", label: "Archive" },
      ] as NavItem[],
      { ...all, mountPrefix: "/smarthome/attendance" }
    );
    expect(nav.map((n) => n.href)).toEqual(["/smarthome/attendance"]);
  });
});
