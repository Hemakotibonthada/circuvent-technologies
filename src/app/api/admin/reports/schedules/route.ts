import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import {
  listSchedules, createSchedule, updateSchedule, deleteSchedule,
  sendSchedule, schedulableReports, type ScheduleInput,
} from "@/lib/reports-schedule";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// GET    /api/admin/reports/schedules            → list schedules + options
// POST   /api/admin/reports/schedules            → create (body: ScheduleInput)
// POST   /api/admin/reports/schedules?id=..&action=send   → send one now
// PUT    /api/admin/reports/schedules?id=..       → update (body: partial)
// DELETE /api/admin/reports/schedules?id=..       → delete

export async function GET(request: Request) {
  if (!guard(request, "analytics")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ schedules: listSchedules(), reportOptions: schedulableReports() });
}

export async function POST(request: Request) {
  if (!guard(request, "analytics")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const action = searchParams.get("action");

  if (id && action === "send") {
    const outcome = await sendSchedule(id);
    const status = outcome.status === "ok" ? 200 : outcome.status === "skipped" ? 200 : 502;
    return NextResponse.json({ ok: outcome.status === "ok", outcome }, { status });
  }

  const body = (await request.json().catch(() => ({}))) as Partial<ScheduleInput>;
  const result = createSchedule({
    reportType: String(body.reportType || ""),
    rangeDays: body.rangeDays,
    frequency: String(body.frequency || ""),
    recipients: body.recipients,
    enabled: body.enabled,
    label: body.label,
  });
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
  return NextResponse.json({ ok: true, schedule: result.schedule }, { status: 201 });
}

export async function PUT(request: Request) {
  if (!guard(request, "analytics")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as Partial<ScheduleInput>;
  const result = updateSchedule(id, body);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.error === "Schedule not found." ? 404 : 400 });
  return NextResponse.json({ ok: true, schedule: result.schedule });
}

export async function DELETE(request: Request) {
  if (!guard(request, "analytics")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const removed = deleteSchedule(id);
  if (!removed) return NextResponse.json({ error: "Schedule not found." }, { status: 404 });
  return NextResponse.json({ ok: true });
}
