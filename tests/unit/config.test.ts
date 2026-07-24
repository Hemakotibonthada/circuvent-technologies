import { SITE_URL, siteConfig, validateEnv, isDbConfigured } from "@/lib/config";

describe("config", () => {
  it("exposes a normalized canonical site URL (no trailing slash)", () => {
    expect(SITE_URL).toMatch(/^https:\/\//);
    expect(SITE_URL.endsWith("/")).toBe(false);
  });

  it("uses circuvent.com as the default domain", () => {
    // NEXT_PUBLIC_SITE_URL is unset in the test env.
    expect(SITE_URL).toContain("circuvent.com");
  });

  it("brands with the /logo-mark.png asset", () => {
    expect(siteConfig.logo).toBe("/logo-mark.png");
  });

  it("does not enforce prod-only vars outside production", () => {
    // NODE_ENV is 'test' here, so DATABASE_URL/ACCOUNT_SECRET are not required.
    const report = validateEnv();
    expect(report.ok).toBe(true);
    expect(Array.isArray(report.warnings)).toBe(true);
  });

  it("reports database configuration from the environment", () => {
    expect(isDbConfigured()).toBe(!!process.env.DATABASE_URL);
  });
});
