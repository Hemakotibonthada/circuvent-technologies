import { Router } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { verifyPassword } from "../auth";
import { config } from "../config";
import { checkSession, currentEpoch } from "../sessions";

export const oauthRouter = Router();

/**
 * Smart-home grants live inside the same revocation model as everything else.
 *
 * They did not, and the gap was total. These tokens were minted with a bare
 * `jwt.sign({uid, purpose})` — no `te` (token-epoch) claim — and verified with a
 * bare `jwt.verify`, so they never reached `checkSession()`. That made every
 * remediation the product offers a no-op against them: signing out all devices,
 * changing the password, resetting a forgotten password, an admin revoking
 * sessions, and even an admin *blocking the account* all bump `token_epoch` and
 * kill console sessions while leaving the Alexa/Google grant fully alive.
 *
 * The refresh token lasted ten years, there is no unlink endpoint, and no record
 * of issued grants exists to delete out of band. So anyone who completed account
 * linking once — a shared Amazon account, an Echo left behind after a move, an
 * ex-partner — kept the ability to actuate mains relays, pumps and the hub for a
 * decade, and the victim doing everything right could not take it away.
 *
 * Adding `te` and calling `checkSession` on verify is the whole fix: it puts
 * these tokens under the same kill switch as the console.
 */
async function sign(purpose: string, uid: number, expiresIn: string): Promise<string> {
  const te = await currentEpoch(uid);
  return jwt.sign({ uid, purpose, te }, config.JWT_SECRET, { expiresIn } as jwt.SignOptions);
}

async function verify(purpose: string, token: string): Promise<number | null> {
  let uid: number;
  let te: number;
  try {
    const d = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    uid = Number(d.uid);
    if (d.purpose !== purpose || !Number.isFinite(uid)) return null;
    // Tokens minted before this change carry no `te`. Treating a missing claim
    // as epoch 0 is what retires them: any account that has ever bumped its
    // epoch rejects them immediately, and any that has not is at 0 and keeps
    // working until it does. Defaulting to the *current* epoch instead would
    // grandfather in exactly the ten-year tokens this exists to revoke.
    te = Number.isFinite(Number(d.te)) ? Number(d.te) : 0;
  } catch {
    return null;
  }
  // Fails closed: checkSession rejects blocked accounts and stale epochs, and
  // throws rather than returning "ok" if the database is unreachable.
  try {
    if ((await checkSession(uid, te)) !== "ok") return null;
  } catch {
    return null;
  }
  return uid;
}

/** Verify a smart-home access token (Bearer) -> user id. */
export async function verifySmartHomeToken(token: string): Promise<number | null> {
  return verify("sh_access", token);
}

