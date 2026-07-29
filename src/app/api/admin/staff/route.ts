import { NextRequest, NextResponse } from "next/server";
import { hashPassword } from "@/lib/account";
import { checkPassword } from "@/lib/admin-password-policy";
import {
  guard,
  ALL_ROLES,
  ROLE_LABELS,
  DEFAULT_ADMIN_EMAIL,
} from "@/lib/admin-auth";
import {
  listAdminUsers,
  getAdminUser,
  upsertAdminUser,
  patchAdminUser,
  deleteAdminUser,
  countSuperadmins,
  logAudit,
  type AdminRole,
  type AdminUser,
} from "@/lib/store";

function publicStaff(u: AdminUser) {
  return {
    email: u.email,
    name: u.name,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt,
    createdBy: u.createdBy,
    lastLoginAt: u.lastLoginAt,
  };
}

const isRole = (r: unknown): r is AdminRole => ALL_ROLES.includes(r as AdminRole);
const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// GET — list all staff + role catalogue
export async function GET(request: NextRequest) {
  if (!guard(request, "staff")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    staff: listAdminUsers().map(publicStaff),
    roles: ALL_ROLES.map((r) => ({ id: r, label: ROLE_LABELS[r] })),
  });
}

// POST — create a new staff member / make someone an admin
export async function POST(request: NextRequest) {
  const me = guard(request, "staff");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const email = (body.email || "").toString().trim().toLowerCase();
  const name = (body.name || "").toString().trim() || email.split("@")[0];
  const password = (body.password || "").toString();
  const role = body.role;

  if (!validEmail(email)) return NextResponse.json({ error: "Valid email required" }, { status: 400 });
  const strength = checkPassword(password, { email, name });
  if (!strength.ok) {
    return NextResponse.json(
      { error: "Password does not meet the security policy", errors: strength.errors },
      { status: 400 }
    );
  }
  if (!isRole(role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  if (getAdminUser(email)) return NextResponse.json({ error: "A staff account with this email already exists" }, { status: 409 });

  const { salt, hash } = hashPassword(password);
  const user = upsertAdminUser({
    email,
    name,
    hash,
    salt,
    role,
    active: true,
    createdAt: new Date().toISOString(),
    createdBy: me.email,
    passwordChangedAt: new Date().toISOString(),
    // Whoever created the account knows this password, so it is a transport
    // credential, not the user's own. They must replace it at first sign-in.
    mustChangePassword: true,
    tokenVersion: 0,
  });
  logAudit("staff.create", `${me.email} created ${email} as ${role}`);
  return NextResponse.json({ ok: true, staff: publicStaff(user) });
}

// PATCH — update role / reset password / activate-deactivate
export async function PATCH(request: NextRequest) {
  const me = guard(request, "staff");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const email = (body.email || "").toString().trim().toLowerCase();
  const target = getAdminUser(email);
  if (!target) return NextResponse.json({ error: "Staff account not found" }, { status: 404 });

  const patch: Partial<AdminUser> = {};

  if (typeof body.name === "string" && body.name.trim()) patch.name = body.name.trim();

  if (body.role !== undefined) {
    if (!isRole(body.role)) return NextResponse.json({ error: "Invalid role" }, { status: 400 });
    // Don't allow demoting the last active super-admin.
    if (target.role === "superadmin" && body.role !== "superadmin" && countSuperadmins() <= 1) {
      return NextResponse.json({ error: "Cannot demote the last super admin" }, { status: 400 });
    }
    patch.role = body.role;
  }

  if (body.active !== undefined) {
    const active = !!body.active;
    if (!active && target.role === "superadmin" && countSuperadmins() <= 1) {
      return NextResponse.json({ error: "Cannot deactivate the last super admin" }, { status: 400 });
    }
    if (!active && email === me.email) {
      return NextResponse.json({ error: "You cannot deactivate yourself" }, { status: 400 });
    }
    patch.active = active;
  }

  if (typeof body.password === "string" && body.password) {
    const strength = checkPassword(body.password, { email, name: target.name });
    if (!strength.ok) {
      return NextResponse.json(
        { error: "Password does not meet the security policy", errors: strength.errors },
        { status: 400 }
      );
    }
    const { salt, hash } = hashPassword(body.password);
    patch.salt = salt;
    patch.hash = hash;
    patch.passwordChangedAt = new Date().toISOString();
    // An admin reset is a temporary credential known to a second person, so it
    // grants access exactly once and must then be replaced by the owner.
    patch.mustChangePassword = true;
    // Ends every session held under the old password, which is the point of a
    // reset — otherwise a compromised session survives its own remediation.
    patch.tokenVersion = (target.tokenVersion || 0) + 1;
  }

  const updated = patchAdminUser(email, patch);
  logAudit("staff.update", `${me.email} updated ${email}: ${Object.keys(patch).join(", ")}`);
  return NextResponse.json({ ok: true, staff: updated ? publicStaff(updated) : null });
}

// DELETE — remove a staff account
export async function DELETE(request: NextRequest) {
  const me = guard(request, "staff");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const email = (searchParams.get("email") || "").trim().toLowerCase();
  const target = getAdminUser(email);
  if (!target) return NextResponse.json({ error: "Staff account not found" }, { status: 404 });

  if (email === me.email) return NextResponse.json({ error: "You cannot delete your own account" }, { status: 400 });
  if (email === DEFAULT_ADMIN_EMAIL) return NextResponse.json({ error: "The default owner account cannot be deleted" }, { status: 400 });
  if (target.role === "superadmin" && countSuperadmins() <= 1) {
    return NextResponse.json({ error: "Cannot delete the last super admin" }, { status: 400 });
  }

  deleteAdminUser(email);
  logAudit("staff.delete", `${me.email} deleted ${email}`);
  return NextResponse.json({ ok: true });
}
