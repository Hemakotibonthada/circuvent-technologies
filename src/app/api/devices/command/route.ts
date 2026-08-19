import { NextResponse } from "next/server";
import { enqueueCommand } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";
import { sendFleetCommand } from "@/lib/shop-fleet";

export const runtime = "nodejs";

/**
 * POST /api/devices/command { deviceId, action, params? } — queue a command.
 *
 * The shop's own table is tried first because it is local and authoritative for
 * the devices it holds. A device that is not in it is almost certainly on the
 * control plane, which is now where the list comes from — without the second
 * attempt every button on a control-plane device would fail with "not found"
 * while the card sat there showing it online.
 */
export async function POST(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });

  const { deviceId, action, params } = await request.json();
  if (!deviceId || !action) {
    return NextResponse.json({ success: false, message: "deviceId and action are required." }, { status: 400 });
  }

  const res = enqueueCommand(String(deviceId), email, String(action), params);
  if (res.ok) return NextResponse.json({ success: true });

  const sent = await sendFleetCommand(email, String(deviceId), String(action), params);
  if (sent) return NextResponse.json({ success: true });

  return NextResponse.json({ success: false, message: res.message }, { status: 400 });
}
