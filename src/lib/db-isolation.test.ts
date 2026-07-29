import { dataFingerprint, assertNotProductionData } from "./db";

// dev.circuvent.com served real customer accounts, orders and wallet balances
// because a Vercel variable scoped to "all environments" handed preview builds
// the production connection string. Nothing in the code objected. These tests
// pin the guard that now does.

const PROD_URL = "postgres://user:pw@ep-prod-123.eu-central-1.aws.neon.tech/main";
const DEV_URL = "postgres://user:pw@ep-dev-456.eu-central-1.aws.neon.tech/main";

const ENV_KEYS = ["PROD_DATA_FINGERPRINT", "VERCEL_ENV", "NODE_ENV"] as const;
type Saved = Partial<Record<(typeof ENV_KEYS)[number], string | undefined>>;

let saved: Saved = {};

function setEnv(key: (typeof ENV_KEYS)[number], value: string | undefined): void {
  // NODE_ENV is readonly in the Next.js type surface, so assign through a cast.
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[key];
  else env[key] = value;
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
});

afterEach(() => {
  for (const k of ENV_KEYS) setEnv(k, saved[k]);
});

describe("dataFingerprint", () => {
  it("is stable for the same URL", () => {
    expect(dataFingerprint(PROD_URL)).toBe(dataFingerprint(PROD_URL));
  });

  it("ignores surrounding whitespace, which is easy to paste in", () => {
    expect(dataFingerprint(`  ${PROD_URL}\n`)).toBe(dataFingerprint(PROD_URL));
  });

  it("differs between databases", () => {
    expect(dataFingerprint(DEV_URL)).not.toBe(dataFingerprint(PROD_URL));
  });

  it("does not disclose the connection string", () => {
    const fp = dataFingerprint(PROD_URL);
    expect(fp).toMatch(/^[0-9a-f]{16}$/);
    expect(PROD_URL).not.toContain(fp);
    for (const secret of ["user", "pw", "ep-prod-123"]) {
      expect(fp).not.toContain(secret);
    }
  });
});

describe("assertNotProductionData", () => {
  it("blocks a preview deployment holding the production database", () => {
    setEnv("PROD_DATA_FINGERPRINT", dataFingerprint(PROD_URL));
    setEnv("VERCEL_ENV", "preview");
    expect(() => assertNotProductionData(PROD_URL)).toThrow(/Refusing to use the production database/);
  });

  it("allows a preview deployment with its own database", () => {
    setEnv("PROD_DATA_FINGERPRINT", dataFingerprint(PROD_URL));
    setEnv("VERCEL_ENV", "preview");
    expect(() => assertNotProductionData(DEV_URL)).not.toThrow();
  });

  it("allows production to use the production database", () => {
    setEnv("PROD_DATA_FINGERPRINT", dataFingerprint(PROD_URL));
    setEnv("VERCEL_ENV", "production");
    expect(() => assertNotProductionData(PROD_URL)).not.toThrow();
  });

  it("does nothing when no fingerprint is configured", () => {
    setEnv("PROD_DATA_FINGERPRINT", undefined);
    setEnv("VERCEL_ENV", "preview");
    expect(() => assertNotProductionData(PROD_URL)).not.toThrow();
  });

  it("tolerates case and whitespace in the configured fingerprint", () => {
    setEnv("PROD_DATA_FINGERPRINT", `  ${dataFingerprint(PROD_URL).toUpperCase()} `);
    setEnv("VERCEL_ENV", "preview");
    expect(() => assertNotProductionData(PROD_URL)).toThrow(/Refusing to use the production database/);
  });

  it("blocks a local production-mode run outside Vercel too", () => {
    setEnv("PROD_DATA_FINGERPRINT", dataFingerprint(PROD_URL));
    setEnv("VERCEL_ENV", undefined);
    setEnv("NODE_ENV", "development");
    expect(() => assertNotProductionData(PROD_URL)).toThrow(/Refusing to use the production database/);
  });
});
