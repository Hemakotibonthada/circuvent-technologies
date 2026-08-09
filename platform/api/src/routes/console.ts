/**
 * The operations console at api.circuvent.com.
 *
 * WHY THE CONTROL PLANE SERVES A PAGE AT ALL
 *
 * The root of this host answered `{"error":"Not found"}`. That is accurate and
 * useless: the box runs the broker every device depends on, the scheduler that
 * fires every automation, and the database behind both — and the only way to
 * ask it anything was to have a JWT and a terminal. When something broke, the
 * first question ("is the control plane the problem?") needed an SSH session to
 * answer, which meant it usually did not get answered.
 *
 * This is the page that answers it. It is deliberately not the customer
 * dashboard — that lives on circuvent.com and talks to this host over the API.
 * This is the operator's view of the machine itself: what build is running,
 * what it can do, whether the broker and database are up, which devices are
 * talking, and what has happened recently.
 *
 * WHY IT IS ONE FILE WITH NO BUILD STEP
 *
 * The console has to work when things are going wrong. A bundler, a CDN or a
 * separate deployment are three more things that can be the reason the page
 * that diagnoses an outage is itself unavailable. Everything here ships inside
 * the same image as the API, is served from memory, and has no external
 * dependency of any kind — no fonts, no scripts, no stylesheets. It renders on
 * a phone tethered to a hotspot at 3am, which is when it matters.
 *
 * SECURITY
 *
 * The page itself is public and contains nothing sensitive: it is a login form
 * and the JavaScript that talks to the existing API. Every byte of data on it
 * comes from /admin endpoints that already require a valid token and the admin
 * role, so this adds no new privilege surface — it is a client, not a bypass.
 *
 * The token is held in memory only. sessionStorage would survive a reload and
 * be readable by any script that ever gets injected into this origin; the cost
 * of keeping it in a closure is that a refresh asks for the password again,
 * which is the right trade for a console that can reboot a fleet.
 *
 * A per-response nonce is issued and the CSP allows inline script only with
 * that nonce, so this route is locked down even though the rest of the API
 * runs with helmet's CSP disabled (it serves JSON, where CSP does nothing).
 *
 * ONE CONSEQUENCE OF THAT WORTH KNOWING BEFORE EDITING
 *
 * A nonce applies to the style and script *elements*. It does not apply to a
 * per-element style attribute — those require 'unsafe-hashes', which loosens
 * the policy for everything on the page. So there are no style attributes
 * here, in the markup or in anything the scripts generate; the small utility
 * classes near the end of the stylesheet exist for that reason and not out of
 * taste. Adding one back produces a page that returns 200, passes every header
 * assertion, and renders as unstyled text in a browser that enforces the
 * policy — which is how it was found.
 */
import { Router } from "express";
import { randomBytes } from "crypto";
import { CAPABILITIES, BUILD } from "../build-info";

export const consoleRouter = Router();

