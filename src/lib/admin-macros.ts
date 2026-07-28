// Support Macros — canned responses for the support team, with per-macro
// usage counters. Complements (does not replace) the existing SupportPanel
// ticket thread UI — agents pick a macro there to paste the body text.
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";

export interface Macro {
  id: string;
  title: string;
  body: string;
  category: string;
  usageCount: number;
  createdAt: string;
}

const store = createFileStore<{ macros: Macro[] }>("admin-macros.json", () => ({
  macros: [
    { id: shortId("macro"), title: "Order delayed", body: "Hi there, we're sorry for the delay on your order. Your package is on its way and should arrive within 2-3 business days.", category: "Shipping", usageCount: 0, createdAt: new Date().toISOString() },
    { id: shortId("macro"), title: "Warranty claim next steps", body: "Thanks for reaching out. Please share your device ID/serial and a short description of the issue so we can start a warranty claim.", category: "Warranty", usageCount: 0, createdAt: new Date().toISOString() },
  ],
}));

export function listMacros(category?: string): Macro[] {
  const rows = store.read().macros;
  return category ? rows.filter((m) => m.category === category) : rows;
}

export function upsertMacro(input: Partial<Macro> & { title: string; body: string; category: string }): Macro {
  return store.mutate((db) => {
    const existing = input.id ? db.macros.find((m) => m.id === input.id) : undefined;
    if (existing) {
      existing.title = input.title;
      existing.body = input.body;
      existing.category = input.category;
      return existing;
    }
    const created: Macro = { id: shortId("macro"), title: input.title, body: input.body, category: input.category, usageCount: 0, createdAt: new Date().toISOString() };
    db.macros.unshift(created);
    return created;
  });
}

export function deleteMacro(id: string): boolean {
  return store.mutate((db) => {
    const before = db.macros.length;
    db.macros = db.macros.filter((m) => m.id !== id);
    return db.macros.length < before;
  });
}

export function recordMacroUsage(id: string): void {
  store.mutate((db) => {
    const m = db.macros.find((x) => x.id === id);
    if (m) m.usageCount += 1;
  });
}
