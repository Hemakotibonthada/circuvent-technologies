/**
 * @jest-environment node
 *
 * Node rather than jsdom: these assertions turn on `fetch` never being called,
 * and jsdom does not provide one to spy on. See Docs/24 — the same trap that
 * catches API-route tests.
 *
 * A non-production deployment must not authenticate a production customer.
 *
 * THE HOLE THIS CLOSES
 *
 * dev.circuvent.com has its own Neon database, and `assertNotProductionData`
 * correctly stops it opening production's. Production users could still sign in
 * to it anyway, because identity does not travel through the database:
 *
 *   1. POST /api/account/login misses in the dev database — it is a fresh one.
 *   2. The route falls back to verifyAgainstControlPlane().
 *   3. CONTROL_PLANE_URL defaults to https://api.circuvent.com, of which there
 *      is exactly one, so the *live fleet* checks the password.
 *   4. It vouches, and the route then creates that customer in the dev database
 *      with a scrypt hash of their real password.
 *
 * So production users could sign in to dev, and dev quietly accumulated live
 * credentials while doing it. The existing guard never fired because step 3 is
 * an outbound HTTPS call that never touches the shop database.
 *
 * These tests pin the environment rule and — just as importantly — the two
 * properties that make it safe to deploy: it is inert until configured, and it
 * never applies to production.
 */

const ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ENV };
  jest.resetModules();
});

async function loadSso(env: Record<string, string | undefined>) {
  process.env = { ...ENV, ...env };
  jest.resetModules();
  return import("@/lib/sso");
}

describe("federation is refused off production", () => {
  it("refuses when a preview build points at a listed production control plane", async () => {
    const sso = await loadSso({
      VERCEL_ENV: "preview",
      CONTROL_PLANE_URL: "https://api.circuvent.com",
      PROD_IDENTITY_HOSTS: "api.circuvent.com",
    });
    expect(sso.federationAllowedHere()).toBe(false);
  });

  it("allows production to use its own control plane", async () => {
    /*
     * The guard must never fire on production. That is what makes an
     * over-broad list harmless: the worst case is a host nobody listed going
     * unguarded, never production refusing its own logins.
     */
    const sso = await loadSso({
      VERCEL_ENV: "production",
      CONTROL_PLANE_URL: "https://api.circuvent.com",
      PROD_IDENTITY_HOSTS: "api.circuvent.com",
    });
    expect(sso.federationAllowedHere()).toBe(true);
  });

  it("allows a preview build paired with its own control plane", async () => {
    // The rule is about *which* fleet is being asked, not about being dev.
    const sso = await loadSso({
      VERCEL_ENV: "preview",
      CONTROL_PLANE_URL: "https://api-dev.circuvent.com",
      PROD_IDENTITY_HOSTS: "api.circuvent.com",
    });
    expect(sso.federationAllowedHere()).toBe(true);
  });

  it("is inert until somebody lists a host", async () => {
    /*
     * An unset variable must not turn federation off everywhere. Deploying a
     * guard that silently breaks sign-in for app-only customers would be a
     * worse outage than the hole it closes.
     */
    const sso = await loadSso({
      VERCEL_ENV: "preview",
      CONTROL_PLANE_URL: "https://api.circuvent.com",
      PROD_IDENTITY_HOSTS: "",
    });
    expect(sso.federationAllowedHere()).toBe(true);
  });

  it("ignores scheme, port, path and case when comparing hosts", async () => {
    // The list is written by a person, and a trailing slash must not be the
    // difference between a guard and no guard.
    const sso = await loadSso({
      VERCEL_ENV: "preview",
      CONTROL_PLANE_URL: "https://API.Circuvent.com:443/",
      PROD_IDENTITY_HOSTS: " api.circuvent.com , other.example ",
    });
    expect(sso.federationAllowedHere()).toBe(false);
  });

  it("treats a local dev server as non-production", async () => {
    /*
     * A laptop running `npm run dev` has no VERCEL_ENV at all, and it could
     * authenticate real customers against the live fleet just as easily as a
     * preview deployment could.
     */
    const sso = await loadSso({
      VERCEL_ENV: undefined,
      NODE_ENV: "development",
      CONTROL_PLANE_URL: "https://api.circuvent.com",
      PROD_IDENTITY_HOSTS: "api.circuvent.com",
    });
    expect(sso.federationAllowedHere()).toBe(false);
  });
});

describe("the refusal reaches the paths that matter", () => {
  it("declines to check a password against the live fleet", async () => {
    const sso = await loadSso({
      VERCEL_ENV: "preview",
      CONTROL_PLANE_URL: "https://api.circuvent.com",
      PROD_IDENTITY_HOSTS: "api.circuvent.com",
    });
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    const out = await sso.verifyAgainstControlPlane("real@customer.com", "their-real-password");
    expect(out).toBeNull();
    // The point is not only the null — it is that the live fleet was never
    // asked, so a preview build cannot be used to test credentials against it.
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("declines to mint a console session even holding the secret", async () => {
    /*
     * mintConsoleSession is already gated on FEDERATION_SECRET, but a preview
     * deployment that happens to hold the production secret would otherwise
     * mint live console sessions. Holding the secret is not the same as being
     * entitled to use it.
     */
    const sso = await loadSso({
      VERCEL_ENV: "preview",
      CONTROL_PLANE_URL: "https://api.circuvent.com",
      PROD_IDENTITY_HOSTS: "api.circuvent.com",
      FEDERATION_SECRET: "x".repeat(48),
    });
    const fetchSpy = jest.spyOn(globalThis, "fetch");
    expect(await sso.mintConsoleSession("real@customer.com")).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("returns null rather than throwing, so a refusal looks like a bad password", async () => {
    /*
     * Throwing would turn "this account does not exist here" into a 500, and a
     * 500 that only happens for addresses that exist on the live fleet is an
     * account-enumeration oracle. The refusal has to be indistinguishable from
     * credentials that did not match.
     */
    const sso = await loadSso({
      VERCEL_ENV: "preview",
      CONTROL_PLANE_URL: "https://api.circuvent.com",
      PROD_IDENTITY_HOSTS: "api.circuvent.com",
    });
    await expect(sso.verifyAgainstControlPlane("a@b.com", "pw")).resolves.toBeNull();
  });
});
