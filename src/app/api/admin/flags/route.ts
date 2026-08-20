import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { logAudit } from "@/lib/store";
import {
  listFlags,
  upsertFlag,
  deleteFlag,
  listExperiments,
  createExperiment,
  setExperimentStatus,
  deleteExperiment,
} from "@/lib/admin-flags";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (!guard(request, "flags")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  return NextResponse.json({ success: true, flags: listFlags(), experiments: listExperiments() });
}

export async function POST(request: Request) {
  const me = guard(request, "flags");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (b.kind === "experiment") {
      if (!b.name || !Array.isArray(b.variantNames) || b.variantNames.length < 2) {
        return NextResponse.json({ success: false, message: "Name and at least 2 variants required." }, { status: 400 });
      }
      const experiment = createExperiment({ name: b.name, metricName: b.metricName || "conversion", variantNames: b.variantNames });
      logAudit("flags.experiment.create", `${me.email} created experiment "${experiment.name}" (variants: ${experiment.variants.map((v) => v.name).join(", ")})`);
      return NextResponse.json({ success: true, experiment });
    }
    if (!b.key || !b.label) return NextResponse.json({ success: false, message: "key and label required." }, { status: 400 });
    const flag = upsertFlag({ key: b.key, label: b.label, description: b.description, enabled: b.enabled, rolloutPct: b.rolloutPct });
    logAudit("flags.create", `${me.email} created flag "${flag.key}" (enabled=${flag.enabled}, rolloutPct=${flag.rolloutPct}%)`);
    return NextResponse.json({ success: true, flag });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const me = guard(request, "flags");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (b.kind === "experiment") {
      const before = listExperiments().find((e) => e.id === b.id);
      const experiment = setExperimentStatus(b.id, b.status);
      if (!experiment) return NextResponse.json({ success: false, message: "Not found." }, { status: 404 });
      logAudit("flags.experiment.status", `${me.email} changed experiment "${experiment.name}" status from ${before?.status ?? "unknown"} to ${experiment.status}`);
      return NextResponse.json({ success: true, experiment });
    }
    // Matched by key (not id) because upsertFlag itself resolves the existing
    // record by key — see admin-flags.ts. Read the prior state first so the
    // audit entry can say what changed, not just that something did.
    const before = listFlags().find((f) => f.key === b.key);
    const flag = upsertFlag({ id: b.id, key: b.key, label: b.label, enabled: b.enabled, rolloutPct: b.rolloutPct, description: b.description });
    const changes: string[] = [];
    if (before && before.enabled !== flag.enabled) changes.push(`enabled ${before.enabled} -> ${flag.enabled}`);
    if (before && before.rolloutPct !== flag.rolloutPct) changes.push(`rolloutPct ${before.rolloutPct}% -> ${flag.rolloutPct}%`);
    const action = changes.some((c) => c.startsWith("enabled")) ? "flags.toggle" : changes.length ? "flags.rollout" : "flags.update";
    logAudit(action, `${me.email} updated flag "${flag.key}"${changes.length ? ` (${changes.join(", ")})` : ""}`);
    return NextResponse.json({ success: true, flag });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const me = guard(request, "flags");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const id = searchParams.get("id") || "";
  if (kind === "experiment") {
    const experiment = listExperiments().find((e) => e.id === id);
    const ok = deleteExperiment(id);
    if (ok) logAudit("flags.experiment.delete", `${me.email} deleted experiment "${experiment?.name ?? id}"`);
    return NextResponse.json({ success: ok });
  }
  const flag = listFlags().find((f) => f.id === id);
  const ok = deleteFlag(id);
  if (ok) logAudit("flags.delete", `${me.email} deleted flag "${flag?.key ?? id}"`);
  return NextResponse.json({ success: ok });
}
