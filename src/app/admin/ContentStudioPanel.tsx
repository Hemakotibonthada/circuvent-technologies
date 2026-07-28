"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BookOpen,
  Calendar,
  Edit3,
  Eye,
  FileText,
  History,
  Loader2,
  Plus,
  Rocket,
  Search,
  Trash2,
  X,
} from "lucide-react";

function tok(): string {
  try {
    return sessionStorage.getItem("admin-token") || "";
  } catch {
    return "";
  }
}

type CmsContentType = "blog" | "case-study" | "page";
type CmsStatus = "draft" | "scheduled" | "published" | "archived";

interface CmsRevision {
  id: string;
  at: string;
  author: string;
  note?: string;
  snapshot: { title: string; excerpt: string; body: string; tags: string[]; category: string };
}

interface CmsPost {
  id: string;
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
  createdAt: string;
  updatedAt: string;
  seoTitle?: string;
  seoDescription?: string;
  readMinutes: number;
  views: number;
  revisions: CmsRevision[];
}

interface CmsStats {
  total: number;
  published: number;
  drafts: number;
  scheduled: number;
  totalViews: number;
}

const STATUS_COLORS: Record<CmsStatus, string> = {
  draft: "#94a3b8",
  scheduled: "#f59e0b",
  published: "#22c55e",
  archived: "#64748b",
};

const TYPE_LABELS: Record<CmsContentType, string> = {
  blog: "Blog post",
  "case-study": "Case study",
  page: "Marketing page",
};

const card: React.CSSProperties = { background: "var(--bg-surface)", border: "1px solid var(--border-primary)" };
const field = "w-full rounded-xl border px-3 py-2 text-sm outline-none";
const inputStyle = { background: "var(--bg-glass)", borderColor: "var(--border-primary)", color: "var(--text-primary)" };

function emptyForm(): Partial<CmsPost> {
  return { type: "blog", status: "draft", tags: [], category: "Engineering", title: "", excerpt: "", body: "", slug: "" };
}

