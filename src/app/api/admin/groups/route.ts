import { NextResponse } from "next/server";
import { adminFromRequest, requireArea } from "@/lib/admin-auth";
import { listDirectoryGroups } from "@/lib/identity-groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * /api/admin/groups — the Circuvent groups a report can be sent to.
 *
 * Gated on `analytics`, the same area that may send the report. Anyone who can
 * choose where revenue figures go should already be allowed to see them.
 *
 * `configured` distinguishes the two reasons the list can be empty: no service
 * token set up, versus a directory that genuinely has no mail-enabled groups.
 * The screen says something different for each, rather than showing an empty
 * picker that looks broken either way.
 */
export async function GET(request: Request) {
  if (!requireArea(adminFromRequest(request), "analytics")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const groups = await listDirectoryGroups();
  return NextResponse.json({
    groups,
    configured: !!process.env.IDENTITY_SERVICE_TOKEN,
  });
}
