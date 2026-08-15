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

  // ---- per-user console preferences (store_kv) -----------------------------
  //
  // Channel names are edited on a phone and read in a browser, so the only
  // property that matters is that a write from one client is visible to every
  // other. They previously were not: the store wrote a JSON file, Vercel's
  // filesystem is read-only, and createFileStore catches that and continues in
  // memory *per lambda instance*. The console paints from a localStorage cache,
  // so the browser that did the renaming looked correct while every other
  // client — and every private window — showed "Channel 3".
  console.log("user preferences…");
  const LABELS = { "home-hub-978dde59": { ch1: "FAN", ch2: "Tube light" } };

  assert(Object.keys(await db.dbReadUserPrefs("u1")).length === 0, "unknown user has no prefs");

  await db.dbWriteUserPrefScope("u1", "channel-labels", LABELS);
  const asBrowser: any = await db.dbReadUserPrefs("u1");
  assert(asBrowser["channel-labels"]["home-hub-978dde59"].ch1 === "FAN", "a name written by one client is readable by another");
  assert(asBrowser["channel-labels"]["home-hub-978dde59"].ch3 === undefined, "an unnamed channel stays unnamed (falls back)");

  await db.dbWriteUserPrefScope("u2", "channel-labels", { d: { ch1: "Someone else" } });
  const stillMine: any = await db.dbReadUserPrefs("u1");
  assert(stillMine["channel-labels"]["home-hub-978dde59"].ch1 === "FAN", "one account's names are not another's");

  // Two of the same person's devices saving different scopes at the same moment.
  // A read-modify-write in JavaScript loses whichever landed first; the merge is
  // done in the statement so it cannot. Issued concurrently so this would notice.
  await Promise.all([
    db.dbWriteUserPrefScope("u1", "dashboard", { cols: 4 }),
    db.dbWriteUserPrefScope("u1", "device-widgets", { d: { ch1: { kind: "fan" } } }),
    db.dbWriteUserPrefScope("u1", "profile", { displayName: "Hema" }),
  ]);
  const merged: any = await db.dbReadUserPrefs("u1");
  assert(
    ["channel-labels", "dashboard", "device-widgets", "profile"].every((s) => s in merged),
    "concurrent writes to different scopes all survive"
  );
  assert(merged["channel-labels"]["home-hub-978dde59"].ch2 === "Tube light", "an earlier scope is untouched by later ones");

  // Replacing a scope is wholesale, so clearing a name really clears it.
  await db.dbWriteUserPrefScope("u1", "channel-labels", { "home-hub-978dde59": { ch1: "FAN" } });
  const trimmed: any = await db.dbReadUserPrefs("u1");
  assert(trimmed["channel-labels"]["home-hub-978dde59"].ch2 === undefined, "a removed name does not linger");
  assert(trimmed.dashboard.cols === 4, "replacing one scope leaves the others alone");

  assert((await db.dbClearUserPrefScope("u1", "channel-labels")) === true, "clearing a scope reports it removed something");
  const cleared: any = await db.dbReadUserPrefs("u1");
  assert(!("channel-labels" in cleared), "the cleared scope is gone");
  assert(cleared.dashboard.cols === 4, "clearing one scope keeps the rest");
  assert((await db.dbClearUserPrefScope("u1", "channel-labels")) === false, "clearing nothing reports nothing removed");
  const otherUser: any = await db.dbReadUserPrefs("u2");
  assert(otherUser["channel-labels"].d.ch1 === "Someone else", "clearing one account does not touch another");

  // ---- feature-module documents (store_kv) --------------------------------
  //
  // The durable half of createFileStore. Incidents were the visible casualty:
  // the store wrote a JSON file, the serverless filesystem is read-only, and
  // the helper catches that and continues in memory — so a queue that had 32
  // incidents filed against it read empty, while the counter behind INC-0032
  // survived in whichever instance still held it.
  console.log("feature-module documents…");
  assert((await db.dbReadFileStore("admin-icm.json")) === null, "an unwritten module document reads as absent");

  const icm = { incidents: [{ id: "INC-0001", title: "Gateway timeouts" }], seq: 1, teams: ["Platform"] };
  await db.dbWriteFileStore("admin-icm.json", icm);
  const backIcm: any = await db.dbReadFileStore("admin-icm.json");
  assert(backIcm.incidents[0].id === "INC-0001", "an incident written by one instance is readable by another");
  assert(backIcm.seq === 1, "the id counter travels with the incidents it numbered");

  await db.dbWriteFileStore("admin-icm.json", { ...icm, seq: 2, incidents: [...icm.incidents, { id: "INC-0002" }] });
  const grown: any = await db.dbReadFileStore("admin-icm.json");
  assert(grown.incidents.length === 2 && grown.seq === 2, "a later write replaces the document wholesale");

  await db.dbWriteFileStore("admin-cms.json", { pages: [] });
  const stillIcm: any = await db.dbReadFileStore("admin-icm.json");
  assert(stillIcm.incidents.length === 2, "one module's document is not another's");

  console.log(failures === 0 ? "\nALL PASSED" : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