const page = (nonce: string): string => `<!doctype html>
<html lang="en" data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Circuvent · Control Plane Operations</title>
<style nonce="${nonce}">
:root{
  --bg:#070b12; --panel:#0e1622; --panel-2:#131d2c; --line:#1e2a3c;
  --text:#e8eef7; --dim:#93a4bd; --faint:#61738d;
  --ok:#22c55e; --warn:#f59e0b; --bad:#ef4444; --accent:#22d3ee; --accent2:#8b5cf6;
}
*{box-sizing:border-box}
body{margin:0;background:radial-gradient(1200px 600px at 20% -10%,#12203a 0%,var(--bg) 60%);
  color:var(--text);font:14px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  min-height:100vh}
a{color:var(--accent)}
.wrap{max-width:1180px;margin:0 auto;padding:20px 16px 64px}
header{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 0 18px}
.logo{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;font-weight:800;
  background:linear-gradient(135deg,var(--accent),var(--accent2));color:#04121a}
h1{font-size:19px;margin:0;letter-spacing:.2px}
.sub{color:var(--dim);font-size:12px;margin-top:2px}
.spacer{flex:1}
.badge{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);
  background:var(--panel);border-radius:999px;padding:5px 11px;font-size:12px;color:var(--dim)}
.dot{width:8px;height:8px;border-radius:50%;background:var(--faint)}
.dot.ok{background:var(--ok)} .dot.bad{background:var(--bad)} .dot.warn{background:var(--warn)}
.card{background:var(--panel);border:1px solid var(--line);border-radius:16px;padding:16px;margin-bottom:14px}
.card h2{font-size:13px;text-transform:uppercase;letter-spacing:.9px;color:var(--dim);margin:0 0 12px}
.grid{display:grid;gap:12px}
.g4{grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.kpi{background:var(--panel-2);border:1px solid var(--line);border-radius:13px;padding:13px}
.kpi .n{font-size:24px;font-weight:800;letter-spacing:-.4px}
.kpi .l{color:var(--dim);font-size:11px;text-transform:uppercase;letter-spacing:.7px;margin-top:3px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;color:var(--faint);font-weight:600;font-size:11px;text-transform:uppercase;
  letter-spacing:.6px;padding:8px 10px;border-bottom:1px solid var(--line);white-space:nowrap}
td{padding:9px 10px;border-bottom:1px solid #16202e;vertical-align:middle}
tr:last-child td{border-bottom:0}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px}
.pill{display:inline-block;border-radius:999px;padding:2px 9px;font-size:11px;font-weight:700;border:1px solid transparent}
.pill.ok{background:rgba(34,197,94,.14);color:#5ee08a;border-color:rgba(34,197,94,.3)}
.pill.bad{background:rgba(239,68,68,.14);color:#ff8f8f;border-color:rgba(239,68,68,.3)}
.pill.dim{background:#182333;color:var(--dim);border-color:var(--line)}
button{font:inherit;cursor:pointer;border-radius:10px;border:1px solid var(--line);
  background:var(--panel-2);color:var(--text);padding:8px 13px;transition:filter .15s}
button:hover:not(:disabled){filter:brightness(1.25)}
button:disabled{opacity:.45;cursor:not-allowed}
button.primary{background:linear-gradient(135deg,var(--accent),var(--accent2));color:#05121a;
  border-color:transparent;font-weight:700}
button.sm{padding:5px 10px;font-size:12px}
button.danger{color:#ff9b9b;border-color:rgba(239,68,68,.35)}
input{font:inherit;width:100%;padding:11px 12px;border-radius:11px;border:1px solid var(--line);
  background:#0a121d;color:var(--text)}
input:focus{outline:2px solid rgba(34,211,238,.45);outline-offset:1px}
label{display:block;font-size:12px;color:var(--dim);margin:0 0 6px}
.field{margin-bottom:13px}
.login{max-width:390px;margin:9vh auto}
.err{background:rgba(239,68,68,.1);border:1px solid rgba(239,68,68,.32);color:#ffb4b4;
  border-radius:11px;padding:10px 12px;font-size:13px;margin-bottom:12px}
.note{color:var(--faint);font-size:12px;margin-top:10px;line-height:1.55}
.tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}
.tab{padding:8px 14px;border-radius:999px;border:1px solid var(--line);background:var(--panel);
  color:var(--dim);font-size:13px;cursor:pointer}
.tab[aria-selected="true"]{color:var(--text);border-color:rgba(34,211,238,.55);background:var(--panel-2)}
.row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.hide{display:none!important}
.scroll{overflow-x:auto}
.cap{display:inline-block;background:#152132;border:1px solid var(--line);border-radius:7px;
  padding:2px 8px;font-size:11px;color:var(--dim);margin:0 5px 5px 0}
.hp0{padding-top:0}
.w100{width:100%}
.tc{text-align:center}
.mb14{margin-bottom:14px}
.mt12{margin-top:12px}
.faint{color:var(--faint)}
.k{color:var(--dim);width:190px}
@media (max-width:640px){ th:nth-child(n+5),td:nth-child(n+5){display:none} h1{font-size:17px} }
</style>
</head>
<body>
<div class="wrap">

  <div id="login" class="login">
    <div class="card">
      <header class="hp0">
        <div class="logo">C</div>
        <div><h1>Control Plane</h1><div class="sub">Operations console</div></div>
      </header>
      <div id="loginErr" class="err hide" role="alert"></div>
      <form id="loginForm" autocomplete="on">
        <div class="field">
          <label for="email">Email</label>
          <input id="email" type="email" name="email" autocomplete="username" required>
        </div>
        <div class="field">
          <label for="password">Password</label>
          <input id="password" type="password" name="password" autocomplete="current-password" required>
        </div>
        <button class="primary w100" type="submit" id="loginBtn">Sign in</button>
      </form>
      <p class="note">
        Administrator credentials only. This console reads and controls live hardware —
        every action is applied to the production fleet immediately.
        Your session is held in memory and ends when this tab closes.
      </p>
    </div>
    <p class="note tc">
      Build <span class="mono" id="loginBuild">…</span>
    </p>
  </div>

  <div id="app" class="hide">
    <header>
      <div class="logo">C</div>
      <div>
        <h1>Control Plane Operations</h1>
        <div class="sub" id="whoami">…</div>
      </div>
      <div class="spacer"></div>
      <span class="badge"><span class="dot" id="dotDb"></span> Database</span>
      <span class="badge"><span class="dot" id="dotMqtt"></span> Broker</span>
      <button class="sm" id="refresh">Refresh</button>
      <button class="sm" id="signout">Sign out</button>
    </header>

    <div id="banner" class="err hide" role="alert"></div>

    <div class="grid g4 mb14">
      <div class="kpi"><div class="n" id="kDevices">–</div><div class="l">Devices</div></div>
      <div class="kpi"><div class="n" id="kOnline">–</div><div class="l">Online now</div></div>
      <div class="kpi"><div class="n" id="kUsers">–</div><div class="l">Accounts</div></div>
      <div class="kpi"><div class="n" id="kEvents">–</div><div class="l">Events · 7 days</div></div>
    </div>

    <div class="tabs" role="tablist">
      <button class="tab" role="tab" data-tab="overview" aria-selected="true">Overview</button>
      <button class="tab" role="tab" data-tab="devices" aria-selected="false">Devices</button>
      <button class="tab" role="tab" data-tab="users" aria-selected="false">Accounts</button>
      <button class="tab" role="tab" data-tab="events" aria-selected="false">Activity</button>
    </div>

    <section id="tab-overview">
      <div class="card">
        <h2>This build</h2>
        <table><tbody id="buildRows"></tbody></table>
        <div class="mt12" id="caps"></div>
        <p class="note">
          Capabilities are declared by the running build, not probed. If something a client needs
          is missing here, that client is talking to an older container than the repository —
          rebuild with <span class="mono">docker compose up -d --build</span>.
        </p>
      </div>
      <div class="card">
        <h2>Fleet by type</h2>
        <div class="scroll"><table><thead><tr><th>Type</th><th>Count</th></tr></thead>
        <tbody id="byType"></tbody></table></div>
      </div>
    </section>

    <section id="tab-devices" class="hide">
      <div class="card">
        <h2>Devices</h2>
        <div class="scroll"><table>
          <thead><tr><th>Device</th><th>Type</th><th>Status</th><th>Last seen</th><th>Firmware</th><th>Owner</th><th></th></tr></thead>
          <tbody id="devRows"></tbody>
        </table></div>
        <p class="note">
          “Refresh state” asks the device to republish. It is the safest way to tell a device that
          is genuinely offline from one whose last message was simply a while ago.
        </p>
      </div>
    </section>

    <section id="tab-users" class="hide">
      <div class="card">
        <h2>Accounts</h2>
        <div class="scroll"><table>
          <thead><tr><th>Email</th><th>Name</th><th>Role</th><th>Devices</th><th>Status</th></tr></thead>
          <tbody id="userRows"></tbody>
        </table></div>
      </div>
    </section>

    <section id="tab-events" class="hide">
      <div class="card">
        <h2>Recent activity</h2>
        <div class="scroll"><table>
          <thead><tr><th>When</th><th>Device</th><th>Kind</th><th>Title</th><th>Account</th></tr></thead>
          <tbody id="evtRows"></tbody>
        </table></div>
      </div>
    </section>
  </div>
</div>

<script nonce="${nonce}">
(function () {
  "use strict";

  // Held in a closure, never in storage. A refresh asks for the password
  // again; that is the right price for a console that can reboot a fleet.
  var token = null;
  var timer = null;

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  };

  function ago(iso) {
    if (!iso) return "never";
    var ms = Date.now() - new Date(iso).getTime();
    if (isNaN(ms)) return "—";
    var m = Math.floor(ms / 60000);
    if (m < 1) return "just now";
    if (m < 60) return m + "m ago";
    var h = Math.floor(m / 60);
    if (h < 24) return h + "h ago";
    return Math.floor(h / 24) + "d ago";
  }

  function api(path, opts) {
    opts = opts || {};
    var headers = { "content-type": "application/json" };
    if (token) headers.authorization = "Bearer " + token;
    return fetch(path, {
      method: opts.method || "GET",
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      cache: "no-store"
    }).then(function (r) {
      // A 401 mid-session means the token expired or was revoked. Say so and
      // return to the login form rather than rendering half a console.
      if (r.status === 401 && token) { signOut("Your session expired. Sign in again."); throw new Error("unauthorised"); }
      return r.json().catch(function () { return {}; }).then(function (body) {
        if (!r.ok) throw new Error(body && body.error ? body.error : "Request failed (" + r.status + ")");
        return body;
      });
    });
  }

  function banner(msg) {
    var el = $("banner");
    if (!msg) { el.classList.add("hide"); return; }
    el.textContent = msg;
    el.classList.remove("hide");
  }

  // ---- login ----
  fetch("/health", { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (h) {
    $("loginBuild").textContent = (h.commit || "unknown") + " · " + (h.builtAt || "unknown");
  }).catch(function () { $("loginBuild").textContent = "unreachable"; });

  $("loginForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var btn = $("loginBtn"), err = $("loginErr");
    err.classList.add("hide");
    btn.disabled = true; btn.textContent = "Signing in…";
    api("/auth/login", { method: "POST", body: { email: $("email").value.trim(), password: $("password").value } })
      .then(function (r) {
        if (!r.token) throw new Error("No token returned");
        token = r.token;
        return api("/admin/me");
      })
      .then(function (me) {
        $("whoami").textContent = (me && me.email ? me.email : "administrator") + " · signed in";
        $("password").value = "";
        $("login").classList.add("hide");
        $("app").classList.remove("hide");
        loadAll();
        timer = setInterval(loadAll, 20000);
      })
      .catch(function (e2) {
        token = null;
        // The server's own words. "Login failed" would hide the difference
        // between a wrong password, a disabled account, and not being an admin.
        err.textContent = e2 && e2.message ? e2.message : "Could not sign in";
        err.classList.remove("hide");
      })
      .then(function () { btn.disabled = false; btn.textContent = "Sign in"; });
  });

  function signOut(msg) {
    token = null;
    if (timer) { clearInterval(timer); timer = null; }
    $("app").classList.add("hide");
    $("login").classList.remove("hide");
    var err = $("loginErr");
    if (msg) { err.textContent = msg; err.classList.remove("hide"); } else { err.classList.add("hide"); }
  }
  $("signout").addEventListener("click", function () { signOut(null); });
  $("refresh").addEventListener("click", function () { loadAll(); });

  // ---- tabs ----
  Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (t) {
    t.addEventListener("click", function () {
      Array.prototype.forEach.call(document.querySelectorAll(".tab"), function (o) {
        o.setAttribute("aria-selected", String(o === t));
      });
      ["overview", "devices", "users", "events"].forEach(function (name) {
        $("tab-" + name).classList.toggle("hide", name !== t.dataset.tab);
      });
    });
  });

  // ---- data ----
  function loadAll() {
    if (!token) return;
    banner("");
    Promise.all([
      api("/health").catch(function (e) { return { _err: e.message }; }),
      api("/admin/health").catch(function (e) { return { _err: e.message }; }),
      api("/admin/stats").catch(function (e) { return { _err: e.message }; }),
      api("/admin/devices").catch(function (e) { return { _err: e.message }; }),
      api("/admin/users").catch(function (e) { return { _err: e.message }; }),
      api("/admin/events?limit=40").catch(function (e) { return { _err: e.message }; })
    ]).then(function (r) {
      var failed = r.filter(function (x) { return x && x._err; });
      // Partial failure is reported and the rest still renders. A console that
      // blanks because one endpoint is unhappy is useless exactly when one
      // endpoint is unhappy.
      if (failed.length) banner(failed.length + " of 6 panels could not load: " + failed[0]._err);
      renderBuild(r[0], r[1]);
      renderStats(r[2]);
      renderDevices(r[3]);
      renderUsers(r[4]);
      renderEvents(r[5]);
    }).catch(function () { /* signOut already handled a 401 */ });
  }

  function renderBuild(h, ah) {
    var up = ah && typeof ah.uptimeSec === "number"
      ? (ah.uptimeSec < 3600 ? Math.round(ah.uptimeSec / 60) + "m"
        : ah.uptimeSec < 86400 ? Math.round(ah.uptimeSec / 3600) + "h"
        : Math.round(ah.uptimeSec / 86400) + "d")
      : "—";
    var rows = [
      ["Commit", '<span class="mono">' + esc(h && h.commit || "unknown") + "</span>"],
      ["Built", '<span class="mono">' + esc(h && h.builtAt || "unknown") + "</span>"],
      ["Uptime", esc(up)],
      ["Node", esc(ah && ah.node || "—")],
      ["Broker certificate", ah && ah.brokerCert && ah.brokerCert.notAfter
        ? esc(String(ah.brokerCert.notAfter).slice(0, 10)) +
          (ah.brokerCert.daysRemaining != null
            ? ' <span class="pill ' + (ah.brokerCert.daysRemaining < 30 ? "bad" : "dim") + '">' +
              esc(ah.brokerCert.daysRemaining) + " days left</span>"
            : "")
        : "—"]
    ];
    $("buildRows").innerHTML = rows.map(function (r) {
      return "<tr><td class=\\"k\\">" + r[0] + "</td><td>" + r[1] + "</td></tr>";
    }).join("");

    var caps = (h && h.capabilities) || [];
    $("caps").innerHTML = caps.length
      ? caps.map(function (c) { return '<span class="cap">' + esc(c) + "</span>"; }).join("")
      : '<span class="pill bad">This build reports no capabilities — it predates capability reporting.</span>';

    $("dotDb").className = "dot " + (ah && ah.db ? "ok" : "bad");
    $("dotMqtt").className = "dot " + (ah && ah.mqtt ? "ok" : "bad");
  }

  function renderStats(s) {
    if (!s || s._err) return;
    $("kDevices").textContent = s.devices != null ? s.devices : "–";
    $("kOnline").textContent = s.online != null ? s.online : "–";
    $("kUsers").textContent = s.users != null ? s.users : "–";
    $("kEvents").textContent = s.events7d != null ? s.events7d : "–";
    $("byType").innerHTML = (s.byType || []).map(function (t) {
      return "<tr><td>" + esc(t.type) + "</td><td>" + esc(t.count) + "</td></tr>";
    }).join("") || '<tr><td colspan="2" class="faint">No devices registered.</td></tr>';
  }

  function renderDevices(d) {
    var list = (d && d.devices) || [];
    $("devRows").innerHTML = list.map(function (x) {
      return "<tr>" +
        "<td><div>" + esc(x.name || x.id) + "</div><div class=\\"mono faint\\">" + esc(x.id) + "</div></td>" +
        "<td>" + esc(x.type) + "</td>" +
        '<td><span class="pill ' + (x.online ? "ok" : "dim") + '">' + (x.online ? "Online" : "Offline") + "</span></td>" +
        "<td>" + esc(ago(x.last_seen)) + "</td>" +
        "<td>" + esc(x.fw_version || "—") + "</td>" +
        "<td>" + esc(x.owner_email || "unclaimed") + "</td>" +
        '<td class="row">' +
          '<button class="sm" data-act="state" data-id="' + esc(x.id) + '">Refresh state</button>' +
          '<button class="sm danger" data-act="reboot" data-id="' + esc(x.id) + '">Reboot</button>' +
        "</td></tr>";
    }).join("") || '<tr><td colspan="7" class="faint">No devices registered.</td></tr>';
  }

  function renderUsers(u) {
    var list = (u && u.users) || [];
    $("userRows").innerHTML = list.map(function (x) {
      return "<tr><td>" + esc(x.email) + "</td><td>" + esc(x.name || "—") + "</td>" +
        '<td>' + (x.is_admin ? '<span class="pill ok">Admin</span>' : '<span class="pill dim">User</span>') + "</td>" +
        "<td>" + esc(x.device_count != null ? x.device_count : "—") + "</td>" +
        '<td>' + (x.blocked ? '<span class="pill bad">Disabled</span>' : '<span class="pill dim">Active</span>') + "</td></tr>";
    }).join("") || '<tr><td colspan="5" class="faint">No accounts.</td></tr>';
  }

  function renderEvents(e) {
    var list = (e && e.events) || [];
    $("evtRows").innerHTML = list.map(function (x) {
      return "<tr><td>" + esc(ago(x.ts)) + "</td>" +
        '<td class="mono">' + esc(x.device_id || "—") + "</td>" +
        "<td>" + esc(x.kind || "—") + "</td>" +
        "<td>" + esc(x.title || "—") + "</td>" +
        "<td>" + esc(x.owner_email || "—") + "</td></tr>";
    }).join("") || '<tr><td colspan="5" class="faint">Nothing recorded yet.</td></tr>';
  }

  // ---- device actions ----
  document.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest("button[data-act]") : null;
    if (!btn) return;
    var id = btn.dataset.id, act = btn.dataset.act;
    // Rebooting drops a relay board mid-cycle. Confirm it, name the device,
    // and never make it the easiest button to hit by accident.
    if (act === "reboot" && !window.confirm("Reboot " + id + " now? It will drop off the network for about 20 seconds.")) return;
    btn.disabled = true;
    var was = btn.textContent;
    btn.textContent = "Sending…";
    api("/admin/devices/" + encodeURIComponent(id) + "/command", {
      method: "POST",
      body: { action: act === "reboot" ? "reboot" : "state" }
    }).then(function () { btn.textContent = "Sent"; })
      .catch(function (err) { btn.textContent = "Failed"; banner(err.message); })
      .then(function () {
        setTimeout(function () { btn.textContent = was; btn.disabled = false; }, 2500);
      });
  });
})();
</script>
</body>
</html>`;

