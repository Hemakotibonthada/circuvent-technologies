import "../test-env";
import { describe, it, beforeEach, before, after } from "node:test";
import assert from "node:assert/strict";
import type { MqttClient } from "mqtt";
import { pool } from "../db";
import { bus, __setMqttClientForTests } from "../mqtt";
import { __resetAttendanceForTests, dedupeKey, ingestPunch, startAttendance } from "./ingest";
import { __resetAclCacheForTests, ancestryOf, computeAcl, syncTerminal } from "./acl";
import type { SiteSettings } from "./rollup";

/**
 * A scan, from the wall to the register.
 *
 * The cases here are the ones that go wrong in the field rather than the ones
 * that are easy to write: a terminal replaying its queue after an outage, a
 * card that was valid when the roster was pushed and is not valid now, and a
 * reader with no clock because the site came back from a power cut before its
 * internet did.
 *
 * Driven through the real bus wiring, with only the broker replaced. The
 * database is stubbed at pool.query — the same seam the ANPR and face-door
 * suites use — because what is being tested is the decision-making, not
 * Postgres.
 */

type QueryHandler = (sql: string, params?: unknown[]) => unknown[] | undefined;

const realQuery = pool.query.bind(pool);
const DEVICE = "rfid-attend-01";
const SITE = 1;
const OWNER = 8;

interface Published {
  topic: string;
  payload: Record<string, unknown>;
}

let published: Published[] = [];
/** Rows the ingest tried to write to attend_punches. */
let inserted: unknown[][] = [];
/** dedupe_keys the database already holds. */
let existingKeys = new Set<string>();

let terminalRow: Record<string, unknown> | null = null;
let cardRow: Record<string, unknown> | null = null;
let ruleRows: Record<string, unknown>[] = [];
let credentialRows: Record<string, unknown>[] = [];
let groupRows: Record<string, unknown>[] = [];
let previousPunch: Record<string, unknown> | null = null;

const site: SiteSettings = {
  id: SITE,
  ownerId: OWNER,
  name: "Test School",
  kind: "school",
  timeZone: "Asia/Kolkata",
  graceMinutes: 10,
  halfDayAfterMinutes: 180,
  absentAfterMinutes: 120,
  autoOut: true,
  dedupeSeconds: 60,
  notifyGuardians: false,
  notifyAbsence: false,
};

const siteDbRow = {
  id: String(SITE), owner_id: String(OWNER), name: site.name, kind: site.kind,
  timezone: site.timeZone, grace_minutes: 10, half_day_after_minutes: 180,
  absent_after_minutes: 120, auto_out: true, dedupe_seconds: 60,
  notify_guardians: false, notify_absence: false,
};

function stubQueries(extra?: QueryHandler): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = async (sql: string, params?: unknown[]) => {
    const rows = extra?.(sql, params);
    if (rows) return { rows, rowCount: rows.length };

    if (sql.includes("FROM attend_terminals t")) {
      return { rows: terminalRow ? [terminalRow] : [], rowCount: terminalRow ? 1 : 0 };
    }
    if (sql.includes("FROM attend_terminals WHERE device_id")) {
      return { rows: terminalRow ? [terminalRow] : [], rowCount: terminalRow ? 1 : 0 };
    }
    if (sql.includes("FROM attend_sites WHERE id")) return { rows: [siteDbRow], rowCount: 1 };
    if (sql.includes("FROM attend_credentials c") && sql.includes("JOIN attend_people p")) {
      // resolveCard, or the roster load for an ACL.
      if (sql.includes("c.card_number = $2")) {
        return { rows: cardRow ? [cardRow] : [], rowCount: cardRow ? 1 : 0 };
      }
      return { rows: credentialRows, rowCount: credentialRows.length };
    }
    if (sql.includes("FROM attend_rules")) return { rows: ruleRows, rowCount: ruleRows.length };
    if (sql.includes("FROM attend_schedules")) return { rows: [], rowCount: 0 };
    if (sql.includes("FROM attend_groups")) return { rows: groupRows, rowCount: groupRows.length };
    if (sql.includes("FROM attend_punches") && sql.includes("ORDER BY COALESCE")) {
      return { rows: previousPunch ? [previousPunch] : [], rowCount: previousPunch ? 1 : 0 };
    }
    if (sql.includes("INSERT INTO attend_punches")) {
      const key = params?.[15] as string | null;
      if (key && existingKeys.has(key)) return { rows: [], rowCount: 0 };
      if (key) existingKeys.add(key);
      inserted.push(params ?? []);
      return { rows: [{ id: String(inserted.length) }], rowCount: 1 };
    }
    if (sql.includes("FROM attend_people p") && sql.includes("WHERE p.id = $1")) {
      return { rows: [], rowCount: 0 };
    }
    if (sql.includes("FROM attend_days")) return { rows: [], rowCount: 0 };
    return { rows: [], rowCount: 0 };
  };
}

