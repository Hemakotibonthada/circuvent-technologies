import { NextRequest, NextResponse } from "next/server";
import { verifyCaller } from "@/lib/user-prefs";
import {
  deleteCamera,
  getCamera,
  revokePhone,
  toPublic,
  updateCamera,
} from "@/lib/external-cameras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> | { id: string } };

async function paramId(ctx: Ctx): Promise<string> {
  const p = ctx.params;
  const resolved = typeof (p as Promise<{ id: string }>).then === "function" ? await (p as Promise<{ id: string }>) : (p as { id: string });
  return resolved.id;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const id = await paramId(ctx);
  const cam = await getCamera(caller.key, id);
  if (!cam) return NextResponse.json({ ok: false, error: "Camera not found." }, { status: 404 });
  return NextResponse.json({ ok: true, camera: toPublic(cam) });
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const id = await paramId(ctx);
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

  if (body.revoke === true) {
    const ok = await revokePhone(caller.key, id);
    if (!ok) return NextResponse.json({ ok: false, error: "Camera not found." }, { status: 404 });
    const cam = await getCamera(caller.key, id);
    return NextResponse.json({ ok: true, camera: cam ? toPublic(cam) : null });
  }

  const patch: Parameters<typeof updateCamera>[2] = {};
  if (typeof body.name === "string") patch.name = body.name;
  if (typeof body.streamUrl === "string") patch.streamUrl = body.streamUrl;
  if (typeof body.snapshotUrl === "string") patch.snapshotUrl = body.snapshotUrl;
  if (typeof body.username === "string") patch.username = body.username;
  if (typeof body.password === "string") patch.password = body.password;
  if (typeof body.roomName === "string") patch.roomName = body.roomName;

  const updated = await updateCamera(caller.key, id, patch);
  if (!updated) return NextResponse.json({ ok: false, error: "Camera not found." }, { status: 404 });
  return NextResponse.json({ ok: true, camera: toPublic(updated) });
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const caller = await verifyCaller(req);
  if (!caller) return NextResponse.json({ ok: false, error: "Sign in required." }, { status: 401 });
  const id = await paramId(ctx);
  const removed = await deleteCamera(caller.key, id);
  if (!removed) return NextResponse.json({ ok: false, error: "Camera not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