/**
 * The console, with a fresh nonce per response.
 *
 * A nonce is generated per request rather than reusing one, because a fixed
 * nonce is the same as no nonce — an injected script could simply carry it.
 * The CSP is set here rather than globally: the rest of this service returns
 * JSON, where a content policy protects nothing and only risks breaking a
 * client that renders a response.
 */
consoleRouter.get("/", (_req, res) => {
  const nonce = randomBytes(16).toString("base64");
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'none'",
      `style-src 'nonce-${nonce}'`,
      `script-src 'nonce-${nonce}'`,
      "connect-src 'self'",
      "img-src 'self' data:",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join("; ")
  );
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Cache-Control", "no-store");
  res.type("html").send(page(nonce));
});

/**
 * A machine-readable index, for anyone who reached this host with curl.
 *
 * The root used to answer `{"error":"Not found"}`, which reads as "wrong
 * address" and sends people looking for a different hostname. This says what
 * the service is and where its documented surface begins.
 */
consoleRouter.get("/index.json", (_req, res) => {
  res.json({
    service: "circuvent-control-plane",
    version: BUILD.version,
    commit: BUILD.commit,
    capabilities: CAPABILITIES,
    console: "/",
    health: "/health",
    publicApi: "/v1",
    docs: "https://circuvent.com/developers",
  });
});
