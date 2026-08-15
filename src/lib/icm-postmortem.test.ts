/**
 * @jest-environment node
 */

/**
 * Chasing the write-up a resolved incident owes.
 *
 * The model has always known which incidents owe a postmortem, and the queue
 * has always listed them — but both only work on somebody who goes looking,
 * and a resolved incident is closed, so nothing draws anybody back to it. The
 * behaviour under test is the reminder that arrives without being asked for,
 * and — just as important — the point at which it stops asking.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cv-icm-pm-"));

jest.mock("./order-core", () => ({ sendMail: jest.fn().mockResolvedValue(true) }));

import {
  POSTMORTEM_GRACE_MINS,
  POSTMORTEM_MAX_REMINDERS,
  POSTMORTEM_REMIND_MINS,
  planNotifications,
  type NotifyState,
} from "./icm-notify";
import { fileIncident, sweepPostmortem, updateIncident } from "./icm-store";
import {
  acknowledge,
  addActionItem,
  createIncident,
  mitigate,
  publishPostmortem,
  reactivate,
  resolve,
  savePostmortem,
  type Incident,
  type Severity,
} from "./icm";

const NOW = "2026-10-01T09:00:00.000Z";
const at = (mins: number) => new Date(Date.parse(NOW) + mins * 60_000).toISOString();
const hours = (h: number) => h * 60;
const empty: NotifyState = { sent: {} };

let n = 0;

/** A resolved incident of the given severity, resolved at NOW. */
function resolved(severity: Severity = 2): Incident {
  const inc = fileIncident(
    {
      title: `Needs a write-up ${n++}`,
      description: "",
      severity,
      owningTeam: "Platform",
      createdBy: "tests",
      source: "manual",
      affectedServices: [],
      customersImpacted: 0,
    },
    at(-10)
  );
  updateIncident(inc.id, (i) => acknowledge(i, "asha@x.com", at(-9)));
  updateIncident(inc.id, (i) => mitigate(i, "asha@x.com", "restarted", at(-8)));
  updateIncident(inc.id, (i) => resolve(i, "asha@x.com", "fixed", NOW));
  return inc;
}

/* The planner is pure, so the reminder rule is exercised directly rather than
   through the store — the store test below covers the schedule. */
const plannedFor = (inc: Incident, now: string, state: NotifyState = empty) =>
  planNotifications([inc], state, { now, contacts: { Platform: ["platform@x.com"] } }).filter(
    (x) => x.reason === "postmortem"
  );

function resolvedIncident(severity: number, over: Partial<Incident> = {}): Incident {
  const base = createIncident(
    `INC-P${n++}`,
    {
      title: "Checkout was down",
      description: "",
      severity: severity as Incident["severity"],
      owningTeam: "Platform",
      createdBy: "tests",
      source: "manual",
      affectedServices: [],
      customersImpacted: 0,
    },
    at(-10)
  );
  return {
    ...base,
    status: "resolved",
    acknowledgedAt: at(-9),
    mitigatedAt: at(-8),
    resolvedAt: NOW,
    ...over,
  };
}

describe("the reminder rule", () => {
  it("says nothing during the grace period", () => {
    // Chasing an hour after an outage reaches people who just finished a long
    // night, and is the surest way to make the reminder something they filter.
    expect(plannedFor(resolvedIncident(2), at(hours(1)))).toHaveLength(0);
    expect(plannedFor(resolvedIncident(2), at(POSTMORTEM_GRACE_MINS - 1))).toHaveLength(0);
  });

  it("asks once the grace period has passed", () => {
    const [n1] = plannedFor(resolvedIncident(2), at(POSTMORTEM_GRACE_MINS + 5));
    expect(n1).toBeDefined();
    expect(n1.subject).toContain("Postmortem due");
    expect(n1.to).toContain("platform@x.com");
  });

  it("says whether anything has been written yet", () => {
    const nothing = plannedFor(resolvedIncident(2), at(POSTMORTEM_GRACE_MINS + 5))[0];
    expect(nothing.lines.join(" ")).toContain("Nothing has been written");

    const drafted = resolvedIncident(2);
    const withDraft = savePostmortem(
      drafted,
      "asha@x.com",
      { summary: "s", cause: "c", detection: "d" },
      at(1)
    ).incident;
    const some = plannedFor(withDraft, at(POSTMORTEM_GRACE_MINS + 5))[0];
    expect(some.lines.join(" ")).toContain("draft exists");
  });

  it("does not ask a severity that owes nothing", () => {
    expect(plannedFor(resolvedIncident(3), at(POSTMORTEM_GRACE_MINS + 5))).toHaveLength(0);
    expect(plannedFor(resolvedIncident(4), at(POSTMORTEM_GRACE_MINS + 5))).toHaveLength(0);
  });

  it("does not ask once it has been published", () => {
    let inc = resolvedIncident(1);
    inc = savePostmortem(inc, "asha@x.com", { summary: "s", cause: "c", detection: "d" }, at(1)).incident;
    inc = addActionItem(inc, "asha@x.com", { what: "add a timeout", owner: "ben", due: "next sprint" }, at(2)).incident;
    inc = publishPostmortem(inc, "asha@x.com", at(3)).incident;

    expect(plannedFor(inc, at(POSTMORTEM_GRACE_MINS + 5))).toHaveLength(0);
  });

  it("does not ask about an incident that is open again", () => {
    const inc = reactivate(resolvedIncident(1), "ben@x.com", "it came back", at(60)).incident;
    expect(plannedFor(inc, at(POSTMORTEM_GRACE_MINS + 5))).toHaveLength(0);
  });

  it("repeats on an interval, once per interval", () => {
    const inc = resolvedIncident(2);
    const first = plannedFor(inc, at(POSTMORTEM_GRACE_MINS + 5))[0];
    const state: NotifyState = { sent: { [first.key]: NOW } };

    // Still inside the same interval: already asked.
    expect(plannedFor(inc, at(POSTMORTEM_GRACE_MINS + 60), state)).toHaveLength(0);
    // Into the next one: asks again, under a different key.
    const second = plannedFor(inc, at(POSTMORTEM_GRACE_MINS + POSTMORTEM_REMIND_MINS + 5), state)[0];
    expect(second).toBeDefined();
    expect(second.key).not.toBe(first.key);
  });

  it("stops asking rather than becoming background noise", () => {
    /* A write-up still missing two weeks later is not waiting for another
       email, and continuing to send teaches the team to ignore these. */
    const inc = resolvedIncident(2);
    const wayLater = at(POSTMORTEM_GRACE_MINS + POSTMORTEM_MAX_REMINDERS * POSTMORTEM_REMIND_MINS + 5);
    expect(plannedFor(inc, wayLater)).toHaveLength(0);
  });
});

