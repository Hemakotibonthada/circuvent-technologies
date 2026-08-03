import "./test-env";
import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { pool } from "./db";
import { buildDeviceReport, reportToCsv } from "./device-report";

/**
 * The report is the one document that gathers everything known about a unit,
 * and it is rendered for two audiences from one assembler. The assertions that
 * matter are therefore about the boundary between them: what an owner must
 * never be shown, and the fact that neither audience can be shown a credential
 * because none is stored in recoverable form.
 */

const DEVICE = {
  id: "smart-plug-a41c9e02",
  serial: "CV-PLG-4K7M-92XH",
  hwid: "a41c9e02",
  name: "Lobby plug",
  type: "smart-plug",
  room: "Lobby",
  favorite: false,
  online: true,
  last_seen: new Date("2026-08-03T09:00:00.000Z"),
  state: { power: true, watts: 41.2 },
  fw_version: "1.4.2",
  created_at: new Date("2026-01-05T08:30:00.000Z"),
  notes: "RMA #4471 — replaced under warranty",
  batch: "BATCH-2026-01",
  key_issued_at: new Date("2026-01-05T08:30:00.000Z"),
  key_rotated_at: new Date("2026-06-01T10:00:00.000Z"),
  key_rotations: 2,
  owner_id: "7",
  owner_email: "customer@example.com",
  owner_name: "A Customer",
};