function terminal(over: Record<string, unknown> = {}) {
  return {
    device_id: DEVICE, site_id: String(SITE), zone_id: "5", direction: "in",
    mode: "both", enabled: true, counts: true, acl_version: "3",
    ...over,
  };
}

function card(over: Record<string, unknown> = {}) {
  return {
    credential_id: "11", cred_active: true, revoked_at: null,
    id: "7", name: "Asha", code: "S001", group_id: "3", schedule_id: null,
    active: true, valid_from: null, valid_to: null, group_schedule_id: null,
    ...over,
  };
}

before(() => {
  __setMqttClientForTests({
    publish: (topic: string, payload: string) => {
      published.push({ topic, payload: JSON.parse(payload) });
    },
  } as unknown as MqttClient);
  startAttendance();
});

after(() => {
  __setMqttClientForTests(null);
  __resetAttendanceForTests();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (pool as any).query = realQuery;
});

beforeEach(() => {
  published = [];
  inserted = [];
  existingKeys = new Set();
  terminalRow = terminal();
  cardRow = card();
  ruleRows = [];
  credentialRows = [];
  groupRows = [{ id: "3", parent_id: "2" }, { id: "2", parent_id: null }];
  previousPunch = null;
  __resetAclCacheForTests();
  stubQueries();
});

const cmds = (action: string) =>
  published.filter((p) => p.topic === `cv/${DEVICE}/cmd` && p.payload.action === action);

/** Columns of the row insertPunch built, by position. */
const col = {
  personId: 3, credentialId: 4, card: 5, direction: 6, granted: 7,
  reason: 8, method: 9, source: 10, seq: 11, deviceAt: 12, offline: 14, key: 15,
};

describe("the dedupe key", () => {
  it("includes the card and the terminal clock, not just the sequence", () => {
    /*
     * A factory reset restarts the sequence at zero. A bare (device, seq) key
     * would then silently discard several hundred real punches as duplicates
     * of last month's.
     */
    assert.equal(dedupeKey("t1", 5, 999, 1700000000), "t1|5|999|1700000000");
    assert.notEqual(dedupeKey("t1", 5, 999, 1700000000), dedupeKey("t1", 5, 111, 1700000000));
  });

  it("has no key for a punch with no sequence", () => {
    // A manual entry from the console is not a replay of anything.
    assert.equal(dedupeKey("t1", null, 5, 1), null);
  });
});

describe("an ordinary scan", () => {
  it("resolves the card, stores it, and greets by name", async () => {
    const r = await ingestPunch(DEVICE, { seq: 1, card: 4242, granted: true, ts: 1787000000 });
    assert.equal(r?.stored, true);
    assert.equal(r?.personId, 7);
    assert.equal(inserted.length, 1);
    assert.equal(inserted[0][col.granted], true);
    assert.equal(inserted[0][col.reason], "ok");

    const greet = cmds("greet");
    assert.equal(greet.length, 1);
    assert.equal(greet[0].payload.name, "Asha");
    assert.equal(greet[0].payload.status, "ok");
  });

  it("does nothing for a device nobody has set up as a terminal", async () => {
    terminalRow = null;
    const r = await ingestPunch("some-other-device", { seq: 1, card: 1 });
    assert.equal(r, null);
    assert.equal(inserted.length, 0);
  });

  it("uses the terminal's own clock when it had one", async () => {
    await ingestPunch(DEVICE, { seq: 1, card: 4242, granted: true, ts: 1787000000 });
    assert.deepEqual(inserted[0][col.deviceAt], new Date(1787000000 * 1000));
  });

  it("stores no device time at all when the terminal had no clock", async () => {
    /*
     * A site that lost power and came back before its internet did. Zero is
     * stored as null rather than as 1970 or as "now": the register can then
     * say the time is approximate instead of quietly inventing one.
     */
    await ingestPunch(DEVICE, { seq: 1, card: 4242, granted: true, ts: 0 });
    assert.equal(inserted[0][col.deviceAt], null);
  });
});

