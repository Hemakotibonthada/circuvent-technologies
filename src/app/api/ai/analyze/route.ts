import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { analyseHome } from "@/lib/ai/analysis";
import { logger } from "@/lib/logger";
import type { Device, AppEvent } from "@/lib/control-plane";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTROL_PLANE_URL = (
  process.env.CONTROL_PLANE_URL ||
  process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ||
  "https://api.circuvent.com"
).replace(/\/$/, "");

/**
 * POST /api/ai/analyze — the diagnostic, with no language model involved.
 *
 * Separate from /chat on purpose. Dashboards, the mobile home screen and the
 * admin console want the findings themselves, not prose about them, and they
 * should keep working when no AI provider is configured or the provider is
 * down. Nothing in this path can hallucinate: it is arithmetic over readings
 * fetched with the caller's own token.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const { ok, retryAfter } = rateLimit("ai", ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many requests." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    const body = (await request.json().catch(() => ({}))) as { consoleToken?: string };
    const token = typeof body.consoleToken === "string" ? body.consoleToken.trim() : "";
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Sign in to the smart-home console first." },
        { status: 401 },
      );
    }

    const get = async <T>(path: string): Promise<T | null> => {
      try {
        const res = await fetch(`${CONTROL_PLANE_URL}${path}`, {
          headers: { authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8000),
        });
        return res.ok ? ((await res.json()) as T) : null;
      } catch {
        return null;
      }
    };

    /**
     * The control plane wraps its collections: `/devices` answers
     * `{ devices: [...] }`, not a bare array, and `/events` and `/automations`
     * are the same shape. `get<T>` ends in `as T`, which is an assertion rather
     * than a check, so typing this call as `Device[]` compiled cleanly and then
     * handed `analyseHome` an object where it expects an array. It spreads that
     * into `findOfflineDevices` and throws, which the catch-all turns into a
     * 500 and the panel renders as "Analysis failed." — with nothing anywhere
     * naming the actual mismatch.
     *
     * The other two calls were already unwrapped correctly. Only this one lied.
     */
    const deviceList = await get<{ devices: Device[] }>("/devices");
    if (!deviceList || !Array.isArray(deviceList.devices)) {
      return NextResponse.json(
        { success: false, message: "Could not reach the smart-home service." },
        { status: 502 },
      );
    }
    const devices = deviceList.devices;

    // Events and automations enrich the analysis but are not required for it,
    // so a failure there degrades the report rather than failing the request.
    const [events, automations] = await Promise.all([
      get<{ events: AppEvent[] }>("/events?limit=100"),
      get<{ automations: unknown[] }>("/automations"),
    ]);

    const analysis = analyseHome({
      devices,
      events: events?.events ?? [],
      automations: (automations?.automations ?? []) as Parameters<typeof analyseHome>[0]["automations"],
    });

    return NextResponse.json({ success: true, analysis });
  } catch (err) {
    logger.error("ai.analyze_failed", {}, err);
    return NextResponse.json({ success: false, message: "Analysis failed." }, { status: 500 });
  }
}
