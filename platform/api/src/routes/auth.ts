import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { pool } from "../db";
import { hashPassword, verifyPassword, signUserToken, requireAuth, type AuthedRequest } from "../auth";
import { revokeAllSessions } from "../sessions";
import { sendOtpEmail, sendPasswordResetEmail } from "../mail";
import { config } from "../config";
import { logger } from "../logger";

export const authRouter = Router();

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().max(120).optional(),
});

function genOtp(): string {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
}

/**
 * POST /auth/register — step 1 of sign-up. Validates, stores a PENDING
 * registration (no account yet), and emails a 6-digit OTP. The account is only
 * created at /auth/verify-otp once the code is confirmed.
 */
authRouter.post("/register", async (req, res) => {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { password, name } = parsed.data;
  const email = parsed.data.email.trim().toLowerCase();
  try {
    const exists = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [email]);
    if (exists.rowCount) {
      res.status(409).json({ error: "An account with that email already exists." });
      return;
    }
    const otp = genOtp();
    const [pwHash, otpHash] = await Promise.all([hashPassword(password), hashPassword(otp)]);
    const expires = new Date(Date.now() + config.OTP_TTL_MIN * 60_000);
    await pool.query(
      `INSERT INTO pending_registrations (email, name, password, otp_hash, attempts, expires_at)
       VALUES ($1, $2, $3, $4, 0, $5)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password = EXCLUDED.password,
         otp_hash = EXCLUDED.otp_hash, attempts = 0, expires_at = EXCLUDED.expires_at, created_at = now()`,
      [email, name ?? "", pwHash, otpHash, expires]
    );
    const sent = await sendOtpEmail(email, name ?? "", otp);
    if (!sent && (config.NODE_ENV !== "production" || config.OTP_DEBUG === "true")) logger.warn({ email, otp }, "DEV OTP (no email provider configured)");
    res.json({ pending: true, email, otpSent: sent, expiresInMin: config.OTP_TTL_MIN });
  } catch (err) {
    logger.error({ err }, "register failed");
    res.status(500).json({ error: "Could not start sign-up." });
  }
});

const verifySchema = z.object({ email: z.string().email(), otp: z.string().min(4).max(8) });