describe("a card nobody has issued", () => {
  it("is refused and still written down", async () => {
    cardRow = null;
    const r = await ingestPunch(DEVICE, { seq: 1, card: 999999, granted: false });
    assert.equal(r?.stored, true, "an unknown card at 02:00 is the row somebody comes looking for");
    assert.equal(inserted[0][col.granted], false);
    assert.equal(inserted[0][col.reason], "unknown-card");
    assert.equal(inserted[0][col.personId], null);
  });

  it("tells the terminal why, in words a person can act on", async () => {
    cardRow = null;
    await ingestPunch(DEVICE, { seq: 1, card: 999999, granted: false });
    const greet = cmds("greet")[0];
    assert.equal(greet.payload.status, "denied");
    assert.equal(greet.payload.message, "Card not recognised");
  });
});

describe("the door and the server disagreeing", () => {
  it("records that a leaver's card opened a door it should not have", async () => {
    /*
     * The reason the server re-decides at all. The terminal granted it from a
     * list pushed last week; the person left on Friday. The honest record is
     * that the door opened and should not have.
     */
    cardRow = card({ valid_to: "2020-01-01" });
    await ingestPunch(DEVICE, { seq: 1, card: 4242, granted: true });
    assert.equal(inserted[0][col.granted], false, "not counted as a valid entry");
    assert.equal(inserted[0][col.reason], "expired");
  });

  it("refuses a revoked card even though the door opened", async () => {
    cardRow = card({ cred_active: false, revoked_at: "2026-01-01T00:00:00Z" });
    await ingestPunch(DEVICE, { seq: 1, card: 4242, granted: true });
    assert.equal(inserted[0][col.reason], "revoked");
  });

  it("does not record a grant the terminal itself refused", async () => {
    await ingestPunch(DEVICE, { seq: 1, card: 4242, granted: false, reason: "offline" });
    assert.equal(inserted[0][col.granted], false);
  });
});

describe("replaying an offline queue", () => {
  it("stores a replayed punch once", async () => {
    const p = { seq: 9, card: 4242, granted: true, ts: 1787000000, offline: true };
    const first = await ingestPunch(DEVICE, p);
    const second = await ingestPunch(DEVICE, p);
    assert.equal(first?.stored, true);
    assert.equal(second?.stored, false, "the same punch twice is one arrival");
    assert.equal(inserted.length, 1);
  });

  it("does not greet somebody three hours after they walked in", async () => {
    /*
     * A replayed punch names a person who is no longer standing there, and the
     * next person at the reader would see a stranger's name beside a door that
     * did not open for them.
     */
    await ingestPunch(DEVICE, { seq: 9, card: 4242, granted: true, offline: true });
    assert.equal(cmds("greet").length, 0);
  });

  it("greets a live scan", async () => {
    await ingestPunch(DEVICE, { seq: 9, card: 4242, granted: true, offline: false });
    assert.equal(cmds("greet").length, 1);
  });

  it("keeps punches from different terminals apart", async () => {
    await ingestPunch(DEVICE, { seq: 1, card: 4242, granted: true, ts: 1787000000 });
    terminalRow = terminal({ device_id: "rfid-attend-02" });
    await ingestPunch("rfid-attend-02", { seq: 1, card: 4242, granted: true, ts: 1787000000 });
    assert.equal(inserted.length, 2, "same sequence number, different walls");
  });
});

describe("duplicate suppression", () => {
  it("suppresses a second tap on the same reader", async () => {
    const now = new Date("2026-08-17T04:30:00Z");
    previousPunch = { device_id: DEVICE, direction: "in", at: now };
    await ingestPunch(DEVICE, { seq: 2, card: 4242, granted: true }, {
      at: new Date(now.getTime() + 3000),
    });
    assert.equal(inserted[0][col.reason], "duplicate");
    assert.equal(inserted[0][col.granted], false, "not a second arrival");
  });

  it("still says something friendly on the screen", async () => {
    const now = new Date("2026-08-17T04:30:00Z");
    previousPunch = { device_id: DEVICE, direction: "in", at: now };
    await ingestPunch(DEVICE, { seq: 2, card: 4242, granted: true }, {
      at: new Date(now.getTime() + 3000),
    });
    const greet = cmds("greet")[0];
    assert.equal(greet.payload.status, "ok");
    assert.match(String(greet.payload.message), /already scanned/i);
  });
});

describe("doors with no card involved", () => {
  it("records a request-to-exit with nobody attached", async () => {
    const r = await ingestPunch(DEVICE, { seq: 4, card: 0, granted: true, method: "rex" });
    assert.equal(r?.stored, true);
    assert.equal(inserted[0][col.personId], null);
    assert.equal(inserted[0][col.method], "rex");
    assert.equal(inserted[0][col.granted], true, "a door that opens without a trace is not access control");
  });
});

