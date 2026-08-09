/**
 * Listening to a camera's microphone.
 *
 *   POST — a viewer arms or stops listening. One call does the whole
 *          handshake: the server mints the upload token, stores it, and hands
 *          it to the camera. The browser never holds it, because the token
 *          exists so the *device* can prove itself.
 *   GET  — the browser collects chunks it has not heard yet.
 */
import { NextRequest, NextResponse } from "next/server";
import { callerOwnsDevice } from "@/lib/camera-relay";
import { armListen, stopListen, audioSince, commandAudio, AUDIO_LISTEN_MS } from "@/lib/camera-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(req: NextRequest): string {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

/** Where the camera should post. Absolute, because the device has no origin. */
function uploadUrl(req: NextRequest): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  return `${base.replace(/\/$/, "")}/api/smarthome/camera/audio`;
}

export async function POST(req: NextRequest) {
  const cpToken = bearer(req);
  if (!cpToken) return NextResponse.json({ error: "authentication required" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { deviceId?: string; on?: boolean };
  const deviceId = typeof body.deviceId === "string" ? body.deviceId : "";
  if (!deviceId) return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  if (!(await callerOwnsDevice(deviceId, cpToken))) {
    return NextResponse.json({ error: "not your device" }, { status: 403 });
  }

  if (body.on === false) {
    // The camera is told first and the buffer cleared after, so a chunk that
    // was already in flight cannot land after the stop and then be served to
    // somebody who believed they had stopped listening.
    await commandAudio(deviceId, cpToken, { action: "listen", on: false });
    await stopListen(deviceId);
    return NextResponse.json({ ok: true, listening: false });
  }

  const armed = await armListen(deviceId);
  if (!armed) {
    return NextResponse.json(
      { error: "listening needs a database; DATABASE_URL is not configured here" },
      { status: 503 }
    );
  }

  const sent = await commandAudio(deviceId, cpToken, {
    action: "listen",
    on: true,
    url: uploadUrl(req),
    token: armed.token,
    ttl: Math.round(AUDIO_LISTEN_MS / 1000),
  });
  if (!sent) {
    // Do not leave a live token behind for a camera that was never told about
    // it. An unreachable device that comes back later would otherwise start
    // uploading to a session nobody is in.
    await stopListen(deviceId);
    return NextResponse.json({ error: "could not reach the camera" }, { status: 502 });
  }

  return NextResponse.json({ ok: true, listening: true, expires: armed.expires });
}

export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("deviceId") || "";
  const since = Number(req.nextUrl.searchParams.get("since") || 0);
  const cpToken = bearer(req);
  if (!deviceId) return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  if (!cpToken) return NextResponse.json({ error: "authentication required" }, { status: 401 });
  if (!(await callerOwnsDevice(deviceId, cpToken))) {
    return NextResponse.json({ error: "not your device" }, { status: 403 });
  }

  const chunks = await audioSince(deviceId, Number.isFinite(since) && since > 0 ? since : 0);
  // 200 with an empty list rather than 204: the caller polls on a cursor and
  // needs to keep it, and "nothing new yet" is a normal answer in the second
  // between arming and the first chunk — not an absence of content.
  return NextResponse.json({ chunks });
}
