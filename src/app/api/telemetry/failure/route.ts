import { NextResponse } from "next/server";
import crypto from "crypto";
import { recordFailures, revalidateFailures, flushFailures, KNOWN_APPS } from "@/lib/api-failures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/telemetry/failure — where the other applications report.
 *
 * Authenticated, unlike the browser beacon next door, and for a specific
 * reason: these records name the person the request was for. An endpoint that
 * accepted an unauthenticated `actor` would let anybody file failures against
 * a colleague, and the panel exists to be believed. The bearer token is shared
 * with the applications, which have already authenticated the person before
 * reporting.
 *
 * When no token is configured the route refuses everything rather than falling
 * open. A collector that silently accepts anonymous reports is worse than one
 * that is switched off, because the panel looks equally trustworthy either way.
 */
export async function POST(request: Request) {
  const expected = process.env.INSIGHTS_INGEST_TOKEN?.trim();
  if (!expected) {
    return NextResponse.json(
      { error: "Failure reporting is not configured on this deployment." },
      { status: 503 }
    );
  }

  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!provided || !safeEqual(provided, expected)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { app?: unknown; failures?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const raw = typeof body.app === "string" ? body.app.trim().toLowerCase() : "";
  /*
   * An unrecognised name is filed under "other:" rather than rejected. A new
   * application reporting failures is exactly when the panel is most useful,
   * and refusing its reports until somebody adds a string to a list here would
   * hide the deployment that most needs watching.
   */
  const app = (KNOWN_APPS as readonly string[]).includes(raw)
    ? raw
    : raw
      ? `other:${raw.slice(0, 24)}`
      : "unknown";

  const failures = Array.isArray(body.failures) ? body.failures : [];
  if (!failures.length) return NextResponse.json({ ok: true, accepted: 0 });

  await revalidateFailures();
  const accepted = recordFailures(failures, { app });
  await flushFailures();

  return NextResponse.json({ ok: true, accepted });
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}
