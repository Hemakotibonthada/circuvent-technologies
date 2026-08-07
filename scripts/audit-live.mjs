/**
 * Live audit: exercises every read-only surface of the production control
 * plane and website, reports real status codes and latency.
 *
 * Read-only by default. Pass --control to additionally round-trip one real
 * device command and measure how long the device takes to echo its new state.
 */
const API = process.env.CV_API || "https://api.circuvent.com";
const SITE = process.env.CV_SITE || "https://circuvent.com";
const EMAIL = process.env.CV_EMAIL;
const PASSWORD = process.env.CV_PASSWORD;

const results = [];
const t = (ms) => `${Math.round(ms)}ms`;

async function hit(label, url, opts = {}) {
  const started = Date.now();
  let status = 0, body = null, err = null;
  try {
    const r = await fetch(url, { ...opts, signal: AbortSignal.timeout(20000) });
    status = r.status;
    const text = await r.text();
    try { body = JSON.parse(text); } catch { body = text.slice(0, 200); }
  } catch (e) {
    err = e.message;
  }
  const ms = Date.now() - started;
  results.push({ label, url: url.replace(API, "").replace(SITE, ""), status, ms, err });
  return { status, body, ms };
}

const auth = (tok) => ({ headers: { authorization: `Bearer ${tok}` } });

(async () => {
  console.log(`\n=== unauthenticated surface ===`);
  await hit("health", `${API}/health`);
  const v1root = await hit("v1 discovery", `${API}/v1`);
  await hit("v1 without key", `${API}/v1/devices`);
  await hit("openapi", `${SITE}/openapi.json`);
  await hit("site home", SITE);
  await hit("robots", `${SITE}/robots.txt`);
  await hit("sitemap", `${SITE}/sitemap.xml`);
  await hit("visitors (must be 401)", `${SITE}/api/visitors`);

  if (!EMAIL || !PASSWORD) {
    console.log("no creds supplied; stopping after public surface");
    return dump();
  }

  console.log(`\n=== authenticating ===`);
  const login = await hit("login", `${API}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const tok = login.body?.token || login.body?.accessToken;
  if (!tok) {
    console.log("login failed:", login.status, JSON.stringify(login.body).slice(0, 300));
    return dump();
  }
  console.log(`token acquired (${t(login.ms)}), user:`, JSON.stringify(login.body?.user || {}).slice(0, 200));

  console.log(`\n=== authenticated user surface ===`);
  const devs = await hit("devices", `${API}/devices`, auth(tok));
  await hit("rooms", `${API}/rooms`, auth(tok));
  await hit("scenes", `${API}/scenes`, auth(tok));
  await hit("automations", `${API}/automations`, auth(tok));
  await hit("events", `${API}/events`, auth(tok));
  await hit("unread count", `${API}/events/unread-count`, auth(tok));
  await hit("energy summary", `${API}/energy/summary`, auth(tok));
  await hit("gate passes", `${API}/gate/passes`, auth(tok));
  await hit("dev scopes", `${API}/developer/scopes`, auth(tok));
  await hit("dev keys", `${API}/developer/keys`, auth(tok));
  await hit("dev webhooks", `${API}/developer/webhooks`, auth(tok));

  console.log(`\n=== admin surface ===`);
  await hit("admin me", `${API}/admin/me`, auth(tok));
  await hit("admin stats", `${API}/admin/stats`, auth(tok));
  await hit("admin users", `${API}/admin/users`, auth(tok));
  const adevs = await hit("admin devices", `${API}/admin/devices`, auth(tok));
  await hit("admin events", `${API}/admin/events`, auth(tok));
  await hit("admin health", `${API}/admin/health`, auth(tok));
  await hit("admin lookup", `${API}/admin/devices/lookup?serial=TEST`, auth(tok));

  const list = Array.isArray(devs.body) ? devs.body : devs.body?.devices || [];
  const alist = Array.isArray(adevs.body) ? adevs.body : adevs.body?.devices || [];
  console.log(`\n=== fleet (${list.length} user / ${alist.length} admin) ===`);
  for (const d of alist.length ? alist : list) {
    console.log(
      `  ${(d.id || "").padEnd(22)} type=${String(d.type).padEnd(10)} online=${String(d.online ?? d.isOnline)}` +
      ` fw=${d.fw_version || d.fwVersion || "-"} serial=${d.serial || "-"} last=${d.last_seen || d.lastSeen || "-"}`
    );
  }

  for (const d of (alist.length ? alist : list).slice(0, 3)) {
    await hit(`report ${d.id}`, `${API}/admin/devices/${d.id}/report`, auth(tok));
    await hit(`telemetry ${d.id}`, `${API}/admin/devices/${d.id}/telemetry`, auth(tok));
  }

  dump();
})();

function dump() {
  console.log(`\n=== results ===`);
  const bad = [];
  for (const r of results) {
    const ok = r.status >= 200 && r.status < 300;
    const expected401 = r.label.includes("must be 401") && r.status === 401;
    const flag = ok || expected401 ? "ok  " : "FAIL";
    if (!ok && !expected401) bad.push(r);
    console.log(`${flag} ${String(r.status).padEnd(4)} ${t(r.ms).padStart(7)}  ${r.label}  ${r.err || ""}`);
  }
  console.log(`\n${results.length - bad.length}/${results.length} ok`);
  if (bad.length) {
    console.log(`\nfailures:`);
    for (const r of bad) console.log(`  ${r.status} ${r.url} — ${r.label} ${r.err || ""}`);
  }
}
