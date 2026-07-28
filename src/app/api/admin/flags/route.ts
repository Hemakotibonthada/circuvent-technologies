import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
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
  if (!guard(request, "flags")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (b.kind === "experiment") {
      if (!b.name || !Array.isArray(b.variantNames) || b.variantNames.length < 2) {
        return NextResponse.json({ success: false, message: "Name and at least 2 variants required." }, { status: 400 });
      }
      const experiment = createExperiment({ name: b.name, metricName: b.metricName || "conversion", variantNames: b.variantNames });
      return NextResponse.json({ success: true, experiment });
    }
    if (!b.key || !b.label) return NextResponse.json({ success: false, message: "key and label required." }, { status: 400 });
    const flag = upsertFlag({ key: b.key, label: b.label, description: b.description, enabled: b.enabled, rolloutPct: b.rolloutPct });
    return NextResponse.json({ success: true, flag });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!guard(request, "flags")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (b.kind === "experiment") {
      const experiment = setExperimentStatus(b.id, b.status);
      if (!experiment) return NextResponse.json({ success: false, message: "Not found." }, { status: 404 });
      return NextResponse.json({ success: true, experiment });
    }
    const flag = upsertFlag({ id: b.id, key: b.key, label: b.label, enabled: b.enabled, rolloutPct: b.rolloutPct, description: b.description });
    return NextResponse.json({ success: true, flag });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!guard(request, "flags")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const id = searchParams.get("id") || "";
  const ok = kind === "experiment" ? deleteExperiment(id) : deleteFlag(id);
  return NextResponse.json({ success: ok });
}
