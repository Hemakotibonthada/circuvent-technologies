import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { saveSubscription, removeSubscription, pushConfigured } from "@/lib/web-push";
import { accountKey } from "@/lib/alerts-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/push/subscribe — register a browser for notifications.
 * DELETE                   — unregister it.
 *
 * Scoped to the console token, using the same account key the alert store
 * uses. That matters: a push tells somebody about their own devices, and
 * getting the key wrong here would deliver one household's alerts to another.
 *
 * The subscription itself is not a secret — it is an endpoint URL plus the
 * public half of a keypair the browser generated — but it is a capability to
 * notify that browser, so it is stored against the account rather than left
 * addressable by anyone who knows the endpoint.
 */
export async function POST(request: Request) {
  const { ok, retryAfter } = rateLimit("track", clientIp(request));
  if (!ok) {
    return NextResponse.json(
      { ok: false, message: "Too many requests." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  if (!pushConfigured()) {
    // Saying so is the point: a subscription stored against a server that
    // cannot send is a notification the user believes they will get.
    return NextResponse.json(
      { ok: false, configured: false, message: "Browser notifications are not configured on this deployment." },
      { status: 503 }
    );
  }

  const body = (await request.json().catch(() => ({}))) as {
    consoleToken?: string;
    subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  };

  const token = typeof body.consoleToken === "string" ? body.consoleToken.trim() : "";
  if (!token) {
    return NextResponse.json({ ok: false, message: "Sign in to the smart-home console first." }, { status: 401 });
  }

  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ ok: false, message: "That is not a usable push subscription." }, { status: 400 });
  }

  saveSubscription(accountKey(token), {
    endpoint: sub.endpoint,
    keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { endpoint?: string };
  if (!body?.endpoint) {
    return NextResponse.json({ ok: false, message: "Which subscription?" }, { status: 400 });
  }
  /*
   * No token required to unsubscribe.
   *
   * Knowing the endpoint is proof enough — it is the browser's own address,
   * and the only thing this can do is stop that browser being notified.
   * Requiring a session would leave dead subscriptions behind whenever
   * somebody signs out first, and those endpoints then fail on every send.
   */
  removeSubscription(body.endpoint);
  return NextResponse.json({ ok: true });
}
