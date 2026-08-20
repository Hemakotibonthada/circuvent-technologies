// SEO & Redirects Manager — per-path meta overrides and a 301/302 redirect
// rule table. This is a management surface for content/SEO teams; wiring it
// into the live request path (middleware/proxy.ts) is intentionally left out
// here to avoid touching the security-sensitive CSP/header logic in
// src/proxy.ts — a follow-up could have middleware consult these tables.
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";

export interface SeoOverride {
  id: string;
  path: string; // e.g. "/projects/nexus-ai-os"
  title?: string;
  description?: string;
  ogImage?: string;
  noindex?: boolean;
  updatedAt: string;
}

export type RedirectStatus = 301 | 302;

export interface RedirectRule {
  id: string;
  from: string;
  to: string;
  statusCode: RedirectStatus;
  hits: number;
  createdAt: string;
}

interface SeoDB {
  overrides: SeoOverride[];
  redirects: RedirectRule[];
}

const store = createFileStore<SeoDB>("admin-seo.json", () => ({ overrides: [], redirects: [] }), { durable: true });

/** Loads the authoritative copy before a request reads or writes. Every route awaits this first. */
export async function revalidateSeo(): Promise<void> {
  await store.hydrate();
}

/** Waits for the pending database write to land — awaited before responding, not fired and forgotten. */
export async function flushSeo(): Promise<void> {
  await store.flush();
}

export function listOverrides(): SeoOverride[] {
  return store.read().overrides;
}

export function upsertOverride(input: Partial<SeoOverride> & { path: string }): SeoOverride {
  return store.mutate((db) => {
    const existing = db.overrides.find((o) => o.path === input.path);
    const now = new Date().toISOString();
    if (existing) {
      Object.assign(existing, input, { updatedAt: now });
      return existing;
    }
    const created: SeoOverride = { id: shortId("seo"), path: input.path, title: input.title, description: input.description, ogImage: input.ogImage, noindex: input.noindex, updatedAt: now };
    db.overrides.unshift(created);
    return created;
  });
}

export function deleteOverride(id: string): boolean {
  return store.mutate((db) => {
    const before = db.overrides.length;
    db.overrides = db.overrides.filter((o) => o.id !== id);
    return db.overrides.length < before;
  });
}

export function listRedirects(): RedirectRule[] {
  return store.read().redirects;
}

export function upsertRedirect(input: Partial<RedirectRule> & { from: string; to: string; statusCode: RedirectStatus }): RedirectRule {
  return store.mutate((db) => {
    const existing = input.id ? db.redirects.find((r) => r.id === input.id) : undefined;
    if (existing) {
      existing.from = input.from;
      existing.to = input.to;
      existing.statusCode = input.statusCode;
      return existing;
    }
    const created: RedirectRule = { id: shortId("redir"), from: input.from, to: input.to, statusCode: input.statusCode, hits: 0, createdAt: new Date().toISOString() };
    db.redirects.unshift(created);
    return created;
  });
}

export function deleteRedirect(id: string): boolean {
  return store.mutate((db) => {
    const before = db.redirects.length;
    db.redirects = db.redirects.filter((r) => r.id !== id);
    return db.redirects.length < before;
  });
}

export function recordRedirectHit(from: string): void {
  store.mutate((db) => {
    const r = db.redirects.find((x) => x.from === from);
    if (r) r.hits += 1;
  });
}
