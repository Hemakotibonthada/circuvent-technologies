/**
 * Branded status pages for endpoints a person can reach in a browser.
 *
 * WHY THESE EXIST
 *
 * The fulfilment and token endpoints answer POST from Google's and Amazon's
 * servers. A person opening one in a browser is doing something reasonable —
 * checking a deployment, following a URL from a console, diagnosing a linking
 * problem — and they used to get `{"error":"Not found"}`, then a slightly
 * better JSON blob. Neither is a page. Both make a working system look broken
 * or unfinished, and a certification reviewer is one of the people who looks.
 *
 * WHY CONTENT NEGOTIATION RATHER THAN JUST HTML
 *
 * The same URL has two audiences. A browser should get something designed; a
 * monitor, a curl in a runbook, or a script checking the deployment should
 * still get JSON it can parse. Serving HTML to everything would break the
 * second, and serving JSON to everything is what produced the screenshot that
 * prompted this. `Accept` is exactly the mechanism for that, and using it
 * costs one line at each call site.
 *
 * The markup is inline and dependency-free on purpose: the control plane
 * serves no static assets and has no template engine, and a status page that
 * needs a build step is a status page that breaks when the build changes.
 */
import type { Request, Response } from "express";
import { BUILD, CAPABILITIES } from "./build-info";

function esc(s: string): string {
  return String(s ?? "").replace(
    /[<>"'&]/g,
    (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "&": "&amp;" })[c] as string
  );
}

export interface StatusPage {
  /** Shown as the page's heading, e.g. "Google Home fulfilment". */
  title: string;
  /** One sentence saying what this endpoint is for. */
  summary: string;
  /** Short paragraphs explaining what to do. */
  body: string[];
  /** Key/value rows — method, content type, build. */
  facts?: Array<[string, string]>;
  /** Optional call to action. */
  action?: { label: string; href: string };
  /** HTTP status. 405 for a POST-only endpoint, 400 for a bad request. */
  status: number;
  /** Machine-readable body, for callers that asked for JSON. */
  json: Record<string, unknown>;
}

/**
 * The shared shell.
 *
 * Deliberately close to the account-linking sign-in page: somebody moving
 * between them is inside one product, and two different visual identities on
 * adjacent screens reads as two different services glued together.
 */
