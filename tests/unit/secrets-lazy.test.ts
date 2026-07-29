/**
 * The build must never depend on a runtime secret, but a request that needs
 * one must still fail closed. `next build` imports every route module to
 * collect page data, so resolving the session key at module scope turned a
 * missing ACCOUNT_SECRET into a failed deploy.
 */
describe("lazySecret", () => {
  const ORIGINAL = process.env.ACCOUNT_SECRET;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ACCOUNT_SECRET;
    else process.env.ACCOUNT_SECRET = ORIGINAL;
    (process.env as Record<string, string>).NODE_ENV = "test";
  });

  function load() {
    let mod!: typeof import("@/lib/secrets");
    jest.isolateModules(() => {
      mod = require("@/lib/secrets") as typeof import("@/lib/secrets");
    });
    return mod;
  }

  it("does not read the environment until the secret is used", () => {
    delete process.env.ACCOUNT_SECRET;
    (process.env as Record<string, string>).NODE_ENV = "production";

    // Importing and building the accessor must be side-effect free: this is
    // exactly what `next build` does for every route module.
    const { lazySecret } = load();
    const get = expect(() => lazySecret(["ACCOUNT_SECRET"], "customer sessions"));
    get.not.toThrow();
  });

  it("fails closed in production when the secret is missing", () => {
    delete process.env.ACCOUNT_SECRET;
    (process.env as Record<string, string>).NODE_ENV = "production";

    const { lazySecret } = load();
    const get = lazySecret(["ACCOUNT_SECRET"], "customer sessions");
    expect(() => get()).toThrow(/ACCOUNT_SECRET is not set/);
  });

  it("rejects a secret too short to sign with in production", () => {
    process.env.ACCOUNT_SECRET = "short";
    (process.env as Record<string, string>).NODE_ENV = "production";

    const { lazySecret } = load();
    const get = lazySecret(["ACCOUNT_SECRET"], "customer sessions");
    expect(() => get()).toThrow(/too short/);
  });

  it("returns the configured secret and memoises it", () => {
    process.env.ACCOUNT_SECRET = "x".repeat(48);
    (process.env as Record<string, string>).NODE_ENV = "production";

    const { lazySecret } = load();
    const get = lazySecret(["ACCOUNT_SECRET"], "customer sessions");
    expect(get()).toBe("x".repeat(48));
    delete process.env.ACCOUNT_SECRET;
    expect(get()).toBe("x".repeat(48));
  });
});
