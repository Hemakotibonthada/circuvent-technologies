import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { logAudit } from "@/lib/store";
import { listJobs, addCustomJob, toggleJob, removeJob, recordRun, listRuns, jobsStats } from "@/lib/admin-jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "jobs")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ success: true, jobs: listJobs(), runs: listRuns(), stats: jobsStats() });
}

/** POST /api/admin/jobs — { kind: "job" } to add a custom job, or { kind: "run-result" } to log a client-triggered run. */
export async function POST(request: Request) {
  const me = guard(request, "jobs");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (b.kind === "run-result") {
      const run = recordRun(b.jobId, b.jobName, !!b.ok, Number(b.durationMs) || 0, b.detail);
      logAudit("jobs.run", `${me.email} ran job "${run.jobName}" (${run.jobId}): ${run.ok ? "succeeded" : "failed"} in ${run.durationMs}ms`);
      return NextResponse.json({ success: true, run });
    }
    if (!b.name || !b.endpoint) return NextResponse.json({ success: false, message: "name and endpoint required." }, { status: 400 });
    const job = addCustomJob({ name: b.name, endpoint: b.endpoint, method: b.method === "GET" ? "GET" : "POST", scheduleDescription: b.scheduleDescription || "Manual trigger only" });
    if (!job) {
      return NextResponse.json(
        {
          success: false,
          message: "The endpoint must be a first-party path beginning /api/ — running a job sends your admin session token to it.",
        },
        { status: 400 }
      );
    }
    logAudit("jobs.create", `${me.email} created job "${job.name}" (${job.method} ${job.endpoint})`);
    return NextResponse.json({ success: true, job });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const me = guard(request, "jobs");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { id, enabled } = await request.json();
    const before = listJobs().find((j) => j.id === id);
    const ok = toggleJob(id, !!enabled);
    if (ok) {
      logAudit(
        "jobs.toggle",
        `${me.email} turned job "${before?.name ?? id}" ${enabled ? "on" : "off"} (was ${before ? (before.enabled ? "on" : "off") : "unknown"})`
      );
    }
    return NextResponse.json({ success: ok });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const me = guard(request, "jobs");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const job = listJobs().find((j) => j.id === id);
  const ok = removeJob(id);
  if (ok) logAudit("jobs.delete", `${me.email} deleted job "${job?.name ?? id}" (${job?.endpoint ?? "unknown endpoint"})`);
  return NextResponse.json({ success: ok });
}