function shell(inner: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)} — Circuvent</title>
<style>
  *{box-sizing:border-box}
  body{
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
    background:#0b1020;color:#e5e7eb;margin:0;min-height:100vh;
    display:flex;align-items:center;justify-content:center;padding:28px 20px;
    line-height:1.6;
  }
  .card{
    width:100%;max-width:560px;background:#111827;border:1px solid #1f2937;
    border-radius:18px;padding:30px 28px;
    box-shadow:0 18px 50px rgba(0,0,0,.45);
  }
  .brand{display:flex;align-items:center;gap:12px;margin-bottom:22px}
  .mark{
    width:40px;height:40px;border-radius:11px;flex:none;
    background:linear-gradient(135deg,#06b6d4,#8b5cf6);
  }
  .brand b{font-size:17px;letter-spacing:.2px}
  .brand span{display:block;color:#94a3b8;font-size:12px;font-weight:400}
  h1{font-size:21px;margin:0 0 6px;line-height:1.3}
  .pill{
    display:inline-flex;align-items:center;gap:7px;margin-bottom:16px;
    background:rgba(16,185,129,.12);border:1px solid rgba(16,185,129,.35);
    color:#6ee7b7;border-radius:999px;padding:5px 12px;font-size:12.5px;font-weight:600;
  }
  .dot{width:7px;height:7px;border-radius:50%;background:#10b981;flex:none}
  p{margin:0 0 13px;color:#cbd5e1;font-size:14.5px}
  p.lead{color:#e5e7eb}
  dl{margin:20px 0 0;border-top:1px solid #1f2937;padding-top:16px;font-size:13.5px}
  .row{display:flex;justify-content:space-between;gap:16px;padding:5px 0}
  dt{color:#94a3b8;flex:none}
  dd{margin:0;text-align:right;color:#e5e7eb;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;
     font-size:12.5px;word-break:break-all}
  .cta{
    display:inline-block;margin-top:22px;background:linear-gradient(135deg,#06b6d4,#8b5cf6);
    color:#fff;text-decoration:none;border-radius:12px;padding:12px 20px;
    font-weight:700;font-size:14.5px;
  }
  .foot{margin-top:22px;padding-top:15px;border-top:1px solid #1f2937;
        color:#64748b;font-size:12px}
  .foot a{color:#94a3b8}
  code{background:#0b1020;border:1px solid #1f2937;border-radius:6px;padding:1px 6px;font-size:12.5px}
  @media (prefers-color-scheme: light){
    body{background:#f8fafc;color:#0f172a}
    .card{background:#fff;border-color:#e2e8f0;box-shadow:0 18px 50px rgba(15,23,42,.08)}
    p{color:#475569}p.lead{color:#0f172a}
    dt{color:#64748b}dd{color:#0f172a}
    dl,.foot{border-color:#e2e8f0}
    code{background:#f1f5f9;border-color:#e2e8f0}
    .brand span{color:#64748b}
  }
</style>
</head>
<body>
  <main class="card">
    <div class="brand">
      <div class="mark" aria-hidden="true"></div>
      <div><b>Circuvent</b><span>Smart home platform</span></div>
    </div>
${inner}
    <div class="foot">
      Circuvent Technologies · <a href="https://circuvent.com">circuvent.com</a>
      · <a href="https://api.circuvent.com/health">service status</a>
    </div>
  </main>
</body>
</html>`;
}

function render(page: StatusPage): string {
  const facts = (page.facts ?? []).concat([
    ["Build", BUILD.commit],
    ["Service", "operational"],
  ]);
  const inner = `    <div class="pill"><span class="dot"></span>This endpoint is working</div>
    <h1>${esc(page.title)}</h1>
    <p class="lead">${esc(page.summary)}</p>
${page.body.map((b) => `    <p>${b}</p>`).join("\n")}
    <dl>
${facts.map(([k, v]) => `      <div class="row"><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("\n")}
    </dl>
${page.action ? `    <a class="cta" href="${esc(page.action.href)}">${esc(page.action.label)}</a>` : ""}`;
  return shell(inner, page.title);
}

/**
 * Answers a browser with a page and everything else with JSON.
 *
 * `req.accepts` puts HTML first only when the client actually listed it, so
 * curl and monitors — which send `*​/*` or nothing — keep getting JSON. That
 * ordering is the whole trick, and getting it backwards would break every
 * script that checks these endpoints.
 */
export function sendStatusPage(req: Request, res: Response, page: StatusPage): void {
  res.status(page.status);
  if (req.accepts(["json", "html"]) === "html") {
    res.set("Content-Type", "text/html; charset=utf-8").send(render(page));
    return;
  }
  res.json({ ...page.json, build: BUILD.commit });
}

/** The shared page for an endpoint that only answers POST. */
export function postOnlyPage(opts: {
  title: string;
  caller: string;
  purpose: string;
  status?: number;
}): StatusPage {
  return {
    status: opts.status ?? 405,
    title: opts.title,
    summary: `${opts.purpose} It answers POST from ${opts.caller}, and nothing else.`,
    body: [
      `You are seeing this because a browser sends a <code>GET</code> request. That is not a fault — it means the endpoint is deployed and reachable, which is usually what somebody opening this URL wanted to know.`,
      `There is nothing to do here. To control your devices by voice, link your account from the Google Home or Alexa app.`,
    ],
    facts: [
      ["Method", "POST"],
      ["Content type", "application/json"],
      ["Capabilities", CAPABILITIES.length + " advertised"],
    ],
    action: { label: "Open Circuvent", href: "https://circuvent.com/smarthome" },
    json: {
      error: "method_not_allowed",
      endpoint: opts.title,
      expects: "POST",
      message: `${opts.purpose} It answers POST from ${opts.caller} and nothing else — seeing this in a browser means it is deployed and working.`,
      health: "https://api.circuvent.com/health",
    },
  };
}
