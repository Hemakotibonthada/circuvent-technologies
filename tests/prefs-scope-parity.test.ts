import { SCOPES } from "@/lib/user-prefs";
import { CONFIG_SCOPE, LABEL_SCOPE } from "../mobile/src/channel-prefs";

/*
 * The app and the site have to agree on a string, and nothing in either
 * compiler checks it. They did not agree.
 *
 * The app asked for "channel-config". The site has never had that scope, so the
 * request came back 400 "Unknown scope" every single time — and the app treats
 * any failed fetch as "we are offline, keep the cache", which is the correct
 * behaviour for a flaky network and completely wrong here. The result was that
 * channel types set on the web never reached the app, forever, with nothing
 * anywhere reporting a problem.
 *
 * These are two separate applications, one of which is not even built by the
 * same toolchain, so this test is the only place the mismatch can be caught.
 */
describe("the app asks for scopes the site actually has", () => {
  it.each([
    ["channel names", LABEL_SCOPE],
    ["channel types", CONFIG_SCOPE],
  ])("%s", (_what, scope) => {
    expect(SCOPES).toContain(scope);
  });

  /*
   * Named explicitly as well as checked against the list, because a rename on
   * the web side that updated both this test's expectation and the constant
   * would pass while silently orphaning every stored preference.
   */
  it("stores channel types where the console's own editor writes them", () => {
    expect(CONFIG_SCOPE).toBe("device-widgets");
    expect(LABEL_SCOPE).toBe("channel-labels");
  });
});
