import { Router } from "express";
import { z } from "zod";
import crypto from "node:crypto";
import { pool } from "../db";
import { hashPassword, verifyPassword, signUserToken } from "../auth";
import { sendOtpEmail } from "../mail";
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
    if (!sent && (config.NODE_ENV !== "production" || config.OTP_DEBUG)) logger.warn({ email, otp }, "DEV OTP (no email provider configured)");
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
    res.json({ token: signUserToken({ uid, email }), user: { id: uid, email, name } });
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
    if (!sent && (config.NODE_ENV !== "production" || config.OTP_DEBUG)) logger.warn({ email, otp }, "DEV OTP (resend)");
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
    const { rows } = await pool.query<{ id: number; name: string; password: string }>(
      `SELECT id, name, password FROM users WHERE email = $1`,
      [emailNorm]
    );
    const user = rows[0];
    if (!user || !(await verifyPassword(parsed.data.password, user.password))) {
      res.status(401).json({ error: "Invalid email or password." });
      return;
    }
    res.json({ token: signUserToken({ uid: Number(user.id), email: emailNorm }), user: { id: Number(user.id), email: emailNorm, name: user.name } });
  } catch {
    res.status(500).json({ error: "Login failed." });
  }
});
