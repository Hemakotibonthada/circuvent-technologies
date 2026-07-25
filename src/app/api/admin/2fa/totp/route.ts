import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { adminFromRequest } from "@/lib/admin-auth";
import { setAdminTotp, setAdminTwoFactorMethodEmail, flushNow } from "@/lib/store";
import { generateTotpSecret, otpauthUrl, verifyTotp } from "@/lib/totp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST /api/admin/2fa/totp — begin authenticator setup: returns a fresh secret,
// the otpauth URI, and a QR data-URL (rendered server-side, so the secret is
// never sent to a third-party QR service). Add it to the authenticator app.
export async function POST(request: Request) {
  const me = adminFromRequest(request);
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const secret = generateTotpSecret();
  const otpauth = otpauthUrl(secret, me.email);
  let qr = "";
  try {
    qr = await QRCode.toDataURL(otpauth, { margin: 1, width: 220, color: { dark: "#0b1220", light: "#ffffff" } });
  } catch {
    /* QR is a convenience; manual key entry still works */
  }
  return NextResponse.json({ ok: true, secret, otpauth, qr });
}

// PUT /api/admin/2fa/totp { secret, code } — verify the first code from the
// authenticator, then enable TOTP 2FA for the account.
export async function PUT(request: Request) {
  const me = adminFromRequest(request);
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { secret, code } = await request.json().catch(() => ({}));
  if (typeof secret !== "string" || !secret || !code) {
    return NextResponse.json({ error: "secret and code are required." }, { status: 400 });
  }
  if (!verifyTotp(secret, String(code))) {
    return NextResponse.json({ error: "That code didn't match. Check your authenticator app and try again." }, { status: 400 });
  }
  setAdminTotp(me.email, secret);
  await flushNow();
  return NextResponse.json({ ok: true, enabled: true, method: "totp" });
}

// DELETE /api/admin/2fa/totp — switch back to email codes (keeps 2FA on).
export async function DELETE(request: Request) {
  const me = adminFromRequest(request);
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  setAdminTwoFactorMethodEmail(me.email);
  await flushNow();
  return NextResponse.json({ ok: true, method: "email" });
}
