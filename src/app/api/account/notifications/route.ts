import { NextResponse } from "next/server";
import { listNotifications, markNotificationsRead, clearNotifications } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/account/notifications — my in-app notifications. */
export async function GET(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  const notifications = listNotifications(email);
  const unread = notifications.filter((n) => !n.read).length;
  return NextResponse.json({ success: true, notifications, unread });
}

/** PATCH /api/account/notifications { ids? } — mark read (all if ids omitted). */
export async function PATCH(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  const { ids } = await request.json().catch(() => ({}));
  markNotificationsRead(email, Array.isArray(ids) ? ids : undefined);
  return NextResponse.json({ success: true });
}

/** DELETE /api/account/notifications — clear all. */
export async function DELETE(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  clearNotifications(email);
  return NextResponse.json({ success: true });
}
