import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import {
  affectedPeople,
  appBreakdown,
  failureGroups,
  failuresForActor,
  isDurable,
  receivedCount,
  revalidateFailures,
} from "@/lib/api-failures";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/insights-failures — the cross-application failure view.
 *
 * Three answers to the three questions support asks, in the order they get
 * asked: which application is unhealthy, which people are stuck, and what is
 * actually going wrong. `?actor=` drills into one person.
 */
export async function GET(request: Request) {
  if (!guard(request, "insights")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await revalidateFailures();

  const url = new URL(request.url);
  const hours = Math.max(1, Math.min(720, Number(url.searchParams.get("hours")) || 24));
  const actor = url.searchParams.get("actor");

  if (actor) {
    return NextResponse.json({
      success: true,
      actor: actor.toLowerCase(),
      hours,
      failures: failuresForActor(actor, hours),
    });
  }

  return NextResponse.json({
    success: true,
    hours,
    apps: appBreakdown(hours),
    people: affectedPeople(hours),
    groups: failureGroups(hours).slice(0, 50),
    received: receivedCount(),
    /*
     * Surfaced rather than assumed. Without a database this store keeps one
     * lambda's memory, and a panel reading empty then means "nothing was kept",
     * not "nothing went wrong" — the panel says which.
     */
    durable: isDurable(),
  });
}
