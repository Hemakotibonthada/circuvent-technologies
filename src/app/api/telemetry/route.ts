import { NextResponse } from "next/server";
import { ingest, sessionId } from "@/lib/telemetry-store";
import { optedOut } from "@/lib/traffic";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/telemetry — the browser beacon.
 *
 * Unauthenticated by necessity: a crash on the login page is exactly the crash
 * worth knowing about, and requiring a session would blind the collector to the
 * failures that matter most. Everything arriving here is therefore treated as
 * hostile — see normaliseEvent, which clamps every field, and the batch cap
 * below.
 *
 * It always answers 204. A telemetry endpoint that returns errors teaches the
 * client to retry, and a retry storm during an outage is a way of turning a
 * partial failure into a total one. If we could not use the payload, that is
 * our problem, not the browser's.
 */
export async function POST(request: Request) {
  try {
    /*
     * Do Not Track and the shop's own opt-out are honoured here as they are in
     * traffic.ts. Diagnostics are not a reason to ignore a preference the user
     * has already expressed to the rest of the site.
     */
    if (optedOut({ get: (k: string) => request.headers.get(k) })) {
      return new NextResponse(null, { status: 204 });
    }

    const body = (await request.json()) as { events?: unknown[]; source?: unknown };
    const events = Array.isArray(body?.events) ? body.events : [];
    if (!events.length) return new NextResponse(null, { status: 204 });

    const ip =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      request.headers.get("x-real-ip") ||
      "0.0.0.0";
    const ua = request.headers.get("user-agent") || "";

    ingest(events, {
      /* Derived server-side. A client-supplied session id would be
         attacker-controlled and could be used to poison anyone's journey. */
      session: sessionId(ip, ua),
      source: body?.source === "mobile" ? "mobile" : "web",
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    return new NextResponse(null, { status: 204 });
  }
}
