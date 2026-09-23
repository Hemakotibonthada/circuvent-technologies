import { NextRequest, NextResponse } from "next/server";
import { EXT_FRAME_MAX_B64, storePhoneFrame } from "@/lib/external-cameras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Phone uploads a JPEG body with x-cv-camera + x-cv-token headers. */
export async function POST(req: NextRequest) {
  const cameraId = req.headers.get("x-cv-camera") || "";
  const token = req.headers.get("x-cv-token") || "";
  if (!cameraId || !token) {
    return NextResponse.json({ error: "x-cv-camera and x-cv-token are required" }, { status: 400 });
  }

  const body = await req.arrayBuffer();
  if (!body.byteLength) return NextResponse.json({ error: "empty frame" }, { status: 400 });

  const jpegB64 = Buffer.from(body).toString("base64");
  if (jpegB64.length > EXT_FRAME_MAX_B64) {
    return NextResponse.json({ error: "frame too large" }, { status: 413 });
  }

  const r = await storePhoneFrame(cameraId, token, jpegB64, body.byteLength);
  if (!r.ok) return NextResponse.json({ error: r.reason }, { status: r.status });
  return NextResponse.json({ ok: true, bytes: body.byteLength });
}
