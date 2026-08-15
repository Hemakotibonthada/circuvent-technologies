/**
 * Team notification: who hears about an incident, and about every change to it.
 *
 * Two gaps this covers, both of which meant a team could own an incident and
 * never hear about it:
 *
 *  1. A team was only ever a *name*. Recipients were the assignee, whoever the
 *     rota named, and one global address shared by every team — so Firmware's
 *     2am page and Web's went to the same inbox, and an incident routed to a
 *     team with an empty rota and no assignee reached nobody but that inbox.
 *
 *  2. Only five things were ever announced: filed, escalated, assigned,
 *     unacknowledged, resolved. Acknowledging, mitigating, commenting,
 *     changing severity and publishing a postmortem — the running commentary a
 *     team actually follows an incident by — were silent.
 */

import {
  UPDATE_MAX_AGE_MINS,
  planNotifications,
  recipientsFor,
  teamAddresses,
  type NotifyState,
  type TeamContacts,
} from "./icm-notify";
import {
  acknowledge,
  assign,
  comment,
  createIncident,
  mitigate,
  publishPostmortem,
  savePostmortem,
  setSeverity,
  type Incident,
  type Rotation,
} from "./icm";

const NOW = "2026-06-01T12:00:00.000Z";
const at = (mins: number) => new Date(Date.parse(NOW) + mins * 60_000).toISOString();
const empty: NotifyState = { sent: {} };

const CONTACTS: TeamContacts = {
  Platform: ["platform-oncall@circuvent.com", "platform-leads@circuvent.com"],
  Firmware: ["firmware@circuvent.com"],
};

const inc = (id: string, over: Partial<Incident> = {}): Incident => ({
  ...createIncident(
    id,
    {
      title: "Meter readings stalled",
      description: "No readings for 20 minutes.",
      severity: 2,
      source: "monitor",
      owningTeam: "Platform",
      createdBy: "icm-bridge",
      affectedServices: [],
      customersImpacted: 0,
    },
    NOW
  ),
  ...over,
});

const rota: Rotation[] = [
  { team: "Platform", shifts: [{ team: "Platform", who: "ben@circuvent.com", startsAt: at(-60), endsAt: at(60) }] },
];

const plan = (incidents: Incident[], state: NotifyState = empty, now = NOW) =>
  planNotifications(incidents, state, { rotations: rota, now, contacts: CONTACTS });

describe("teamAddresses", () => {
  it("returns the list for a team", () => {
    expect(teamAddresses(CONTACTS, "Firmware")).toEqual(["firmware@circuvent.com"]);
  });

  it("matches regardless of case and surrounding space", () => {
    // One side is typed into a form, the other into an environment variable.
    expect(teamAddresses(CONTACTS, "  platform ")).toEqual(CONTACTS.Platform);
    expect(teamAddresses({ "Control Plane": ["cp@x.com"] }, "control plane")).toEqual(["cp@x.com"]);
  });

  it("returns nothing for a team with no list, rather than guessing", () => {
    expect(teamAddresses(CONTACTS, "Networking")).toEqual([]);
    expect(teamAddresses(CONTACTS, "")).toEqual([]);
  });
});

describe("who the team's mail reaches", () => {
  it("copies the team's list as well as the people acting", () => {
    expect(recipientsFor(inc("INC-1", { assignedTo: "asha@x.com" }), rota, NOW, [], CONTACTS)).toEqual([
      "asha@x.com",
      "ben@circuvent.com",
      "platform-oncall@circuvent.com",
      "platform-leads@circuvent.com",
    ]);
  });

  it("reaches the team even when nobody is assigned and the rota is empty", () => {
    /* The case that used to reach nobody at all. */
    const orphan = inc("INC-1", { assignedTo: "", owningTeam: "Firmware" });
    expect(recipientsFor(orphan, [], NOW, [], CONTACTS)).toEqual(["firmware@circuvent.com"]);
  });

  it("keeps the global fallback last, after the team", () => {
    const to = recipientsFor(inc("INC-1", { assignedTo: "" }), [], NOW, ["ops@x.com"], CONTACTS);
    expect(to).toEqual(["platform-oncall@circuvent.com", "platform-leads@circuvent.com", "ops@x.com"]);
  });

  it("does not write to the same address twice, whatever its capitals", () => {
    const dup = inc("INC-1", { assignedTo: "Platform-OnCall@circuvent.com" });
    const to = recipientsFor(dup, [], NOW, [], CONTACTS);
    expect(to).toEqual(["Platform-OnCall@circuvent.com", "platform-leads@circuvent.com"]);
  });

  it("routes a different team's incident to that team", () => {
    const fw = inc("INC-2", { owningTeam: "Firmware", assignedTo: "" });
    expect(recipientsFor(fw, rota, NOW, [], CONTACTS)).toEqual(["firmware@circuvent.com"]);
  });
});

describe("the mail sent when an incident is filed", () => {
  it("goes to the owning team", () => {
    const filed = plan([inc("INC-1")]).find((n) => n.reason === "filed")!;
    expect(filed.to).toEqual(expect.arrayContaining(CONTACTS.Platform));
    expect(filed.subject).toContain("INC-1");
  });

  it("names the team in the body", () => {
    const filed = plan([inc("INC-1")]).find((n) => n.reason === "filed")!;
    expect(filed.lines.join(" ")).toContain("Platform");
  });
});

