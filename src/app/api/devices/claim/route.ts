import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { claimDevice } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";

/** POST /api/devices/claim { deviceId, key, name? } — link a device to the account. */
export async function POST(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const { ok, retryAfter } = rateLimit("account", ip);
  if (!ok) {
    return NextResponse.json(
      { success: false, message: "Too many attempts. Please try again shortly." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  const { deviceId, key, name } = await request.json();
  if (!deviceId || !key) {
    return NextResponse.json({ success: false, message: "Device ID and key are required." }, { status: 400 });
  }

  const res = claimDevice(String(deviceId).trim(), String(key).trim(), email, name ? String(name).trim() : undefined);
  if (!res.ok) return NextResponse.json({ success: false, message: res.message }, { status: 400 });
  return NextResponse.json({ success: true, device: res.device });
}
