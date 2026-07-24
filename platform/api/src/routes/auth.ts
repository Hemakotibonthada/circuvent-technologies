import { Router } from "express";
import { z } from "zod";
import { pool } from "../db";
import { hashPassword, verifyPassword, signUserToken } from "../auth";

export const authRouter = Router();

const credsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  name: z.string().max(120).optional(),
});

authRouter.post("/register", async (req, res) => {
  const parsed = credsSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid input", details: parsed.error.flatten().fieldErrors });
    return;
  }
  const { email, password, name } = parsed.data;
  const emailNorm = email.trim().toLowerCase();
  try {
    const exists = await pool.query(`SELECT 1 FROM users WHERE email = $1`, [emailNorm]);
    if (exists.rowCount) {
      res.status(409).json({ error: "An account with that email already exists." });
      return;
    }
    const hash = await hashPassword(password);
    const { rows } = await pool.query<{ id: number }>(
      `INSERT INTO users (email, name, password) VALUES ($1, $2, $3) RETURNING id`,
      [emailNorm, name ?? "", hash]
    );
    const uid = Number(rows[0].id);
    res.json({ token: signUserToken({ uid, email: emailNorm }), user: { id: uid, email: emailNorm, name: name ?? "" } });
  } catch {
    res.status(500).json({ error: "Could not create account." });
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
