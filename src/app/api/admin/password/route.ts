import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { revalidate, flushNow, logAudit } from "@/lib/store";
import { adminFromRequest, changeAdminPassword, adminPasswordAge } from "@/lib/admin-auth";
import {
  MAX_PASSWORD_AGE_DAYS,
  MIN_PASSWORD_LENGTH,
  PASSWORD_HISTORY_DEPTH,
  suggestPassword,
} from "@/lib/admin-password-policy";

/**
 * Self-service password management for the signed-in staff member.
 *
 * Deliberately separate from /api/admin/staff, which is the *administrative*
 * surface: that one lets a superadmin reset someone else's password and is
 * gated on the "staff" area. This one is open to every role, because a user
 * must always be able to rotate their own credential — including while it is
 * expired and the rest of the console is locked.
 */

// GET — rotation status for the current user
export async function GET(request: NextRequest) {
  await revalidate(["adminUsers"]);
  const user = adminFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const age = adminPasswordAge(user);
  return NextResponse.json({
    ...age,
    policy: {
      maxAgeDays: MAX_PASSWORD_AGE_DAYS,
      minLength: MIN_PASSWORD_LENGTH,
      historyDepth: PASSWORD_HISTORY_DEPTH,
    },
    // A generated suggestion is offered so the fastest path is also the
    // strongest one. Uses the CSPRNG, never Math.random.
    suggestion: suggestPassword((n) => Uint8Array.from(crypto.randomBytes(n))),
  });
}

// POST — change the current user's password
export async function POST(request: NextRequest) {
  await revalidate(["adminUsers"]);
  const user = adminFromRequest(request);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const currentPassword = (body.currentPassword || "").toString();
  const newPassword = (body.newPassword || "").toString();

  if (!currentPassword || !newPassword) {
    return NextResponse.json(
      { error: "Current and new password are both required" },
      { status: 400 }
    );
  }

  const result = changeAdminPassword(user.email, currentPassword, newPassword);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error, errors: result.errors },
      { status: result.status }
    );
  }

  await flushNow();
  logAudit("staff.password.change", `${user.email} changed their password; other sessions signed out`);

  const age = adminPasswordAge(result.user);
  return NextResponse.json({
    ok: true,
    // Every other session for this account is now invalid. The caller gets a
    // replacement so the act of securing the account does not sign them out.
    token: result.token,
    ...age,
  });
}
