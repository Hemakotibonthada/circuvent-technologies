import { NextResponse } from "next/server";
import { publicAccount, updateAccountProfile } from "@/lib/store";
import { verifyToken, tokenFromRequest } from "@/lib/account";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  return NextResponse.json({ success: true, account: publicAccount(email) });
}

/** PATCH /api/account/profile — update name/phone/gender/dob/gstin/businessName/notifyPrefs. */
export async function PATCH(request: Request) {
  const email = verifyToken(tokenFromRequest(request));
  if (!email) return NextResponse.json({ success: false, message: "Please sign in." }, { status: 401 });
  try {
    const patch = await request.json();
    const account = updateAccountProfile(email, patch || {});
    if (!account) return NextResponse.json({ success: false, message: "Account not found." }, { status: 404 });
    return NextResponse.json({ success: true, account });
  } catch {
    return NextResponse.json({ success: false, message: "Could not update your profile." }, { status: 500 });
  }
}
