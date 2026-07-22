import { NextResponse } from "next/server";
import { enqueueCommand } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";

/** POST /api/devices/command { deviceId, action, params? } — queue a command. */
export async function POST(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });

  const { deviceId, action, params } = await request.json();
  if (!deviceId || !action) {
    return NextResponse.json({ success: false, message: "deviceId and action are required." }, { status: 400 });
  }

  const res = enqueueCommand(String(deviceId), email, String(action), params);
  if (!res.ok) return NextResponse.json({ success: false, message: res.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
