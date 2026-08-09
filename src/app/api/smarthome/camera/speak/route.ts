/**
 * Talking through a camera.
 *
 *   POST — the browser uploads a WAV clip. The server validates it, stores it
 *          as the single pending clip for that camera, and tells the device to
 *          come and fetch it.
 *   GET  — the device collects it, once, presenting the token it was given.
 *
 * The device pulls rather than being pushed to, because nothing on the public
 * internet can reach into a home network — and because a camera that accepted
 * unsolicited audio would be a loudspeaker in someone's house that a stranger
 * could use. The token is one-shot and short-lived, so the worst an intercepted
 * command can do is play a clip that its rightful owner had already recorded.
 */
import { NextRequest, NextResponse } from "next/server";
import { callerOwnsDevice } from "@/lib/camera-relay";
import {
  queueSpeak,
  takeSpeak,
  commandAudio,
  validateSpeakWav,
  SPEAK_MAX_B64,
  SPEAK_MAX_SECONDS,
} from "@/lib/camera-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function bearer(req: NextRequest): string {
  const h = req.headers.get("authorization") || "";
  return h.startsWith("Bearer ") ? h.slice(7) : "";
}

function fetchUrl(req: NextRequest, deviceId: string, token: string): string {
  const base = process.env.NEXT_PUBLIC_SITE_URL || req.nextUrl.origin;
  return (
    `${base.replace(/\/$/, "")}/api/smarthome/camera/speak` +
    `?deviceId=${encodeURIComponent(deviceId)}&token=${encodeURIComponent(token)}`
  );
}

export async function POST(req: NextRequest) {
  const cpToken = bearer(req);
  if (!cpToken) return NextResponse.json({ error: "authentication required" }, { status: 401 });

  const deviceId = req.nextUrl.searchParams.get("deviceId") || "";
  if (!deviceId) return NextResponse.json({ error: "deviceId is required" }, { status: 400 });
  if (!(await callerOwnsDevice(deviceId, cpToken))) {
    return NextResponse.json({ error: "not your device" }, { status: 403 });
  }

  const body = await req.arrayBuffer();
  if (!body.byteLength) return NextResponse.json({ error: "no audio was sent" }, { status: 400 });
  const buf = Buffer.from(body);

  /*
   * Validated here and not only in the browser.
   *
   * The firmware skips a fixed 44-byte header and streams whatever follows
   * straight to the amplifier. It does not reject a malformed file — it plays
   * it, as noise at the wrong speed through a speaker in someone's home. The
   * browser's own encoder is correct, but the browser is not the only thing
   * that can call this.
   */
  const check = validateSpeakWav(buf);
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  const wavB64 = buf.toString("base64");
  if (wavB64.length > SPEAK_MAX_B64) {
    return NextResponse.json(
      { error: `clip is too long — the camera plays at most ${SPEAK_MAX_SECONDS}s` },
      { status: 413 }
    );
  }

  const queued = await queueSpeak(deviceId, wavB64);
  if (!queued) {
    return NextResponse.json(
      { error: "talking needs a database; DATABASE_URL is not configured here" },
      { status: 503 }
    );
  }

  const sent = await commandAudio(deviceId, cpToken, {
    action: "speak",
    url: fetchUrl(req, deviceId, queued.token),
    token: queued.token,
  });
  if (!sent) return NextResponse.json({ error: "could not reach the camera" }, { status: 502 });

  const seconds = (buf.readUInt32LE(40) / (8000 * 2)).toFixed(1);
  return NextResponse.json({ ok: true, seconds: Number(seconds) });
}

/**
 * The device collecting its clip.
 *
 * Deliberately not behind the owner check the rest of this file uses: the
 * caller here is an ESP32 with no user session, and the one-shot token it
 * presents was minted seconds earlier for this device alone. Requiring a user
 * credential would mean putting a durable one on the device, which is a much
 * worse trade than a token that works once and expires in a minute.
 */
export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get("deviceId") || "";
  const token = req.nextUrl.searchParams.get("token") || req.headers.get("x-cv-token") || "";
  if (!deviceId || !token) {
    return NextResponse.json({ error: "deviceId and token are required" }, { status: 400 });
  }

  const wav = await takeSpeak(deviceId, token);
  if (!wav) {
    // 410, not 404: the usual cause is a clip that was already collected or
    // has expired, and "gone" says that. A 404 would read as "no such camera"
    // and send someone looking at the device.
    return NextResponse.json({ error: "nothing to play" }, { status: 410 });
  }

  return new NextResponse(new Uint8Array(wav), {
    status: 200,
    headers: {
      "content-type": "audio/wav",
      "content-length": String(wav.length),
      "cache-control": "no-store",
    },
  });
}
