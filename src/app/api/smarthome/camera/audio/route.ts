/**
 * Where a camera posts what its microphone heard.
 *
 * Device-facing only. The token is minted per listening session and expires,
 * so a camera can only upload while somebody has actually asked to listen —
 * the device is never given a durable credential for this.
 */
import { NextRequest, NextResponse } from "next/server";
import { storeAudioChunk, AUDIO_MAX_CHUNK_B64 } from "@/lib/camera-audio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const deviceId = req.headers.get("x-cv-device") || "";
  const token = req.headers.get("x-cv-token") || "";
  if (!deviceId || !token) {
    return NextResponse.json({ error: "x-cv-device and x-cv-token are required" }, { status: 400 });
  }

  const body = await req.arrayBuffer();
  const bytes = body.byteLength;
  if (!bytes) return NextResponse.json({ error: "empty chunk" }, { status: 400 });

  const wavB64 = Buffer.from(body).toString("base64");
  if (wavB64.length > AUDIO_MAX_CHUNK_B64) {
    return NextResponse.json({ error: "chunk too large" }, { status: 413 });
  }

  const r = await storeAudioChunk(deviceId, token, wavB64, bytes);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.status });
  return NextResponse.json({ ok: true, bytes });
}
