import { NextResponse } from "next/server";
import { deviceSync } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/devices/sync  (device protocol — proprietary)
 * Auth: headers x-device-id + x-device-key.
 * Body: { type?, state? }  — device posts its latest telemetry/state.
 * Returns: { ok, claimed, commands[] } — pending commands are drained.
 *
 * This single endpoint serves as heartbeat + telemetry + command poll so the
 * firmware only needs one HTTPS call on a timer.
 */
export async function POST(request: Request) {
  const id = request.headers.get("x-device-id") || "";
  const key = request.headers.get("x-device-key") || "";
  if (!id || !key) {
    return NextResponse.json({ ok: false, error: "Missing device credentials" }, { status: 401 });
  }

  let body: { type?: string; state?: Record<string, unknown> } = {};
  try {
    body = await request.json();
  } catch {
    /* empty body is fine */
  }

  const res = deviceSync(id, key, body?.type, body?.state);
  if (!res) {
    return NextResponse.json({ ok: false, error: "Authentication failed" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, claimed: res.claimed, pending: !!res.pending, commands: res.commands });
}
