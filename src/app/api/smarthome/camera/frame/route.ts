/**
 * The camera relay's two ends.
 *
 *   POST — the device uploads its newest frame, authenticated by the
 *          short-lived token it was handed when a viewer armed it.
 *   GET  — the browser reads that frame, authenticated as the device's owner
 *          against the control plane.
 *
 * The device presents a per-session token rather than a permanent credential,
 * so a camera can only upload while somebody has actually asked to watch it.
 */
import { NextRequest, NextResponse } from "next/server";
import { storeFrame, latestFrame, callerOwnsDevice, RELAY_MAX_B64 } from "@/lib/camera-relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(req: NextRequest): string {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

export async function POST(req: NextRequest) {
  const deviceId = req.headers.get("x-cv-device") || "";
  const token = req.headers.get("x-cv-token") || "";
  if (!deviceId || !token) {
    return NextResponse.json({ error: "x-cv-device and x-cv-token are required" }, { status: 400 });
  }

  const body = await req.arrayBuffer();
  const bytes = body.byteLength;
  if (!bytes) return NextResponse.json({ error: "empty frame" }, { status: 400 });

  const jpegB64 = Buffer.from(body).toString("base64");
  if (jpegB64.length > RELAY_MAX_B64) {
    return NextResponse.json({ error: "frame too large" }, { status: 413 });
  }

  const r = await storeFrame(deviceId, token, jpegB64, bytes);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.status });
  return NextResponse.json({ ok: true, bytes });
}

export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("deviceId") || "";
  const cpToken = bearer(req);
  if (!deviceId) return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  if (!cpToken) return NextResponse.json({ error: "authentication required" }, { status: 401 });

  if (!(await callerOwnsDevice(deviceId, cpToken))) {
    return NextResponse.json({ error: "not your device" }, { status: 403 });
  }

  const frame = await latestFrame(deviceId);
  if (!frame) {
    /*
     * 204, not 404. The camera exists and the caller may see it; there simply
     * is no fresh frame yet — usually the second or two between arming and the
     * first upload. A 404 would read as "no such camera" and send someone
     * hunting for a device that is sitting right there.
     */
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json(frame);
}
