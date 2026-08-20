import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import { logAudit } from "@/lib/store";
import {
  listSegments,
  upsertSegment,
  deleteSegment,
  resolveSegmentMembers,
  listCampaigns,
  upsertCampaign,
  deleteCampaign,
  sendCampaign,
  abandonedCheckouts,
  sendRecoveryEmail,
  marketingStats,
  revalidateMarketing,
  flushMarketing,
} from "@/lib/admin-marketing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/marketing — segments, campaigns, abandoned checkouts & stats. */
export async function GET(request: Request) {
  if (!guard(request, "marketing")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await revalidateMarketing();
  const { searchParams } = new URL(request.url);
  const previewSegmentId = searchParams.get("previewSegment");
  const segments = listSegments();
  const preview = previewSegmentId ? resolveSegmentMembers(segments.find((s) => s.id === previewSegmentId)?.rules || {}) : undefined;
  return NextResponse.json({
    success: true,
    segments,
    campaigns: listCampaigns(),
    abandoned: abandonedCheckouts(),
    stats: marketingStats(),
    preview,
  });
}

/** POST /api/admin/marketing — { kind: "segment" | "campaign", ... } create/update. */
export async function POST(request: Request) {
  const me = guard(request, "marketing");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await revalidateMarketing();
    const b = await request.json();
    if (b.kind === "segment") {
      if (!b.name) return NextResponse.json({ success: false, message: "Segment name is required." }, { status: 400 });
      const segment = upsertSegment({ id: b.id, name: b.name, description: b.description, rules: b.rules || {} });
      logAudit("marketing.segment.upsert", segment.name);
      await flushMarketing();
      return NextResponse.json({ success: true, segment });
    }
    if (b.kind === "campaign") {
      if (!b.name || !b.subject) return NextResponse.json({ success: false, message: "Name and subject are required." }, { status: 400 });
      const campaign = upsertCampaign({ id: b.id, name: b.name, subject: b.subject, bodyHtml: b.bodyHtml || "", segmentId: b.segmentId });
      logAudit("marketing.campaign.upsert", campaign.name);
      await flushMarketing();
      return NextResponse.json({ success: true, campaign });
    }
    return NextResponse.json({ success: false, message: "Unknown kind." }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, message: "Could not save." }, { status: 500 });
  }
}

/** PATCH /api/admin/marketing — { action: "send-campaign" | "send-recovery", id/orderNo }. */
export async function PATCH(request: Request) {
  const me = guard(request, "marketing");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    await revalidateMarketing();
    const b = await request.json();
    if (b.action === "send-campaign") {
      const campaign = await sendCampaign(b.id);
      if (!campaign) return NextResponse.json({ success: false, message: "Campaign not found or already sent." }, { status: 404 });
      logAudit("marketing.campaign.send", `${campaign.name} -> ${campaign.stats.recipients} recipients`);
      await flushMarketing();
      return NextResponse.json({ success: true, campaign });
    }
    if (b.action === "send-recovery") {
      const ok = await sendRecoveryEmail(b.orderNo);
      if (ok) logAudit("marketing.recovery.send", b.orderNo);
      return NextResponse.json({ success: ok });
    }
    return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, message: "Action failed." }, { status: 500 });
  }
}

/** DELETE /api/admin/marketing?kind=segment|campaign&id= */
export async function DELETE(request: Request) {
  if (!guard(request, "marketing")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await revalidateMarketing();
  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  const id = searchParams.get("id") || "";
  const ok = kind === "campaign" ? deleteCampaign(id) : deleteSegment(id);
  await flushMarketing();
  return NextResponse.json({ success: ok });
}
