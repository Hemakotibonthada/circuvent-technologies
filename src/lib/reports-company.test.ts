/**
 * The legal identity printed on report PDFs.
 *
 * A report is the document a customer or an accountant keeps longest, and the
 * address on it is the one somebody writes to years later. `brand.ts` exists
 * because that already went wrong once — the invoice carried a different
 * address from the outbound mail, and people kept writing to the wrong one.
 *
 * These pin the two behaviours that matter: unset fields say so in words
 * rather than printing blanks, and the contact never falls back to a transport
 * address that nobody monitors.
 */

import { BRAND } from "./brand";

/*
 * `reports.ts` reaches the order store, which uses a top-level await that Jest's
 * transform cannot take. These metrics do not touch orders at all, so the store
 * and its neighbours are stubbed — the same approach as reports-engine.test.ts.
 */
jest.mock("./store", () => ({
  listOrders: jest.fn(() => [] as unknown[]),
  listProducts: jest.fn(() => [] as unknown[]),
  listCustomers: jest.fn(() => [] as unknown[]),
  listReturns: jest.fn(() => [] as unknown[]),
  listTickets: jest.fn(() => [] as unknown[]),
  analytics: jest.fn(() => ({})),
}));
jest.mock("./inventory", () => ({
  listProductRows: jest.fn(() => [] as unknown[]),
  valuation: jest.fn(() => ({ byCategory: [], skuCount: 0, units: 0, cost: 0, retail: 0, potentialProfit: 0 })),
  reorderSuggestions: jest.fn(() => [] as unknown[]),
  deadStock: jest.fn(() => [] as unknown[]),
}));
jest.mock("./admin-tax", () => ({ listHsnMappings: jest.fn(() => [] as unknown[]) }));

const KEYS = [
  "REPORT_COMPANY_NAME",
  "REPORT_COMPANY_ADDRESS",
  "REPORT_COMPANY_GSTIN",
  "REPORT_COMPANY_STATE",
  "REPORT_COMPANY_STATE_CODE",
  "REPORT_COMPANY_EMAIL",
  "EMAIL_REPLY_TO",
  "EMAIL_FROM",
] as const;

/** Load `companyInfo` with a controlled environment. */
async function withEnv(env: Partial<Record<(typeof KEYS)[number], string>>) {
  const saved: Record<string, string | undefined> = {};
  for (const k of KEYS) {
    saved[k] = process.env[k];
    if (env[k] === undefined) delete process.env[k];
    else process.env[k] = env[k];
  }
  try {
    jest.resetModules();
    const mod = await import("./reports");
    return mod.companyInfo();
  } finally {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

describe("an unconfigured deployment", () => {
  it("says the address is missing rather than printing a blank line", async () => {
    /*
     * On a tax document a missing registered office should be obvious. A blank
     * line looks like a formatting slip and gets ignored; a sentence saying it
     * is not configured gets fixed.
     */
    const info = await withEnv({});
    expect(info.addressLines).toEqual(["Registered office address not configured"]);
  });

  it("reports no GSTIN as null, so the header can say so", async () => {
    const info = await withEnv({});
    expect(info.gstin).toBeNull();
  });

  it("never falls back to an address nobody monitors", async () => {
    /*
     * This is the regression being guarded. The contact used to come from
     * siteConfig, which resolves EMAIL_REPLY_TO, then EMAIL_FROM, then a
     * literal default — so a deployment with neither set printed
     * "hello@circuvent.com" on every report. That is a default in config.ts,
     * not the monitored inbox, and not what brand.ts designates for customer
     * documents.
     */
    const info = await withEnv({});
    expect(info.email).toBe(BRAND.supportEmail);
    expect(info.email).not.toBe("hello@circuvent.com");
  });

  it("is not swayed by the mail transport's own addresses", async () => {
    // EMAIL_FROM is how mail leaves the building. It is not a support inbox,
    // and it has no business on a document somebody replies to.
    const info = await withEnv({
      EMAIL_FROM: "no-reply@mailer.example",
      EMAIL_REPLY_TO: "bounces@mailer.example",
    });
    expect(info.email).toBe(BRAND.supportEmail);
  });
});

describe("a configured deployment", () => {
  it("splits the address on pipes", async () => {
    const info = await withEnv({
      REPORT_COMPANY_ADDRESS: "Plot 12, HITEC City | Madhapur | Hyderabad 500081",
    });
    expect(info.addressLines).toEqual(["Plot 12, HITEC City", "Madhapur", "Hyderabad 500081"]);
  });

  it("drops empty segments from a trailing or doubled pipe", async () => {
    // A trailing pipe is the commonest way to edit one of these by hand, and
    // it should not print an empty line into the header.
    const info = await withEnv({ REPORT_COMPANY_ADDRESS: "One||Two|" });
    expect(info.addressLines).toEqual(["One", "Two"]);
  });

  it("takes the state code from the GSTIN rather than trusting a second field", async () => {
    /*
     * The first two digits of a GSTIN are the state code by definition, so
     * deriving it removes the chance of the two disagreeing — which on a GST
     * document is a filing problem, not a cosmetic one.
     */
    const info = await withEnv({ REPORT_COMPANY_GSTIN: "36ABCDE1234F1Z5", REPORT_COMPANY_STATE_CODE: "07" });
    expect(info.gstin).toBe("36ABCDE1234F1Z5");
    expect(info.stateCode).toBe("36");
  });

  it("uses the explicit state code only when there is no GSTIN", async () => {
    const info = await withEnv({ REPORT_COMPANY_STATE_CODE: "29" });
    expect(info.stateCode).toBe("29");
  });

  it("lets accounts documents reach a different inbox", async () => {
    // A real case: GST paperwork going to accounts@ rather than support@.
    const info = await withEnv({ REPORT_COMPANY_EMAIL: "accounts@circuvent.com" });
    expect(info.email).toBe("accounts@circuvent.com");
  });

  it("ignores a blank override rather than printing nothing", async () => {
    // An empty variable in a deployment config is far more common than a
    // deliberate one, and an empty contact line is worse than the default.
    const info = await withEnv({ REPORT_COMPANY_EMAIL: "   " });
    expect(info.email).toBe(BRAND.supportEmail);
  });

  it("takes the trading name when one is set", async () => {
    const info = await withEnv({ REPORT_COMPANY_NAME: "Circuvent Technologies Pvt Ltd" });
    expect(info.name).toBe("Circuvent Technologies Pvt Ltd");
  });
});
