import { NextResponse } from "next/server";
import { listDevicesByOwner } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/devices — devices linked to the signed-in account, with live state. */
export async function GET(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  return NextResponse.json({ success: true, devices: listDevicesByOwner(email) });
}
