/**
 * Where a report is allowed to go, and what it says when it gets there.
 *
 * Two failures this guards against, both quiet:
 *
 *   - A group address that is not a real group. This endpoint emails the
 *     company's revenue figures, so "whatever was posted" is not an acceptable
 *     recipient list.
 *   - An email template that uses layout CSS its readers do not support. The
 *     banner used `display:flex`; Outlook and Gmail ignored it, the 28px logo
 *     expanded to the full width of the message, and the title printed on top
 *     of it. Nothing errors — it just arrives broken.
 */
import { keepKnownGroups, reportRecipients, type DirectoryGroup } from "@/lib/identity-groups";

/*
 * The store reaches for a database at import time, and the dashboard reads it.
 * Both are mocked with the exact shape from the report that prompted this —
 * ₹52 collected against ₹2,50,867 ordered — so the template is tested on the
 * numbers that made it contradict itself.
 */
jest.mock("@/lib/store", () => ({
  getAlertSettings: () => ({ lowStockThreshold: 5 }),
  listOrders: () => [],
  listProducts: () => [],
  load: () => ({}),
  save: () => {},
}));

jest.mock("@/lib/insights", () => ({
  dashboard: () => ({
    range: 30,
    kpis: {
      revenue: { value: 52, delta: 0, spark: [] },
      orders: { value: 10, delta: 0, spark: [] },
      aov: { value: 7, delta: 0, spark: [] },
    },
    series: [
      { gmv: 150000, paidOrders: 4, revenue: 30, orders: 6 },
      { gmv: 100867, paidOrders: 3, revenue: 22, orders: 4 },
    ],
    topProducts: [
      { name: "Circuvent Agri GSM Starter", qty: 35, revenue: 104965 },
      { name: "Circuvent Home Hub", qty: 40, revenue: 99960 },
    ],
  }),
}));

// eslint-disable-next-line import/first
import { buildReportHtml } from "@/lib/alerts";

const KNOWN: DirectoryGroup[] = [
  { id: "1", email: "admins@circuvent.com", name: "Admins", description: "" },
  { id: "2", email: "dev@circuvent.com", name: "Developers", description: "" },
];

describe("which group addresses are accepted", () => {
  it("keeps groups that exist", () => {
    const { accepted, rejected } = keepKnownGroups(["admins@circuvent.com"], KNOWN);
    expect(accepted).toEqual(["admins@circuvent.com"]);
    expect(rejected).toEqual([]);
  });

  /*
   * The one that matters. Without this the endpoint is a way to have the
   * revenue figures emailed anywhere, by anyone who can reach it.
   */
  it("refuses an address that is not a group", () => {
    const { accepted, rejected } = keepKnownGroups(["attacker@example.com"], KNOWN);
    expect(accepted).toEqual([]);
    expect(rejected).toEqual(["attacker@example.com"]);
  });

  it("refuses a group that no longer exists, as a stale tab would send", () => {
    const { accepted, rejected } = keepKnownGroups(["deleted@circuvent.com"], KNOWN);
    expect(accepted).toEqual([]);
    expect(rejected).toEqual(["deleted@circuvent.com"]);
  });

  it("matches regardless of case or padding", () => {
    const { accepted } = keepKnownGroups(["  ADMINS@Circuvent.com "], KNOWN);
    expect(accepted).toEqual(["admins@circuvent.com"]);
  });

  it("does not accept the same group twice", () => {
    const { accepted } = keepKnownGroups(
      ["admins@circuvent.com", "Admins@circuvent.com"],
      KNOWN
    );
    expect(accepted).toEqual(["admins@circuvent.com"]);
  });

  it("ignores blanks rather than treating them as recipients", () => {
    const { accepted, rejected } = keepKnownGroups(["", "   "], KNOWN);
    expect(accepted).toEqual([]);
    expect(rejected).toEqual([]);
  });
});

