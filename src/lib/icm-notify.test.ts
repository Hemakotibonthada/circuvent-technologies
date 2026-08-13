import {
  planNotifications,
  recipientsFor,
  renderNotification,
  markSent,
  pruneSent,
  RENOTIFY_UNACKED_MINS,
  type NotifyState,
} from "./icm-notify";
import { createIncident, acknowledge, resolve, mitigate, type Incident, type Rotation } from "./icm";

const NOW = "2026-06-01T12:00:00.000Z";
const at = (mins: number) => new Date(Date.parse(NOW) + mins * 60_000).toISOString();
const empty: NotifyState = { sent: {} };

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

describe("recipientsFor", () => {
  it("prefers the assignee, then whoever is on call", () => {
    expect(recipientsFor(inc("INC-1", { assignedTo: "asha@circuvent.com" }), rota, NOW)).toEqual([
      "asha@circuvent.com",
      "ben@circuvent.com",
    ]);
  });

  it("falls back to on call when nobody is assigned", () => {
    expect(recipientsFor(inc("INC-1", { assignedTo: "" }), rota, NOW)).toEqual(["ben@circuvent.com"]);
  });

  it("appends the team address rather than substituting it", () => {
    // A team address that only receives what the rota failed to route is one
    // nobody reads.
    expect(recipientsFor(inc("INC-1", { assignedTo: "asha@x" }), rota, NOW, ["ops@circuvent.com"])).toEqual([
      "asha@x",
      "ben@circuvent.com",
      "ops@circuvent.com",
    ]);
  });

  it("does not repeat somebody who is both assigned and on call", () => {
    expect(recipientsFor(inc("INC-1", { assignedTo: "ben@circuvent.com" }), rota, NOW)).toEqual([
      "ben@circuvent.com",
    ]);
  });

  it("still returns the fallback when there is no rota and no assignee", () => {
    expect(recipientsFor(inc("INC-1", { assignedTo: "" }), [], NOW, ["ops@x"])).toEqual(["ops@x"]);
  });
});

