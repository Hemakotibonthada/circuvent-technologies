/**
 * @jest-environment node
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

/*
 * The admin console can see which phones are signed in, on what build, from
 * what address. That is standard, useful, and the same thing every bank and
 * every developer platform shows.
 *
 * What it must not become is a location tracker. The app asks for location
 * permission to show the weather; sending coordinates to the platform under a
 * different heading would be using a permission for a purpose it was not
 * granted for, which is exactly what purpose limitation under India's DPDP Act
 * and the GDPR forbids.
 *
 * That boundary is one line of code away at all times — the app already has the
 * permission and already has an API client — so it is pinned here rather than
 * left to whoever next needs "a bit more detail".
 */
const root = join(__dirname, "..");
const read = (...p: string[]) => readFileSync(join(root, ...p), "utf8");

const installs = read("platform", "api", "src", "app-installs.ts");
const mobileInstall = read("mobile", "src", "install.ts");
const panel = read("src", "app", "admin", "AppInstallsPanel.tsx");
const schema = read("platform", "api", "src", "db.ts");

describe("the install registry collects no coordinates", () => {
  /* The table has no columns to put them in, which is the strongest form of
     this guarantee: adding one is a schema change somebody has to justify. */
  it("has no latitude or longitude column", () => {
    const table = schema.slice(schema.indexOf("CREATE TABLE IF NOT EXISTS app_installs"));
    const body = table.slice(0, table.indexOf(");"));
    expect(body).not.toMatch(/\blat(itude)?\b/i);
    expect(body).not.toMatch(/\blon(g|gitude)?\b/i);
    expect(body).not.toMatch(/\bcoord/i);
    expect(body).not.toMatch(/\bgps\b/i);
  });

  it("records only what the request itself carries", () => {
    expect(installs).not.toMatch(/\blatitude\b/i);
    expect(installs).not.toMatch(/\bcoords\b/i);
    /* IP and edge-supplied city are the whole of it. */
    expect(installs).toContain("clientIp");
    expect(installs).toContain("geoFrom");
  });

  /*
   * The app is the other half. It already holds location permission and
   * already has an API client, so the only thing stopping it sending
   * coordinates is that it does not.
   */
  it("the app sends no location with its install headers", () => {
    expect(mobileInstall).not.toMatch(/expo-location/);
    expect(mobileInstall).not.toMatch(/getCurrentPosition/);
    expect(mobileInstall).not.toMatch(/\bcoords\b/);
    expect(mobileInstall).not.toMatch(/x-cv-(lat|lon|geo|location)/i);
  });

  /*
   * And it does not use a hardware identifier. Those are what a phone's privacy
   * model exists to prevent, and none of them are needed — the id only has to
   * stay stable for one install of one app.
   */
  it("uses a random install id rather than a device identifier", () => {
    expect(mobileInstall).not.toMatch(/androidId|getUniqueId|identifierForVendor|advertisingId|imei/i);
    expect(mobileInstall).toMatch(/Math\.random/);
  });
});

describe("geolocation is never invented", () => {
  /*
   * Nothing looks an address up. A plausible-but-wrong city is worse than an
   * empty one, because "signed in from Mumbai" is the sort of thing somebody
   * acts on — an account gets locked, a customer gets accused.
   */
  it("does no lookup of its own", () => {
    expect(installs).not.toMatch(/fetch\(/);
    expect(installs).not.toMatch(/maxmind|geoip|ipapi|ipinfo/i);
  });

  it("reads the edge's headers and nothing else", () => {
    for (const h of ["cf-ipcity", "cf-ipcountry", "x-vercel-ip-city", "x-geo-city"]) {
      expect(installs).toContain(h);
    }
  });

  it("the panel hides the location line when there is none", () => {
    expect(panel).toMatch(/\(r\.lastCity \|\| r\.lastCountry\) &&/);
  });
});

describe("the account holder sees what staff see", () => {
  /*
   * This is what makes an admin view defensible rather than creepy, and it is
   * the more useful half: the person who knows a phone was sold last year is
   * the person who owns it.
   */
  const account = read("platform", "api", "src", "routes", "account.ts");

  it("exposes the same list to the user", () => {
    expect(account).toContain('accountRouter.get("/sessions"');
    expect(account).toContain("listForUser");
  });

  it("lets them sign a device out", () => {
    expect(account).toContain('accountRouter.delete("/sessions/:installId"');
    expect(account).toContain("markRevoked");
    /*
     * And actually ends the session rather than only recording that it was
     * ended. The token is what grants access; marking a row without bumping the
     * epoch would be a sign-out button that does nothing, which is worse than
     * not having one.
     */
    expect(account).toContain("revokeAllSessions");
  });

  it("is honest that signing out one device signs out all of them", () => {
    expect(account).toContain("signedOutEverywhere");
  });
});

describe("the console says what it holds", () => {
  /* Written on the screen, not only in a commit message. */
  it("explains the location source to whoever is reading it", () => {
    expect(panel).toMatch(/derived from the connecting IP/i);
    expect(panel).toMatch(/do not report GPS/i);
  });
});