export default function ContentStudioPanel() {
  const [posts, setPosts] = useState<CmsPost[]>([]);
  const [stats, setStats] = useState<CmsStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<Partial<CmsPost> | null>(null);
  const [historyFor, setHistoryFor] = useState<CmsPost | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("type", typeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (q) params.set("q", q);
      const res = await fetch(`/api/admin/cms?${params.toString()}`, { headers: { "x-admin-token": tok() } });
      if (res.ok) {
        const d = await res.json();
        setPosts(d.posts || []);
        setStats(d.stats || null);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [typeFilter, statusFilter, q]);

  useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    if (!editing?.title) {
      setMsg("Title is required.");
      return;
    }
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/admin/cms", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-admin-token": tok() },
        body: JSON.stringify(editing),
      });
      const d = await res.json();
      if (d.success) {
        setEditing(null);
        load();
      } else setMsg(d.message || "Could not save.");
    } catch {
      setMsg("Network error.");
    }
    setBusy(false);
  };

  const setStatus = async (post: CmsPost, status: CmsStatus) => {
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, status } : p)));
    await fetch("/api/admin/cms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ id: post.id, status }),
    });
  };

  const remove = async (post: CmsPost) => {
    if (!confirm(`Delete "${post.title}"? This cannot be undone.`)) return;
    setPosts((prev) => prev.filter((p) => p.id !== post.id));
    await fetch(`/api/admin/cms?id=${encodeURIComponent(post.id)}`, { method: "DELETE", headers: { "x-admin-token": tok() } });
  };

  const restore = async (post: CmsPost, revisionId: string) => {
    setBusy(true);
    const res = await fetch("/api/admin/cms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", "x-admin-token": tok() },
      body: JSON.stringify({ id: post.id, restoreRevisionId: revisionId }),
    });
    const d = await res.json();
    setBusy(false);
    if (d.success) {
      setHistoryFor(null);
      load();
    }
  };

  const filtered = useMemo(() => posts, [posts]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
            <BookOpen className="w-5 h-5" /> Content Studio
          </h2>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            Draft, schedule and publish blog posts, case studies and marketing pages — with full revision history.
          </p>
        </div>
        <button
          onClick={() => setEditing(emptyForm())}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
        >
          <Plus className="w-4 h-4" /> New content
        </button>
      </div>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: "Total", value: stats.total },
            { label: "Published", value: stats.published, color: STATUS_COLORS.published },
            { label: "Drafts", value: stats.drafts, color: STATUS_COLORS.draft },
            { label: "Scheduled", value: stats.scheduled, color: STATUS_COLORS.scheduled },
            { label: "Total views", value: stats.totalViews },
          ].map((s) => (
            <div key={s.label} className="rounded-xl p-3" style={card}>
              <div className="text-2xl font-extrabold" style={{ color: s.color || "var(--text-primary)" }}>
                {s.value}
              </div>
              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className={field} style={{ ...inputStyle, width: "auto" }}>
          <option value="all">All types</option>
          <option value="blog">Blog posts</option>
          <option value="case-study">Case studies</option>
          <option value="page">Pages</option>
        </select>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className={field} style={{ ...inputStyle, width: "auto" }}>
          <option value="all">All statuses</option>
          <option value="draft">Draft</option>
          <option value="scheduled">Scheduled</option>
          <option value="published">Published</option>
          <option value="archived">Archived</option>
        </select>
        <div className="flex-1 min-w-[180px] flex items-center gap-2 rounded-xl border px-3 py-2" style={inputStyle}>
          <Search className="w-4 h-4" style={{ color: "var(--text-tertiary)" }} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, slug, tags…" className="bg-transparent outline-none text-sm flex-1" style={{ color: "var(--text-primary)" }} />
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--accent-cyan)" }} />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl p-10 text-center" style={card}>
          <FileText className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--text-tertiary)" }} />
          <p style={{ color: "var(--text-tertiary)" }}>No content yet. Create your first draft.</p>
        </div>
      ) : (
        <div className="rounded-xl overflow-hidden" style={card}>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left" style={{ borderBottom: "1px solid var(--border-primary)" }}>
                {["Title", "Type", "Status", "Author", "Views", "Updated", "Actions"].map((h) => (
                  <th key={h} className="px-4 py-2.5 font-medium" style={{ color: "var(--text-tertiary)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} style={{ borderBottom: "1px solid var(--border-primary)" }}>
                  <td className="px-4 py-3">
                    <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                      {p.title}
                    </div>
                    <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                      /{p.slug} · {p.readMinutes} min read
                    </div>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                    {TYPE_LABELS[p.type]}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className="px-2 py-0.5 rounded-full text-xs font-semibold"
                      style={{ background: `${STATUS_COLORS[p.status]}22`, color: STATUS_COLORS[p.status] }}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                    {p.author}
                  </td>
                  <td className="px-4 py-3" style={{ color: "var(--text-secondary)" }}>
                    <span className="inline-flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" /> {p.views}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => setEditing(p)} title="Edit" className="p-1.5 rounded-lg hover:bg-white/10">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      {p.status !== "published" && (
                        <button onClick={() => setStatus(p, "published")} title="Publish now" className="p-1.5 rounded-lg hover:bg-white/10 text-emerald-400">
                          <Rocket className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {p.status !== "archived" && (
                        <button onClick={() => setStatus(p, "archived")} title="Archive" className="p-1.5 rounded-lg hover:bg-white/10 text-amber-400">
                          <Calendar className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button onClick={() => setHistoryFor(p)} title="Revision history" className="p-1.5 rounded-lg hover:bg-white/10">
                        <History className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => remove(p)} title="Delete" className="p-1.5 rounded-lg hover:bg-white/10 text-red-400">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[88vh] overflow-y-auto rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
                {editing.id ? "Edit content" : "New content"}
              </h3>
              <button onClick={() => setEditing(null)}>
                <X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} />
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Type
                  <select
                    className={field}
                    style={inputStyle}
                    value={editing.type}
                    onChange={(e) => setEditing({ ...editing, type: e.target.value as CmsContentType })}
                  >
                    <option value="blog">Blog post</option>
                    <option value="case-study">Case study</option>
                    <option value="page">Marketing page</option>
                  </select>
                </label>
                <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Status
                  <select
                    className={field}
                    style={inputStyle}
                    value={editing.status}
                    onChange={(e) => setEditing({ ...editing, status: e.target.value as CmsStatus })}
                  >
                    <option value="draft">Draft</option>
                    <option value="scheduled">Scheduled</option>
                    <option value="published">Published</option>
                    <option value="archived">Archived</option>
                  </select>
                </label>
              </div>
              {editing.status === "scheduled" && (
                <label className="text-xs block" style={{ color: "var(--text-tertiary)" }}>
                  Publish at
                  <input
                    type="datetime-local"
                    className={field}
                    style={inputStyle}
                    value={editing.publishAt?.slice(0, 16) || ""}
                    onChange={(e) => setEditing({ ...editing, publishAt: new Date(e.target.value).toISOString() })}
                  />
                </label>
              )}
              <label className="text-xs block" style={{ color: "var(--text-tertiary)" }}>
                Title
                <input className={field} style={inputStyle} value={editing.title || ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
              </label>
              <label className="text-xs block" style={{ color: "var(--text-tertiary)" }}>
                Slug (optional — derived from title if blank)
                <input className={field} style={inputStyle} value={editing.slug || ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Category
                  <input className={field} style={inputStyle} value={editing.category || ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
                </label>
                <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Tags (comma separated)
                  <input
                    className={field}
                    style={inputStyle}
                    value={(editing.tags || []).join(", ")}
                    onChange={(e) => setEditing({ ...editing, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })}
                  />
                </label>
              </div>
              <label className="text-xs block" style={{ color: "var(--text-tertiary)" }}>
                Excerpt
                <textarea className={field} style={inputStyle} rows={2} value={editing.excerpt || ""} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} />
              </label>
              <label className="text-xs block" style={{ color: "var(--text-tertiary)" }}>
                Body (Markdown)
                <textarea className={field} style={{ ...inputStyle, fontFamily: "monospace" }} rows={10} value={editing.body || ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  SEO title
                  <input className={field} style={inputStyle} value={editing.seoTitle || ""} onChange={(e) => setEditing({ ...editing, seoTitle: e.target.value })} />
                </label>
                <label className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                  Cover image URL
                  <input className={field} style={inputStyle} value={editing.coverImage || ""} onChange={(e) => setEditing({ ...editing, coverImage: e.target.value })} />
                </label>
              </div>
              <label className="text-xs block" style={{ color: "var(--text-tertiary)" }}>
                SEO description
                <textarea className={field} style={inputStyle} rows={2} value={editing.seoDescription || ""} onChange={(e) => setEditing({ ...editing, seoDescription: e.target.value })} />
              </label>
              {msg && <p className="text-sm text-red-400">{msg}</p>}
              <button
                onClick={save}
                disabled={busy}
                className="w-full py-2.5 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
              >
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save content
              </button>
            </div>
          </div>
        </div>
      )}

      {historyFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 bg-black/60 backdrop-blur-sm">
          <div className="w-full max-w-lg max-h-[80vh] overflow-y-auto rounded-2xl p-6" style={card}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg" style={{ color: "var(--text-primary)" }}>
                Revision history — {historyFor.title}
              </h3>
              <button onClick={() => setHistoryFor(null)}>
                <X className="w-5 h-5" style={{ color: "var(--text-tertiary)" }} />
              </button>
            </div>
            {historyFor.revisions.length === 0 ? (
              <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                No previous revisions yet — edits create a snapshot automatically.
              </p>
            ) : (
              <div className="space-y-2">
                {historyFor.revisions.map((r) => (
                  <div key={r.id} className="rounded-xl p-3 flex items-center justify-between gap-3" style={{ background: "var(--bg-glass)", border: "1px solid var(--border-primary)" }}>
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                        {r.snapshot.title}
                      </div>
                      <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {new Date(r.at).toLocaleString()} · {r.author}
                        {r.note ? ` · ${r.note}` : ""}
                      </div>
                    </div>
                    <button
                      onClick={() => restore(historyFor, r.id)}
                      disabled={busy}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold text-white"
                      style={{ background: "linear-gradient(135deg, #06b6d4, #8b5cf6)" }}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
