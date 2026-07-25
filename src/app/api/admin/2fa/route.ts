import { NextResponse } from "next/server";
import { adminFromRequest } from "@/lib/admin-auth";
import { setAdminTwoFactor, flushNow } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/2fa — whether 2FA is enabled + which method, for the admin.
export async function GET(request: Request) {
  const me = adminFromRequest(request);
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({
    ok: true,
    enabled: !!me.twoFactorEnabled,
    method: me.twoFactorEnabled ? me.twoFactorMethod || "email" : null,
  });
}

// PUT /api/admin/2fa { enabled } — enable/disable 2-step verification for self.
export async function PUT(request: Request) {
  const me = adminFromRequest(request);
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { enabled } = await request.json().catch(() => ({}));
  if (typeof enabled !== "boolean") {
    return NextResponse.json({ error: "enabled (boolean) is required." }, { status: 400 });
  }
  setAdminTwoFactor(me.email, enabled);
  await flushNow();
  return NextResponse.json({ ok: true, enabled });
}
