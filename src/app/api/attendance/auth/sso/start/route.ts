import { NextRequest, NextResponse } from "next/server";
import { beginAttendanceSso, FLOW_COOKIE, FLOW_TTL, SSO_PATH, publicRequestOrigin, sealAttendance } from "@/lib/attendance-sso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    // Derive from the public Host / X-Forwarded-* (attendance.circuvent.com,
    // home, iot, apex…). Never FRONTEND_URL — that is the marketing site and
    // would mint redirect_uri against circuvent.com for every console host.
    // Never request.url.origin behind Platform bind (http://0.0.0.0:3022).
    const origin = publicRequestOrigin(request);
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
