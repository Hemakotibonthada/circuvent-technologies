import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { listJobs, addCustomJob, toggleJob, removeJob, recordRun, listRuns, jobsStats } from "@/lib/admin-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "jobs")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ success: true, jobs: listJobs(), runs: listRuns(), stats: jobsStats() });
}

/** POST /api/admin/jobs — { kind: "job" } to add a custom job, or { kind: "run-result" } to log a client-triggered run. */
export async function POST(request: Request) {
  if (!guard(request, "jobs")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (b.kind === "run-result") {
      const run = recordRun(b.jobId, b.jobName, !!b.ok, Number(b.durationMs) || 0, b.detail);
      return NextResponse.json({ success: true, run });
    }
    if (!b.name || !b.endpoint) return NextResponse.json({ success: false, message: "name and endpoint required." }, { status: 400 });
    const job = addCustomJob({ name: b.name, endpoint: b.endpoint, method: b.method === "GET" ? "GET" : "POST", scheduleDescription: b.scheduleDescription || "Manual trigger only" });
    return NextResponse.json({ success: true, job });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!guard(request, "jobs")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id, enabled } = await request.json();
    const ok = toggleJob(id, !!enabled);
    return NextResponse.json({ success: ok });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!guard(request, "jobs")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const ok = removeJob(searchParams.get("id") || "");
  return NextResponse.json({ success: ok });
}