/** Answers each of the report's queries by what the SQL mentions. */
function stubPool(over: { device?: unknown[] } = {}): void {
  (pool as unknown as { query: unknown }).query = async (sql: string) => {
    if (sql.includes("FROM devices d")) return { rows: over.device ?? [DEVICE], rowCount: 1 };
    // Must be tested before the plain "FROM telemetry" branch — the counts
    // query selects COUNT(*) FROM telemetry and would otherwise match it.
    if (sql.includes("telemetry_total")) {
      return { rows: [{ telemetry_total: "5231", command_total: "88", first_seen: new Date("2026-01-05T09:00:00.000Z") }], rowCount: 1 };
    }
    if (sql.includes("FROM telemetry")) {
      return { rows: [{ ts: new Date("2026-08-03T08:59:00.000Z"), payload: { watts: 41.2 } }], rowCount: 1 };
    }
    if (sql.includes("FROM commands c")) {
      return {
        rows: [{ ts: new Date("2026-08-03T08:58:00.000Z"), payload: { power: true }, email: "customer@example.com" }],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM events")) {
      return {
        rows: [{ ts: new Date("2026-08-01T00:00:00.000Z"), kind: "info", title: "Came online", body: "" }],
        rowCount: 1,
      };
    }
    if (sql.includes("FROM device_audit")) {
      return {
        rows: [
          {
            ts: new Date("2026-06-01T10:00:00.000Z"),
            actor_email: "ops@circuvent.com",
            action: "reissue-key",
            detail: { rotation: 2 },
            note: "customer lost the card",
          },
        ],
        rowCount: 1,
      };
    }
    return { rows: [], rowCount: 0 };
  };
}

describe("admin report", () => {
  test("gathers every section", async () => {
    stubPool();
    const r = await buildDeviceReport(DEVICE.id, "admin");
    assert.ok(r);
    assert.equal(r.audience, "admin");
    assert.equal(r.identity.serial, "CV-PLG-4K7M-92XH");
    assert.equal(r.identity.hwid, "a41c9e02");
    assert.equal(r.identity.batch, "BATCH-2026-01");
    assert.equal(r.ownership.ownerEmail, "customer@example.com");
    assert.equal(r.connectivity.telemetryRecords, 5231);
    assert.equal(r.connectivity.commandsIssued, 88);
    assert.equal(r.telemetry.length, 1);
    assert.equal(r.controlLog.length, 1);
    assert.equal(r.events.length, 1);
    assert.equal(r.auditLog.length, 1);
    assert.equal(r.auditLog[0].actor, "ops@circuvent.com");
  });

  test("reports credential history without a credential", async () => {
    // bcrypt means there is nothing to return even to an admin. The report has
    // to say so rather than omit the section, or support will keep looking for
    // the field that shows the key.
    stubPool();
    const r = await buildDeviceReport(DEVICE.id, "admin");
    assert.equal(r!.credentials.recoverable, false);
    assert.equal(r!.credentials.rotations, 2);
    assert.ok(String(r!.credentials.note).includes("cannot be displayed"));
    assert.ok(!("key" in r!.credentials));
    assert.ok(!("keyHash" in r!.credentials));
    assert.ok(!JSON.stringify(r).includes("key_hash"));
  });

  test("names who issued each command", async () => {
    stubPool();
    const r = await buildDeviceReport(DEVICE.id, "admin");
    assert.equal(r!.controlLog[0].by, "customer@example.com");
  });
});

describe("owner report redaction", () => {
  test("hides manufacturing data", async () => {
    // The chip id and batch identify a production run and mean nothing to a
    // customer. The internal note may quote an RMA or another person's case.
    stubPool();
    const r = await buildDeviceReport(DEVICE.id, "owner");
    assert.ok(r);
    assert.equal(r.identity.hwid, undefined);
    assert.equal(r.identity.batch, undefined);
    assert.equal(r.identity.notes, undefined);
    const json = JSON.stringify(r);
    assert.ok(!json.includes("BATCH-2026-01"));
    assert.ok(!json.includes("RMA #4471"));
    // Not asserted: that the chip id string is absent from the whole document.
    // devices.id is `${type}-${hwid}` by construction, so the chip id is inside
    // an identifier the owner already sees on every screen. Redacting the field
    // is what matters; pretending the id does not contain it would be theatre.
  });

  test("never exposes the administrative audit trail", async () => {
    // Which member of staff touched a unit, and the free-text reason they
    // gave, is internal. It is not queried at all for an owner.
    stubPool();
    const r = await buildDeviceReport(DEVICE.id, "owner");
    assert.deepEqual(r!.auditLog, []);
    const json = JSON.stringify(r);
    assert.ok(!json.includes("ops@circuvent.com"));
    assert.ok(!json.includes("customer lost the card"));
  });

  test("does not leak account identifiers", async () => {
    stubPool();
    const r = await buildDeviceReport(DEVICE.id, "owner");
    assert.equal(r!.ownership.ownerId, undefined);
    assert.equal(r!.ownership.ownerEmail, undefined);
    assert.equal(r!.ownership.claimed, true);
    assert.ok(!JSON.stringify(r).includes("customer@example.com"));
  });

  test("still keeps everything the owner is entitled to", async () => {
    // Redaction must not turn the customer's copy into a stub — they asked for
    // a report of their own device.
    stubPool();
    const r = await buildDeviceReport(DEVICE.id, "owner");
    assert.equal(r!.identity.serial, "CV-PLG-4K7M-92XH");
    assert.equal(r!.identity.firmware, "1.4.2");
    assert.deepEqual(r!.state, { power: true, watts: 41.2 });
    assert.equal(r!.telemetry.length, 1);
    assert.equal(r!.controlLog.length, 1);
    assert.equal(r!.events.length, 1);
    assert.equal(r!.connectivity.telemetryRecords, 5231);
    assert.ok(String(r!.qr.label).startsWith("circuvent://setup?"));
  });

  test("attributes the owner's own commands without naming them", async () => {
    stubPool();
    const r = await buildDeviceReport(DEVICE.id, "owner");
    assert.equal(r!.controlLog[0].by, "you");
  });
});

describe("edges", () => {
  test("returns null for a device that does not exist", async () => {
    stubPool({ device: [] });
    assert.equal(await buildDeviceReport("nope", "admin"), null);
  });

  test("survives a device that has never been claimed or seen", async () => {
    stubPool({
      device: [
        {
          ...DEVICE,
          serial: null,
          last_seen: null,
          key_rotated_at: null,
          owner_id: null,
          owner_email: null,
          owner_name: null,
          state: {},
        },
      ],
    });
    const r = await buildDeviceReport(DEVICE.id, "admin");
    assert.ok(r);
    assert.equal(r.identity.serial, null);
    assert.equal(r.ownership.claimed, false);
    assert.equal(r.connectivity.lastSeen, null);
    // With no serial the QR must still identify the unit by its id rather than
    // emitting "null" into a printed label.
    assert.ok(String(r.qr.label).includes(DEVICE.id));
  });

  test("says when the history was truncated", async () => {
    // Otherwise a reader concludes the device only ever sent one sample.
    stubPool();
    const r = await buildDeviceReport(DEVICE.id, "admin", { limit: 1 });
    assert.equal(r!.summary.truncated, true);
    const wide = await buildDeviceReport(DEVICE.id, "admin", { limit: 100 });
    assert.equal(wide!.summary.truncated, false);
  });
});

describe("csv export", () => {
  test("escapes values that would otherwise break the columns", async () => {
    stubPool({
      device: [{ ...DEVICE, name: 'Plug, "main"\nhall' }],
    });
    const csv = reportToCsv((await buildDeviceReport(DEVICE.id, "admin"))!);
    assert.ok(csv.includes('"Plug, ""main""\nhall"'));
  });

  test("includes the audit section only when there is one", async () => {
    stubPool();
    const admin = reportToCsv((await buildDeviceReport(DEVICE.id, "admin"))!);
    assert.ok(admin.includes("# Administrative audit"));
    const owner = reportToCsv((await buildDeviceReport(DEVICE.id, "owner"))!);
    assert.ok(!owner.includes("# Administrative audit"));
  });
});
