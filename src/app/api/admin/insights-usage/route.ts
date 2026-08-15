import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import {
  DEFAULT_COHORTS,
  cohortView,
  costView,
  funnelView,
  impactView,
  liveView,
  usageView,
} from "@/lib/telemetry-store";
import type { CohortDefinition, FunnelStepSpec, UsageDimension } from "@/lib/app-insights-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DIMENSIONS: UsageDimension[] = ["source", "userAgentClass", "path", "kind", "method", "entryPath"];

/**
 * The Usage and Configure blades.
 *
 * One route with a `view` parameter rather than six routes, so the guard and
 * the `hours` clamp are written once. `hours` drives a full pass over the
 * buffer, so an unbounded value is a cheap way to make the admin API do
 * arbitrary work — it is clamped here exactly as insights-telemetry clamps it.
 */
function windowHours(url: URL): number {
  return Math.min(168, Math.max(1, Math.round(Number(url.searchParams.get("hours")) || 24)));
}

export async function GET(request: Request) {
  if (!guard(request, "insights")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const hours = windowHours(url);
  const view = url.searchParams.get("view") ?? "overview";

  switch (view) {
    case "overview": {
      const dimParam = url.searchParams.get("dimension");
      const dimension = DIMENSIONS.includes(dimParam as UsageDimension)
        ? (dimParam as UsageDimension)
        : "path";
      return NextResponse.json({
        success: true,
        ...usageView({ hours, dimension, flowNode: url.searchParams.get("node") ?? undefined }),
      });
    }

    case "impact": {
      const goal = (url.searchParams.get("goal") ?? "").trim();
      if (!goal) return NextResponse.json({ success: false, message: "Choose a goal route." }, { status: 400 });
      return NextResponse.json({ success: true, ...impactView(goal, hours) });
    }

    case "cohorts":
      return NextResponse.json({ success: true, ...cohortView(DEFAULT_COHORTS, hours) });

    case "cost":
      return NextResponse.json({ success: true, ...costView() });

    case "live":
      return NextResponse.json({ success: true, ...liveView() });

    default:
      return NextResponse.json({ success: false, message: "Unknown view." }, { status: 400 });
  }
}

/**
 * POST — funnels and custom cohorts.
 *
 * The steps and filters are the caller's, are unbounded in length, and in the
 * cohort case are query expressions. Same reasoning as the Logs blade: they go
 * in a body, not in a URL that ends up in an access log.
 */
export async function POST(request: Request) {
  if (!guard(request, "insights")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const hours = windowHours(url);
  const body = await request.json().catch(() => ({}));
  const view = typeof body.view === "string" ? body.view : "funnel";

  if (view === "funnel") {
    const raw = Array.isArray(body.steps) ? body.steps : [];
    // Ten steps is already more funnel than anybody reads, and each step is a
    // full pass over every session.
    const steps: FunnelStepSpec[] = raw.slice(0, 10).map((s: unknown) => {
      const step = (s ?? {}) as Record<string, unknown>;
      const match = step.match === "prefix" || step.match === "contains" ? step.match : "exact";
      return {
        label: String(step.label ?? "").slice(0, 60),
        path: String(step.path ?? "").slice(0, 200),
        match,
      };
    });
    return NextResponse.json({ success: true, ...funnelView(steps, hours) });
  }

  if (view === "cohorts") {
    const raw = Array.isArray(body.cohorts) ? body.cohorts : [];
    const cohorts: CohortDefinition[] = raw.slice(0, 20).map((c: unknown, i: number) => {
      const cohort = (c ?? {}) as Record<string, unknown>;
      return {
        id: String(cohort.id ?? `c${i}`).slice(0, 40),
        name: String(cohort.name ?? "Untitled").slice(0, 60),
        filter: String(cohort.filter ?? "").slice(0, 400),
      };
    });
    return NextResponse.json({
      success: true,
      ...cohortView(cohorts.length ? cohorts : DEFAULT_COHORTS, hours),
    });
  }

  return NextResponse.json({ success: false, message: "Unknown view." }, { status: 400 });
}
