import { NextRequest, NextResponse } from "next/server";
import { verifyCaller } from "@/lib/user-prefs";
import {
  addCamera,
  camerasDurable,
  hydrateCameras,
  listCameras,
  toPublic,
  type AddCameraInput,
  type ExternalCameraKind,
} from "@/lib/external-cameras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type BrandKind = Exclude<ExternalCameraKind, "phone">;
const KINDS = new Set<BrandKind>(["hls", "mjpeg", "snapshot", "rtsp"]);

function isBrandKind(v: unknown): v is BrandKind {
  return typeof v === "string" && KINDS.has(v as BrandKind);
}

export async function GET(req: NextRequest) {
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ ok: false, error: "Sign in to manage cameras." }, { status: 401 });
  await hydrateCameras();
  const cams = await listCameras(caller.key);
  return NextResponse.json({
    ok: true,
    cameras: cams.map(toPublic),
    durable: camerasDurable(),
    relayConfigured: !!(process.env.CAMERA_RELAY_BASE_URL || "").trim(),
  });
}

export async function POST(req: NextRequest) {
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ ok: false, error: "Sign in to manage cameras." }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as Partial<AddCameraInput>;
  const streamUrl = typeof body.streamUrl === "string" ? body.streamUrl.trim() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";

  if (!isBrandKind(body.kind)) {
    return NextResponse.json({ ok: false, error: "kind must be hls, mjpeg, snapshot, or rtsp." }, { status: 400 });
  }
  const kind = body.kind;
  if (!streamUrl) {
    return NextResponse.json({ ok: false, error: "A stream or RTSP URL is required." }, { status: 400 });
  }
  if (kind !== "rtsp" && !/^https?:\/\//i.test(streamUrl) && !streamUrl.startsWith("/")) {
    return NextResponse.json({ ok: false, error: "Stream URL must be http(s) or a site-relative path." }, { status: 400 });
  }
  if (kind === "rtsp" && !/^rtsps?:\/\//i.test(streamUrl)) {
    return NextResponse.json({ ok: false, error: "RTSP cameras need an rtsp:// or rtsps:// URL." }, { status: 400 });
  }

  const cam = await addCamera(caller.key, {
    name: name || "Camera",
    kind,
    streamUrl,
    snapshotUrl: typeof body.snapshotUrl === "string" ? body.snapshotUrl : undefined,
    username: typeof body.username === "string" ? body.username : undefined,
    password: typeof body.password === "string" ? body.password : undefined,
    roomName: typeof body.roomName === "string" ? body.roomName : undefined,
  });

  return NextResponse.json({ ok: true, camera: toPublic(cam), durable: camerasDurable() });
}
