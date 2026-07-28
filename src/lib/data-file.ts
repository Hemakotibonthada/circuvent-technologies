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

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), ".data");

export interface FileStore<T> {
  /** Returns the current in-memory value, hydrating from disk on first use. */
  read(): T;
  /** Replaces the whole value and persists it. */
  write(next: T): void;
  /** Mutates the in-memory value in place via `fn`, then persists it. */
  mutate<R = void>(fn: (draft: T) => R): R;
  /** True when the last disk write attempt succeeded (false = in-memory only). */
  isDurable(): boolean;
}

/**
 * Creates a small, independent JSON-file-backed store.
 *
 * @param filename File name (not path) under DATA_DIR, e.g. "admin-cms.json".
 * @param seed     Factory for the initial value when no file exists yet.
 */
export function createFileStore<T>(filename: string, seed: () => T): FileStore<T> {
  const file = path.join(DATA_DIR, filename);
  let mem: T | null = null;
  let canWrite = true;

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
    if (!canWrite || mem === null) return;
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(mem, null, 2), "utf8");
    } catch {
      canWrite = false; // read-only FS (serverless) — degrade to in-memory
      console.warn(`[data-file:${filename}] disk not writable; using in-memory store for this instance`);
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
      return canWrite;
    },
  };
}

/** Generates a short, URL-safe random id (not cryptographically sensitive). */
export function shortId(prefix = ""): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}${prefix ? "_" : ""}${time}${rand}`;
}
