// Generic on-disk JSON persistence helper for standalone feature modules.
//
// Mirrors the resilience pattern used by the main shop store (store.ts):
// an in-memory working copy is the source of truth for the life of the
// process, and every mutation is best-effort written through to a JSON file
// under DATA_DIR. On read-only filesystems (serverless production without a
// database) writes silently stop and the module degrades to in-memory-only
// for that instance, instead of throwing and breaking the request.
//
// This exists so new feature modules (admin CMS, marketing, pricing, console
// developer portal, etc.) don't need to keep extending the single large `DB`
// interface in store.ts — each module owns a small, independent JSON file and
// a typed accessor built on top of this helper. That keeps the blast radius
// of any one feature small and avoids ever touching the core shop store.
//
// SERVER ONLY — uses node:fs. Never import this from a client component.

import fs from "fs";
import path from "path";
import { dbEnabled, dbReadFileStore, dbWriteFileStore } from "./db";

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");

export interface FileStore<T> {
  /** Returns the current in-memory value, hydrating from disk on first use. */
  read(): T;
  /** Replaces the whole value and persists it. */
  write(next: T): void;
  /** Mutates the in-memory value in place via `fn`, then persists it. */
  mutate<R = void>(fn: (draft: T) => R): R;
  /** True when this value survives the instance that wrote it. */
  isDurable(): boolean;
  /**
   * Loads the authoritative copy from the database.
   *
   * Must be awaited by a request handler **before** it reads or writes a
   * durable store, exactly as routes await `revalidate()` for the shop store.
   * Without a database this is a no-op and the disk copy is already loaded.
   */
  hydrate(): Promise<void>;
  /**
   * Waits for the pending database write to land.
   *
   * Awaited before responding rather than fired and forgotten: a serverless
   * function that returns before its promises settle is frozen mid-write, and
   * the change is lost — which looks exactly like the bug this exists to fix.
   */
  flush(): Promise<void>;
}

export interface FileStoreOptions {
  /**
   * Mirror this store into the database when one is configured.
   *
   * Opt-in per module, and deliberately not the default: a module whose routes
   * do not `hydrate()` first would start from its empty seed and then flush
   * that emptiness over whatever the database holds. Opting in is a statement
   * that the callers have been updated.
   */
  durable?: boolean;
}

/**
 * Creates a small, independent JSON-file-backed store.
 *
 * @param filename File name (not path) under DATA_DIR, e.g. "admin-cms.json".
 * @param seed     Factory for the initial value when no file exists yet.
 * @param opts     See FileStoreOptions.
 */
export function createFileStore<T>(
  filename: string,
  seed: () => T,
  opts: FileStoreOptions = {}
): FileStore<T> {
  const file = path.join(DATA_DIR, filename);
  const durable = opts.durable === true;
  let mem: T | null = null;
  let canWrite = true;
  /** Whether the database copy has been read into `mem` for this instance. */
  let hydrated = false;
  let pending: Promise<void> = Promise.resolve();

  function usingDb(): boolean {
    return durable && dbEnabled();
  }

  function load(): T {
    if (mem !== null) return mem;
    try {
      if (fs.existsSync(file)) {
        mem = JSON.parse(fs.readFileSync(file, "utf8")) as T;
        return mem;
      }
    } catch (e) {
      console.error(`[data-file:${filename}] load error:`, e);
    }
    mem = seed();
    persist();
    return mem;
  }

  function persist(): void {
    if (mem === null) return;

    if (usingDb()) {
      if (!hydrated) {
        /*
         * Refusing to write rather than risking the data. Reaching here means a
         * route mutated a durable store without hydrating it first, so `mem` is
         * the seed — writing it would replace the real document with an empty
         * one. Loud, because it is a wiring mistake in a new caller, not a
         * runtime condition to be tolerated.
         */
        console.error(
          `[data-file:${filename}] refusing to save: hydrate() was not awaited before this write.`
        );
      } else {
        const snapshot = mem;
        pending = pending
          .then(() => dbWriteFileStore(filename, snapshot))
          .catch((e) => {
            console.error(`[data-file:${filename}] database write failed:`, e);
            throw e;
          });
      }
    }

    if (!canWrite) return;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(mem, null, 2), "utf8");
    } catch {
      canWrite = false; // read-only FS (serverless) — degrade to in-memory
      if (!usingDb()) {
        console.warn(`[data-file:${filename}] disk not writable; using in-memory store for this instance`);
      }
    }
  }

  return {
    read(): T {
      return load();
    },
    write(next: T): void {
      mem = next;
      persist();
    },
    mutate<R = void>(fn: (draft: T) => R): R {
      const cur = load();
      const result = fn(cur);
      persist();
      return result;
    },
    isDurable(): boolean {
      return usingDb() || canWrite;
    },
    async hydrate(): Promise<void> {
      if (!usingDb()) return;
      const stored = await dbReadFileStore<T>(filename);
      /*
       * Marked before loading, not after: on a first run `load()` seeds the
       * document and immediately persists it, and with the flag still unset
       * that write trips the un-hydrated guard below and logs an alarming
       * error about data it is in the middle of legitimately creating.
       */
      hydrated = true;
      /*
       * A missing row is a first run, not an empty document: keeping whatever
       * is already loaded means a deployment that switches this on carries the
       * existing disk copy up to the database on its first write, rather than
       * starting the module from nothing.
       */
      if (stored !== null) mem = stored;
      else load();
    },
    async flush(): Promise<void> {
      await pending;
    },
  };
}

/** Generates a short, URL-safe random id (not cryptographically sensitive). */
export function shortId(prefix = ""): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}${prefix ? "_" : ""}${time}${rand}`;
}
