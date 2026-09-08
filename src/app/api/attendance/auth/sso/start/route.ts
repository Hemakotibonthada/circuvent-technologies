import { NextRequest, NextResponse } from "next/server";
import { beginAttendanceSso, FLOW_COOKIE, FLOW_TTL, SSO_PATH, sealAttendance } from "@/lib/attendance-sso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const origin = new URL(request.url).origin;
    const { flow, url } = beginAttendanceSso(origin, request.nextUrl.searchParams.get("tab"));
    const response = NextResponse.redirect(url);
    response.headers.set("Cache-Control", "no-store");
    response.cookies.set(FLOW_COOKIE, sealAttendance("flow", flow), {
      httpOnly: true, secure: origin.startsWith("https:"), sameSite: "lax", path: SSO_PATH, maxAge: FLOW_TTL,
    });
    return response;
  } catch {
    return NextResponse.json({ error: "Attendance sign-in is not configured." }, { status: 503 });
  }
}
