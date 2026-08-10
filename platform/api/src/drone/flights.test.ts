import "../test-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toSummary, type FlightRow } from "./flights";
import { reportHtml, describeIncident, type FlightReportData } from "./report";

/**
 * The pure halves of the flight log.
 *
 * `applyBatch` and the sweeps need Postgres, so what is proved here is the
 * part that turns stored rows into the numbers a person reads — which is where
 * a log book quietly becomes wrong. A duration computed from the wrong pair of
 * timestamps is still a plausible number, and nobody checks a plausible
 * number.
 */

function flight(over: Partial<FlightRow> = {}): FlightRow {
  return {
    id: "1",
    owner_id: 1,
    device_id: "drone-link-abc",
    boot_id: "1",
    started_at: "2026-08-09T10:00:00.000Z",
    ended_at: "2026-08-09T10:20:00.000Z",
    took_off_at: "2026-08-09T10:02:00.000Z",
    landed_at: "2026-08-09T10:18:00.000Z",
    max_alt_m: 85.5,
    max_dist_m: 420,
    distance_m: 3200,
    max_speed_ms: 14.2,
    batt_start_pct: 98,
    batt_end_pct: 31,
    batt_used_mah: 4100,
    home_lat: 17.385,
    home_lon: 78.4867,
    samples: 9600,
    outcome: "landed",
    failsafe: false,
    fence_breach: false,
    notes: null,
    ...over,
  } as FlightRow;
}

describe("flight summary", () => {
  it("separates total time from airborne time", () => {
    /*
     * Arming and leaving the ground are different moments, sometimes minutes
     * apart while a pilot waits for a clearance. Duty time built on the wrong
     * one is wrong by exactly that gap.
     */
    const s = toSummary(flight());
    assert.equal(s.durationSec, 20 * 60);
    assert.equal(s.airborneSec, 16 * 60);
  });

  it("reports airborne time as null — not zero — when the aircraft never flew", () => {
    /*
     * An aircraft that armed, failed a check and disarmed has no airborne time
     * to measure. Zero would be a claim that it flew for no time, which reads
     * as a real flight in every average computed downstream.
     */
    const s = toSummary(flight({ took_off_at: null, landed_at: null }));
    assert.equal(s.airborneSec, null);
    assert.equal(s.durationSec, 20 * 60);
  });

  it("gives an open flight no duration rather than a running one", () => {
    const s = toSummary(flight({ ended_at: null, landed_at: null, outcome: "open" }));
    assert.equal(s.durationSec, null);
    assert.equal(s.airborneSec, null);
  });

  it("keeps stale distinct from landed", () => {
    /*
     * A flight that ended in silence is the one an investigator goes looking
     * for. Folding it into "landed" would hide the only record of it.
     */
    const s = toSummary(flight({ outcome: "stale" }));
    assert.equal(s.outcome, "stale");
  });

  it("coerces numeric columns that Postgres returns as strings", () => {
    // node-postgres returns REAL and BIGINT as strings. Left uncoerced these
    // reach the UI as "3200" and sort lexically, so 900 m looks further than
    // 3200 m.
    const s = toSummary(flight({
      max_alt_m: "85.5" as unknown as number,
      distance_m: "3200" as unknown as number,
      samples: "9600" as unknown as number,
    }));
    assert.equal(typeof s.maxAltM, "number");
    assert.equal(s.distanceM, 3200);
    assert.equal(s.samples, 9600);
  });
});

describe("incident descriptions", () => {
  it("writes plain English for every kind the pipeline records", () => {
    assert.match(describeIncident("failsafe", { mode: "rtl" }), /failsafe.*rtl/i);
    assert.match(describeIncident("fence-breach", { dist: 812.4 }), /812 m/);
    assert.match(describeIncident("low-battery", { battPct: 14 }), /14%/);
    assert.match(describeIncident("telemetry-gap", { missedBatches: 6 }), /6 batches/);
    assert.match(describeIncident("flight-stale", {}), /without a landing/i);
  });

  it("falls back to the raw kind rather than inventing a description", () => {
    assert.equal(describeIncident("something-new", {}), "something-new");
  });
});

const base: FlightReportData = {
  day: "2026-08-09",
  flights: 7,
  airborneSec: 4920,
  distanceM: 18400,
  maxAltM: 112,
  aircraft: [
    { deviceId: "drone-link-a1", name: "Survey 1", flights: 4, airborneSec: 3000 },
    { deviceId: "drone-link-b2", name: null, flights: 3, airborneSec: 1920 },
  ],
  incidents: [],
  stale: 0,
  retire: [],
  ageing: [],
  operatorId: "UAOP-1234",
};

describe("flight report body", () => {
  it("leads with a green banner when nothing went wrong", () => {
    const html = reportHtml(base, "Field team");
    assert.match(html, /All flights completed normally/);
    assert.match(html, /Field team/);
    assert.match(html, /UAOP-1234/);
  });

  it("leads with the exceptions when something did", () => {
    /*
     * The days this report matters are the days nobody opens it, so anything
     * that went wrong has to be readable in a preview pane — above the totals,
     * not below them.
     */
    const html = reportHtml(
      { ...base, stale: 1, incidents: [{ at: "14:32", deviceId: "drone-link-a1", kind: "failsafe", detail: "Autopilot failsafe" }] },
      "Field team"
    );
    const bannerAt = html.indexOf("need review");
    const activityAt = html.indexOf("Activity");
    assert.ok(bannerAt > 0, "expected an exception banner");
    assert.ok(bannerAt < activityAt, "exceptions must appear above the totals");
    assert.match(html, /ended without a landing/);
  });

  it("shows distance in kilometres once it is far enough to matter", () => {
    assert.match(reportHtml(base, "F"), /18\.40 km/);
    assert.match(reportHtml({ ...base, distanceM: 420 }, "F"), /420 m/);
  });

  it("says so plainly when nothing flew", () => {
    const html = reportHtml({ ...base, flights: 0, airborneSec: 0, distanceM: 0, aircraft: [] }, "F");
    assert.match(html, /No flights were recorded/);
  });

  it("separates packs that must be retired from packs merely ageing", () => {
    /*
     * The useful response to an ageing pack is to stop putting it on the long
     * jobs — not to bin it. A single "bad" flag gives an operator nothing to
     * do until the day it flips, by which point the pack has been flying at
     * the edge for months.
     */
    const html = reportHtml(
      {
        ...base,
        retire: [{ label: "Pack C", cycles: 214, retireAt: 200 }],
        ageing: [{ label: "Pack A", cycles: 168, retireAt: 200 }],
      },
      "F"
    );
    assert.match(html, /due for retirement/i);
    assert.match(html, /Pack C/);
    assert.match(html, /Batteries ageing/i);
    assert.match(html, /Pack A/);
  });

  it("escapes values that would otherwise break the layout", () => {
    const html = reportHtml(base, `Team "<script>alert(1)</script>"`);
    assert.doesNotMatch(html, /<script>/);
    assert.match(html, /&lt;script&gt;/);
  });

  it("falls back to the device id when an aircraft has no name", () => {
    const html = reportHtml(base, "F");
    assert.match(html, /drone-link-b2/);
    assert.match(html, /Survey 1/);
  });

  it("hides the per-aircraft table for a single aircraft", () => {
    // With one airframe the table repeats the totals verbatim, and a report
    // that says everything twice gets skimmed.
    const html = reportHtml({ ...base, aircraft: [base.aircraft[0]!] }, "F");
    assert.doesNotMatch(html, /By aircraft/);
  });
});
