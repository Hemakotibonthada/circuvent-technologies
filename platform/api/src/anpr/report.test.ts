import "../test-env";
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { reportHtml, type ReportData } from "./report";

/**
 * The daily report's rendering.
 *
 * The scheduler and the delivery path need a database and an SMTP server, but
 * the body does not — and the body is where a report quietly becomes useless:
 * a plate rendered unreadably, a zero that looks like a fault, or an unescaped
 * value breaking the layout in the one client the recipient uses.
 */

const base: ReportData = {
  day: "2026-08-09",
  total: 42,
  recognised: 40,
  entries: 21,
  exits: 19,
  unique: 17,
  denied: 1,
  watched: 0,
  unreadable: 2,
  insideNow: 3,
  capacity: 20,
  busiestHour: 8,
  overstays: [{ plate: "KA01AB1234", hours: 14 }],
  blocked: [{ plate: "MH12CD5678", at: "19:42" }],
  frequent: [{ plate: "KA01AB1234", count: 6 }],
  recogniser: "platerecognizer",
};

describe("report body", () => {
  it("shows plates grouped the way they are printed on the car", () => {
    // The stored form has no spaces. A report is read aloud and typed into
    // tickets, so it must not hand somebody a ten-character run.
    const html = reportHtml(base, "Front gate");
    assert.match(html, /KA 01 AB 1234/);
    assert.doesNotMatch(html, /KA01AB1234/);
  });

  it("states the read rate against the total, not alone", () => {
    const html = reportHtml(base, "Front gate");
    assert.match(html, /40 of 42/);
  });

  it("reports occupancy against capacity when one is set", () => {
    assert.match(reportHtml(base, "Front gate"), /3 of 20/);
    // Without a capacity the bare count is correct — "3 of null" is not.
    assert.match(reportHtml({ ...base, capacity: null }, "Front gate"), />3</);
  });

  it("explains a zero read rate caused by configuration, not by the camera", () => {
    /*
     * The failure this prevents: a facilities manager gets a report saying 0%
     * of plates were read, and sends somebody up a ladder to inspect a camera
     * that is working exactly as configured.
     */
    const html = reportHtml(
      { ...base, recognised: 0, unreadable: 42, recogniser: "none" },
      "Front gate"
    );
    assert.match(html, /No plate recogniser is configured/i);
    assert.match(html, /not a camera fault/i);
  });

  it("warns when the camera really is reading poorly", () => {
    const html = reportHtml({ ...base, total: 40, recognised: 10 }, "Front gate");
    assert.match(html, /Fewer than 6 in 10/i);
    assert.doesNotMatch(html, /No plate recogniser is configured/i);
  });

  it("says a quiet day was quiet, and what to check", () => {
    // An empty report and a broken camera look identical otherwise.
    const html = reportHtml(
      { ...base, total: 0, recognised: 0, entries: 0, exits: 0, unique: 0, denied: 0,
        unreadable: 0, blocked: [], frequent: [], busiestHour: null },
      "Front gate"
    );
    assert.match(html, /No vehicles were recorded/i);
    assert.match(html, /online and armed/i);
  });

  it("omits sections that have nothing in them", () => {
    const quiet = reportHtml({ ...base, denied: 0, blocked: [], overstays: [], frequent: [] }, "Front gate");
    assert.doesNotMatch(quiet, /Blocked vehicles/);
    assert.doesNotMatch(quiet, /Most frequent/);
    assert.doesNotMatch(quiet, /Overdue vehicles/);
  });

  it("escapes the site name instead of letting it break the layout", () => {
    // The name comes from a user-editable account field.
    const html = reportHtml(base, '<script>alert(1)</script>');
    assert.doesNotMatch(html, /<script>alert/);
    assert.match(html, /&lt;script&gt;/);
  });

  it("uses no remote images, so it renders with images blocked", () => {
    // Most clients block remote images by default; a report that depends on
    // them looks broken to most of the people who receive it.
    assert.doesNotMatch(reportHtml(base, "Front gate"), /<img/i);
  });

  it("tells the reader where to turn it off", () => {
    assert.match(reportHtml(base, "Front gate"), /Security|Vehicles|Site/);
  });
});
