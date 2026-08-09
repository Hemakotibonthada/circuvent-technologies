/**
 * Tests for scheduled email reports (reports-schedule.ts).
 *
 * The file store, mail transport and report engine are mocked so the schedule
 * logic is tested in isolation: recipient validation, CRUD, the due/cadence
 * calculation, and that a run rebuilds + emails each due report and records the
 * outcome. No disk and no real store are touched.
 */
jest.mock("./data-file", () => {
  return {
    createFileStore: <T,>(_name: string, seed: () => T) => {
      let mem: T | null = null;
      const load = () => { if (mem === null) mem = seed(); return mem; };
      return {
        read: () => load(),
        write: (n: T) => { mem = n; },
        mutate: <R,>(fn: (d: T) => R) => fn(load()),
        isDurable: () => false,
      };
    },
    shortId: (p = "") => `${p}_${Math.random().toString(36).slice(2, 10)}`,
  };
});
jest.mock("./order-core", () => ({ sendMail: jest.fn(async () => true) }));
jest.mock("./reports", () => ({
  isReportType: (x: string) => ["sales", "tax", "products"].includes(x),
  buildReport: (type: string, days: number) => ({
    id: type, title: `${type} report`, subtitle: "s", group: "Sales", rangeDays: days,
    generatedAt: new Date().toISOString(), currency: "INR", summary: [],
    columns: [{ key: "a", label: "A", type: "text" }], rows: [["x"]], totals: [], notes: [],
  }),
  companyInfo: () => ({ name: "Test Co", addressLines: [], gstin: null, state: "TS", stateCode: null, email: "a@b.c" }),
  REPORT_CATALOG: [{ id: "sales", label: "Sales", desc: "", group: "Sales" }],
}));

import * as orderCore from "./order-core";
import {
  cleanRecipients, createSchedule, updateSchedule, deleteSchedule, listSchedules,
  isDue, sendSchedule, runDueSchedules, isFrequency, type ReportSchedule,
} from "./reports-schedule";

const sendMail = (orderCore as unknown as { sendMail: jest.Mock }).sendMail;

function clearAll() {
  for (const s of listSchedules()) deleteSchedule(s.id);
}
beforeEach(() => { clearAll(); sendMail.mockReset(); sendMail.mockResolvedValue(true); });

describe("cleanRecipients", () => {
  it("keeps valid emails, drops junk and de-duplicates case-insensitively", () => {
    expect(cleanRecipients("a@b.com, A@B.com; bad, c@d.co")).toEqual(["a@b.com", "c@d.co"]);
    expect(cleanRecipients(["x@y.com", "nope"])).toEqual(["x@y.com"]);
    expect(cleanRecipients("")).toEqual([]);
    expect(cleanRecipients(undefined)).toEqual([]);
  });
});

describe("isFrequency", () => {
  it("accepts the three cadences and nothing else", () => {
    expect(isFrequency("daily")).toBe(true);
    expect(isFrequency("weekly")).toBe(true);
    expect(isFrequency("monthly")).toBe(true);
    expect(isFrequency("hourly")).toBe(false);
  });
});