describe("who the report is addressed to", () => {
  it("keeps the individual address when groups are chosen", () => {
    // A group is an addition, not a replacement. Dropping the address somebody
    // already relies on is how a report stops arriving unnoticed.
    expect(reportRecipients("owner@circuvent.com", ["admins@circuvent.com"])).toEqual([
      "owner@circuvent.com",
      "admins@circuvent.com",
    ]);
  });

  it("sends to the individual alone when no group is chosen", () => {
    expect(reportRecipients("owner@circuvent.com", [])).toEqual(["owner@circuvent.com"]);
  });

  it("does not send twice to the same mailbox", () => {
    expect(reportRecipients("admins@circuvent.com", ["Admins@circuvent.com"])).toEqual([
      "admins@circuvent.com",
    ]);
  });

  it("copes with no individual address configured", () => {
    expect(reportRecipients(undefined, ["admins@circuvent.com"])).toEqual([
      "admins@circuvent.com",
    ]);
    expect(reportRecipients("", [])).toEqual([]);
  });
});

describe("the report email survives an email client", () => {
  const { html, subject } = buildReportHtml(30);

  /*
   * `display:flex` is not supported by Outlook's Word renderer or Gmail. This
   * is the specific defect that shipped: the banner laid itself out with flex,
   * the logo lost its size, and the heading landed on top of the image.
   */
  it("uses no flex or grid layout anywhere", () => {
    expect(html).not.toMatch(/display\s*:\s*flex/i);
    expect(html).not.toMatch(/display\s*:\s*grid/i);
    expect(html).not.toMatch(/\bgap\s*:/i);
  });

  it("pins the logo's size in both the attributes and the style", () => {
    const img = html.match(/<img[^>]*>/i)?.[0] ?? "";
    expect(img).toMatch(/width="28"/);
    expect(img).toMatch(/height="28"/);
    // Clients strip one or the other; carrying both is what survives.
    expect(img).toMatch(/width:\s*28px/);
    expect(img).toMatch(/max-width:\s*28px/);
  });

  it("declares a solid colour behind the gradient", () => {
    // Outlook renders no gradient at all. Without this the banner is white and
    // the white heading on it disappears.
    const banner = html.slice(0, html.indexOf("</table>"));
    expect(banner).toMatch(/background-color:\s*#0891b2/i);
    const solidAt = banner.indexOf("background-color");
    const gradientAt = banner.indexOf("linear-gradient");
    expect(solidAt).toBeGreaterThanOrEqual(0);
    expect(solidAt).toBeLessThan(gradientAt);
  });

  it("lays the banner out with a table", () => {
    expect(html).toMatch(/<table[^>]*role="presentation"/i);
  });
});

describe("the report's figures say what they count", () => {
  const { html, subject } = buildReportHtml(30);

  /*
   * The header read "₹52 revenue" from "10 orders" above a table of top
   * products totalling ₹1,04,965 — three figures, three different
   * denominators, no labels. Every one was correct and the report still
   * contradicted itself.
   */
  it("distinguishes what was ordered from what was collected", () => {
    expect(html).toContain("Ordered");
    expect(html).toContain("Collected");
    expect(html).not.toMatch(/>\s*Revenue\s*</);
  });

  it("says which orders the product table counts", () => {
    expect(html).toMatch(/whether or not payment has been captured/i);
  });

  it("explains what the average is an average of", () => {
    expect(html).toMatch(/collected ÷ paid/);
  });

  it("pairs figures in the subject that count the same orders", () => {
    // "₹X from N order(s)" must both mean every order in the window.
    expect(subject).toMatch(/from \d+ order\(s\)/);
    expect(subject).toMatch(/collected/);
  });

  /*
   * The concrete case. Ordered and collected are wildly different numbers here,
   * and both have to appear — the old template showed only the smaller one,
   * beside a product table built from the larger.
   */
  it("shows both figures from the report that prompted this", () => {
    expect(html).toContain("₹2,50,867"); // ordered, across all 10 orders
    expect(html).toContain("₹52"); // collected, from the 7 paid ones
    expect(html).toContain("7 paid");
    expect(html).toContain("10 order(s)");
  });
});
