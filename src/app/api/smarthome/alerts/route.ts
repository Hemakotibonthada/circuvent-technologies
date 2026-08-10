import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit } from "@/lib/rate-limit";
import { analyseHome } from "@/lib/ai/analysis";
import { sweep, acknowledge, summarise, type Alert } from "@/lib/anomaly-monitor";
import { accountKey, readAlerts, writeAlerts, lastSweepAt } from "@/lib/alerts-store";
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
 * POST /api/smarthome/alerts — run a sweep, or acknowledge an alert.
 *
 * /api/ai/analyze answers "what is wrong right now" and forgets. That is
 * enough for a panel somebody is looking at and useless for anything else: a
 * hub can be offline for three days and the system will describe it perfectly
 * the first time anyone opens the page.
 *
 * This keeps the state between evaluations, so the same problem stays one
 * alert — raised once, counted while it persists, closed by itself when it
 * stops — and so a notification can be sent for a problem nobody is watching
 * for.
 *
 * `{ action: "acknowledge", fingerprint }` silences an alert's reminders
 * without claiming it is fixed.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const { ok, retryAfter } = rateLimit("ai", ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many requests." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      consoleToken?: string;
      action?: string;
      fingerprint?: string;
      by?: string;
    };
    const token = typeof body.consoleToken === "string" ? body.consoleToken.trim() : "";
    if (!token) {
      return NextResponse.json({ success: false, message: "Sign in to the smart-home console first." }, { status: 401 });
    }

    const key = accountKey(token);

    if (body.action === "acknowledge") {
      if (!body.fingerprint) {
        return NextResponse.json({ success: false, message: "Which alert?" }, { status: 400 });
      }
      const next = acknowledge(readAlerts(key), body.fingerprint, String(body.by || "console"));
      writeAlerts(key, next);
      return NextResponse.json({ success: true, alerts: next, summary: summarise(next) });
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

    const deviceList = await get<{ devices: Device[] }>("/devices");
    /*
     * Not reaching the control plane is not the same as nothing being wrong.
     * If this returned an empty finding set, the sweep would close every open
     * alert and report a fleet-wide recovery that never happened. So a failed
     * fetch returns the alerts as they stand, untouched, and says the sweep
     * did not run.
     */
    if (!deviceList || !Array.isArray(deviceList.devices)) {
      const alerts = readAlerts(key);
      return NextResponse.json(
        {
          success: false,
          swept: false,
          message: "Could not reach the smart-home service — showing the last known alerts.",
          alerts,
          summary: summarise(alerts),
          lastSweepAt: lastSweepAt(key),
        },
        { status: 502 }
      );
    }

    const [events, automations] = await Promise.all([
      get<{ events: AppEvent[] }>("/events?limit=100"),
      get<{ automations: unknown[] }>("/automations"),
    ]);

    const analysis = analyseHome({
      devices: deviceList.devices,
      events: events?.events ?? [],
      automations: (automations?.automations ?? []) as Parameters<typeof analyseHome>[0]["automations"],
    });

    const previous: Alert[] = readAlerts(key);
    // The evaluation demonstrably ran, so an empty result really does mean
    // everything is healthy and open alerts should close.
    const result = sweep(previous, analysis.findings, { sweepProducedFindings: true });
    writeAlerts(key, result.alerts);

    if (result.opened.length || result.resolved.length || result.escalated.length) {
      logger.info("smarthome.alerts_swept", {
        opened: result.opened.length,
        resolved: result.resolved.length,
        escalated: result.escalated.length,
        open: result.alerts.filter((a) => a.state === "open").length,
      });
    }

    return NextResponse.json({
      success: true,
      swept: true,
      alerts: result.alerts,
      summary: summarise(result.alerts),
      opened: result.opened,
      resolved: result.resolved,
      escalated: result.escalated,
      notify: result.toNotify,
      lastSweepAt: lastSweepAt(key),
    });
  } catch (err) {
    logger.error("smarthome.alerts_failed", {}, err);
    return NextResponse.json({ success: false, message: "Could not evaluate alerts." }, { status: 500 });
  }
}