function esc(s: string): string {
  return (s || "").replace(/[<>"'&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "&": "&amp;" }[c] as string));
}

/**
 * Registered account-linking redirect URIs.
 *
 * SECURITY: this list is the only thing standing between the login form and
 * authorization-code exfiltration. A scheme-only check ("must start with
 * https://") leaves the host attacker-controlled, so a phishing link can run
 * the whole flow on the genuine API origin and then have the code 302'd to the
 * attacker. Every candidate must match one of these origins exactly, with the
 * path constrained to the vendor's documented prefix.
 */
const BUILTIN_REDIRECT_PREFIXES = [
  // Amazon Alexa account linking (per-region endpoints).
  "https://layla.amazon.com/api/skill/link/",
  "https://pitangui.amazon.com/api/skill/link/",
  "https://alexa.amazon.co.jp/api/skill/link/",
  // Google Home / Actions on Google account linking.
  "https://oauth-redirect.googleusercontent.com/r/",
  "https://oauth-redirect-sandbox.googleusercontent.com/r/",
];

function allowedRedirectPrefixes(): string[] {
  const extra = config.SMARTHOME_REDIRECT_URIS.split(",")
    .map((s) => s.trim())
    .filter((s) => s.startsWith("https://") || s.startsWith("http://localhost"));
  return [...BUILTIN_REDIRECT_PREFIXES, ...extra];
}

/** Returns the redirect_uri only if it is registered; null otherwise. */
function checkRedirectUri(raw: string): string | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  // A userinfo section lets `https://layla.amazon.com@evil.tld/` slip past a
  // naive prefix test, so reject it outright before comparing.
  if (url.username || url.password) return null;
  const normalized = url.toString();
  for (const prefix of allowedRedirectPrefixes()) {
    let p: URL;
    try {
      p = new URL(prefix);
    } catch {
      continue;
    }
    if (url.protocol === p.protocol && url.host === p.host && url.pathname.startsWith(p.pathname)) {
      return normalized;
    }
  }
  return null;
}

function loginPage(p: Record<string, string>, err = ""): string {
  const hidden = ["client_id", "redirect_uri", "state", "response_type", "scope"]
    .map((k) => `<input type="hidden" name="${k}" value="${esc(p[k] || "")}">`)
    .join("");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Link Circuvent</title>
<style>body{font-family:system-ui,Segoe UI,Roboto,sans-serif;background:#0b1020;color:#e5e7eb;max-width:420px;margin:0 auto;padding:36px 20px}
h1{font-size:22px;margin:6px 0}.b{background:linear-gradient(135deg,#06b6d4,#8b5cf6);color:#fff;border:0;border-radius:12px;padding:14px;width:100%;font-weight:700;font-size:16px;cursor:pointer}
input:not([type=hidden]){width:100%;padding:13px;margin:8px 0;border-radius:12px;border:1px solid #334155;background:#111827;color:#e5e7eb;box-sizing:border-box;font-size:15px}
.e{color:#f59e0b;margin:10px 0}.m{color:#94a3b8;font-size:13px}.l{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.p{width:40px;height:40px;border-radius:11px;background:linear-gradient(135deg,#06b6d4,#8b5cf6)}</style></head><body>
<div class="l"><div class="p"></div><div><h1>Circuvent</h1></div></div>
<p class="m">Sign in to let this assistant control your Circuvent devices.</p>
<form method="POST" action="/oauth/authorize">${hidden}
${err ? `<div class="e">${esc(err)}</div>` : ""}
<input name="email" type="email" placeholder="Email" autocapitalize="off" autocomplete="email" required>
<input name="password" type="password" placeholder="Password" autocomplete="current-password" required>
<button class="b" type="submit">Sign in &amp; link</button></form></body></html>`;
}

// GET /oauth/authorize — Alexa/Google send the user here to link their account.
oauthRouter.get("/authorize", (req, res) => {
  const q = req.query as Record<string, string>;
  if (q.client_id !== config.SMARTHOME_CLIENT_ID) {
    res.status(400).send("Invalid client_id");
    return;
  }
  // Reject before rendering: an unregistered redirect_uri would otherwise be
  // echoed into the form and used on submit.
  if (!checkRedirectUri(q.redirect_uri || "")) {
    res.status(400).send("Invalid redirect_uri");
    return;
  }
  res.set("Content-Type", "text/html").send(loginPage(q));
});

// POST /oauth/authorize — verify credentials, issue an auth code, redirect back.
oauthRouter.post("/authorize", async (req, res) => {
  const b = (req.body || {}) as Record<string, string>;
  if (b.client_id !== config.SMARTHOME_CLIENT_ID) {
    res.status(400).send("Invalid client_id");
    return;
  }
  const redirect = checkRedirectUri(b.redirect_uri || "");
  if (!redirect) {
    res.status(400).send("Invalid redirect_uri");
    return;
  }
  const email = (b.email || "").trim().toLowerCase();
  const { rows } = await pool.query<{ id: number | string; password: string }>(
    `SELECT id, password FROM users WHERE lower(email) = $1`,
    [email]
  );
  const u = rows[0];
  if (!u || !(await verifyPassword(b.password || "", u.password))) {
    res.set("Content-Type", "text/html").send(loginPage(b, "Invalid email or password."));
    return;
  }
  // Bind the code to the redirect it was issued for (RFC 6749 §4.1.3).
  const code = jwt.sign({ uid: Number(u.id), purpose: "sh_code", ruri: redirect }, config.JWT_SECRET, {
    expiresIn: "10m",
  } as jwt.SignOptions);
  const sep = redirect.includes("?") ? "&" : "?";
  const url = `${redirect}${sep}code=${encodeURIComponent(code)}${b.state ? `&state=${encodeURIComponent(b.state)}` : ""}`;
  res.redirect(302, url);
});

// POST /oauth/token — exchange code (or refresh) for access + refresh tokens.
oauthRouter.post("/token", async (req, res) => {
  const b = (req.body || {}) as Record<string, string>;
  let cid = b.client_id;
  let csec = b.client_secret;
  const auth = req.headers.authorization;
  if (auth && auth.startsWith("Basic ")) {
    const [id, sec] = Buffer.from(auth.slice(6), "base64").toString().split(":");
    cid = cid || id;
    csec = csec || sec;
  }
  if (cid !== config.SMARTHOME_CLIENT_ID || !config.SMARTHOME_CLIENT_SECRET || csec !== config.SMARTHOME_CLIENT_SECRET) {
    res.status(401).json({ error: "invalid_client" });
    return;
  }
  let uid: number | null = null;
  if (b.grant_type === "authorization_code") {
    try {
      const d = jwt.verify(b.code || "", config.JWT_SECRET) as jwt.JwtPayload;
      const claimed = Number(d.uid);
      // The code is only valid for the redirect it was issued against, so a
      // leaked code cannot be redeemed from a different registered client.
      const ruriOk = !b.redirect_uri || !d.ruri || b.redirect_uri === d.ruri;
      if (d.purpose === "sh_code" && Number.isFinite(claimed) && ruriOk) uid = claimed;
    } catch {
      uid = null;
    }
  } else if (b.grant_type === "refresh_token") uid = await verify("sh_refresh", b.refresh_token || "");
  else {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }
  if (uid == null) {
    res.status(400).json({ error: "invalid_grant" });
    return;
  }
  // 90 days rather than ten years. Both vendors refresh on a schedule far
  // shorter than this, so the only thing a decade bought was the window in
  // which a stolen grant kept working. A lifetime nobody can review is not a
  // lifetime anyone chose.
  res.json({
    token_type: "Bearer",
    access_token: await sign("sh_access", uid, "1h"),
    refresh_token: await sign("sh_refresh", uid, "90d"),
    expires_in: 3600,
  });
});
