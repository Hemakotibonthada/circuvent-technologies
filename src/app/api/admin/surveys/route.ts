import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { submitResponse, listResponses, npsScore } from "@/lib/admin-surveys";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/surveys — admin-only aggregated view. */
export async function GET(request: Request) {
  if (!guard(request, "surveys")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ success: true, responses: listResponses(), nps: npsScore() });
}

/** POST /api/admin/surveys — PUBLIC: any customer can submit a satisfaction score. */
export async function POST(request: Request) {
  try {
    const b = await request.json();
    if (typeof b.score !== "number") return NextResponse.json({ success: false, message: "score (0-10) required." }, { status: 400 });
    const response = submitResponse(b.score, b.comment, b.email);
    return NextResponse.json({ success: true, response });
  } catch {
    return NextResponse.json({ success: false, message: "Could not submit response." }, { status: 500 });
  }
}
