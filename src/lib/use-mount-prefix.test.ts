import { renderedPathFor } from "./use-mount-prefix";
import { mountPrefixFor } from "./host-mounts";

/**
 * The bug these cover.
 *
 * home.circuvent.com is rewritten onto /smarthome, and a rewrite deliberately
 * leaves the address bar alone. Client code that asked "is this the admin
 * console?" compared the address bar against /smarthome/admin, which is never
 * what the browser shows on that hostname -- so the staff control plane was
 * handed the *consumer* device login, and single sign-on could not be reached
 * at all. Nothing threw; the wrong component simply rendered.
 */
describe("renderedPathFor", () => {
  it("puts the mount prefix back on a mounted hostname", () => {
    const prefix = mountPrefixFor("home.circuvent.com");
    expect(prefix).toBe("/smarthome");
    expect(renderedPathFor(prefix, "/admin")).toBe("/smarthome/admin");
    expect(renderedPathFor(prefix, "/admin/fleet")).toBe("/smarthome/admin/fleet");
  });

  it("treats the root of a mounted hostname as the subtree root", () => {
    expect(renderedPathFor("/smarthome", "/")).toBe("/smarthome");
  });

  it("leaves the main site alone", () => {
    expect(mountPrefixFor("circuvent.com")).toBeNull();
    expect(renderedPathFor(null, "/smarthome/admin")).toBe("/smarthome/admin");
    expect(renderedPathFor(null, "/admin")).toBe("/admin");
  });

  it("does not double up a path that already carries the prefix", () => {
    // A link written for the main site, followed on the subdomain. The proxy
    // leaves these alone, so the browser really can sit at /smarthome/admin
    // while the hostname is mounted.
    expect(renderedPathFor("/smarthome", "/smarthome/admin")).toBe("/smarthome/admin");
    expect(renderedPathFor("/smarthome", "/smarthome")).toBe("/smarthome");
  });

  it("survives a null pathname", () => {
    expect(renderedPathFor("/smarthome", null)).toBe("/smarthome");
    expect(renderedPathFor(null, null)).toBe("/");
  });

  it("covers iot.circuvent.com, which is mounted on the same subtree", () => {
    expect(renderedPathFor(mountPrefixFor("iot.circuvent.com"), "/admin")).toBe(
      "/smarthome/admin"
    );
  });

  it("is what the admin bypass actually tests", () => {
    // ConsoleChrome waives the consumer sign-in on this condition. Asserted
    // here because getting it wrong is invisible: the console renders, it is
    // just the wrong one.
    const onMountedHost = renderedPathFor(mountPrefixFor("home.circuvent.com"), "/admin");
    const onMainSite = renderedPathFor(mountPrefixFor("circuvent.com"), "/smarthome/admin");
    expect(onMountedHost.startsWith("/smarthome/admin")).toBe(true);
    expect(onMainSite.startsWith("/smarthome/admin")).toBe(true);

    // And the consumer console must still get the consumer chrome.
    expect(
      renderedPathFor(mountPrefixFor("home.circuvent.com"), "/devices").startsWith(
        "/smarthome/admin"
      )
    ).toBe(false);
  });
});
