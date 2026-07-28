import { NextResponse } from "next/server";
import { verifyConsolePrincipal } from "@/lib/smarthome-auth";
import { createToken, listTokens, revokeToken, createWebhook, listWebhooks, toggleWebhook, deleteWebhook, listDeliveries, sendTestEvent, CONSOLE_EVENTS } from "@/lib/smarthome-dev-portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const me = await verifyConsolePrincipal(request);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    success: true,
    tokens: listTokens(me.uid),
    webhooks: listWebhooks(me.uid),
    deliveries: listDeliveries(me.uid),
    availableEvents: CONSOLE_EVENTS,
  });
}

export async function POST(request: Request) {
  const me = await verifyConsolePrincipal(request);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await request.json();
    if (b.kind === "webhook") {
      if (!b.url || !Array.isArray(b.events) || !b.events.length) {
        return NextResponse.json({ success: false, message: "url and at least one event required." }, { status: 400 });
      }
      const webhook = createWebhook(me.uid, b.url, b.events);
      return NextResponse.json({ success: true, webhook });
    }
    if (b.kind === "test-event") {
      const delivery = await sendTestEvent(me.uid, b.webhookId, b.event || CONSOLE_EVENTS[0]);
      if (!delivery) return NextResponse.json({ success: false, message: "Webhook not found." }, { status: 404 });
      return NextResponse.json({ success: true, delivery });
    }
    if (!b.label) return NextResponse.json({ success: false, message: "label required." }, { status: 400 });
    const { record, plaintext } = createToken(me.uid, b.label);
    return NextResponse.json({ success: true, record, plaintext });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const me = await verifyConsolePrincipal(request);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const b = await request.json();
    if (b.kind === "webhook") {
      const ok = toggleWebhook(me.uid, b.id, !!b.active);
      return NextResponse.json({ success: ok });
    }
    const ok = revokeToken(me.uid, b.id);
    return NextResponse.json({ success: ok });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const me = await verifyConsolePrincipal(request);
  if (!me) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(request.url);
  const ok = deleteWebhook(me.uid, searchParams.get("id") || "");
  return NextResponse.json({ success: ok });
}
