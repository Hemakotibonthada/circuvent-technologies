import { Router } from "express";
import { pool } from "../db";

export const healthRouter = Router();

healthRouter.get("/", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, service: "circuvent-control-plane", db: "up", ts: new Date().toISOString() });
  } catch {
    res.status(503).json({ ok: false, db: "down" });
  }
});
