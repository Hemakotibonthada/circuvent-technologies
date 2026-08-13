import { NextResponse } from "next/server";
import { adminFromRequest, guard } from "@/lib/admin-auth";
import {
  fileIncident,
  getIncident,
  icmView,
  syncFromAlerts,
  updateIncident,
  linkIncidents,
  unlinkIncidents,
  saveRotation,
  saveView,
  deleteView,
  deliverNotifications,
} from "@/lib/icm-store";
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
  LINK_KINDS,
  type Filters,
  type SlaState,
  type LinkKind,
  type OncallShift,
} from "@/lib/icm";

/** Falls back to the weakest relationship rather than guessing a causal one. */
function normaliseLinkKind(v: unknown): LinkKind {
  return LINK_KINDS.includes(v as LinkKind) ? (v as LinkKind) : "related-to";
}

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

/**
 * Sends whatever this change made due, then returns the incident unchanged.
 *
 * Called from the write paths rather than left to the sweep. The sweep runs
 * daily — Vercel Hobby permits nothing finer — so an incident a person files
 * at 09:00 would page nobody until the following morning, which is not an
 * incident management system.
 *
 * Awaited rather than fired and forgotten: a serverless function that returns
 * before its promises settle is frozen mid-send, and the mail is simply lost.
 * Failures are swallowed because the write already succeeded and reporting it
 * as failed would be worse than a missing email.
 */
async function notified<T>(incident: T): Promise<T> {
  try {
    await deliverNotifications();
  } catch {
    /* deliverNotifications already logs; the write is what the caller asked for. */
  }
  return incident;
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
    hideDuplicates: url.searchParams.get("hideDuplicates") === "1",
  };

  return NextResponse.json({ success: true, ...icmView(filters, new Date().toISOString(), actorOf(request)) });
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
      await notified(null);
      return NextResponse.json({
        success: true,
        filed: filed.map((i) => i.id),
        resolved: resolved.map((i) => i.id),
      });
    }

    /** The on-call rota for one team, replaced wholesale. */
    if (b.kind === "rotation") {
      const team = String(b.team || "").trim();
      if (!team) return NextResponse.json({ success: false, message: "A team is required." }, { status: 400 });

      const shifts: OncallShift[] = (Array.isArray(b.shifts) ? b.shifts : [])
        .map((s: Record<string, unknown>) => ({
          team,
          who: String(s.who || "").trim(),
          startsAt: String(s.startsAt || ""),
          endsAt: String(s.endsAt || ""),
        }))
        /*
         * A shift with no name, or one that ends before it starts, would become
         * a hole that onCallFor reports as "nobody" — indistinguishable from a
         * rota nobody filled in. Rejected here so the rota says what it means.
         */
        .filter((s: OncallShift) => s.who && Date.parse(s.startsAt) < Date.parse(s.endsAt));

      return NextResponse.json({ success: true, rotation: saveRotation(team, shifts) });
    }

    /** A saved queue filter. */
    if (b.kind === "view") {
      const name = String(b.name || "").trim();
      if (!name) return NextResponse.json({ success: false, message: "A name is required." }, { status: 400 });

      const view = saveView(
        { name, filters: (b.filters ?? {}) as Filters, shared: b.shared === true },
        actorOf(request)
      );
      return NextResponse.json({ success: true, view });
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

    return NextResponse.json({ success: true, incident: await notified(incident) });
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

    /*
     * Linking writes two incidents, so it cannot go through `apply` — that
     * shape is one record in, one record out. It is handled here, before the
     * switch, rather than by widening the shape for a single case.
     */
    if (b.action === "link" || b.action === "unlink") {
      const otherId = String(b.otherId || "");
      const { error } =
        b.action === "link"
          ? linkIncidents(id, otherId, normaliseLinkKind(b.kind), actor, now)
          : unlinkIncidents(id, otherId, actor, now);

      if (error) {
        return NextResponse.json(
          { success: false, message: error },
          { status: error === "No such incident." ? 404 : 409 }
        );
      }
      return NextResponse.json({ success: true, incident: getIncident(id) });
    }

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

    return NextResponse.json({ success: true, incident: await notified(incident), sla: slaSnapshot(incident, now) });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

/** DELETE /api/admin/icm?viewId=… — remove a saved queue filter. */
export async function DELETE(request: Request) {
  if (!guard(request, "icm")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const viewId = new URL(request.url).searchParams.get("viewId") || "";
  if (!viewId) return NextResponse.json({ success: false, message: "A view is required." }, { status: 400 });

  const { error } = deleteView(viewId, actorOf(request));
  if (error) {
    /* "Belongs to somebody else" is a 403: the view exists, and saying so is
       not a leak — view names are shared vocabulary on a team. */
    const status = error === "No such view." ? 404 : 403;
    return NextResponse.json({ success: false, message: error }, { status });
  }
  return NextResponse.json({ success: true });
}