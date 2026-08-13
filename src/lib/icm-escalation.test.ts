/**
 * Escalation and postmortems.
 *
 * An escalation policy fails by being too loud, not too quiet: the moment it
 * pages somebody who is already working the incident, or pages twice for the
 * same thing, people turn it off. Most of these tests are about restraint.
 */

import {
  shouldEscalate,
  escalate,
  planEscalations,
  savePostmortem,
  addActionItem,
  toggleActionItem,
  publishPostmortem,
  postmortemsOutstanding,
  postmortemRequired,
  createIncident,
  acknowledge,
  ESCALATION_GRACE_MINS,
  type Incident,
  type Severity,
} from "./icm";

const T0 = "2026-08-12T12:00:00.000Z";
const at = (mins: number) => new Date(Date.parse(T0) + mins * 60_000).toISOString();

function make(severity: Severity, over: Partial<Incident> = {}): Incident {
  const inc = createIncident("INC-1", {
    title: "Devices not responding",
    description: "several devices offline",
    severity,
    source: "monitor",
    owningTeam: "Platform",
    createdBy: "monitor",
    affectedServices: ["control-plane"],
    customersImpacted: 10,
    impactStartedAt: T0,
    tags: [],
  }, T0);
  return { ...inc, ...over };
}

describe("shouldEscalate", () => {
  it("escalates an unacknowledged incident past its ack target", () => {
    const inc = make(3); // ack target 480 mins
    expect(shouldEscalate(inc, at(10))).toBe(false);
    expect(shouldEscalate(inc, at(481))).toBe(true);
  });

  it("does not escalate an acknowledged incident", () => {
    // Somebody is on it. Paging their manager anyway teaches people to
    // acknowledge things they are not working on.
    const inc = acknowledge(make(3), "ana", at(5)).incident;
    expect(shouldEscalate(inc, at(481))).toBe(false);
  });

  it("does not escalate a mitigated incident", () => {
    const inc = make(3, { status: "mitigated" });
    expect(shouldEscalate(inc, at(481))).toBe(false);
  });

  it("never escalates into Sev0", () => {
    // Sev0 means the product is gone for everybody. A clock does not have the
    // context to declare that.
    const inc = make(1);
    expect(shouldEscalate(inc, at(10_000))).toBe(false);
  });

  it("does not escalate twice inside the grace period", () => {
    const inc = make(3);
    const once = escalate(inc, at(481)).incident;
    expect(shouldEscalate(once, at(481 + ESCALATION_GRACE_MINS - 1))).toBe(false);
  });

  it("escalates again once the grace period has passed and it is still ignored", () => {
    const inc = make(3);
    const once = escalate(inc, at(481)).incident;
    expect(shouldEscalate(once, at(481 + ESCALATION_GRACE_MINS + 1))).toBe(true);
  });
});

describe("escalate", () => {
  it("raises severity by one and records why", () => {
    const inc = make(3);
    const out = escalate(inc, at(481));
    expect(out.error).toBe("");
    expect(out.incident.severity).toBe(2);
    expect(out.incident.escalations).toBe(1);
    expect(out.incident.timeline.at(-1)?.text).toContain("Sev 2");
  });

  it("does not restamp the SLA, so the breach that caused it stays visible", () => {
    /*
     * Restamping would clear the breach and make the incident look as though
     * it had been handled on time — the opposite of what happened.
     */
    const inc = make(3);
    const out = escalate(inc, at(481)).incident;
    expect(out.slaAckMins).toBe(inc.slaAckMins);
  });

  it("refuses when the conditions are not met, rather than escalating anyway", () => {
    const inc = make(3);
    const out = escalate(inc, at(10));
    expect(out.error).not.toBe("");
    expect(out.incident.severity).toBe(3);
  });
});

describe("planEscalations", () => {
  it("returns only the incidents that are due", () => {
    const due = make(3);
    const fresh = { ...make(3), id: "INC-2" };
    const acked = { ...acknowledge(make(3), "ana", at(5)).incident, id: "INC-3" };
    const plan = planEscalations([due, fresh, acked], at(481));
    expect(plan).toHaveLength(2); // due and fresh share a created time
    expect(plan.every((i) => i.severity === 2)).toBe(true);
  });

  it("returns nothing when nothing is overdue", () => {
    expect(planEscalations([make(3)], at(10))).toEqual([]);
  });
});

