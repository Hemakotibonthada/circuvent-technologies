import { NextResponse } from "next/server";
import { adminFromRequest } from "@/lib/admin-auth";
import { isDbConfigured } from "@/lib/config";
import * as db from "@/lib/db";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health/db — deep database readiness check (admin only).
 *
 * Performs a real, non-destructive round-trip against the configured database
 * and reports connectivity plus current row counts. Guarded because it touches
 * the database and exposes internal counts.
 */
export async function GET(request: Request) {
  if (!adminFromRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isDbConfigured()) {
    return NextResponse.json(
      { ok: false, mode: "file", message: "No DATABASE_URL configured — using the local file store (not durable on serverless)." },
      { status: 200 }
    );
  }

  const started = Date.now();
  try {
    const res = await db.dbHealthcheck();
    return NextResponse.json({
      ok: res.ok,
      mode: "postgres",
      latencyMs: Date.now() - started,
      counts: { accounts: res.accounts, admins: res.admins, orders: res.orders },
    });
  } catch (err) {
    logger.error("health.db.failed", {}, err);
    return NextResponse.json(
      { ok: false, mode: "postgres", message: "Database connection failed." },
      { status: 503 }
    );
  }
}
