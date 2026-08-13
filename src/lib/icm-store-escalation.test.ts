/**
 * Escalation running for real, through the store.
 *
 * shouldEscalate and escalate are pure and already tested. This asserts the
 * part that cannot be tested purely: that something actually calls them. A
 * policy nobody invokes is the exact failure this codebase keeps producing — a
 * control that looks present and does nothing.
 *
 * The store is shared and accumulates, so every assertion is scoped to the
 * incident it filed rather than to "the first one".
 */

import { fileIncident, icmView, getIncident } from "./icm-store";
import type { Filters, Severity } from "./icm";

const T0 = "2026-08-12T12:00:00.000Z";
const at = (mins: number) => new Date(Date.parse(T0) + mins * 60_000).toISOString();

const file = (severity: Severity) =>
  fileIncident(
    {
      title: "Devices offline",
      description: "several devices stopped reporting",
      severity,
      source: "monitor",
      owningTeam: "Platform",
      createdBy: "monitor",
      affectedServices: ["control-plane"],
      customersImpacted: 5,
      impactStartedAt: T0,
      tags: [],
    },
    T0
  );

const ALL: Filters = { status: "all" };

describe("escalation actually runs", () => {
  it("does not escalate while the ack clock is intact", () => {
    const inc = file(3);
    icmView(ALL, at(10));
    expect(getIncident(inc.id)?.severity).toBe(3);
  });

  it("escalates a breached, unacknowledged incident when the queue is read", () => {
    const inc = file(3); // Sev3 ack target is 480 minutes
    icmView(ALL, at(481));
    const after = getIncident(inc.id);
    expect(after?.severity).toBe(2);
    expect(after?.escalations).toBe(1);
  });

  it("persists the escalation rather than only reporting it", () => {
    // The severity must survive the read that caused it, or the queue reverts
    // the moment anybody refreshes.
    const inc = file(3);
    icmView(ALL, at(481));
    icmView(ALL, at(482));
    expect(getIncident(inc.id)?.severity).toBe(2);
  });

  it("does not escalate again within the grace period, however often it is read", () => {
    const inc = file(3);
    icmView(ALL, at(481));
    for (let i = 0; i < 10; i++) icmView(ALL, at(482 + i));
    const after = getIncident(inc.id);
    expect(after?.severity).toBe(2);
    expect(after?.escalations).toBe(1);
  });

  it("never escalates a Sev1 into a Sev0, however long it is ignored", () => {
    const inc = file(1);
    icmView(ALL, at(10_000));
    expect(getIncident(inc.id)?.severity).toBe(1);
  });

  it("reports resolved incidents that owe a postmortem", () => {
    const view = icmView(ALL, at(1));
    // The shape must exist even when empty, or the panel has nothing to bind to.
    expect(Array.isArray(view.postmortemsDue)).toBe(true);
  });
});
