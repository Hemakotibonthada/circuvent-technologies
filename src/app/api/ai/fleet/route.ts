import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { analyseFleet } from "@/lib/ai/fleet";
import { logger } from "@/lib/logger";
import type { AdminDevice } from "@/lib/control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTROL_PLANE_URL = (
  process.env.CONTROL_PLANE_URL ||
  process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ||
  "https://api.circuvent.com"
).replace(/\/$/, "");

/**
 * POST /api/ai/fleet — fleet-wide correlation, with no language model involved.
 *
 * The mobile fleet screens already hold `AdminDevice[]` locally, so this could
 * have been ported into the app instead. It is served here on purpose: the
 * correlation rules and their thresholds are covered by tests, and two copies
 * of that logic would drift until the phone and the console disagreed about
 * whether a firmware release is failing. One implementation, one answer.
 *
 * Authorisation is not decided here. The caller's own token is forwarded to
 * `GET /admin/devices`, and the control plane's admin guard is what actually
 * permits or refuses — this route cannot grant access the token does not carry.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const { ok, retryAfter } = rateLimit("ai", ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many requests." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    let body: { consoleToken?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { success: false, message: "Request body must be valid JSON." },
        { status: 400 },
      );
    }

    const token = typeof body?.consoleToken === "string" ? body.consoleToken.trim() : "";
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Sign in to the console first." },
        { status: 401 },
      );
    }

    let res: Response;
    try {
      res = await fetch(`${CONTROL_PLANE_URL}/admin/devices`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      });
    } catch {
      return NextResponse.json(
        { success: false, message: "Could not reach the smart-home service." },
        { status: 502 },
      );
    }

    // These two are meaningfully different to the person reading the screen:
    // one means "sign in again", the other means "you are not an administrator".
    if (res.status === 401) {
      return NextResponse.json(
        { success: false, message: "Your session expired. Sign in again." },
        { status: 401 },
      );
    }
    if (res.status === 403) {
      return NextResponse.json(
        { success: false, message: "Fleet analysis is available to administrators only." },
        { status: 403 },
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { success: false, message: "Could not read the device fleet." },
        { status: 502 },
      );
    }

    const payload = (await res.json()) as { devices?: AdminDevice[] };
    const devices = Array.isArray(payload?.devices) ? payload.devices : [];

    return NextResponse.json({ success: true, analysis: analyseFleet(devices) });
  } catch (err) {
    logger.error("ai.fleet_failed", {}, err);
    return NextResponse.json({ success: false, message: "Fleet analysis failed." }, { status: 500 });
  }
}
