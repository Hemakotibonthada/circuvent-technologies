/**
 * The incident summary must never invent.
 *
 * IcM's assistant card is trusted because it reads as authoritative — somebody
 * paged at 3am reads "What we know" and acts on it. That trust is only earned
 * if every sentence is traceable to a field on the record. These tests exist to
 * catch the day someone decides the card would be more helpful if it guessed.
 */

import { summariseIncident } from "@/lib/icm-summary";
import { formatWhen } from "@/lib/icm";
import type { Incident } from "@/lib/icm";

const NOW = new Date("2025-02-10T12:00:00.000Z").toISOString();
const NOW_MS = Date.parse(NOW);

/*
 * Deliberately not cast with `as Incident`. The first draft of this file was,
 * and the cast silently accepted timeline entries with the wrong field names —
 * the test then "found" a bug in the summary that was really a bug in the
 * fixture. A fixture that does not typecheck is not a fixture.
 */
function incident(over: Partial<Incident> = {}): Incident {
  return {
    id: "INC-1000",
    title: "Camera stream dropping frames",
    description: "",
    severity: 2,
    status: "active",
    source: "monitor",
    owningTeam: "Firmware",
    assignedTo: "",
    createdBy: "monitor",
    createdAt: new Date(NOW_MS - 45 * 60_000).toISOString(),
    acknowledgedAt: null,
    mitigatedAt: null,
    resolvedAt: null,
    impactStartedAt: new Date(NOW_MS - 45 * 60_000).toISOString(),
    affectedServices: [],
    customersImpacted: 0,
    mitigation: "",
    rootCause: "",
    timeline: [
      {
        id: "t1",
        kind: "created",
        at: new Date(NOW_MS - 45 * 60_000).toISOString(),
        actor: "monitor",
        text: "opened the incident",
      },
    ],
    tags: [],
    slaAckMins: 15,
    slaMitigateMins: 120,
    escalations: 0,
    links: [],
    ...over,
  };
}

describe("summariseIncident", () => {
  it("states the age of the incident rather than leaving it to be worked out", () => {
    const s = summariseIncident(incident(), NOW);
    expect(s.known.join(" ")).toMatch(/45m/);
  });

  it("does not claim a cause when no root cause has been recorded", () => {
    const s = summariseIncident(incident(), NOW);
    const text = [...s.known, ...s.done].join(" ").toLowerCase();
    expect(text).not.toContain("root cause");
    expect(text).not.toContain("caused by");
  });

  it("reports the cause verbatim once one is recorded", () => {
    const s = summariseIncident(
      incident({ rootCause: "Broker hit its per-client message cap." }),
      NOW
    );
    expect(s.done.join(" ")).toContain("Broker hit its per-client message cap.");
  });

  /*
   * The quiet flag is the honest signal. An incident where nothing has happened
   * since it opened should say so, rather than padding the card with the fact
   * that it was opened — which the reader can see from the header.
   */
  it("flags an incident where nothing has happened since it was created", () => {
    const s = summariseIncident(incident(), NOW);
    expect(s.quiet).toBe(true);
  });

  it("is no longer quiet once somebody has acted, and names who acted", () => {
    const inc = incident({
      acknowledgedAt: new Date(NOW_MS - 30 * 60_000).toISOString(),
      timeline: [
        ...incident().timeline,
        {
          id: "t2",
          kind: "acknowledged",
          at: new Date(NOW_MS - 30 * 60_000).toISOString(),
          actor: "asha",
          text: "acknowledged the incident",
        },
      ],
    });
    const s = summariseIncident(inc, NOW);
    expect(s.quiet).toBe(false);
    expect(s.done.join(" ")).toMatch(/asha/i);
  });

  it("names the breached clock rather than just saying the SLA is breached", () => {
    // Created 45m ago against a 15m acknowledgement target, never acknowledged.
    const s = summariseIncident(incident({ slaAckMins: 15 }), NOW);
    expect(s.known.join(" ").toLowerCase()).toContain("acknowledge");
  });

  it("points at the original when the incident is a duplicate", () => {
    const s = summariseIncident(
      incident({
        links: [{ id: "INC-0994", kind: "duplicate-of", at: NOW, by: "asha" }],
      }),
      NOW
    );
    expect(s.known.join(" ")).toContain("INC-0994");
  });

  it("never paraphrases an operator's own words", () => {
    const note = "Rolled back to 1.11.4 — do NOT re-deploy 1.12.0 until QA signs off.";
    const s = summariseIncident(
      incident({
        timeline: [
          ...incident().timeline,
          { id: "t2", kind: "comment", at: NOW, actor: "ravi", text: note },
        ],
      }),
      NOW
    );
    expect(s.done.join(" ")).toContain(note);
  });

  it("does not say 'filed by monitor via monitor' when a source files its own", () => {
    const s = summariseIncident(incident({ createdBy: "monitor", source: "monitor" }), NOW);
    expect(s.known.join(" ")).not.toMatch(/monitor via monitor/);
    expect(s.known.join(" ")).toContain("filed by monitor");
  });

  it("still names both when a person files against a source", () => {
    const s = summariseIncident(incident({ createdBy: "asha", source: "monitor" }), NOW);
    expect(s.known.join(" ")).toContain("filed by asha via monitor");
  });

  /*
   * The card sits directly under the SLA clocks. A US-format timestamp beside
   * "10 Feb, 03:50 am" reads as a different event, not a different format.
   */
  it("states times in the same format as the clocks above it", () => {
    const s = summariseIncident(
      incident({ escalations: 1, lastEscalatedAt: new Date(NOW_MS - 10 * 60_000).toISOString() }),
      NOW
    );
    const line = s.known.find((l) => l.startsWith("Escalated")) ?? "";
    expect(line).toContain(formatWhen(new Date(NOW_MS - 10 * 60_000).toISOString()));
    expect(line).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  it("survives an incident with no timeline at all", () => {
    const s = summariseIncident(incident({ timeline: [] }), NOW);
    expect(Array.isArray(s.known)).toBe(true);
    expect(Array.isArray(s.done)).toBe(true);
  });
});
