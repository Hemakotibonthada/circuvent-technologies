import { NextResponse } from "next/server";
import { listDevicesByOwner } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";
import { listFleetDevices, mergeDeviceLists } from "@/lib/shop-fleet";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/devices — devices linked to the signed-in account, with live state.
 *
 * Reads both registries. The shop's own table holds units claimed here with the
 * printed ID and key; the control plane holds everything commissioned through
 * the app, which is where a customer's devices actually are. Listing only the
 * former is why this page showed "No devices linked yet" to people whose
 * hardware was online at the time — see lib/shop-fleet.ts.
 */
export async function GET(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });

  const local = listDevicesByOwner(email);
  const fleet = await listFleetDevices(email);
  return NextResponse.json({ success: true, devices: mergeDeviceLists(fleet, local) });
}