describe("postmortems", () => {
  const mitigated = (): Incident => ({ ...make(1), status: "mitigated" });
  const draft = { summary: "s", cause: "c", detection: "d" };

  it("refuses a postmortem while the incident is still active", () => {
    const out = savePostmortem(make(1), "ana", draft, at(30));
    expect(out.error).not.toBe("");
  });

  it("starts one once mitigated", () => {
    const out = savePostmortem(mitigated(), "ana", draft, at(30));
    expect(out.error).toBe("");
    expect(out.incident.postmortem?.cause).toBe("c");
    expect(out.incident.postmortem?.publishedAt).toBeNull();
  });

  it("requires an owner on an action, because unowned actions do not happen", () => {
    const withPm = savePostmortem(mitigated(), "ana", draft, at(30)).incident;
    const out = addActionItem(withPm, "ana", { what: "improve monitoring", owner: "", due: "" }, at(31));
    expect(out.error).toContain("owner");
  });

  it("adds and completes an action", () => {
    let inc = savePostmortem(mitigated(), "ana", draft, at(30)).incident;
    inc = addActionItem(inc, "ana", { what: "add an alert", owner: "bo", due: "next sprint" }, at(31)).incident;
    expect(inc.postmortem?.actionItems).toHaveLength(1);

    const id = inc.postmortem!.actionItems[0].id;
    inc = toggleActionItem(inc, "bo", id, at(40)).incident;
    expect(inc.postmortem?.actionItems[0].done).toBe(true);
  });

  it("refuses to publish a postmortem with no actions", () => {
    const inc = savePostmortem(mitigated(), "ana", draft, at(30)).incident;
    const out = publishPostmortem(inc, "ana", at(35));
    expect(out.error).toContain("no actions");
  });

  it("publishes once it has actions", () => {
    let inc = savePostmortem(mitigated(), "ana", draft, at(30)).incident;
    inc = addActionItem(inc, "ana", { what: "add an alert", owner: "bo", due: "" }, at(31)).incident;
    const out = publishPostmortem(inc, "ana", at(35));
    expect(out.error).toBe("");
    expect(out.incident.postmortem?.publishedAt).toBe(at(35));
  });

  it("editing a published postmortem does not silently unpublish it", () => {
    let inc = savePostmortem(mitigated(), "ana", draft, at(30)).incident;
    inc = addActionItem(inc, "ana", { what: "x", owner: "bo", due: "" }, at(31)).incident;
    inc = publishPostmortem(inc, "ana", at(35)).incident;
    inc = savePostmortem(inc, "ana", { ...draft, cause: "better understanding" }, at(60)).incident;
    expect(inc.postmortem?.publishedAt).toBe(at(35));
    expect(inc.postmortem?.cause).toBe("better understanding");
  });
});

describe("postmortemRequired / outstanding", () => {
  it("requires one for Sev2 and worse only", () => {
    expect(postmortemRequired(make(0))).toBe(true);
    expect(postmortemRequired(make(2))).toBe(true);
    // A postmortem for every Sev4 is a stack of documents nobody reads, and
    // the requirement stops meaning anything where it matters.
    expect(postmortemRequired(make(3))).toBe(false);
  });

  it("lists resolved incidents that owe one", () => {
    const owed: Incident = { ...make(1), status: "resolved" };
    const notOwed: Incident = { ...make(4), id: "INC-2", status: "resolved" };
    const stillOpen: Incident = { ...make(1), id: "INC-3" };
    expect(postmortemsOutstanding([owed, notOwed, stillOpen]).map((i) => i.id)).toEqual(["INC-1"]);
  });

  it("stops listing one after it is published", () => {
    let inc: Incident = { ...make(1), status: "mitigated" };
    inc = savePostmortem(inc, "ana", { summary: "s", cause: "c", detection: "d" }, at(30)).incident;
    inc = addActionItem(inc, "ana", { what: "x", owner: "bo", due: "" }, at(31)).incident;
    inc = publishPostmortem(inc, "ana", at(35)).incident;
    inc = { ...inc, status: "resolved" };
    expect(postmortemsOutstanding([inc])).toEqual([]);
  });
});
