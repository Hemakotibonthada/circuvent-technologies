/**
 * @jest-environment node
 */

/**
 * The incident watcher's scheduling decisions.
 *
 * `sweepIncident` is the step behind the durable workflow, and the value that
 * matters is `nextCheckAt`: it is what the workflow sleeps until. Getting it
 * wrong is not a visibly broken feature — it is a page that arrives hours late,
 * or a workflow that spins waking itself up. Neither shows up on a screen.
 *
 * Escalation used to happen only inside `icmView`, so an incident escalated
 * when somebody opened the admin queue and not before. These tests drive the
 * store directly, with no panel involved, which is the situation the workflow
 * exists to handle.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cv-icm-watch-"));

/* The sweep sends mail as its last act. Stubbed so these tests exercise the
   scheduling rather than the transport, which order-core covers already. */
jest.mock("./order-core", () => ({ sendMail: jest.fn().mockResolvedValue(true) }));

import { RENOTIFY_UNACKED_MINS } from "./icm-notify";
import { fileIncident, sweepIncident, updateIncident } from "./icm-store";
import { acknowledge, mitigate, resolve } from "./icm";

const NOW = "2026-09-01T09:00:00.000Z";
const at = (mins: number) => new Date(Date.parse(NOW) + mins * 60_000).toISOString();
const minutesUntil = (iso: string, from: string) =>
  Math.round((Date.parse(iso) - Date.parse(from)) / 60_000);

let n = 0;
function file(over: Partial<Parameters<typeof fileIncident>[0]> = {}) {
  return fileIncident(
    {
      title: `Watched incident ${n++}`,
      description: "",
      severity: 2,
      owningTeam: "Platform",
      createdBy: "tests",
      source: "monitor",
      affectedServices: [],
      customersImpacted: 0,
      ...over,
    },
    NOW
  );
}

describe("when to look again", () => {
  it("waits for the acknowledgement deadline, not a fixed interval", async () => {
    const inc = file();
    const state = await sweepIncident(inc.id, NOW);

    expect(state.exists).toBe(true);
    expect(state.acknowledged).toBe(false);
    expect(state.nextCheckAt).not.toBeNull();
    /* The whole point of a durable sleep: wake exactly when the clock runs
       out, rather than polling and hoping a poll lands near it. */
    expect(minutesUntil(state.nextCheckAt!, NOW)).toBe(inc.slaAckMins);
  });

  it("nags on a fixed interval once the deadline has passed", async () => {
    const inc = file();
    const late = at(inc.slaAckMins + 5);
    const state = await sweepIncident(inc.id, late);

    expect(minutesUntil(state.nextCheckAt!, late)).toBe(RENOTIFY_UNACKED_MINS);
  });

  it("never asks to be woken in the past, however far the clock has run down", async () => {
    // A breached clock returns a negative remainder; sleeping until then would
    // return immediately and spin the workflow.
    const inc = file();
    const veryLate = at(inc.slaAckMins + 10_000);
    const state = await sweepIncident(inc.id, veryLate);

    expect(Date.parse(state.nextCheckAt!)).toBeGreaterThan(Date.parse(veryLate));
  });

  it("switches to the mitigation clock once somebody has acknowledged", async () => {
    const inc = file();
    updateIncident(inc.id, (i) => acknowledge(i, "asha@x.com", at(1)));

    const state = await sweepIncident(inc.id, at(2));

    expect(state.acknowledged).toBe(true);
    expect(state.nextCheckAt).not.toBeNull();
    /* Further out than the nag interval — this is the mitigation budget, not
       another reminder aimed at somebody already working the problem. */
    expect(minutesUntil(state.nextCheckAt!, at(2))).toBeGreaterThan(RENOTIFY_UNACKED_MINS);
  });

  it("stops once the mitigation clock has also run out", async () => {
    const inc = file();
    updateIncident(inc.id, (i) => acknowledge(i, "asha@x.com", at(1)));

    const state = await sweepIncident(inc.id, at(10_000));

    expect(state.nextCheckAt).toBeNull();
  });

  it("stops when the incident is mitigated", async () => {
    const inc = file();
    updateIncident(inc.id, (i) => acknowledge(i, "asha@x.com", at(1)));
    updateIncident(inc.id, (i) => mitigate(i, "asha@x.com", "restarted", at(2)));

    expect((await sweepIncident(inc.id, at(3))).nextCheckAt).toBeNull();
  });

  it("stops when the incident is resolved", async () => {
    const inc = file();
    updateIncident(inc.id, (i) => acknowledge(i, "asha@x.com", at(1)));
    updateIncident(inc.id, (i) => mitigate(i, "asha@x.com", "restarted", at(2)));
    updateIncident(inc.id, (i) => resolve(i, "asha@x.com", "fixed", at(3)));

    const state = await sweepIncident(inc.id, at(4));
    expect(state.status).toBe("resolved");
    expect(state.nextCheckAt).toBeNull();
  });

  it("reports an incident that no longer exists rather than throwing", async () => {
    const state = await sweepIncident("INC-9999", NOW);
    expect(state.exists).toBe(false);
    expect(state.nextCheckAt).toBeNull();
  });
});

describe("escalating without anybody watching", () => {
  it("raises the severity when the deadline passes", async () => {
    /* The behaviour that previously required somebody to open the admin queue. */
    const inc = file({ severity: 3 });
    const state = await sweepIncident(inc.id, at(inc.slaAckMins + 1));

    expect(state.escalated).toBe(true);
    expect(state.severity).toBe(2);
  });

  it("does not escalate one that is still within its clock", async () => {
    const inc = file({ severity: 3 });
    const state = await sweepIncident(inc.id, at(1));

    expect(state.escalated).toBe(false);
    expect(state.severity).toBe(3);
  });

  it("does not escalate one that has been acknowledged", async () => {
    const inc = file({ severity: 3 });
    updateIncident(inc.id, (i) => acknowledge(i, "asha@x.com", at(1)));

    const state = await sweepIncident(inc.id, at(inc.slaAckMins + 1));
    expect(state.escalated).toBe(false);
  });

  it("escalates repeatedly as the incident stays unowned, one level at a time", async () => {
    const inc = file({ severity: 3 });

    const first = await sweepIncident(inc.id, at(inc.slaAckMins + 1));
    expect(first.escalated).toBe(true);
    expect(first.severity).toBe(2);

    /* Immediately afterwards the grace period holds it. */
    const held = await sweepIncident(inc.id, at(inc.slaAckMins + 2));
    expect(held.escalated).toBe(false);

    const later = await sweepIncident(inc.id, at(inc.slaAckMins + 10_000));
    expect(later.escalated).toBe(true);
    expect(later.severity).toBe(1);
  });

  it("sends what the escalation made due", async () => {
    const inc = file({ severity: 3 });
    const state = await sweepIncident(inc.id, at(inc.slaAckMins + 1));
    /* Skipped counts as handled: with no team address and no rota there is
       nobody to write to, which the sweep reports rather than hiding. */
    expect(state.notified.sent + state.notified.skipped).toBeGreaterThan(0);
    expect(state.notified.failed).toBe(0);
  });
});
