import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { adminFromRequest, guard } from "@/lib/admin-auth";
import { logger } from "@/lib/logger";
import { watchIncident } from "@/workflows/icm-watch";
import { chasePostmortem } from "@/workflows/icm-postmortem";
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
  revalidateIcm,
  flushIcm,
  setTeamContact,
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
  /*
   * The durable write is awaited here too, for the same reason the mail is:
   * this function is the last thing every write path does before returning,
   * and a serverless function that returns with a write still in flight is
   * frozen and the incident is lost.
   */
  await flushIcm();
  return incident;
}

/**
 * Starts the durable watch that escalates this incident on time.
 *
 * Failure to start is logged and swallowed. The incident has already been
 * filed and the first notification already sent; refusing the request at this
 * point would tell the caller their incident does not exist, which is both
 * untrue and the worse of the two outcomes. Without the watch, escalation
 * falls back to what it was before — the daily sweep and whoever opens the
 * queue — rather than to nothing.
 */
async function watch(incidentId: string): Promise<void> {
  try {
    await start(watchIncident, [incidentId]);
  } catch (e) {
    logger.error("icm.watch_start_failed", { incident: incidentId }, e);
  }
}

/**
 * Starts the chase for the write-up a resolved incident owes.
 *
 * Only worth starting for severities that owe one — `sweepPostmortem` would
 * exit immediately otherwise, but a workflow run per Sev4 is a cost with no
 * reader. Swallowed on failure for the same reason as the watch: the
 * resolution itself succeeded, and the daily sweep still catches the reminder.
 */
async function chase(incident: { id: string; severity: number }): Promise<void> {
  if (!POSTMORTEM_SEVERITIES.includes(incident.severity)) return;
  try {
    await start(chasePostmortem, [incident.id]);
  } catch (e) {
    logger.error("icm.chase_start_failed", { incident: incident.id }, e);
  }
}

/** Mirrors `postmortemRequired` in the incident model: Sev2 and worse. */
const POSTMORTEM_SEVERITIES = [0, 1, 2];

/** GET /api/admin/icm — the queue, the stats and the routing teams. */
export async function GET(request: Request) {
  if (!guard(request, "icm")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  /* Every handler loads the authoritative copy first. Without this the queue
     is whatever the instance that happened to serve the request remembers. */
  await revalidateIcm();

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
  await revalidateIcm();
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
      /* Every incident the monitor files gets its own watch, exactly as one a
         person files does — an unattended incident is the one most likely to
         go unacknowledged. */
      for (const inc of filed) await watch(inc.id);
      await notified(null);
      return NextResponse.json({
        success: true,
        filed: filed.map((i) => i.id),
        resolved: resolved.map((i) => i.id),
      });
    }

    /**
     * Files an incident from an Insights failure group.
     *
     * Routed through the same bridge as everything else rather than calling
     * fileIncident directly, so it inherits the deduplication: clicking twice,
     * or clicking something the sweep has already filed, updates nothing and
     * opens nothing. The alternative is a queue with three incidents for one
     * exception, filed by three people who each looked at the same panel.
     */
    if (b.kind === "from-failure") {
      const key = String(b.key || "").trim();
      if (!key) return NextResponse.json({ success: false, message: "A failure is required." }, { status: 400 });

      const alert: Alert = {
        fingerprint: `failure:${key}`,
        /* A person clicked this, so it is not "maybe". But it is still not a
           Sev0 — the bridge would refuse that, and rightly. */
        severity: "critical",
        title: String(b.title || `Exception on ${b.path || "an unknown route"}`),
        detail: String(b.detail || ""),
        deviceIds: [],
        evidence: {
          errorType: String(b.errorType || ""),
          path: String(b.path || ""),
          count: Number(b.count) || 0,
          sessions: Number(b.sessions) || 0,
        },
        suggestion: "Open Insights → Failures and filter to this exception.",
        state: "open",
        firstSeenAt: String(b.firstSeen || new Date().toISOString()),
        lastSeenAt: String(b.lastSeen || new Date().toISOString()),
        occurrences: Number(b.count) || 1,
      };

      const { filed } = syncFromAlerts([alert], {
        owningTeam: String(b.owningTeam || "Platform"),
        /* A human filed it; only a human should close it. */
        autoResolve: false,
      });

      if (filed.length === 0) {
        return NextResponse.json({
          success: true,
          incident: null,
          message: "An incident is already open for this failure.",
        });
      }
      await watch(filed[0].id);
      return NextResponse.json({ success: true, incident: await notified(filed[0]) });
    }

    /**
     * Where a team's mail goes.
     *
     * Addresses are validated rather than stored as typed: a malformed one
     * fails at send time, inside a sweep nobody is watching, and the symptom is
     * an incident that notified nobody — which is indistinguishable from the
     * bug this whole path exists to fix.
     */
    if (b.kind === "team-contacts") {
      const team = String(b.team || "").trim();
      if (!team) return NextResponse.json({ success: false, message: "A team is required." }, { status: 400 });

      const raw = Array.isArray(b.emails)
        ? b.emails.map(String)
        : String(b.emails || "").split(/[,;\s]+/);
      const emails = raw.map((s: string) => s.trim()).filter(Boolean);
      const bad = emails.filter((e: string) => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e));
      if (bad.length) {
        return NextResponse.json(
          { success: false, message: `Not an email address: ${bad.join(", ")}` },
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        teamContacts: await notified(setTeamContact(team, emails)),
      });
    }

    /** The on-call rota for one team, replaced wholesale. */
    if (b.kind === "rotation") {      const team = String(b.team || "").trim();
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

      return NextResponse.json({ success: true, rotation: await notified(saveRotation(team, shifts)) });
    }

    /** A saved queue filter. */
    if (b.kind === "view") {
      const name = String(b.name || "").trim();
      if (!name) return NextResponse.json({ success: false, message: "A name is required." }, { status: 400 });

      const view = saveView(
        { name, filters: (b.filters ?? {}) as Filters, shared: b.shared === true },
        actorOf(request)
      );
      return NextResponse.json({ success: true, view: await notified(view) });
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

    await watch(incident.id);
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
  await revalidateIcm();
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
      return NextResponse.json({ success: true, incident: await notified(getIncident(id)) });
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

    /* A resolution is the one transition that creates an obligation rather than
       discharging one. Started here so the chase is measured from this moment. */
    if (b.action === "resolve") await chase(incident);

    return NextResponse.json({ success: true, incident: await notified(incident), sla: slaSnapshot(incident, now) });
  } catch {
    return NextResponse.json({ success: false, message: "Request failed." }, { status: 500 });
  }
}

/** DELETE /api/admin/icm?viewId=… — remove a saved queue filter. */
export async function DELETE(request: Request) {
  if (!guard(request, "icm")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  await revalidateIcm();

  const viewId = new URL(request.url).searchParams.get("viewId") || "";
  if (!viewId) return NextResponse.json({ success: false, message: "A view is required." }, { status: 400 });

  const { error } = deleteView(viewId, actorOf(request));
  if (error) {
    /* "Belongs to somebody else" is a 403: the view exists, and saying so is
       not a leak — view names are shared vocabulary on a team. */
    const status = error === "No such view." ? 404 : 403;
    return NextResponse.json({ success: false, message: error }, { status });
  }
  await flushIcm();
  return NextResponse.json({ success: true });
}