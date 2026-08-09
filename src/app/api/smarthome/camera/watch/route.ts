/**
 * Arms (or disarms) a camera for remote viewing.
 *
 * One call does the whole handshake, because splitting it would put the upload
 * token in the browser for no reason: the token exists so the *device* can
 * prove itself, and the browser never needs to hold it. Here the server mints
 * it, stores it, and hands it to the camera over the control plane's command
 * path — the browser only ever learns that watching started.
 */
import { NextRequest, NextResponse } from "next/server";
import { armRelay, callerOwnsDevice, commandCloudPush, RELAY_ARM_MS } from "@/lib/camera-relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Where the camera should post. Absolute, because the device has no origin. */
function uploadUrl(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  const base = configured || req.nextUrl.origin;
  return `${base.replace(/\/$/, "")}/api/smarthome/camera/frame`;
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get("authorization") || "";
  const cpToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!cpToken) return NextResponse.json({ error: "authentication required" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    deviceId?: string;
    on?: boolean;
    fps?: number;
  };
  const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
  if (!deviceId) return NextResponse.json({ error: "deviceId is required" }, { status: 400 });

  if (!(await callerOwnsDevice(deviceId, cpToken))) {
    return NextResponse.json({ error: "not your device" }, { status: 403 });
  }

  if (body.on === false) {
    await commandCloudPush(deviceId, cpToken, { on: false });
    return NextResponse.json({ ok: true, watching: false });
  }

  const armed = await armRelay(deviceId);
  if (!armed) {
    return NextResponse.json(
      { error: "remote viewing needs a database; DATABASE_URL is not configured here" },
      { status: 503 }
    );
  }

  /*
   * Frame rate is capped deliberately. Each upload is a full TLS request from
   * an ESP32, which takes a few hundred milliseconds; asking for more than
   * this does not produce more frames, it produces a backlog and a hot radio.
   * LAN viewing is the route for smooth video — this one is for seeing what is
   * happening at home from somewhere else.
   */
  const fps = Math.min(4, Math.max(1, Math.round(body.fps ?? 2)));

  const sent = await commandCloudPush(deviceId, cpToken, {
    on: true,
    url: uploadUrl(req),
    token: armed.token,
    fps,
    ttl: Math.round(RELAY_ARM_MS / 1000),
  });
  if (!sent) return NextResponse.json({ error: "could not reach the camera" }, { status: 502 });

  return NextResponse.json({ ok: true, watching: true, fps, expires: armed.expires });
}
