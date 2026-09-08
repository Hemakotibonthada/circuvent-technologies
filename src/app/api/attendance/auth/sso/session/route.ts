import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SSO_PATH, openAttendance, type AttendanceSession } from "@/lib/attendance-sso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origin mismatch" }, { status: 403 });
  }
  const session = openAttendance<AttendanceSession>("session", request.cookies.get(SESSION_COOKIE)?.value);
  const response = NextResponse.json(session || { error: "This sign-in has expired. Please try again." }, {
    status: session ? 200 : 401, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
  });
  response.cookies.delete({ name: SESSION_COOKIE, path: SSO_PATH });
  return response;
}
