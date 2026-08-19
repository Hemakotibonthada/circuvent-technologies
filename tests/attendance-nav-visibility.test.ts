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
