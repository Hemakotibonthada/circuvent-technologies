import { NextResponse } from "next/server";
import { publicKey, pushConfigured } from "@/lib/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/push/key — the VAPID public key a browser needs to subscribe.
 *
 * Public by design: it is the half of the pair that identifies the sender to
 * the push service, and a browser cannot subscribe without it. The private
 * key never leaves the server.
 *
 * When push is not configured this says so rather than returning an empty
 * string. The client can then explain that notifications are unavailable
 * instead of offering a button that silently fails.
 */
export async function GET() {
  if (!pushConfigured()) {
    return NextResponse.json({
      ok: false,
      configured: false,
      message: "Browser notifications are not configured on this deployment (VAPID keys are not set).",
    });
  }
  return NextResponse.json({ ok: true, configured: true, key: publicKey() });
}
