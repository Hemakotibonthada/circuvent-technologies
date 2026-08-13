import { NextResponse } from "next/server";
import { adminFromRequest, guard } from "@/lib/admin-auth";
import { fileIncident, getIncident, icmView, syncFromAlerts, updateIncident } from "@/lib/icm-store";
import type { Alert } from "@/lib/anomaly-monitor";
import {
  acknowledge,
  assign,
  comment,
  savePostmortem,
  addActionItem,
  toggleActionItem,
  publishPostmortem,
  mitigate,
  normaliseSeverity,
  reactivate,
  resolve,
  setSeverity,
  slaSnapshot,
  type Filters,
  type SlaState,
} from "@/lib/icm";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Who is doing this.
 *
 * Every timeline entry is attributed, and "system" is reserved for things the
 * platform did on its own — so an action taken by a signed-in human that lost
 * its identity would be a lie in the audit trail. The guard has already run by
 * the time this is called, so there is always a session; the fallback covers
 * the impossible case rather than inventing a plausible name.
 */
function actorOf(request: Request): string {
  const admin = adminFromRequest(request);
  return admin?.email || "unknown";
}

/** GET /api/admin/icm — the queue, the stats and the routing teams. */
export async function GET(request: Request) {
  if (!guard(request, "icm")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const incident = getIncident(id);
    if (!incident) return NextResponse.json({ success: false, message: "No such incident." }, { status: 404 });
    const now = new Date().toISOString();
    return NextResponse.json({ success: true, incident, sla: slaSnapshot(incident, now), now });
  }

  const sev = url.searchParams.get("severity");
  const filters: Filters = {
    status: (url.searchParams.get("status") as Filters["status"]) || "open",
    severity: sev === null || sev === "" ? null : normaliseSeverity(sev),
    team: url.searchParams.get("team") || "",
    assignedTo: url.searchParams.get("assignedTo") || "",
    search: url.searchParams.get("q") || "",
    slaState: (url.searchParams.get("sla") as SlaState) || null,
  };

  return NextResponse.json({ success: true, ...icmView(filters) });
}

/** POST /api/admin/icm — file a new incident, or sync from monitor alerts. */
export async function POST(request: Request) {
  if (!guard(request, "icm")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();

    /*
     * The monitor path. Files incidents for anything the anomaly sweep is
     * reporting and closes the ones whose findings have cleared, subject to the
     * rules in icm-bridge.ts — chiefly that it files each finding once and
     * never closes an incident a person has picked up.
     */
    if (b.kind === "sync-alerts") {
      const alerts = Array.isArray(b.alerts) ? (b.alerts as Alert[]) : [];
      const { filed, resolved } = syncFromAlerts(alerts, {
        owningTeam: typeof b.owningTeam === "string" ? b.owningTeam : undefined,
        autoResolve: b.autoResolve !== false,
      });
      return NextResponse.json({
        success: true,
        filed: filed.map((i) => i.id),
        resolved: resolved.map((i) => i.id),
      });
    }

    const title = String(b.title || "").trim();
    if (!title) return NextResponse.json({ success: false, message: "A title is required." }, { status: 400 });

    const incident = fileIncident({
      title,
      description: String(b.description || ""),
      severity: normaliseSeverity(b.severity),
      owningTeam: String(b.owningTeam || "").trim(),
      createdBy: actorOf(request),
      source:
        b.source === "monitor" || b.source === "customer" || b.source === "automation" ? b.source : "manual",
      impactStartedAt: b.impactStartedAt ? String(b.impactStartedAt) : undefined,
      affectedServices: Array.isArray(b.affectedServices) ? b.affectedServices.map(String) : [],
      customersImpacted: Number(b.customersImpacted) || 0,
      tags: Array.isArray(b.tags) ? b.tags.map(String) : [],
      assignedTo: String(b.assignedTo || "").trim(),
    });

    return NextResponse.json({ success: true, incident });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

/**
 * PATCH /api/admin/icm — act on an incident.
 *
 * One endpoint with an `action` rather than a verb per transition: they share
 * their lookup, their audit trail and their response shape, and the alternative
 * is seven routes differing by four lines each.
 */
export async function PATCH(request: Request) {
  if (!guard(request, "icm")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    const id = String(b.id || "");
    const actor = actorOf(request);
    const now = new Date().toISOString();
    const note = String(b.note || "");

    const apply = (() => {
      switch (b.action) {
        case "acknowledge":
          return (i: Parameters<typeof acknowledge>[0]) => acknowledge(i, actor, now);
        case "mitigate":
          return (i: Parameters<typeof mitigate>[0]) => mitigate(i, actor, note, now);
        case "resolve":
          return (i: Parameters<typeof resolve>[0]) => resolve(i, actor, note, now);
        case "reactivate":
          return (i: Parameters<typeof reactivate>[0]) => reactivate(i, actor, note, now);
        case "severity":
          return (i: Parameters<typeof setSeverity>[0]) =>
            setSeverity(i, actor, normaliseSeverity(b.severity), note, now);
        case "assign":
          return (i: Parameters<typeof assign>[0]) =>
            assign(i, actor, String(b.assignedTo || ""), String(b.owningTeam || ""), now);
        case "postmortem":
          return (i: Parameters<typeof savePostmortem>[0]) =>
            savePostmortem(
              i,
              actor,
              {
                summary: String(b.summary || ""),
                cause: String(b.cause || ""),
                detection: String(b.detection || ""),
              },
              now
            );
        case "action-add":
          return (i: Parameters<typeof addActionItem>[0]) =>
            addActionItem(
              i,
              actor,
              { what: String(b.what || ""), owner: String(b.owner || ""), due: String(b.due || "") },
              now
            );
        case "action-toggle":
          return (i: Parameters<typeof toggleActionItem>[0]) =>
            toggleActionItem(i, actor, String(b.itemId || ""), now);
        case "postmortem-publish":
          return (i: Parameters<typeof publishPostmortem>[0]) => publishPostmortem(i, actor, now);
        case "comment":
          return (i: Parameters<typeof comment>[0]) => comment(i, actor, String(b.body || ""), now);
        default:
          return null;
      }
    })();

    if (!apply) return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });

    const { incident, error } = updateIncident(id, apply);
    if (!incident) return NextResponse.json({ success: false, message: error }, { status: 404 });
    /*
     * A refused transition is a 409, not a 500 and not a silent 200. "Already
     * acknowledged" is the correct answer to a double-click or to two people
     * acting at once, and the UI has to tell that apart from a failure.
     */
    if (error) return NextResponse.json({ success: false, message: error, incident }, { status: 409 });

    return NextResponse.json({ success: true, incident, sla: slaSnapshot(incident, now) });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}
