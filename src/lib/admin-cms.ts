// Content Studio — a lightweight headless CMS for the marketing site's
// editorial content (blog posts, case studies and static marketing pages).
//
// This is intentionally a separate, independent store from the public site's
// static data files (src/lib/blog-data.ts, case-studies-data.ts): it models
// the *authoring workflow* (drafts, scheduling, revisions, SEO fields) that a
// content team would use before content is promoted into the published data
// files by a developer/build step. Keeping it independent avoids touching the
// public rendering pipeline while giving admins a real content pipeline.
//
// SERVER ONLY — uses node:fs via data-file.ts.

import { createFileStore, shortId } from "./data-file";

export type CmsContentType = "blog" | "case-study" | "page";
export type CmsStatus = "draft" | "scheduled" | "published" | "archived";

export interface CmsRevision {
  id: string;
  at: string;
  author: string;
  note?: string;
  snapshot: {
    title: string;
    excerpt: string;
    body: string;
    coverImage?: string;
    tags: string[];
    category: string;
    seoTitle?: string;
    seoDescription?: string;
  };
}

export interface CmsPost {
  id: string;
  type: CmsContentType;
  slug: string;
  title: string;
  excerpt: string;
  body: string; // markdown
  coverImage?: string;
  tags: string[];
  category: string;
  author: string;
  status: CmsStatus;
  publishAt?: string; // ISO — used when status === "scheduled"
  createdAt: string;
  updatedAt: string;
  seoTitle?: string;
  seoDescription?: string;
  readMinutes: number;
  views: number;
  revisions: CmsRevision[];
}

export interface CmsPostInput {
  id?: string;
  type: CmsContentType;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  coverImage?: string;
  tags: string[];
  category: string;
  author: string;
  status: CmsStatus;
  publishAt?: string;
  seoTitle?: string;
  seoDescription?: string;
}

interface CmsDB {
  posts: CmsPost[];
}

const store = createFileStore<CmsDB>("admin-cms.json", () => ({ posts: [] }));

function estimateReadMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

export function listPosts(filter?: { type?: CmsContentType; status?: CmsStatus; q?: string }): CmsPost[] {
  const { posts } = store.read();
  let rows = [...posts];
  if (filter?.type) rows = rows.filter((p) => p.type === filter.type);
  if (filter?.status) rows = rows.filter((p) => p.status === filter.status);
  if (filter?.q) {
    const q = filter.q.toLowerCase();
    rows = rows.filter(
      (p) => p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q))
    );
  }
  return rows.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function getPost(id: string): CmsPost | null {
  return store.read().posts.find((p) => p.id === id) ?? null;
}

/** Auto-publishes anything scheduled whose publishAt has passed. Call on read paths. */
export function reconcileSchedule(): number {
  const now = Date.now();
  return store.mutate((db) => {
    let changed = 0;
    for (const p of db.posts) {
      if (p.status === "scheduled" && p.publishAt && new Date(p.publishAt).getTime() <= now) {
        p.status = "published";
        p.updatedAt = new Date().toISOString();
        changed++;
      }
    }
    return changed;
  });
}

export function upsertPost(input: CmsPostInput, author: string): CmsPost {
  return store.mutate((db) => {
    const now = new Date().toISOString();
    const slug = slugify(input.slug || input.title);
    const existing = input.id ? db.posts.find((p) => p.id === input.id) : undefined;

    if (existing) {
      // Snapshot the previous version before overwriting it.
      existing.revisions.unshift({
        id: shortId("rev"),
        at: now,
        author,
        snapshot: {
          title: existing.title,
          excerpt: existing.excerpt,
          body: existing.body,
          coverImage: existing.coverImage,
          tags: existing.tags,
          category: existing.category,
          seoTitle: existing.seoTitle,
          seoDescription: existing.seoDescription,
        },
      });
      existing.revisions = existing.revisions.slice(0, 25);
      existing.type = input.type;
      existing.slug = slug;
      existing.title = input.title;
      existing.excerpt = input.excerpt;
      existing.body = input.body;
      existing.coverImage = input.coverImage;
      existing.tags = input.tags;
      existing.category = input.category;
      existing.author = input.author || existing.author;
      existing.status = input.status;
      existing.publishAt = input.publishAt;
      existing.seoTitle = input.seoTitle;
      existing.seoDescription = input.seoDescription;
      existing.readMinutes = estimateReadMinutes(input.body);
      existing.updatedAt = now;
      return existing;
    }

    const created: CmsPost = {
      id: shortId("cms"),
      type: input.type,
      slug,
      title: input.title,
      excerpt: input.excerpt,
      body: input.body,
      coverImage: input.coverImage,
      tags: input.tags,
      category: input.category,
      author: input.author || author,
      status: input.status,
      publishAt: input.publishAt,
      createdAt: now,
      updatedAt: now,
      seoTitle: input.seoTitle,
      seoDescription: input.seoDescription,
      readMinutes: estimateReadMinutes(input.body),
      views: 0,
      revisions: [],
    };
    db.posts.unshift(created);
    return created;
  });
}

export function setStatus(id: string, status: CmsStatus): CmsPost | null {
  return store.mutate((db) => {
    const p = db.posts.find((x) => x.id === id);
    if (!p) return null;
    p.status = status;
    p.updatedAt = new Date().toISOString();
    return p;
  });
}

export function restoreRevision(id: string, revisionId: string, author: string): CmsPost | null {
  return store.mutate((db) => {
    const p = db.posts.find((x) => x.id === id);
    if (!p) return null;
    const rev = p.revisions.find((r) => r.id === revisionId);
    if (!rev) return null;
    const now = new Date().toISOString();
    // Snapshot current state first so the restore itself is reversible.
    p.revisions.unshift({
      id: shortId("rev"),
      at: now,
      author,
      note: `Before restoring ${revisionId}`,
      snapshot: {
        title: p.title,
        excerpt: p.excerpt,
        body: p.body,
        coverImage: p.coverImage,
        tags: p.tags,
        category: p.category,
        seoTitle: p.seoTitle,
        seoDescription: p.seoDescription,
      },
    });
    p.title = rev.snapshot.title;
    p.excerpt = rev.snapshot.excerpt;
    p.body = rev.snapshot.body;
    p.coverImage = rev.snapshot.coverImage;
    p.tags = rev.snapshot.tags;
    p.category = rev.snapshot.category;
    p.seoTitle = rev.snapshot.seoTitle;
    p.seoDescription = rev.snapshot.seoDescription;
    p.updatedAt = now;
    return p;
  });
}

export function deletePost(id: string): boolean {
  return store.mutate((db) => {
    const before = db.posts.length;
    db.posts = db.posts.filter((p) => p.id !== id);
    return db.posts.length < before;
  });
}

export function recordView(id: string): void {
  store.mutate((db) => {
    const p = db.posts.find((x) => x.id === id);
    if (p) p.views += 1;
  });
}

export function cmsStats(): { total: number; published: number; drafts: number; scheduled: number; totalViews: number } {
  const posts = store.read().posts;
  return {
    total: posts.length,
    published: posts.filter((p) => p.status === "published").length,
    drafts: posts.filter((p) => p.status === "draft").length,
    scheduled: posts.filter((p) => p.status === "scheduled").length,
    totalViews: posts.reduce((s, p) => s + p.views, 0),
  };
}
