/**
 * @jest-environment node
 */

/**
 * Durable feature-module stores.
 *
 * `createFileStore` writes a JSON file under DATA_DIR. That is correct locally
 * and silently wrong in production: the serverless filesystem is read-only, the
 * helper catches the write failure and carries on in memory, so each module's
 * data survives only until that instance is recycled and is invisible to every
 * other instance meanwhile. Incidents filed in the morning were gone by the
 * afternoon, and the queue read empty.
 *
 * The most important case here is not that writes reach the database — it is
 * that a store which was *not* hydrated refuses to write at all. Without that
 * guard, a route that forgot to hydrate would start from the empty seed and
 * flush that emptiness over the real document, turning a display bug into data
 * loss.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "cv-datafile-test-"));

jest.mock("./db", () => ({
  dbEnabled: jest.fn(),
  dbReadFileStore: jest.fn(),
  dbWriteFileStore: jest.fn(),
}));

import { createFileStore } from "./data-file";

const dbMock = jest.requireMock("./db") as {
  dbEnabled: jest.Mock;
  dbReadFileStore: jest.Mock;
  dbWriteFileStore: jest.Mock;
};

interface Doc {
  items: string[];
  seq: number;
}

const seed = (): Doc => ({ items: [], seq: 0 });

/** A unique file per test, so one test's disk copy cannot feed another. */
let n = 0;
const uniqueName = () => `test-${Date.now()}-${n++}.json`;

beforeEach(() => {
  jest.clearAllMocks();
  dbMock.dbEnabled.mockReturnValue(true);
  dbMock.dbReadFileStore.mockResolvedValue(null);
  dbMock.dbWriteFileStore.mockResolvedValue(undefined);
});

describe("without a database", () => {
  beforeEach(() => dbMock.dbEnabled.mockReturnValue(false));

  it("behaves exactly as before — disk only", async () => {
    const store = createFileStore<Doc>(uniqueName(), seed, { durable: true });
    await store.hydrate();
    store.mutate((d) => d.items.push("a"));
    await store.flush();

    expect(store.read().items).toEqual(["a"]);
    expect(dbMock.dbReadFileStore).not.toHaveBeenCalled();
    expect(dbMock.dbWriteFileStore).not.toHaveBeenCalled();
  });

  it("leaves a store that never opted in alone", async () => {
    dbMock.dbEnabled.mockReturnValue(true);
    const store = createFileStore<Doc>(uniqueName(), seed);
    await store.hydrate();
    store.mutate((d) => d.items.push("a"));
    await store.flush();
    expect(dbMock.dbWriteFileStore).not.toHaveBeenCalled();
  });
});

describe("with a database", () => {
  it("loads the authoritative copy on hydrate", async () => {
    dbMock.dbReadFileStore.mockResolvedValue({ items: ["from the database"], seq: 7 });
    const store = createFileStore<Doc>(uniqueName(), seed, { durable: true });

    await store.hydrate();

    expect(store.read()).toEqual({ items: ["from the database"], seq: 7 });
  });

  it("keeps what it has when the database has no row yet", async () => {
    // A first run, not an empty document — a deployment that switches this on
    // must carry the existing copy up rather than starting from nothing.
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const store = createFileStore<Doc>(uniqueName(), () => ({ items: ["seeded"], seq: 1 }), {
      durable: true,
    });

    await store.hydrate();

    expect(store.read().items).toEqual(["seeded"]);
    // Creating the first row is not a wiring mistake, so it must not be
    // reported as one — a spurious error in production logs costs somebody an
    // afternoon proving it was harmless.
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("writes the whole document after a mutation", async () => {
    const file = uniqueName();
    const store = createFileStore<Doc>(file, seed, { durable: true });
    await store.hydrate();

    store.mutate((d) => {
      d.items.push("incident");
      d.seq = 1;
    });
    await store.flush();

    expect(dbMock.dbWriteFileStore).toHaveBeenCalledWith(file, { items: ["incident"], seq: 1 });
  });

  it("writes on a whole-value replacement too", async () => {
    const file = uniqueName();
    const store = createFileStore<Doc>(file, seed, { durable: true });
    await store.hydrate();

    store.write({ items: ["replaced"], seq: 9 });
    await store.flush();

    expect(dbMock.dbWriteFileStore).toHaveBeenCalledWith(file, { items: ["replaced"], seq: 9 });
  });

  it("reports itself durable even when the disk is not writable", () => {
    const store = createFileStore<Doc>(uniqueName(), seed, { durable: true });
    expect(store.isDurable()).toBe(true);
  });

  it("serialises writes so the last mutation is the last thing stored", async () => {
    const file = uniqueName();
    // Hydrating from an existing row, so the only writes counted are the two
    // mutations — a first run additionally writes the seed to create the row.
    dbMock.dbReadFileStore.mockResolvedValue({ items: [], seq: 0 });
    const store = createFileStore<Doc>(file, seed, { durable: true });
    await store.hydrate();

    store.mutate((d) => d.items.push("first"));
    store.mutate((d) => d.items.push("second"));
    await store.flush();

    expect(dbMock.dbWriteFileStore).toHaveBeenCalledTimes(2);
    expect(dbMock.dbWriteFileStore).toHaveBeenLastCalledWith(file, {
      items: ["first", "second"],
      seq: 0,
    });
  });

  it("creates the row on a first run so the document exists to be read back", async () => {
    const file = uniqueName();
    dbMock.dbReadFileStore.mockResolvedValue(null);
    const store = createFileStore<Doc>(file, () => ({ items: [], seq: 0 }), { durable: true });

    await store.hydrate();
    await store.flush();

    expect(dbMock.dbWriteFileStore).toHaveBeenCalledWith(file, { items: [], seq: 0 });
  });

  it("surfaces a failed write through flush rather than losing it quietly", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    dbMock.dbWriteFileStore.mockRejectedValue(new Error("connection lost"));
    const store = createFileStore<Doc>(uniqueName(), seed, { durable: true });
    await store.hydrate();

    store.mutate((d) => d.items.push("a"));

    await expect(store.flush()).rejects.toThrow("connection lost");
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe("the guard against writing an un-hydrated store", () => {
  it("refuses to save when hydrate() was not awaited", async () => {
    /*
     * The failure this prevents: a route mutates without hydrating, so `mem` is
     * the empty seed, and flushing it would replace a real document with
     * nothing. Refusing is the only safe answer — the alternative turns a
     * missing await into data loss.
     */
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const store = createFileStore<Doc>(uniqueName(), seed, { durable: true });

    store.mutate((d) => d.items.push("would have clobbered"));
    await store.flush();

    expect(dbMock.dbWriteFileStore).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("hydrate() was not awaited"));
    spy.mockRestore();
  });

  it("starts saving once it has been hydrated", async () => {
    const spy = jest.spyOn(console, "error").mockImplementation(() => {});
    const file = uniqueName();
    const store = createFileStore<Doc>(file, seed, { durable: true });

    store.mutate((d) => d.items.push("dropped"));
    expect(dbMock.dbWriteFileStore).not.toHaveBeenCalled();

    dbMock.dbReadFileStore.mockResolvedValue({ items: ["real"], seq: 3 });
    await store.hydrate();
    store.mutate((d) => d.items.push("kept"));
    await store.flush();

    expect(dbMock.dbWriteFileStore).toHaveBeenCalledWith(file, { items: ["real", "kept"], seq: 3 });
    spy.mockRestore();
  });
});