describe("createSchedule validation", () => {
  it("rejects an unknown report type", () => {
    const r = createSchedule({ reportType: "nope", frequency: "daily", recipients: "a@b.com" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/report type/i);
  });
  it("rejects a bad frequency", () => {
    const r = createSchedule({ reportType: "sales", frequency: "yearly", recipients: "a@b.com" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/frequency/i);
  });
  it("rejects when no valid recipient is given", () => {
    const r = createSchedule({ reportType: "sales", frequency: "daily", recipients: "notanemail" });
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/recipient/i);
  });
  it("creates a valid schedule with defaults", () => {
    const r = createSchedule({ reportType: "sales", frequency: "weekly", recipients: "a@b.com, a@b.com" });
    expect(r.ok).toBe(true);
    expect(r.schedule!.recipients).toEqual(["a@b.com"]);
    expect(r.schedule!.enabled).toBe(true);
    expect(r.schedule!.rangeDays).toBe(30);
    expect(listSchedules()).toHaveLength(1);
  });
});

describe("update / delete", () => {
  it("updates fields and can pause a schedule", () => {
    const created = createSchedule({ reportType: "sales", frequency: "daily", recipients: "a@b.com" }).schedule!;
    const upd = updateSchedule(created.id, { enabled: false, rangeDays: 90 });
    expect(upd.ok).toBe(true);
    expect(upd.schedule!.enabled).toBe(false);
    expect(upd.schedule!.rangeDays).toBe(90);
  });
  it("returns not-found for a missing id", () => {
    expect(updateSchedule("missing", { enabled: false }).error).toMatch(/not found/i);
    expect(deleteSchedule("missing")).toBe(false);
  });
  it("deletes an existing schedule", () => {
    const created = createSchedule({ reportType: "tax", frequency: "monthly", recipients: "a@b.com" }).schedule!;
    expect(deleteSchedule(created.id)).toBe(true);
    expect(listSchedules()).toHaveLength(0);
  });
});

describe("isDue", () => {
  const mk = (over: Partial<ReportSchedule>): ReportSchedule => ({
    id: "s", reportType: "sales", rangeDays: 30, frequency: "daily", recipients: ["a@b.com"],
    enabled: true, createdAt: "", updatedAt: "", lastSentAt: null, lastStatus: null, lastError: null, sendCount: 0,
    ...over,
  });
  const now = Date.now();
  it("is due when enabled and never sent", () => {
    expect(isDue(mk({}), now)).toBe(true);
  });
  it("is not due when paused", () => {
    expect(isDue(mk({ enabled: false }), now)).toBe(false);
  });
  it("is not due when there are no recipients", () => {
    expect(isDue(mk({ recipients: [] }), now)).toBe(false);
  });
  it("respects the daily cadence", () => {
    expect(isDue(mk({ lastSentAt: new Date(now - 2 * 3_600_000).toISOString() }), now)).toBe(false); // 2h ago
    expect(isDue(mk({ lastSentAt: new Date(now - 25 * 3_600_000).toISOString() }), now)).toBe(true);  // 25h ago
  });
  it("respects the weekly cadence", () => {
    const day = 86_400_000;
    expect(isDue(mk({ frequency: "weekly", lastSentAt: new Date(now - 3 * day).toISOString() }), now)).toBe(false);
    expect(isDue(mk({ frequency: "weekly", lastSentAt: new Date(now - 8 * day).toISOString() }), now)).toBe(true);
  });
});

describe("sendSchedule", () => {
  it("emails every recipient and records an ok outcome", async () => {
    const s = createSchedule({ reportType: "sales", frequency: "daily", recipients: "a@b.com, c@d.com" }).schedule!;
    const outcome = await sendSchedule(s.id);
    expect(outcome.status).toBe("ok");
    expect(sendMail).toHaveBeenCalledTimes(2);
    const after = listSchedules().find((x) => x.id === s.id)!;
    expect(after.lastStatus).toBe("ok");
    expect(after.lastSentAt).not.toBeNull();
    expect(after.sendCount).toBe(1);
  });
  it("records a failed outcome when the transport fails", async () => {
    sendMail.mockResolvedValue(false);
    const s = createSchedule({ reportType: "tax", frequency: "daily", recipients: "a@b.com" }).schedule!;
    const outcome = await sendSchedule(s.id);
    expect(outcome.status).toBe("failed");
    expect(listSchedules().find((x) => x.id === s.id)!.lastStatus).toBe("failed");
  });
});

describe("runDueSchedules", () => {
  it("sends only the schedules that are due", async () => {
    const due = createSchedule({ reportType: "sales", frequency: "daily", recipients: "a@b.com" }).schedule!;
    const notDue = createSchedule({ reportType: "tax", frequency: "daily", recipients: "c@d.com" }).schedule!;
    // Mark notDue as just sent so its cadence has not elapsed.
    updateSchedule(notDue.id, {});
    const fresh = listSchedules().find((x) => x.id === notDue.id)!;
    fresh.lastSentAt = new Date().toISOString(); // simulate a very recent send

    const summary = await runDueSchedules();
    expect(summary.ran).toBe(1);
    expect(summary.outcomes.some((o) => o.id === due.id)).toBe(true);
    expect(summary.outcomes.some((o) => o.id === notDue.id)).toBe(false);
  });
});