describe("every update reaches the team", () => {
  const updatesFor = (incident: Incident, now = NOW) =>
    plan([incident], empty, now).filter((n) => n.reason === "update");

  it("announces an acknowledgement", () => {
    const a = acknowledge(inc("INC-1"), "asha@x.com", at(1)).incident;
    const [u] = updatesFor(a, at(2));
    expect(u.subject).toContain("Acknowledged");
    expect(u.to).toEqual(expect.arrayContaining(CONTACTS.Platform));
  });

  it("announces a comment, and carries what was said", () => {
    const c = comment(inc("INC-1"), "ben@x.com", "Rolling back the meter firmware.", at(1)).incident;
    const [u] = updatesFor(c, at(2));
    expect(u.subject).toContain("Comment");
    expect(u.lines.join("\n")).toContain("Rolling back the meter firmware.");
  });

  it("announces a severity change", () => {
    const s = setSeverity(inc("INC-1"), "asha@x.com", 1, "customer impact", at(1)).incident;
    const [u] = updatesFor(s, at(2));
    expect(u.subject).toContain("Severity changed");
  });

  it("announces mitigation", () => {
    const m = mitigate(inc("INC-1"), "asha@x.com", "restarted the collector", at(1)).incident;
    expect(updatesFor(m, at(2)).some((u) => u.subject.includes("Mitigated"))).toBe(true);
  });

  it("announces a published postmortem", () => {
    let i = mitigate(inc("INC-1"), "asha@x.com", "restarted", at(1)).incident;
    i = savePostmortem(i, "asha@x.com", { summary: "s", cause: "c", detection: "d" }, at(2)).incident;
    i = publishPostmortem(i, "asha@x.com", at(3)).incident;
    expect(updatesFor(i, at(4)).some((u) => u.subject.includes("Postmortem"))).toBe(true);
  });

  it("says where the incident stands now, not only what changed", () => {
    // Somebody reading the third mail needs the current state, not a diff.
    const c = comment(inc("INC-1"), "ben@x.com", "still looking", at(1)).incident;
    const [u] = updatesFor(c, at(2));
    expect(u.lines.join(" ")).toMatch(/Now active.*owned by Platform/);
  });

  it("sends one mail per change, not one per action type", () => {
    let i = acknowledge(inc("INC-1"), "asha@x.com", at(1)).incident;
    i = comment(i, "ben@x.com", "one", at(2)).incident;
    i = comment(i, "ben@x.com", "two", at(3)).incident;
    expect(updatesFor(i, at(4))).toHaveLength(3);
  });

  it("does not announce an update twice", () => {
    const c = comment(inc("INC-1"), "ben@x.com", "once", at(1)).incident;
    const first = plan([c], empty, at(2)).filter((n) => n.reason === "update");
    const state: NotifyState = { sent: Object.fromEntries(first.map((n) => [n.key, at(2)])) };
    expect(plan([c], state, at(3)).filter((n) => n.reason === "update")).toHaveLength(0);
  });

  it("does not duplicate the events that already have their own mail", () => {
    /* Filing, escalation, resolution and assignment are announced by dedicated
       rules; announcing them again as generic updates would double every one. */
    const c = comment(inc("INC-1"), "ben@x.com", "hello", at(1)).incident;
    const updates = updatesFor(c, at(2));
    expect(updates).toHaveLength(1);
    expect(updates[0].subject).toContain("Comment");
  });

  it("ignores updates too old to act on", () => {
    /*
     * The first sweep after this shipped would otherwise mail the entire
     * history of every incident, and a mail outage would deliver a day of
     * stale updates the moment it recovered.
     */
    const c = comment(inc("INC-1"), "ben@x.com", "ancient", at(1)).incident;
    const later = at(UPDATE_MAX_AGE_MINS + 10);
    expect(plan([c], empty, later).filter((n) => n.reason === "update")).toHaveLength(0);
  });
});

describe("routing an incident to a team", () => {
  it("announces a hand-over that names no person", () => {
    /*
     * The commonest way work is handed over, and the case that sent nothing:
     * the rule was keyed on the assignee, which does not change when an
     * incident is merely routed to another team.
     */
    const routed = assign(inc("INC-1", { assignedTo: "" }), "asha@x.com", "", "Firmware", at(1)).incident;
    const n = plan([routed], empty, at(2)).find((x) => x.reason === "assigned")!;

    expect(n.subject).toContain("Routed");
    expect(n.to).toEqual(["firmware@circuvent.com"]);
  });

  it("tells the team it has been given the incident, not the one that gave it up", () => {
    const routed = assign(inc("INC-1", { assignedTo: "" }), "asha@x.com", "", "Firmware", at(1)).incident;
    const n = plan([routed], empty, at(2)).find((x) => x.reason === "assigned")!;
    expect(n.to).not.toContain("platform-oncall@circuvent.com");
  });

  it("announces each re-assignment, including back to a previous owner", () => {
    /* Keyed on the assignee, handing an incident back to somebody who had held
       it before was treated as already sent. */
    let i = assign(inc("INC-1"), "lead@x.com", "asha@x.com", "", at(1)).incident;
    const first = plan([i], empty, at(2)).find((n) => n.reason === "assigned")!;

    const state: NotifyState = { sent: { [first.key]: at(2) } };
    i = assign(i, "lead@x.com", "ben@x.com", "", at(3)).incident;
    i = assign(i, "lead@x.com", "asha@x.com", "", at(4)).incident;

    const again = plan([i], state, at(5)).find((n) => n.reason === "assigned")!;
    expect(again).toBeDefined();
    expect(again.key).not.toBe(first.key);
    expect(again.subject).toContain("Assigned");
  });
});
