// ═══════════════════════════════════════════════════════════════
// GET /api/admin/availability/probe
// ═══════════════════════════════════════════════════════════════
// A scheduled reachability check against the control plane, recorded as
// telemetry so the Insights panel can report availability from something
// other than "whenever a user happened to load a page".
//
// WHERE THIS SHOULD BE CALLED FROM, and why it is not the obvious place:
//
// The prober must not be the thing it probes. The control-plane VM runs
// continuously and a crontab entry there gives any interval for free — which
// is what the alerts sweep does, correctly, because that probes devices. This
// probes the control plane itself. Run it there and the box is down at exactly
// the moment it is meant to notice: no probe runs, no failure is recorded, and
// the panel shows an unbroken run of successes straight through the outage.
// Silence would read as health.
//
// So Vercel Cron calls this — the app is deployed separately from the VM, and
// that separation is the whole property. Anything else external can too; it is
// a plain authenticated GET. On Hobby the schedule is daily, which is close to
// useless for uptime; a fifteen-minute interval needs Vercel Pro or any
// scheduler that is not on the VM. The code is identical either way, only the
// caller differs.
//
// Because the interval cannot be guaranteed, the panel is told when the last
// check happened rather than left to imply recency. A gap in probes is not
// evidence of uptime.

import { NextResponse } from "next/server";
import { CONTROL_PLANE_URL } from "@/lib/control-plane";
import { ingest, isDurable } from "@/lib/telemetry-store";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** How long to wait before calling the control plane unreachable. */
const TIMEOUT_MS = 10_000;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Without a configured secret this would be an open trigger that makes an
  // outbound request on demand, so it stays shut.
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const startedAt = Date.now();
  let status = 0;
  let ok = false;
  let errorType: string | undefined;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${CONTROL_PLANE_URL}/health`, {
      cache: "no-store",
      signal: controller.signal,
    });
    status = res.status;
    ok = res.ok;
  } catch (e) {
    /*
     * A timeout is a different outcome from a refused connection: one says the
     * host is gone, the other that it is there and not answering, and they
     * point at different faults. Both are failures; only the label differs.
     */
    errorType = e instanceof Error && e.name === "AbortError" ? "Timeout" : "NetworkError";
  } finally {
    clearTimeout(timer);
  }

  const durationMs = Date.now() - startedAt;

  ingest(
    [
      {
        kind: "dependency",
        target: "control-plane",
        path: "/health",
        method: "GET",
        status,
        ok,
        durationMs,
        ...(errorType ? { errorType } : {}),
      },
    ],
    /*
     * A fixed session, because this is not a person. Grouping every probe
     * under one label keeps synthetic checks out of the user-journey view,
     * where they would otherwise look like a visitor who only ever loads
     * /health, forever.
     */
    { session: "probe:availability", source: "probe" }
  );

  if (!ok) {
    logger.warn("availability.probe_failed", { status, durationMs, errorType });
  }

  /*
   * 200 even when the control plane is down. The probe itself succeeded: it
   * asked, and "unreachable" is the answer. Returning 500 would make the
   * scheduler's own retry logic — and any uptime monitor watching *this*
   * endpoint — fire for a fault that is not here.
   */
  return NextResponse.json({
    ok: true,
    probe: { target: "control-plane", reachable: ok, status, durationMs, errorType },
    /*
     * Surfaced because it decides whether this was worth doing at all. On a
     * read-only serverless filesystem the telemetry store is per-instance and
     * in memory, so this result is likely lost before anyone reads it and the
     * panel would show one lonely check rather than a history.
     */
    retained: isDurable(),
    at: new Date().toISOString(),
  });
}

export async function GET(request: Request) {
  return handle(request);
}

// Vercel Cron issues GET. POST is accepted so an external scheduler that only
// speaks POST needs no special case.
export async function POST(request: Request) {
  return handle(request);
}
