import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { logAudit } from "@/lib/store";
import { listRequests, createRequest, updateRequestStatus, buildExportBundle, privacyStats } from "@/lib/admin-privacy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "privacy")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const exportEmail = searchParams.get("exportEmail");
  if (exportEmail) return NextResponse.json({ success: true, bundle: buildExportBundle(exportEmail) });
  return NextResponse.json({ success: true, requests: listRequests(), stats: privacyStats() });
}

/** POST /api/admin/privacy — { email, type } to log a new request (staff-logged on the customer's behalf). */
export async function POST(request: Request) {
  const me = guard(request, "privacy");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (!b.email || (b.type !== "export" && b.type !== "delete")) {
      return NextResponse.json({ success: false, message: "email and type ('export'|'delete') required." }, { status: 400 });
    }
    const req = createRequest(b.email, b.type);
    logAudit("privacy.request.create", `${req.type}:${req.email}`);
    return NextResponse.json({ success: true, request: req });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const me = guard(request, "privacy");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    const req = updateRequestStatus(b.id, b.status, b.note);
    if (!req) return NextResponse.json({ success: false, message: "Not found." }, { status: 404 });
    logAudit("privacy.request.status", `${req.id} -> ${req.status}`);
    return NextResponse.json({ success: true, request: req });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}
