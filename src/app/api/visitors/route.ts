import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { visitorTracker } from "@/lib/visitor-tracker";
import {
  normalizePath,
  normalizeReferrer,
  visitorHash,
  classifyDevice,
  classifyBrowser,
  optedOut,
} from "@/lib/traffic";
import { guard } from "@/lib/admin-auth";

/**
 * Page-view ingest.
 *
 * WHAT CHANGED AND WHY
 *
 * The previous version trusted the client for both identity and the grouping
 * key: it took whatever `visitorId` the browser sent and whatever `page`
 * string came with it, then used that page as a Map key. Both were free to
 * invent, so anyone could inflate the unique-visitor count and grow the page
 * table without bound from a loop in a console tab. It also kept the raw IP
 * on every visitor record.
 *
 * Now the visitor id is derived server-side from a daily-rotating salted hash
 * and the path is normalised against the real route table, so neither is
 * attacker-controlled. No IP is retained.
 */

export const runtime = "nodejs";

/** A view is counted once per visitor per path within this window. */
const DEDUPE_MS = 30_000;
const recent = new Map<string, number>();

/** Bounded, so the dedupe map cannot become the leak it exists to prevent. */
const MAX_RECENT = 20_000;

function seenRecently(key: string, now: number): boolean {
  const last = recent.get(key);
  if (last !== undefined && now - last < DEDUPE_MS) return true;

  if (recent.size >= MAX_RECENT) {
    for (const [k, t] of recent) {
      if (now - t >= DEDUPE_MS) recent.delete(k);
    }
    if (recent.size >= MAX_RECENT) {
      // Map preserves insertion order, so the first key is the oldest.
      const oldest = recent.keys().next().value;
      if (oldest !== undefined) recent.delete(oldest);
    }
  }
  recent.set(key, now);
  return false;
}

export async function POST(request: NextRequest) {
  // Do not measure anyone who has asked not to be. The site already gates
  // Vercel Analytics behind explicit consent; running our own tracker anyway
  // would make that gate a fiction.
  if (optedOut(request.headers)) {
    return NextResponse.json({ ok: true, counted: false, reason: "opted_out" });
  }

  let body: { action?: unknown; page?: unknown; referrer?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const path = normalizePath(body.page);
  // Not an error: a request for an asset or an unrecognised route simply is
  // not a page view, and telling a scanner which paths we accept would be a
  // small gift.
  if (!path) return NextResponse.json({ ok: true, counted: false });

  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? "";
  const id = visitorHash(ip, ua);

  const action = typeof body.action === "string" ? body.action : "view";
  if (action === "disconnect") {
    visitorTracker.leave(id);
    return NextResponse.json({ ok: true });
  }
  if (action === "heartbeat") {
    visitorTracker.heartbeat(id, path);
    return NextResponse.json({ ok: true });
  }

  // A remount, a fast back-and-forward, or a double-fired effect must not
  // each count as a separate view of the same page.
  //
  // Keyed on the RAW path, not the normalised one. Every product collapses to
  // /shop/[slug] for storage, so de-duplicating on that key would count a
  // visitor browsing five products in half a minute as a single view — the
  // grouping that protects the table would have silently become an undercount
  // of real engagement. The dedupe map is bounded and its entries expire, so
  // using the wider key here costs nothing.
  const now = Date.now();
  const rawKey = typeof body.page === "string" ? body.page.split("#")[0].slice(0, 200) : path;
  if (seenRecently(`${id}|${rawKey}`, now)) {
    visitorTracker.heartbeat(id, path);
    return NextResponse.json({ ok: true, counted: false, reason: "deduped" });
  }

  visitorTracker.record(id, {
    path,
    visitorHash: id,
    referrerHost: normalizeReferrer(body.referrer, request.headers.get("host") ?? undefined),
    device: classifyDevice(ua),
    browser: classifyBrowser(ua),
    country: request.headers.get("x-vercel-ip-country"),
  });

  return NextResponse.json({ ok: true, counted: true });
}

/**
 * GET — the live snapshot.
 *
 * Staff only. The previous handler was public, which published the site's
 * traffic and its busiest pages to anyone who asked for them.
 */
export async function GET(request: NextRequest) {
  if (!guard(request, "analytics")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(visitorTracker.liveSnapshot());
}
