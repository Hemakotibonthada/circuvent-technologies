import { NextRequest, NextResponse } from "next/server";
import { verifyCaller } from "@/lib/user-prefs";
import { getCamera, latestPhoneFrame, resolvePlayUrl } from "@/lib/external-cameras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> | { id: string } };

async function paramId(ctx: Ctx): Promise<string> {
  const p = ctx.params;
  const resolved = typeof (p as Promise<{ id: string }>).then === "function" ? await (p as Promise<{ id: string }>) : (p as { id: string });
  return resolved.id;
}

/** Owner reads the latest phone JPEG, or metadata for URL-based cameras. */
export async function GET(req: NextRequest, ctx: Ctx) {
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const id = await paramId(ctx);
  const cam = await getCamera(caller.key, id);
  if (!cam) return NextResponse.json({ ok: false, error: "Camera not found." }, { status: 404 });

  if (cam.kind === "phone") {
    const frame = await latestPhoneFrame(caller.key, id);
    if (!frame) return new NextResponse(null, { status: 204 });
    return NextResponse.json({ ok: true, kind: "phone", ...frame });
  }

  const playUrl = resolvePlayUrl(cam);
  if (!playUrl && !cam.snapshotUrl) {
    return NextResponse.json(
      {
        ok: false,
        error:
          cam.kind === "rtsp"
            ? "RTSP needs CAMERA_RELAY_BASE_URL (go2rtc/MediaMTX) or a snapshot URL."
            : "No playable URL on this camera.",
        needsRelay: cam.kind === "rtsp",
      },
      { status: 404 }
    );
  }
  return NextResponse.json({
    ok: true,
    kind: cam.kind,
    playUrl,
    snapshotUrl: cam.snapshotUrl || null,
  });
}
