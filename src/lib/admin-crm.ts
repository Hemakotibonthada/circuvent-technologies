// CRM Lite — lightweight customer relationship layer on top of the existing
// `listCustomers()` accessor (store.ts, read-only): per-customer tags, a
// note/timeline log, and a computed lifetime-value tier. Independent store —
// never mutates the accounts/orders collections themselves.
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";
import { listCustomers, type CustomerView } from "./store";

export interface CustomerNote {
  id: string;
  email: string;
  author: string;
  note: string;
  at: string;
}

interface CrmDB {
  notes: CustomerNote[];
  tags: Record<string, string[]>; // email -> tags
}

const store = createFileStore<CrmDB>("admin-crm.json", () => ({ notes: [], tags: {} }), { durable: true });

/** Loads the authoritative copy before a request reads or writes. Every route awaits this first. */
export async function revalidateCrm(): Promise<void> {
  await store.hydrate();
}

/** Waits for the pending database write to land — awaited before responding, not fired and forgotten. */
export async function flushCrm(): Promise<void> {
  await store.flush();
}

export type LtvTier = "new" | "bronze" | "silver" | "gold" | "platinum";

export function ltvTier(spend: number): LtvTier {
  if (spend >= 100_000) return "platinum";
  if (spend >= 50_000) return "gold";
  if (spend >= 15_000) return "silver";
  if (spend > 0) return "bronze";
  return "new";
}

export interface CrmCustomer extends CustomerView {
  tier: LtvTier;
  tags: string[];
  noteCount: number;
}

export function crmOverview(q?: string): CrmCustomer[] {
  const db = store.read();
  let rows = listCustomers().map((c) => ({
    ...c,
    tier: ltvTier(c.spend),
    tags: db.tags[c.email] || [],
    noteCount: db.notes.filter((n) => n.email === c.email).length,
  }));
  if (q) {
    const query = q.toLowerCase();
    rows = rows.filter((c) => c.email.toLowerCase().includes(query) || c.name.toLowerCase().includes(query) || c.tags.some((t) => t.toLowerCase().includes(query)));
  }
  return rows.sort((a, b) => b.spend - a.spend);
}

export function setTags(email: string, tags: string[]): string[] {
  return store.mutate((db) => {
    db.tags[email.toLowerCase()] = tags;
    return db.tags[email.toLowerCase()];
  });
}

export function listNotes(email: string): CustomerNote[] {
  return store.read().notes.filter((n) => n.email === email.toLowerCase()).sort((a, b) => b.at.localeCompare(a.at));
}

export function addNote(email: string, note: string, author: string): CustomerNote {
  return store.mutate((db) => {
    const entry: CustomerNote = { id: shortId("note"), email: email.toLowerCase(), author, note, at: new Date().toISOString() };
    db.notes.unshift(entry);
    return entry;
  });
}

export function deleteNote(id: string): boolean {
  return store.mutate((db) => {
    const before = db.notes.length;
    db.notes = db.notes.filter((n) => n.id !== id);
    return db.notes.length < before;
  });
}

export function crmStats(): { platinum: number; gold: number; silver: number; bronze: number; totalTagged: number } {
  const rows = crmOverview();
  const db = store.read();
  return {
    platinum: rows.filter((r) => r.tier === "platinum").length,
    gold: rows.filter((r) => r.tier === "gold").length,
    silver: rows.filter((r) => r.tier === "silver").length,
    bronze: rows.filter((r) => r.tier === "bronze").length,
    totalTagged: Object.values(db.tags).filter((t) => t.length > 0).length,
  };
}
