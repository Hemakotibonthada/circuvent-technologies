import { Router } from "express";
import jwt from "jsonwebtoken";
import { pool } from "../db";
import { verifyPassword } from "../auth";
import { config } from "../config";

export const oauthRouter = Router();

function sign(purpose: string, uid: number, expiresIn: string): string {
  return jwt.sign({ uid, purpose }, config.JWT_SECRET, { expiresIn } as jwt.SignOptions);
}
function verify(purpose: string, token: string): number | null {
  try {
    const d = jwt.verify(token, config.JWT_SECRET) as jwt.JwtPayload;
    const uid = Number(d.uid);
    if (d.purpose === purpose && Number.isFinite(uid)) return uid;
    return null;
  } catch {
    return null;
  }
}
/** Verify a smart-home access token (Bearer) -> user id. */
export function verifySmartHomeToken(token: string): number | null {
  return verify("sh_access", token);
}

function esc(s: string): string {
  return (s || "").replace(/[<>"'&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;", "&": "&amp;" }[c] as string));
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
  res.set("Content-Type", "text/html").send(loginPage(q));
});

// POST /oauth/authorize — verify credentials, issue an auth code, redirect back.
oauthRouter.post("/authorize", async (req, res) => {
  const b = (req.body || {}) as Record<string, string>;
  if (b.client_id !== config.SMARTHOME_CLIENT_ID) {
    res.status(400).send("Invalid client_id");
    return;
  }
  const redirect = b.redirect_uri || "";
  if (!/^https:\/\//i.test(redirect)) {
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
  const code = sign("sh_code", Number(u.id), "10m");
  const sep = redirect.includes("?") ? "&" : "?";
  const url = `${redirect}${sep}code=${encodeURIComponent(code)}${b.state ? `&state=${encodeURIComponent(b.state)}` : ""}`;
  res.redirect(302, url);
});

// POST /oauth/token — exchange code (or refresh) for access + refresh tokens.
oauthRouter.post("/token", (req, res) => {
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
  if (b.grant_type === "authorization_code") uid = verify("sh_code", b.code || "");
  else if (b.grant_type === "refresh_token") uid = verify("sh_refresh", b.refresh_token || "");
  else {
    res.status(400).json({ error: "unsupported_grant_type" });
    return;
  }
  if (uid == null) {
    res.status(400).json({ error: "invalid_grant" });
    return;
  }
  res.json({
    token_type: "Bearer",
    access_token: sign("sh_access", uid, "1h"),
    refresh_token: sign("sh_refresh", uid, "3650d"),
    expires_in: 3600,
  });
});
