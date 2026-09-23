import { NextRequest, NextResponse } from "next/server";
import { claimPhonePair } from "@/lib/external-cameras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Phone: exchange short-lived pair token for ingest credentials. No console login required. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { token?: string };
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (!token) return NextResponse.json({ ok: false, error: "Pairing token required." }, { status: 400 });

  const claimed = await claimPhonePair(token);
  if (!claimed) {
    return NextResponse.json(
      { ok: false, error: "This pairing link is invalid or has expired. Generate a new one from Cameras." },
      { status: 410 }
    );
  }

  return NextResponse.json({
    ok: true,
    cameraId: claimed.cam.id,
    name: claimed.cam.name,
    roomName: claimed.cam.roomName || null,
    ingestToken: claimed.ingestToken,
    expires: claimed.expires,
  });
}
