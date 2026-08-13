import { NextResponse } from "next/server";
import { guard, adminFromRequest } from "@/lib/admin-auth";
import { listRules, saveRule, deleteRule, evaluateAlertRules, allEvents } from "@/lib/telemetry-store";
import { currentValue, type AlertRule } from "@/lib/insights-alert-rules";
import type { Severity } from "@/lib/ai/analysis";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Defaults to the middle severity rather than the loudest one. */
function asSeverity(v: unknown): Severity {
  return v === "critical" || v === "info" ? v : "warning";
}

/**
 * GET — the rules, each with what it currently evaluates to.
 *
 * The current value is returned beside the threshold rather than left to the
 * client, because "is this rule doing anything?" is the only question worth
 * asking of an alert rule, and a table of thresholds alone cannot answer it.
 */
export async function GET(request: Request) {
  if (!guard(request, "insights")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const now = new Date().toISOString();
  const rules = listRules(now);
  const { evaluations } = evaluateAlertRules(now);
  const events = allEvents();

  return NextResponse.json({
    success: true,
    rules: rules.map((r) => ({
      ...r,
      current: currentValue(r, events, now),
      /* The rule is already the row; repeating it inside each evaluation would
         triple the payload for a table that renders one line per result. */
      evaluations: evaluations
        .filter((e) => e.rule.id === r.id)
        .map(({ rule: _rule, ...rest }) => rest),
    })),
    now,
  });
}

/** POST — create or update a rule. */
export async function POST(request: Request) {
  if (!guard(request, "insights")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const b = await request.json();
    const now = new Date().toISOString();

    const rule: AlertRule = {
      id: String(b.id || `rule-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`),
      name: String(b.name || "").trim(),
      enabled: b.enabled !== false,
      metric: b.metric,
      splitBy: b.splitBy ?? "none",
      scope: b.scope ? String(b.scope) : undefined,
      comparison: b.comparison === "below" ? "below" : "above",
      threshold: Number(b.threshold),
      windowMins: Number(b.windowMins),
      minSamples: Number(b.minSamples),
      severity: asSeverity(b.severity),
      owningTeam: b.owningTeam ? String(b.owningTeam) : undefined,
      createdBy: adminFromRequest(request)?.email || "unknown",
      createdAt: String(b.createdAt || now),
    };

    const { rule: saved, error } = saveRule(rule);
    /*
     * 400 rather than a clamp. A rule silently rewritten into something that
     * cannot fire is the exact failure this feature exists to avoid.
     */
    if (error) return NextResponse.json({ success: false, message: error }, { status: 400 });

    return NextResponse.json({ success: true, rule: saved });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

/** DELETE ?id=… */
export async function DELETE(request: Request) {
  if (!guard(request, "insights")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const id = new URL(request.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ success: false, message: "A rule is required." }, { status: 400 });

  const { error } = deleteRule(id);
  if (error) return NextResponse.json({ success: false, message: error }, { status: 404 });
  return NextResponse.json({ success: true });
}
