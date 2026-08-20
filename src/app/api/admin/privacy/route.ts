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
    const res = updateRequestStatus(b.id, b.status, b.note, b.erasureRef);
    if (!res.ok) {
      return NextResponse.json({ success: false, message: res.reason }, { status: 400 });
    }
    const req = res.request;
    // The actor and the erasure evidence, not just the transition. "Who
    // closed this and on what basis" is the question asked afterwards.
    logAudit(
      "privacy.request.status",
      `${me.email}: ${req.id} -> ${req.status}${req.erasureRef ? ` (erasure: ${req.erasureRef})` : ""}`
    );
    return NextResponse.json({ success: true, request: req });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}
