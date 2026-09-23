import { NextRequest, NextResponse } from "next/server";
import { verifyCaller } from "@/lib/user-prefs";
import { createPhonePair, toPublic } from "@/lib/external-cameras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function siteBase(req: NextRequest): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  return (configured || req.nextUrl.origin).replace(/\/$/, "");
}

/** Desktop: mint a phone camera + pairing link / token for QR. */
export async function POST(req: NextRequest) {
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { name?: string; roomName?: string };
  const { cam, pairToken, expires } = await createPhonePair(caller.key, {
    name: body.name,
    roomName: body.roomName,
  });

  const pairUrl = `${siteBase(req)}/smarthome/camera/phone?token=${encodeURIComponent(pairToken)}`;

  return NextResponse.json({
    ok: true,
    camera: toPublic(cam),
    pairToken,
    pairUrl,
    expires,
  });
}