describe("when the chaser wakes up", () => {
  it("waits for the end of the grace period on the first pass", async () => {
    const inc = resolved(2);
    const state = await sweepPostmortem(inc.id, at(1));

    expect(state.outstanding).toBe(true);
    expect(state.nextCheckAt).not.toBeNull();
    const dueInMins = Math.round((Date.parse(state.nextCheckAt!) - Date.parse(NOW)) / 60_000);
    expect(dueInMins).toBe(POSTMORTEM_GRACE_MINS);
  });

  it("moves to the next interval once a reminder is due", async () => {
    const inc = resolved(2);
    const state = await sweepPostmortem(inc.id, at(POSTMORTEM_GRACE_MINS + 5));

    const dueInMins = Math.round((Date.parse(state.nextCheckAt!) - Date.parse(NOW)) / 60_000);
    expect(dueInMins).toBe(POSTMORTEM_GRACE_MINS + POSTMORTEM_REMIND_MINS);
  });

  it("stops when the write-up is published", async () => {
    const inc = resolved(2);
    updateIncident(inc.id, (i) =>
      savePostmortem(i, "asha@x.com", { summary: "s", cause: "c", detection: "d" }, at(1))
    );
    updateIncident(inc.id, (i) =>
      addActionItem(i, "asha@x.com", { what: "add a timeout", owner: "ben", due: "soon" }, at(2))
    );
    updateIncident(inc.id, (i) => publishPostmortem(i, "asha@x.com", at(3)));

    const state = await sweepPostmortem(inc.id, at(POSTMORTEM_GRACE_MINS + 5));
    expect(state.outstanding).toBe(false);
    expect(state.nextCheckAt).toBeNull();
  });

  it("stands down when the incident is reopened", async () => {
    /* It owes an acknowledgement before it owes a document, and a different
       workflow handles that. */
    const inc = resolved(1);
    updateIncident(inc.id, (i) => reactivate(i, "ben@x.com", "it came back", at(60)));

    const state = await sweepPostmortem(inc.id, at(hours(30)));
    expect(state.reopened).toBe(true);
    expect(state.nextCheckAt).toBeNull();
  });

  it("stops for a severity that owes nothing", async () => {
    const inc = resolved(3);
    const state = await sweepPostmortem(inc.id, at(POSTMORTEM_GRACE_MINS + 5));
    expect(state.outstanding).toBe(false);
    expect(state.nextCheckAt).toBeNull();
  });

  it("gives up after the last reminder rather than sleeping forever", async () => {
    const inc = resolved(2);
    const exhausted = at(
      POSTMORTEM_GRACE_MINS + (POSTMORTEM_MAX_REMINDERS - 1) * POSTMORTEM_REMIND_MINS + 5
    );
    const state = await sweepPostmortem(inc.id, exhausted);
    expect(state.nextCheckAt).toBeNull();
  });

  it("reports an incident that no longer exists rather than throwing", async () => {
    const state = await sweepPostmortem("INC-0000", NOW);
    expect(state.exists).toBe(false);
    expect(state.nextCheckAt).toBeNull();
  });
});
