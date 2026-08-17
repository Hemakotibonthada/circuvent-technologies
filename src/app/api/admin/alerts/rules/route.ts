import { NextResponse } from "next/server";
import { adminFromRequest, requireArea } from "@/lib/admin-auth";
import { getAlertSettings, updateAlertSettings, flushNow, type AlertSettings } from "@/lib/store";
import { keepKnownGroups, listDirectoryGroups } from "@/lib/identity-groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET /api/admin/alerts/rules — current alert configuration.
export async function GET(request: Request) {
  // Exposes the notification email and thresholds, so it is settings-scoped.
  if (!requireArea(adminFromRequest(request), "settings")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return NextResponse.json({ ok: true, settings: getAlertSettings() });
}

// PUT /api/admin/alerts/rules — update configuration (superadmin/manager only).
export async function PUT(request: Request) {
  const me = adminFromRequest(request);
  if (!requireArea(me, "settings")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (me!.role !== "superadmin" && me!.role !== "manager") {
    return NextResponse.json({ error: "Only managers can change alert rules." }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const patch: Partial<AlertSettings> = {};
  const boolKeys: (keyof AlertSettings)[] = [
    "onNewOrder", "onLowStock", "onPendingReturn", "onOpenTicket", "onExpiringBatch", "dailyReport",
  ];
  for (const k of boolKeys) if (typeof body[k] === "boolean") (patch as Record<string, unknown>)[k] = body[k];
  if (body.notifyEmail !== undefined) {
    const e = String(body.notifyEmail || "").trim().toLowerCase();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      return NextResponse.json({ error: "Enter a valid notification email." }, { status: 400 });
    }
    patch.notifyEmail = e || undefined;
  }
  if (body.lowStockThreshold !== undefined) {
    patch.lowStockThreshold = Math.max(0, Math.min(1000, Number(body.lowStockThreshold) || 0));
  }
  if (body.reportRangeDays !== undefined) {
    patch.reportRangeDays = Math.max(7, Math.min(365, Number(body.reportRangeDays) || 30));
  }
  /*
   * Group recipients, checked against the directory before being stored.
   *
   * Validated rather than trusted for the same reason the send route does it:
   * this decides where the company's revenue figures are emailed, and an
   * address that is not a real group has no business being saved as one. An
   * empty array is a deliberate "no groups", so it is stored, not ignored.
   */
  if (body.reportGroups !== undefined) {
    const requested = Array.isArray(body.reportGroups) ? body.reportGroups.map(String) : [];
    if (requested.length === 0) {
      patch.reportGroups = [];
    } else {
      const { accepted, rejected } = keepKnownGroups(requested, await listDirectoryGroups());
      if (rejected.length) {
        return NextResponse.json(
          { error: `Not a Circuvent group: ${rejected.join(", ")}` },
          { status: 400 }
        );
      }
      patch.reportGroups = accepted;
    }
  }

  const settings = updateAlertSettings(patch);
  await flushNow();
  return NextResponse.json({ ok: true, settings });
}