describe("the allow-list", () => {
  it("walks a group's ancestors so a parent rule applies", () => {
    const parents = new Map<number, number | null>([[3, 2], [2, null]]);
    assert.deepEqual(ancestryOf(3, parents), [3, 2]);
    assert.deepEqual(ancestryOf(null, parents), []);
  });

  it("does not hang on a group that is its own ancestor", () => {
    // A cycle would otherwise spin forever inside every ACL push.
    const parents = new Map<number, number | null>([[1, 2], [2, 1]]);
    assert.ok(ancestryOf(1, parents).length <= 16);
  });

  it("contains the cards a rule allows and not the ones it does not", async () => {
    credentialRows = [
      { id: "1", card_number: "100", active: true, revoked_at: null, person_id: "7",
        name: "Asha", group_id: "3", person_active: true, valid_from: null, valid_to: null },
      { id: "2", card_number: "200", active: true, revoked_at: null, person_id: "8",
        name: "Ben", group_id: "9", person_active: true, valid_from: null, valid_to: null },
    ];
    ruleRows = [
      { id: "1", zone_id: null, group_id: "9", person_id: null, schedule_id: null,
        allow: false, priority: 0, valid_from: null, valid_to: null },
    ];
    groupRows = [{ id: "3", parent_id: null }, { id: "9", parent_id: null }];

    const cards = await computeAcl(site, { deviceId: DEVICE, zoneId: 5 });
    assert.deepEqual(cards, [100], "Ben's group is denied, so his card is not pushed");
  });

  it("leaves out somebody whose enrolment has ended", async () => {
    credentialRows = [
      { id: "1", card_number: "100", active: true, revoked_at: null, person_id: "7",
        name: "Asha", group_id: null, person_active: true, valid_from: null, valid_to: "2020-01-01" },
    ];
    const cards = await computeAcl(site, { deviceId: DEVICE, zoneId: 5 });
    assert.deepEqual(cards, []);
  });

  it("pushes in chunks with a commit at the end", async () => {
    credentialRows = Array.from({ length: 250 }, (_, i) => ({
      id: String(i), card_number: String(1000 + i), active: true, revoked_at: null,
      person_id: String(i), name: `P${i}`, group_id: null, person_active: true,
      valid_from: null, valid_to: null,
    }));
    await syncTerminal(DEVICE, { force: true });

    const acl = published.filter((p) => p.payload.action === "acl");
    assert.equal(acl[0].payload.mode, "begin");
    assert.equal(acl[0].payload.total, 250);
    assert.equal(acl.filter((p) => p.payload.mode === "chunk").length, 3, "100 per message");
    assert.equal(acl.at(-1)!.payload.mode, "commit");
  });

  it("does not push again when nothing has changed", async () => {
    credentialRows = [
      { id: "1", card_number: "100", active: true, revoked_at: null, person_id: "7",
        name: "Asha", group_id: null, person_active: true, valid_from: null, valid_to: null },
    ];
    await syncTerminal(DEVICE, { force: true });
    const after = published.length;
    await syncTerminal(DEVICE);
    assert.equal(published.length, after, "a settled site costs no MQTT traffic");
  });

  it("sends an empty list to a terminal that has been disabled", async () => {
    /*
     * "Disabled" has to mean the door stops opening. A terminal left holding
     * its last list would carry on admitting everybody, with the console
     * showing it as off.
     */
    terminalRow = terminal({ enabled: false });
    credentialRows = [
      { id: "1", card_number: "100", active: true, revoked_at: null, person_id: "7",
        name: "Asha", group_id: null, person_active: true, valid_from: null, valid_to: null },
    ];
    await syncTerminal(DEVICE, { force: true });
    const begin = published.find((p) => p.payload.mode === "begin");
    assert.equal(begin?.payload.total, 0);
  });
});

describe("wiring", () => {
  it("ingests a punch that arrives on the bus", async () => {
    bus.emit("device:update", {
      deviceId: DEVICE,
      kind: "telemetry",
      payload: { type: "punch", seq: 1, card: 4242, granted: true },
      at: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(inserted.length, 1, "something has to actually be listening");
  });

  it("re-pushes when a terminal reports an incomplete allow-list", async () => {
    bus.emit("device:update", {
      deviceId: DEVICE,
      kind: "telemetry",
      payload: { type: "acl", state: "failed", expected: 250, received: 190 },
      at: new Date().toISOString(),
    });
    await new Promise((r) => setTimeout(r, 60));
    assert.ok(
      published.some((p) => p.payload.action === "acl" && p.payload.mode === "begin"),
      "a terminal running last week's roster lets a leaver in"
    );
  });
});