/** POST /auth/verify-otp — step 2: confirm the code, create the account, sign in. */
authRouter.post("/verify-otp", async (req, res) => {
  const parsed = verifySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();
  try {
    const { rows } = await pool.query<{ name: string; password: string; otp_hash: string; attempts: number; expires_at: string }>(
      `SELECT name, password, otp_hash, attempts, expires_at FROM pending_registrations WHERE email = $1`,
      [email]
    );
    const p = rows[0];
    if (!p) {
      res.status(404).json({ error: "No pending sign-up for this email. Please register again." });
      return;
    }
    if (new Date(p.expires_at).getTime() < Date.now()) {
      await pool.query(`DELETE FROM pending_registrations WHERE email = $1`, [email]);
      res.status(410).json({ error: "Code expired. Please register again." });
      return;
    }
    if (p.attempts >= 6) {
      await pool.query(`DELETE FROM pending_registrations WHERE email = $1`, [email]);
      res.status(429).json({ error: "Too many attempts. Please register again." });
      return;
    }
    if (!(await verifyPassword(parsed.data.otp.trim(), p.otp_hash))) {
      await pool.query(`UPDATE pending_registrations SET attempts = attempts + 1 WHERE email = $1`, [email]);
      res.status(400).json({ error: "Incorrect code. Please try again." });
      return;
    }
    // Race-safe create: the unique email guards against a double-verify.
    const ins = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, password) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO NOTHING RETURNING id`,
      [email, p.name, p.password]
    );
    await pool.query(`DELETE FROM pending_registrations WHERE email = $1`, [email]);
    let uid: number;
    let name = p.name;
    if (ins.rows[0]) uid = Number(ins.rows[0].id);
    else {
      const u = await pool.query<{ id: number; name: string }>(`SELECT id, name FROM users WHERE email = $1`, [email]);
      uid = Number(u.rows[0].id);
      name = u.rows[0].name;
    }
    res.json({ token: await signUserToken({ uid, email }), user: { id: uid, email, name } });
  } catch (err) {
    logger.error({ err }, "verify-otp failed");
    res.status(500).json({ error: "Verification failed." });
  }
});

/** POST /auth/resend-otp — re-issue a fresh code for a pending sign-up. */
authRouter.post("/resend-otp", async (req, res) => {
  const email = String(req.body?.email ?? "").trim().toLowerCase();
  if (!email) {
    res.status(400).json({ error: "Email required" });
    return;
  }
  try {
    const { rows } = await pool.query<{ name: string }>(`SELECT name FROM pending_registrations WHERE email = $1`, [email]);
    if (!rows[0]) {
      res.status(404).json({ error: "No pending sign-up for this email." });
      return;
    }
    const otp = genOtp();
    const otpHash = await hashPassword(otp);
    const expires = new Date(Date.now() + config.OTP_TTL_MIN * 60_000);
    await pool.query(`UPDATE pending_registrations SET otp_hash = $2, attempts = 0, expires_at = $3 WHERE email = $1`, [email, otpHash, expires]);
    const sent = await sendOtpEmail(email, rows[0].name, otp);
    if (!sent && (config.NODE_ENV !== "production" || config.OTP_DEBUG === "true")) logger.warn({ email, otp }, "DEV OTP (resend)");
    res.json({ pending: true, email, otpSent: sent, expiresInMin: config.OTP_TTL_MIN });
  } catch (err) {
    logger.error({ err }, "resend-otp failed");
    res.status(500).json({ error: "Could not resend code." });
  }
});

authRouter.post("/login", async (req, res) => {
  const parsed = credsSchema.pick({ email: true, password: true }).safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }
  const emailNorm = parsed.data.email.trim().toLowerCase();
  try {
    const { rows } = await pool.query<{ id: number; name: string; password: string; blocked: boolean }>(
      `SELECT id, name, password, blocked FROM users WHERE email = $1`,
      [emailNorm]
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(parsed.data.password, user.password))) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    // Checked after the password so a wrong password on a disabled account
    // still reads as "invalid credentials" and does not reveal the account
    // exists — but a correct password gets an honest answer rather than a token
    // that every subsequent request would reject.
    if (user.blocked) {
      res.status(403).json({ error: "This account has been disabled." });
      return;
    }
    res.json({ token: await signUserToken({ uid: Number(user.id), email: emailNorm }), user: { id: Number(user.id), email: emailNorm, name: user.name } });
  } catch {
    res.status(500).json({ error: "Login failed." });
  }
});

/**
 * POST /auth/federated — issue a console session for a customer the storefront
 * has already authenticated.
 *
 * The shop and the control plane keep separate user tables with different
 * password schemes (scrypt vs bcrypt), so single sign-on cannot be done by
 * sharing credentials. Instead the shop's backend, which has just verified the
 * customer itself, asks for a session on their behalf.
 *
 * The caller proves it is the shop by signing "<timestamp>.<email>" with a
 * shared secret. That is a server-to-server credential and must never reach a
 * browser: anyone holding it can mint a session for any address. Requests are
 * therefore rejected unless the secret is configured, the signature matches in
 * constant time, and the timestamp is recent enough that a captured request
 * cannot be replayed later.
 *
 * An address with no console account yet gets one created. Its password column
 * is filled with the hash of a random value nobody keeps, so the row can never
 * be signed into directly — the only way in is through this endpoint or a
 * password reset, and "user signed up on the shop" does not silently become
 * "user has a control-plane password somebody might guess".
 */
const FEDERATION_SKEW_MS = 5 * 60_000;

const federatedSchema = z.object({
  email: z.string().email(),
  name: z.string().max(120).optional(),
});

authRouter.post("/federated", async (req, res) => {
  if (!config.FEDERATION_SECRET) {
    res.status(404).json({ error: "Federation is not enabled." });
    return;
  }

  const parsed = federatedSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input" });
    return;
  }

  const ts = String(req.header("x-federation-timestamp") ?? "");
  const sig = String(req.header("x-federation-signature") ?? "");
  const at = Number(ts);
  if (!Number.isFinite(at) || Math.abs(Date.now() - at) > FEDERATION_SKEW_MS) {
    res.status(401).json({ error: "Stale or missing timestamp." });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const expected = crypto
    .createHmac("sha256", config.FEDERATION_SECRET)
    .update(`${ts}.${email}`)
    .digest("hex");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    res.status(401).json({ error: "Bad signature." });
    return;
  }

  try {
    const found = await pool.query<{ id: number; name: string }>(
      `SELECT id, name FROM users WHERE email = $1`,
      [email]
    );
    let user = found.rows[0];

    if (!user) {
      const unusable = await hashPassword(crypto.randomBytes(32).toString("hex"));
      const created = await pool.query<{ id: number; name: string }>(
        `INSERT INTO users (email, name, password) VALUES ($1, $2, $3)
         ON CONFLICT (email) DO UPDATE SET name = COALESCE(NULLIF(users.name, ''), EXCLUDED.name)
         RETURNING id, name`,
        [email, parsed.data.name ?? "", unusable]
      );
      user = created.rows[0];
      logger.info({ email }, "federated sign-in created a console account");
    }

    res.json({
      token: await signUserToken({ uid: Number(user.id), email }),
      user: { id: Number(user.id), email, name: user.name },
    });
  } catch (err) {
    logger.error({ err }, "federated sign-in failed");
    res.status(500).json({ error: "Could not create a session." });
  }
});

/**
 * POST /auth/sign-out-all — end every session for the signed-in account.
 *
 * The one recovery action a user can take themselves after losing a phone. JWTs
 * cannot be individually withdrawn, so this bumps the account's token epoch,
 * which invalidates every token ever issued to it — including the one making
 * this request.
 *
 * A replacement token is returned so the caller is not signed out of the device
 * it is asking from, which is what people actually want: "sign out everywhere
 * else". It is minted after the bump, so it carries the new epoch.
 */
authRouter.post("/sign-out-all", requireAuth, async (req: AuthedRequest, res) => {
  try {
    const uid = req.user!.uid;
    await revokeAllSessions(uid);
    const token = await signUserToken({ uid, email: req.user!.email });
    logger.info({ uid }, "user revoked all sessions");
    res.json({ success: true, token });
  } catch (err) {
    logger.error({ err }, "sign-out-all failed");
    res.status(500).json({ error: "Could not end your other sessions." });
  }
});

/* ------------------------------------------------------------------ */
/* Password management                                                 */
/* ------------------------------------------------------------------ */

/**
 * POST /auth/change-password — for a signed-in user who knows their password.
 *
 * Ending sessions here is not a nicety. Revoking sessions without changing the
 * password is nearly pointless if someone else knows it — they simply sign back
 * in — and changing the password without revoking leaves their existing token
 * working. The two only close the door together, so this does both.
 */
authRouter.post("/change-password", requireAuth, async (req: AuthedRequest, res) => {
  const parsed = z
    .object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(8).max(200) })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "A new password of at least 8 characters is required." });
    return;
  }
  if (parsed.data.currentPassword === parsed.data.newPassword) {
    res.status(400).json({ error: "The new password must be different from the current one." });
    return;
  }

  const uid = req.user!.uid;
  try {
    const { rows } = await pool.query<{ password: string }>(`SELECT password FROM users WHERE id = $1`, [uid]);
    const current = rows[0];
    if (!current) {
      res.status(404).json({ error: "Account not found." });
      return;
    }
    if (!(await verifyPassword(parsed.data.currentPassword, current.password))) {
      // Deliberately not "wrong password" plus a hint; this endpoint is a
      // credential oracle if it says more than it must.
      res.status(401).json({ error: "That is not your current password." });
      return;
    }

    const hash = await hashPassword(parsed.data.newPassword);
    await pool.query(`UPDATE users SET password = $2 WHERE id = $1`, [uid, hash]);
    await revokeAllSessions(uid);

    // Minted after the revoke, so it carries the new epoch and this device
    // stays signed in while every other one is turned out.
    const token = await signUserToken({ uid, email: req.user!.email });
    logger.info({ uid }, "password changed; all sessions revoked");
    res.json({ success: true, token });
  } catch (err) {
    logger.error({ err }, "change-password failed");
    res.status(500).json({ error: "Could not change your password." });
  }
});

/**
 * POST /auth/forgot-password — start a reset.
 *
 * Always answers the same way whether or not the address has an account. The
 * response would otherwise be a free account-enumeration oracle, and this
 * endpoint needs no authentication to reach.
 */
authRouter.post("/forgot-password", async (req, res) => {
  const parsed = z.object({ email: z.string().email() }).safeParse(req.body);
  // Even a malformed address gets the neutral answer, so probing with junk
  // cannot be distinguished from probing with a real address.
  const neutral = {
    sent: true,
    message: "If that email has a Circuvent account, a reset code is on its way.",
    expiresInMin: config.OTP_TTL_MIN,
  };
  if (!parsed.success) {
    res.json(neutral);
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();

  try {
    const { rows } = await pool.query<{ id: number; name: string; blocked: boolean }>(
      `SELECT id, name, blocked FROM users WHERE email = $1`,
      [email]
    );
    const user = rows[0];

    // A disabled account must not be recoverable by its former owner; that is
    // the point of disabling it.
    if (user && !user.blocked) {
      const otp = genOtp();
      const otpHash = await hashPassword(otp);
      const expires = new Date(Date.now() + config.OTP_TTL_MIN * 60_000);
      await pool.query(
        `INSERT INTO password_resets (email, otp_hash, attempts, expires_at)
         VALUES ($1, $2, 0, $3)
         ON CONFLICT (email) DO UPDATE SET otp_hash = EXCLUDED.otp_hash,
           attempts = 0, expires_at = EXCLUDED.expires_at, created_at = now()`,
        [email, otpHash, expires]
      );
      const sent = await sendPasswordResetEmail(email, user.name, otp);
      if (!sent && (config.NODE_ENV !== "production" || config.OTP_DEBUG === "true")) {
        logger.warn({ email, otp }, "DEV password reset OTP (no email provider configured)");
      }
      logger.info({ email }, "password reset requested");
    } else {
      logger.info({ email }, "password reset requested for unknown or disabled account");
    }

    res.json(neutral);
  } catch (err) {
    logger.error({ err }, "forgot-password failed");
    // Still neutral: an error here must not become the signal that
    // distinguishes a real account from an absent one.
    res.json(neutral);
  }
});

/**
 * POST /auth/reset-password — finish a reset with the emailed code.
 *
 * Mirrors the sign-up OTP flow: bounded attempts, hard expiry, and the row is
 * destroyed the moment it is used so a code cannot be replayed.
 */
authRouter.post("/reset-password", async (req, res) => {
  const parsed = z
    .object({
      email: z.string().email(),
      otp: z.string().min(4).max(8),
      newPassword: z.string().min(8).max(200),
    })
    .safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input. The new password must be at least 8 characters." });
    return;
  }
  const email = parsed.data.email.trim().toLowerCase();

  try {
    const { rows } = await pool.query<{ otp_hash: string; attempts: number; expires_at: string }>(
      `SELECT otp_hash, attempts, expires_at FROM password_resets WHERE email = $1`,
      [email]
    );
    const reset = rows[0];
    if (!reset) {
      res.status(404).json({ error: "No reset in progress for this email. Request a new code." });
      return;
    }
    if (new Date(reset.expires_at).getTime() < Date.now()) {
      await pool.query(`DELETE FROM password_resets WHERE email = $1`, [email]);
      res.status(410).json({ error: "That code has expired. Request a new one." });
      return;
    }
    if (reset.attempts >= 6) {
      await pool.query(`DELETE FROM password_resets WHERE email = $1`, [email]);
      res.status(429).json({ error: "Too many attempts. Request a new code." });
      return;
    }
    if (!(await verifyPassword(parsed.data.otp.trim(), reset.otp_hash))) {
      await pool.query(`UPDATE password_resets SET attempts = attempts + 1 WHERE email = $1`, [email]);
      res.status(400).json({ error: "Incorrect code. Please try again." });
      return;
    }

    const { rows: userRows } = await pool.query<{ id: number; name: string; blocked: boolean }>(
      `SELECT id, name, blocked FROM users WHERE email = $1`,
      [email]
    );
    const user = userRows[0];
    // The account can be deleted or disabled between requesting and redeeming.
    if (!user || user.blocked) {
      await pool.query(`DELETE FROM password_resets WHERE email = $1`, [email]);
      res.status(403).json({ error: "This account is not available." });
      return;
    }

    const hash = await hashPassword(parsed.data.newPassword);
    await pool.query(`UPDATE users SET password = $2 WHERE id = $1`, [user.id, hash]);
    // Whoever prompted the reset may already hold a session. Ending them all is
    // the entire reason a reset is trustworthy.
    await revokeAllSessions(Number(user.id));
    await pool.query(`DELETE FROM password_resets WHERE email = $1`, [email]);

    const token = await signUserToken({ uid: Number(user.id), email });
    logger.info({ uid: user.id }, "password reset completed; all sessions revoked");
    res.json({ success: true, token, user: { id: Number(user.id), email, name: user.name } });
  } catch (err) {
    logger.error({ err }, "reset-password failed");
    res.status(500).json({ error: "Could not reset your password." });
  }
});