describe("planNotifications", () => {
  it("sends one notification when an incident is filed", () => {
    const out = planNotifications([inc("INC-1", { assignedTo: "" })], empty, { rotations: rota, now: NOW });
    const filed = out.filter((n) => n.reason === "filed");

    expect(filed).toHaveLength(1);
    expect(filed[0].subject).toContain("INC-1");
    expect(filed[0].to).toEqual(["ben@circuvent.com"]);
    expect(filed[0].lines.join(" ")).toContain("Acknowledge within");
  });

  it("does not send the same thing twice", () => {
    const first = planNotifications([inc("INC-1")], empty, { rotations: rota, now: NOW });
    const state = markSent(empty, first, NOW);
    const second = planNotifications([inc("INC-1")], state, { rotations: rota, now: NOW });

    expect(first.length).toBeGreaterThan(0);
    expect(second).toHaveLength(0);
  });

  it("notifies once per escalation level, not once per incident", () => {
    const one = inc("INC-1", { escalations: 1, severity: 1 });
    const first = planNotifications([one], empty, { rotations: rota, now: NOW });
    const state = markSent(empty, first, NOW);

    // Same level again — nothing.
    expect(planNotifications([one], state, { rotations: rota, now: NOW }).filter((n) => n.reason === "escalated")).toHaveLength(0);

    // Escalated further — a new notification.
    const two = { ...one, escalations: 2, severity: 0 as const };
    const next = planNotifications([two], state, { rotations: rota, now: NOW });
    expect(next.filter((n) => n.reason === "escalated")).toHaveLength(1);
  });

  it("does not nag while the incident is still inside its ack target", () => {
    const fresh = inc("INC-1");
    const out = planNotifications([fresh], { sent: { "INC-1:filed": NOW } }, {
      rotations: rota,
      now: at(fresh.slaAckMins - 1),
    });

    expect(out.filter((n) => n.reason === "unacknowledged")).toHaveLength(0);
  });

  it("nags once the ack target has passed, and again each interval after", () => {
    const fresh = inc("INC-1");
    let state: NotifyState = { sent: { "INC-1:filed": NOW } };

    const first = planNotifications([fresh], state, { rotations: rota, now: at(fresh.slaAckMins + 1) });
    expect(first.filter((n) => n.reason === "unacknowledged")).toHaveLength(1);
    state = markSent(state, first, NOW);

    // A minute later — still the same interval, so nothing new.
    expect(
      planNotifications([fresh], state, { rotations: rota, now: at(fresh.slaAckMins + 2) }).filter(
        (n) => n.reason === "unacknowledged"
      )
    ).toHaveLength(0);

    // A full interval later — nag again.
    expect(
      planNotifications([fresh], state, {
        rotations: rota,
        now: at(fresh.slaAckMins + RENOTIFY_UNACKED_MINS + 1),
      }).filter((n) => n.reason === "unacknowledged")
    ).toHaveLength(1);
  });

  it("stops nagging the moment somebody acknowledges", () => {
    const acked = acknowledge(inc("INC-1"), "asha", at(5)).incident;
    const out = planNotifications([acked], { sent: { "INC-1:filed": NOW } }, {
      rotations: rota,
      now: at(300),
    });

    expect(out.filter((n) => n.reason === "unacknowledged")).toHaveLength(0);
  });

  it("does not announce the filing of an incident that is already closed", () => {
    const done = resolve(mitigate(inc("INC-1"), "asha", "restarted", at(5)).incident, "asha", "bad deploy", at(10)).incident;
    const out = planNotifications([done], empty, { rotations: rota, now: at(20) });

    expect(out.filter((n) => n.reason === "filed")).toHaveLength(0);
    expect(out.filter((n) => n.reason === "resolved")).toHaveLength(1);
  });

  it("carries the root cause into the resolution notice", () => {
    const done = resolve(mitigate(inc("INC-1"), "asha", "restarted", at(5)).incident, "asha", "bad deploy", at(10)).incident;
    const [n] = planNotifications([done], empty, { rotations: rota, now: at(20) }).filter((x) => x.reason === "resolved");

    expect(n.lines.join(" ")).toContain("bad deploy");
  });

  it("puts the worst incident first, so a truncated batch keeps the Sev1", () => {
    const out = planNotifications(
      [inc("INC-3", { severity: 3 }), inc("INC-1", { severity: 1 }), inc("INC-2", { severity: 2 })],
      empty,
      { rotations: rota, now: NOW }
    );

    expect(out[0].incidentId).toBe("INC-1");
  });

  it("still plans a notification when nobody can be found to send it to", () => {
    // The caller decides what to do with an empty recipient list; silently
    // dropping it here would hide that the rota has a hole.
    const out = planNotifications([inc("INC-1", { assignedTo: "", owningTeam: "Nobody" })], empty, {
      rotations: rota,
      now: NOW,
    });

    expect(out.filter((n) => n.reason === "filed")).toHaveLength(1);
    expect(out[0].to).toEqual([]);
  });
});

describe("renderNotification", () => {
  it("escapes free text so a stray bracket cannot break the message", () => {
    const [n] = planNotifications([inc("INC-1", { title: "<script>alert(1)</script>" })], empty, { now: NOW });
    const r = renderNotification(n);

    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
    // The plain-text part is not HTML and must not be mangled.
    expect(r.text).toContain("<script>");
  });

  it("drops empty lines rather than rendering blank paragraphs", () => {
    const r = renderNotification({
      key: "k",
      incidentId: "INC-1",
      reason: "filed",
      to: [],
      subject: "s",
      lines: ["one", "", "two"],
      severity: 2,
    });

    expect(r.html.match(/<p style="margin/g)).toHaveLength(2);
  });
});

describe("pruneSent", () => {
  it("forgets incidents that no longer exist", () => {
    const state: NotifyState = { sent: { "INC-1:filed": NOW, "INC-2:filed": NOW, "INC-2:resolved": NOW } };
    const pruned = pruneSent(state, [inc("INC-2")]);

    expect(Object.keys(pruned.sent).sort()).toEqual(["INC-2:filed", "INC-2:resolved"]);
  });

  it("keeps everything when every incident is still live", () => {
    const state: NotifyState = { sent: { "INC-1:filed": NOW } };
    expect(pruneSent(state, [inc("INC-1")]).sent).toEqual(state.sent);
  });
});
