import { normaliseDataHost, assertNotProductionData } from "./db";

// dev.circuvent.com served real customer accounts, orders and wallet balances
// because a Vercel variable scoped to "all environments" handed preview builds
// the production connection string. Nothing in the code objected. These tests
// pin the guard that now does.

const PROD_HOST = "ep-bitter-king-azky3gdq.c-3.ap-southeast-1.aws.neon.tech";
const DEV_HOST = "ep-damp-unit-azirxrfa.c-3.ap-southeast-1.aws.neon.tech";
const prodUrl = (host = PROD_HOST) => `postgresql://u:p@${host}/neondb?sslmode=require`;
const devUrl = `postgresql://u:p@${DEV_HOST}/neondb?sslmode=require`;

const ENV_KEYS = ["PROD_DATA_HOSTS", "VERCEL_ENV", "NODE_ENV"] as const;
type Key = (typeof ENV_KEYS)[number];

let saved: Partial<Record<Key, string | undefined>> = {};

function setEnv(key: Key, value: string | undefined): void {
  const env = process.env as Record<string, string | undefined>;
  if (value === undefined) delete env[key];
  else env[key] = value;
}

beforeEach(() => {
  saved = {};
  for (const k of ENV_KEYS) saved[k] = process.env[k];
  setEnv("PROD_DATA_HOSTS", PROD_HOST);
});

afterEach(() => {
  for (const k of ENV_KEYS) setEnv(k, saved[k]);
});

describe("normaliseDataHost", () => {
  it("extracts the host from a connection string", () => {
    expect(normaliseDataHost(prodUrl())).toBe(PROD_HOST);
  });

  it("accepts a bare host", () => {
    expect(normaliseDataHost(PROD_HOST)).toBe(PROD_HOST);
  });

  it("treats the pooled and direct endpoints as the same database", () => {
    const pooled = "ep-bitter-king-azky3gdq-pooler.c-3.ap-southeast-1.aws.neon.tech";
    expect(normaliseDataHost(pooled)).toBe(normaliseDataHost(PROD_HOST));
  });

  it("ignores credentials, port, database and query parameters", () => {
    const a = normaliseDataHost(`postgresql://user:pw@${PROD_HOST}:5432/neondb?sslmode=require`);
    const b = normaliseDataHost(`postgres://other:secret@${PROD_HOST}/otherdb`);
    expect(a).toBe(PROD_HOST);
    expect(b).toBe(PROD_HOST);
  });

  it("is case-insensitive", () => {
    expect(normaliseDataHost(PROD_HOST.toUpperCase())).toBe(PROD_HOST);
  });
});

describe("assertNotProductionData", () => {
  it("blocks a preview deployment holding the production database", () => {
    setEnv("VERCEL_ENV", "preview");
    expect(() => assertNotProductionData(prodUrl())).toThrow(/Refusing to use the production database/);
  });

  it("blocks it via the pooled endpoint too, which is the same database", () => {
    setEnv("VERCEL_ENV", "preview");
    const pooled = prodUrl("ep-bitter-king-azky3gdq-pooler.c-3.ap-southeast-1.aws.neon.tech");
    expect(() => assertNotProductionData(pooled)).toThrow(/Refusing to use the production database/);
  });

  it("allows a preview deployment using the dev database", () => {
    setEnv("VERCEL_ENV", "preview");
    expect(() => assertNotProductionData(devUrl)).not.toThrow();
  });

  it("never blocks production, so an over-broad list cannot cause an outage", () => {
    setEnv("VERCEL_ENV", "production");
    setEnv("PROD_DATA_HOSTS", `${PROD_HOST},${DEV_HOST}`);
    expect(() => assertNotProductionData(prodUrl())).not.toThrow();
    expect(() => assertNotProductionData(devUrl)).not.toThrow();
  });

  it("supports a list of hosts, tolerating stray whitespace", () => {
    setEnv("VERCEL_ENV", "preview");
    setEnv("PROD_DATA_HOSTS", `other.example.com, ${PROD_HOST} ,third.example.com`);
    expect(() => assertNotProductionData(prodUrl())).toThrow(/Refusing to use the production database/);
  });

  it("does nothing when no hosts are configured", () => {
    setEnv("VERCEL_ENV", "preview");
    setEnv("PROD_DATA_HOSTS", "");
    expect(() => assertNotProductionData(prodUrl())).not.toThrow();
  });

  it("blocks a local development run pointed at production", () => {
    setEnv("VERCEL_ENV", undefined);
    setEnv("NODE_ENV", "development");
    expect(() => assertNotProductionData(prodUrl())).toThrow(/Refusing to use the production database/);
  });

  it("names the offending host so the failure is actionable", () => {
    setEnv("VERCEL_ENV", "preview");
    expect(() => assertNotProductionData(prodUrl())).toThrow(new RegExp(PROD_HOST));
  });
});
