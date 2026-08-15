/**
 * @jest-environment node
 */

/**
 * Which store the console preferences go to.
 *
 * The database path itself is proven against a real Postgres in
 * `scripts/test-db.ts` (PGlite cannot run inside Jest without ESM VM flags,
 * which is why the repository has that separate runner). What is asserted here
 * is the decision this module makes: use the database when one is configured,
 * fall back to the file otherwise, and — the part that caused the bug — never
 * report a save as successful when it only reached this instance's memory.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/*
 * Point the file store somewhere disposable *before* importing anything that
 * reads DATA_DIR at module load. The fallback tests below genuinely write to
 * disk, and the real .data directory holds a developer's own console
 * preferences — a test that overwrites those is a test that destroys work.
 */
process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cv-prefs-test-"));

/*
 * The factory is defined inline because jest.mock is hoisted above every
 * declaration in the file — a `const` referenced from it is still in its
 * temporal dead zone when the factory runs.
 */
jest.mock("./db", () => ({
  dbEnabled: jest.fn(),
  dbReadUserPrefs: jest.fn(),
  dbWriteUserPrefScope: jest.fn(),
  dbClearUserPrefScope: jest.fn(),
}));

import { clearScope, isDurable, isScope, readAll, readScope, writeScope } from "./user-prefs";

const dbMock = jest.requireMock("./db") as {
  dbEnabled: jest.Mock;
  dbReadUserPrefs: jest.Mock;
  dbWriteUserPrefScope: jest.Mock;
  dbClearUserPrefScope: jest.Mock;
};

const LABELS = { "home-hub-978dde59": { ch1: "FAN", ch2: "Tube light" } };

beforeEach(() => {
  jest.clearAllMocks();
  dbMock.dbEnabled.mockReturnValue(true);
  dbMock.dbReadUserPrefs.mockResolvedValue({});
  dbMock.dbWriteUserPrefScope.mockResolvedValue(undefined);
  dbMock.dbClearUserPrefScope.mockResolvedValue(true);
});

describe("scopes", () => {
  it("accepts the scopes both clients actually use", () => {
    // The phone and the site are two applications agreeing on a string with
    // nothing in either compiler to check it; they have disagreed before.
    expect(isScope("channel-labels")).toBe(true);
    expect(isScope("device-widgets")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isScope("channel-config")).toBe(false);
    expect(isScope("")).toBe(false);
  });
});

describe("with a database configured", () => {
  it("reads a scope from the database", async () => {
    dbMock.dbReadUserPrefs.mockResolvedValue({ "channel-labels": LABELS });
    await expect(readScope("u1", "channel-labels")).resolves.toEqual(LABELS);
    expect(dbMock.dbReadUserPrefs).toHaveBeenCalledWith("u1");
  });

  it("returns null for a scope the user has never saved", async () => {
    await expect(readScope("u1", "channel-labels")).resolves.toBeNull();
  });

  it("reads every scope at once", async () => {
    dbMock.dbReadUserPrefs.mockResolvedValue({ "channel-labels": LABELS, dashboard: { cols: 2 } });
    await expect(readAll("u1")).resolves.toEqual({ "channel-labels": LABELS, dashboard: { cols: 2 } });
  });

  it("writes a scope to the database", async () => {
    await expect(writeScope("u1", "channel-labels", LABELS)).resolves.toEqual(LABELS);
    expect(dbMock.dbWriteUserPrefScope).toHaveBeenCalledWith("u1", "channel-labels", LABELS);
  });

  it("lets a failed write reach the caller instead of pretending it saved", async () => {
    /*
     * The whole defect in one assertion. The old implementation wrote to an
     * in-memory object that could not fail, returned ok, and the rename was
     * gone by the next cold start — so the console told the user it was saved.
     */
    dbMock.dbWriteUserPrefScope.mockRejectedValue(new Error("connection lost"));
    await expect(writeScope("u1", "channel-labels", LABELS)).rejects.toThrow("connection lost");
  });

  it("clears through the database", async () => {
    await expect(clearScope("u1", "channel-labels")).resolves.toBe(true);
    expect(dbMock.dbClearUserPrefScope).toHaveBeenCalledWith("u1", "channel-labels");
  });

  it("is durable", () => {
    expect(isDurable()).toBe(true);
  });

  it("falls back to the local copy when the database cannot be reached on read", async () => {
    // A console that cannot reach the database should still render the names it
    // has rather than resetting every switch to its default.
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    dbMock.dbReadUserPrefs.mockRejectedValue(new Error("unreachable"));
    await expect(readScope("u1", "channel-labels")).resolves.toBeNull();
    await expect(readAll("u1")).resolves.toEqual({});
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("without a database", () => {
  beforeEach(() => dbMock.dbEnabled.mockReturnValue(false));

  it("does not call the database at all", async () => {
    await writeScope("local", "channel-labels", LABELS);
    await readScope("local", "channel-labels");
    expect(dbMock.dbWriteUserPrefScope).not.toHaveBeenCalled();
    expect(dbMock.dbReadUserPrefs).not.toHaveBeenCalled();
  });

  it("round-trips through the local file store, as local development needs", async () => {
    await writeScope("local", "channel-labels", LABELS);
    await expect(readScope("local", "channel-labels")).resolves.toEqual(LABELS);
  });

  it("keeps scopes separate locally too", async () => {
    await writeScope("local2", "channel-labels", LABELS);
    await writeScope("local2", "dashboard", { cols: 3 });
    await expect(readAll("local2")).resolves.toEqual({
      "channel-labels": LABELS,
      dashboard: { cols: 3 },
    });
  });

  it("clears only what it was asked to", async () => {
    await writeScope("local3", "channel-labels", LABELS);
    await writeScope("local3", "dashboard", { cols: 3 });
    await expect(clearScope("local3", "channel-labels")).resolves.toBe(true);
    await expect(clearScope("local3", "channel-labels")).resolves.toBe(false);
    await expect(readAll("local3")).resolves.toEqual({ dashboard: { cols: 3 } });
  });
});
