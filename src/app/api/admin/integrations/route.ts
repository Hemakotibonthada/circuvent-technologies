import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { logAudit } from "@/lib/store";
import {
  createApiKey,
  listApiKeys,
  revokeApiKey,
  listWebhooks,
  createWebhook,
  toggleWebhook,
  deleteWebhook,
  listDeliveries,
  deliverEvent,
  integrationsStats,
  AVAILABLE_EVENTS,
} from "@/lib/admin-integrations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "integrations")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const webhookId = searchParams.get("webhookId") || undefined;
  return NextResponse.json({
    success: true,
    apiKeys: listApiKeys(),
    webhooks: listWebhooks(),
    deliveries: listDeliveries(webhookId),
    stats: integrationsStats(),
    availableEvents: AVAILABLE_EVENTS,
  });
}

export async function POST(request: Request) {
  const me = guard(request, "integrations");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (b.kind === "webhook") {
      if (!b.url || !Array.isArray(b.events) || !b.events.length) {
        return NextResponse.json({ success: false, message: "url and at least one event required." }, { status: 400 });
      }
      const webhook = createWebhook(b.url, b.events);
      logAudit("integrations.webhook.create", webhook.url);
      return NextResponse.json({ success: true, webhook });
    }
    if (b.kind === "test-event") {
      const result = await deliverEvent(b.event || "order.created", { test: true, note: "Manually triggered test event from Integrations Hub" });
      return NextResponse.json({ success: true, result });
    }
    // default: create API key
    if (!b.label) return NextResponse.json({ success: false, message: "label required." }, { status: 400 });
    const { record, plaintext } = createApiKey(b.label, Array.isArray(b.scopes) ? b.scopes : ["read"]);
    logAudit("integrations.apikey.create", record.label);
    return NextResponse.json({ success: true, record, plaintext });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const me = guard(request, "integrations");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (b.kind === "webhook") {
      const ok = toggleWebhook(b.id, !!b.active);
      return NextResponse.json({ success: ok });
    }
    const ok = revokeApiKey(b.id);
    if (ok) logAudit("integrations.apikey.revoke", b.id);
    return NextResponse.json({ success: ok });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!guard(request, "integrations")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const ok = deleteWebhook(searchParams.get("id") || "");
  return NextResponse.json({ success: ok });
}
