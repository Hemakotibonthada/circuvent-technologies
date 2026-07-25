// Standalone verification of the Postgres persistence adapter (src/lib/db.ts)
// against PGlite — an in-process Postgres, so no external database is needed.
// Run: npx tsx scripts/test-db.ts
import { PGlite } from "@electric-sql/pglite";
import * as db from "../src/lib/db";

function emptyDb(): any {
  return {
    orders: [], products: [], wallets: {}, accounts: {}, pending: {}, devices: {},
    reviews: [], addresses: [], notifyRequests: [], logins: {}, coupons: [],
    tickets: [], returns: [], audit: [], loyalty: {}, adminUsers: {}, referrals: {},
    referralCodes: {}, giftCards: {}, questions: [], notifications: {},
  };
}

let failures = 0;
function assert(cond: boolean, msg: string) {
  if (cond) console.log("  ✓", msg);
  else { console.error("  ✗", msg); failures++; }
}

async function main() {
  const pg = new PGlite();
  db.__setQueryForTests(async (text, params = []) => {
    const res = await pg.query(text, params as unknown[]);
    return res.rows as Record<string, unknown>[];
  });

  console.log("init schema…");
  await db.initDb();

  // ---- seed a realistic store snapshot -------------------------------------
  const store = emptyDb();
  store.accounts["a@x.com"] = { email: "a@x.com", name: "Aya", hash: "H1", salt: "S1", createdAt: "2026-07-01T00:00:00Z", blocked: false, phone: "+91999" };
  store.accounts["b@x.com"] = { email: "b@x.com", name: "Ben", hash: "H2", salt: "S2", createdAt: "2026-07-02T00:00:00Z", blocked: true };
  store.pending["c@x.com"] = { email: "c@x.com", name: "Cid", hash: "H3", salt: "S3", otp: "123456", expires: Date.now() + 600000, attempts: 1, ref: "REF9" };
  store.adminUsers["admin@circuvent.com"] = { email: "admin@circuvent.com", name: "Owner", hash: "AH", salt: "AS", role: "superadmin", active: true, createdAt: "2026-06-01T00:00:00Z" };
  store.orders.push({ orderNo: "CV-1001", email: "a@x.com", status: "paid", total: 2499, items: [{ name: "Aqua", price: 2499, qty: 1, lineTotal: 2499 }] });
  store.coupons.push({ code: "WELCOME10", type: "percent", value: 10, label: "10% off", active: true });
  store.wallets["a@x.com"] = { email: "a@x.com", balance: 150, history: [] };

  console.log("flush all collections…");
  await db.dbFlush(store, db.allCollections());

  console.log("hydrate back…");
  const h: any = await db.dbHydrate();
  assert(Object.keys(h.accounts).length === 2, "2 accounts round-tripped");
  assert(h.accounts["a@x.com"].name === "Aya", "account a fields preserved");
  assert(h.accounts["b@x.com"].blocked === true, "account b blocked flag preserved");
  assert(h.pending["c@x.com"].otp === "123456", "pending OTP preserved");
  assert(h.pending["c@x.com"].attempts === 1, "pending attempts preserved");
  assert(h.adminUsers["admin@circuvent.com"].role === "superadmin", "admin role preserved");
  assert(Array.isArray(h.orders) && h.orders.length === 1 && h.orders[0].orderNo === "CV-1001", "order blob round-tripped");
  assert(h.coupons[0].code === "WELCOME10", "coupon blob round-tripped");
  assert(h.wallets["a@x.com"].balance === 150, "wallet blob round-tripped");

  // ---- typed columns are populated (queryable) -----------------------------
  const q = async (t: string) => (await pg.query(t)).rows as any[];
  const blockedRow = (await q(`SELECT blocked FROM accounts WHERE email='b@x.com'`))[0];
  assert(blockedRow.blocked === true, "accounts.blocked column populated");
  const roleRow = (await q(`SELECT role FROM admin_users WHERE email='admin@circuvent.com'`))[0];
  assert(roleRow.role === "superadmin", "admin_users.role column populated");

  // ---- delete-missing: removing an account mirrors to the table ------------
  delete store.accounts["b@x.com"];
  await db.dbFlush(store, ["accounts"]);
  const after: any = await db.dbHydrate(["accounts"]);
  assert(Object.keys(after.accounts).length === 1 && !after.accounts["b@x.com"], "deleted account removed from table");

  // ---- clearing a pending registration ------------------------------------
  delete store.pending["c@x.com"];
  await db.dbFlush(store, ["pending"]);
  const afterP: any = await db.dbHydrate(["pending"]);
  assert(Object.keys(afterP.pending).length === 0, "cleared pending removed from table");

  // ---- scoped hydrate returns only requested collections -------------------
  const scoped: any = await db.dbHydrate(["accounts"]);
  assert(scoped.accounts && scoped.orders === undefined, "scoped hydrate returns only requested collection");

  // ---- email evidence log (email_history) ----------------------------------
  console.log("email evidence log…");
  await db.dbLogEmail({ to: "a@x.com", subject: "Your Circuvent order CV-1001", type: "order", status: "sent", provider: "resend", messageId: "re_1", related: "CV-1001", bodyHtml: "<p>hi</p>", from: "Circuvent <noreply@circuvent.com>" });
  await db.dbLogEmail({ to: "a@x.com", subject: "123456 is your code", type: "otp", status: "sent", provider: "smtp" });
  await db.dbLogEmail({ to: "x@y.com", subject: "alert digest", type: "alert", status: "failed", error: "No transport" });
  const emails = await db.dbListEmailHistory();
  assert(emails.length === 3, "3 emails logged to email_history");
  const otp = await db.dbListEmailHistory({ type: "otp" });
  assert(otp.length === 1 && otp[0].type === "otp", "email type filter works");
  const failed = await db.dbListEmailHistory({ status: "failed" });
  assert(failed.length === 1 && failed[0].error === "No transport", "email status filter + error preserved");
  const search = await db.dbListEmailHistory({ q: "CV-1001" });
  assert(search.length === 1 && search[0].related === "CV-1001", "email search matches subject/related");
  const counts = await db.dbCountEmailHistory();
  assert(counts.total === 3 && counts.sent === 2 && counts.failed === 1, "email counts (total/sent/failed) correct");
  const orderEmail = emails.find((e) => e.type === "order");
  assert(!!orderEmail && orderEmail.body_html === "<p>hi</p>", "email body_html evidence preserved");

  // ---- request latency metrics (request_metrics) ---------------------------
  console.log("latency metrics…");
  await db.pingDb();
  await db.dbRecordLatency([
    { endpoint: "/api/devices", method: "GET", status: 200, ms: 42 },
    { endpoint: "/api/weather", method: "GET", status: 200, ms: 180 },
    { endpoint: "/api/orders", method: "POST", status: 500, ms: 610 },
  ]);
  const lat = await db.dbLatencySamples(24);
  assert(lat.length === 3, "3 latency samples recorded to request_metrics");
  assert(lat.some((r) => r.endpoint === "/api/orders" && r.status === 500), "latency error status preserved");
  assert(lat.every((r) => typeof r.ms === "number"), "latency ms column is numeric");

  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
