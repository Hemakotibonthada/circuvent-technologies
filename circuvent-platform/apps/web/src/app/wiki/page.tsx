"use client";

import React, { useState } from "react";
import { useApi, useAuth } from "@/hooks/use-auth";
import {
  PageHeader, Card, StatCard, Badge, Button,
  Modal, Input, Textarea, Tabs, EmptyState,
} from "@/components/ui";
import { formatDate, timeAgo } from "@/lib/utils";
import { api } from "@/lib/api-client";

/* ── Types ──────────────────────────────────────────────── */

type BadgeColor = "blue" | "green" | "red" | "amber" | "purple" | "slate" | "cyan" | "pink" | "emerald" | "orange";

interface WikiPage {
  id: string;
  title: string;
  content: string;
  category: string;
  tags: string[];
  authorId: string;
  authorName: string;
  status: string;
  viewCount: number;
  readTimeMinutes: number;
  tableOfContents: Array<{ level: number; text: string; slug: string }>;
  createdAt: string;
  updatedAt: string;
  revisionCount: number;
  isBookmarked?: boolean;
  revisions?: Revision[];
  comments?: WikiComment[];
}

interface Revision {
  id: string;
  pageId: string;
  content: string;
  editorId: string;
  editorName: string;
  revisionNumber: number;
  changeDescription: string;
  createdAt: string;
}

interface WikiComment {
  id: string;
  pageId: string;
  userId: string;
  userName: string;
  content: string;
  createdAt: string;
}

interface WikiDashboard {
  totalPages: number;
  publishedPages: number;
  draftPages: number;
  archivedPages: number;
  totalRevisions: number;
  totalComments: number;
  recentUpdates: number;
  byCategory: Array<{ category: string; count: number }>;
  topContributors: Array<{ authorId: string; authorName: string; pageCount: number }>;
  popularPages: Array<{ id: string; title: string; viewCount: number }>;
}

/* ── Color maps ─────────────────────────────────────────── */

const categoryColors: Record<string, BadgeColor> = {
  HR: "blue", ENGINEERING: "purple", GENERAL: "slate", ONBOARDING: "green",
  POLICY: "amber", TUTORIAL: "cyan", FAQ: "pink", PRODUCT: "emerald",
};

const statusColors: Record<string, BadgeColor> = {
  PUBLISHED: "green", DRAFT: "amber", ARCHIVED: "slate",
};

const CATEGORIES = ["HR", "ENGINEERING", "GENERAL", "ONBOARDING", "POLICY", "TUTORIAL", "FAQ", "PRODUCT"];

/* ── Component ──────────────────────────────────────────── */

export default function WikiPage() {
  const { token, user } = useAuth();
  const { data: dashboard } = useApi<WikiDashboard>("/hr/wiki/dashboard");
  const { data: recentPages } = useApi<WikiPage[]>("/hr/wiki/recent");
  const { data: categories } = useApi<Array<{ name: string; count: number }>>("/hr/wiki/categories");
  const { data: bookmarks, refetch: refetchBookmarks } = useApi<Array<{ pageId: string; title: string; category: string }>>("/hr/wiki/my-bookmarks");

  const [activeTab, setActiveTab] = useState("browse");
  const [searchQuery, setSearchQuery] = useState("");
  const [filterCategory, setFilterCategory] = useState("");
  const [selectedPage, setSelectedPage] = useState<WikiPage | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showRevisionsPanel, setShowRevisionsPanel] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState("GENERAL");
  const [newTags, setNewTags] = useState("");

  const [editMode, setEditMode] = useState(false);
  const [editContent, setEditContent] = useState("");
  const [changeDesc, setChangeDesc] = useState("");

  const [commentText, setCommentText] = useState("");

  const { data: pagesList, refetch: refetchPages } = useApi<WikiPage[]>(
    `/hr/wiki/pages?search=${encodeURIComponent(searchQuery)}&category=${filterCategory}`,
  );

  /* ── Handlers ──────────────────────────────────────────── */

  const handleCreatePage = async () => {
    if (!newTitle || !newContent) return;
    setSubmitting(true);
    await api.post("/hr/wiki/pages", {
      title: newTitle,
      content: newContent,
      category: newCategory,
      tags: newTags ? newTags.split(",").map((t) => t.trim()) : [],
      userId: user?.id,
      authorName: user?.firstName || "User",
    }, token || undefined);
    setShowCreateModal(false);
    setNewTitle(""); setNewContent(""); setNewCategory("GENERAL"); setNewTags("");
    setSubmitting(false);
    refetchPages();
  };

  const handleViewPage = async (pageId: string) => {
    const res = await api.get(`/hr/wiki/pages/${pageId}`, token || undefined);
    if (res.success) {
      setSelectedPage(res.data as any);
      setActiveTab("view");
    }
  };

  const handleUpdatePage = async () => {
    if (!selectedPage || !editContent) return;
    setSubmitting(true);
    const res = await api.put(`/hr/wiki/pages/${selectedPage.id}`, {
      content: editContent,
      changeDescription: changeDesc || "Updated content",
      userId: user?.id,
      editorName: user?.firstName || "User",
    }, token || undefined);
    if (res.success) {
      setSelectedPage({ ...selectedPage, content: editContent, updatedAt: new Date().toISOString() });
    }
    setEditMode(false);
    setChangeDesc("");
    setSubmitting(false);
  };

  const handleArchivePage = async (pageId: string) => {
    await api.delete(`/hr/wiki/pages/${pageId}`, token || undefined);
    setSelectedPage(null);
    setActiveTab("browse");
    refetchPages();
  };

  const handleToggleBookmark = async (pageId: string) => {
    await api.post(`/hr/wiki/pages/${pageId}/bookmark`, { userId: user?.id }, token || undefined);
    refetchBookmarks();
    if (selectedPage?.id === pageId) {
      setSelectedPage({ ...selectedPage, isBookmarked: !selectedPage.isBookmarked });
    }
  };

  const handleAddComment = async () => {
    if (!selectedPage || !commentText) return;
    setSubmitting(true);
    await api.post(`/hr/wiki/pages/${selectedPage.id}/comments`, {
      content: commentText,
      userId: user?.id,
      userName: user?.firstName || "User",
    }, token || undefined);
    setCommentText("");
    setSubmitting(false);
    handleViewPage(selectedPage.id);
  };

  const handleRestoreRevision = async (revId: string) => {
    if (!selectedPage) return;
    await api.post(`/hr/wiki/pages/${selectedPage.id}/revisions/${revId}/restore`, {
      userId: user?.id,
      userName: user?.firstName || "User",
    }, token || undefined);
    handleViewPage(selectedPage.id);
    setShowRevisionsPanel(false);
  };

  /* ── Tab config ────────────────────────────────────────── */

  const tabs = [
    { id: "browse", label: "Browse" },
    { id: "view", label: "View Page", disabled: !selectedPage },
    { id: "bookmarks", label: "Bookmarks" },
    { id: "dashboard", label: "Dashboard" },
  ];

  return (
    <div className="space-y-6 p-6">
      <PageHeader
        title="Wiki / Knowledge Base"
        subtitle="Internal documentation and knowledge sharing"
        actions={<Button onClick={() => setShowCreateModal(true)}>+ New Page</Button>}
      />

      <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab} />

      {/* ── Browse Tab ─────────────────────────────────────── */}
      {activeTab === "browse" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search pages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-72"
            />
            <select
              className="rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value="">All Categories</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {categories && categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.name}
                  onClick={() => setFilterCategory(cat.name === filterCategory ? "" : cat.name)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                    cat.name === filterCategory
                      ? "bg-blue-600 text-white dark:bg-blue-500"
                      : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                  }`}
                >
                  {cat.name} ({cat.count})
                </button>
              ))}
            </div>
          )}

          {pagesList && pagesList.length > 0 ? (
            <div className="grid gap-3">
              {pagesList.map((page) => (
                <div
                  key={page.id}
                  className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => handleViewPage(page.id)}
                >
                  <Card>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-slate-900 dark:text-white">{page.title}</h3>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">
                          {page.content.substring(0, 200)}...
                        </p>
                        <div className="flex items-center gap-3 mt-2 text-xs text-slate-500 dark:text-slate-400">
                          <Badge color={categoryColors[page.category] || "slate"}>{page.category}</Badge>
                          <span>{page.authorName}</span>
                          <span>{page.viewCount} views</span>
                          <span>{page.readTimeMinutes} min read</span>
                          <span>{timeAgo(page.updatedAt)}</span>
                        </div>
                        {page.tags.length > 0 && (
                          <div className="flex gap-1 mt-2">
                            {page.tags.map((tag) => (
                              <span key={tag} className="px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-xs rounded">
                                #{tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <Badge color={statusColors[page.status] || "slate"}>{page.status}</Badge>
                    </div>
                  </Card>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState title="No pages found" description="Create a new page to get started" />
          )}

          {recentPages && recentPages.length > 0 && !searchQuery && !filterCategory && (
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-3">Recently Updated</h3>
              <div className="grid gap-2">
                {recentPages.slice(0, 5).map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-3 p-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer"
                    onClick={() => handleViewPage(p.id)}
                  >
                    <span className="font-medium text-sm text-slate-900 dark:text-white">{p.title}</span>
                    <Badge color={categoryColors[p.category] || "slate"}>{p.category}</Badge>
                    <span className="text-xs text-slate-500 ml-auto">{timeAgo(p.updatedAt)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── View Page Tab ──────────────────────────────────── */}
      {activeTab === "view" && selectedPage && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <Card>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{selectedPage.title}</h2>
                  <div className="flex items-center gap-3 mt-1 text-sm text-slate-500 dark:text-slate-400">
                    <Badge color={categoryColors[selectedPage.category] || "slate"}>{selectedPage.category}</Badge>
                    <span>By {selectedPage.authorName}</span>
                    <span>&middot;</span>
                    <span>{timeAgo(selectedPage.updatedAt)}</span>
                    <span>&middot;</span>
                    <span>{selectedPage.viewCount} views</span>
                    <span>&middot;</span>
                    <span>{selectedPage.readTimeMinutes} min read</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={() => handleToggleBookmark(selectedPage.id)} variant="outline">
                    {selectedPage.isBookmarked ? "Bookmarked" : "Bookmark"}
                  </Button>
                  <Button onClick={() => { setEditMode(true); setEditContent(selectedPage.content); }} variant="outline">Edit</Button>
                  <Button onClick={() => setShowRevisionsPanel(!showRevisionsPanel)} variant="outline">History</Button>
                  <Button onClick={() => handleArchivePage(selectedPage.id)} variant="outline" className="text-red-600">Archive</Button>
                </div>
              </div>

              {selectedPage.tags.length > 0 && (
                <div className="flex gap-1 mb-4">
                  {selectedPage.tags.map((tag) => (
                    <span key={tag} className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs rounded">
                      #{tag}
                    </span>
                  ))}
                </div>
              )}

              {editMode ? (
                <div className="space-y-3">
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={20}
                    className="font-mono text-sm"
                  />
                  <Input
                    placeholder="Change description (optional)"
                    value={changeDesc}
                    onChange={(e) => setChangeDesc(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <Button onClick={handleUpdatePage} disabled={submitting}>Save Changes</Button>
                    <Button onClick={() => setEditMode(false)} variant="outline">Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="prose dark:prose-invert max-w-none">
                  <pre className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {selectedPage.content}
                  </pre>
                </div>
              )}
            </Card>

            <Card>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                Comments ({selectedPage.comments?.length || 0})
              </h3>

              <div className="flex gap-2 mb-4">
                <Input
                  placeholder="Add a comment..."
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  className="flex-1"
                />
                <Button onClick={handleAddComment} disabled={!commentText || submitting}>Post</Button>
              </div>

              {selectedPage.comments && selectedPage.comments.length > 0 ? (
                <div className="space-y-3">
                  {selectedPage.comments.map((comment) => (
                    <div key={comment.id} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium text-slate-900 dark:text-white">{comment.userName}</span>
                        <span className="text-slate-500">{timeAgo(comment.createdAt)}</span>
                      </div>
                      <p className="text-sm text-slate-700 dark:text-slate-300 mt-1">{comment.content}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-500 dark:text-slate-400">No comments yet</p>
              )}
            </Card>
          </div>

          <div className="space-y-4">
            {selectedPage.tableOfContents && selectedPage.tableOfContents.length > 0 && (
              <Card>
                <h4 className="font-semibold text-slate-900 dark:text-white mb-2 text-sm">Table of Contents</h4>
                <nav className="space-y-1">
                  {selectedPage.tableOfContents.map((entry, idx) => (
                    <div key={idx} className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer" style={{ paddingLeft: `${(entry.level - 1) * 12}px` }}>
                      {entry.text}
                    </div>
                  ))}
                </nav>
              </Card>
            )}

            {showRevisionsPanel && selectedPage.revisions && (
              <Card>
                <h4 className="font-semibold text-slate-900 dark:text-white mb-2 text-sm">Revision History</h4>
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {selectedPage.revisions.map((rev) => (
                    <div key={rev.id} className="p-2 border border-slate-200 dark:border-slate-700 rounded text-xs">
                      <div className="flex justify-between">
                        <span className="font-medium text-slate-900 dark:text-white">Rev {rev.revisionNumber}</span>
                        <span className="text-slate-500">{timeAgo(rev.createdAt)}</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-400 mt-1">{rev.changeDescription}</p>
                      <p className="text-slate-500">by {rev.editorName}</p>
                      <Button onClick={() => handleRestoreRevision(rev.id)} variant="outline" className="mt-1 text-xs py-0.5 px-2">
                        Restore
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card>
              <h4 className="font-semibold text-slate-900 dark:text-white mb-2 text-sm">Page Info</h4>
              <dl className="space-y-1 text-sm">
                <div className="flex justify-between"><dt className="text-slate-500">Created</dt><dd className="text-slate-900 dark:text-white">{formatDate(selectedPage.createdAt)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Updated</dt><dd className="text-slate-900 dark:text-white">{formatDate(selectedPage.updatedAt)}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Revisions</dt><dd className="text-slate-900 dark:text-white">{selectedPage.revisionCount}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Views</dt><dd className="text-slate-900 dark:text-white">{selectedPage.viewCount}</dd></div>
              </dl>
            </Card>
          </div>
        </div>
      )}

      {/* ── Bookmarks Tab ──────────────────────────────────── */}
      {activeTab === "bookmarks" && (
        <div className="space-y-3">
          {bookmarks && bookmarks.length > 0 ? (
            bookmarks.map((bm) => (
              <div key={bm.pageId} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleViewPage(bm.pageId)}>
                <Card>
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-slate-900 dark:text-white">{bm.title}</h4>
                      <Badge color={categoryColors[bm.category] || "slate"} className="mt-1">{bm.category}</Badge>
                    </div>
                  </div>
                </Card>
              </div>
            ))
          ) : (
            <EmptyState title="No bookmarks" description="Bookmark pages to quickly find them later" />
          )}
        </div>
      )}

      {/* ── Dashboard Tab ──────────────────────────────────── */}
      {activeTab === "dashboard" && dashboard && (
        <div className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard title="Total Pages" value={dashboard.totalPages} icon="📚" />
            <StatCard title="Published" value={dashboard.publishedPages} icon="✅" color="green" />
            <StatCard title="Drafts" value={dashboard.draftPages} icon="📝" color="amber" />
            <StatCard title="Recent Updates" value={dashboard.recentUpdates} icon="🔄" color="blue" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Pages by Category</h3>
              {dashboard.byCategory.map((cat) => (
                <div key={cat.category} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <span className="text-sm text-slate-700 dark:text-slate-300">{cat.category}</span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{cat.count}</span>
                </div>
              ))}
            </Card>

            <Card>
              <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Top Contributors</h3>
              {dashboard.topContributors.map((contrib, idx) => (
                <div key={contrib.authorId} className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0">
                  <span className="text-sm text-slate-700 dark:text-slate-300">
                    {idx + 1}. {contrib.authorName}
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">{contrib.pageCount} pages</span>
                </div>
              ))}
            </Card>
          </div>

          <Card>
            <h3 className="font-semibold text-slate-900 dark:text-white mb-3">Most Popular Pages</h3>
            <div className="space-y-2">
              {dashboard.popularPages.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between py-2 border-b border-slate-100 dark:border-slate-800 last:border-0 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 rounded px-2"
                  onClick={() => handleViewPage(p.id)}
                >
                  <span className="text-sm font-medium text-slate-900 dark:text-white">{p.title}</span>
                  <span className="text-sm text-slate-500">{p.viewCount} views</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ── Create Page Modal ──────────────────────────────── */}
      <Modal open={showCreateModal} onClose={() => setShowCreateModal(false)} title="Create Wiki Page">
        <div className="space-y-4">
          <Input label="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Page title" />
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Category</label>
            <select
              className="w-full rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            >
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <Input label="Tags" value={newTags} onChange={(e) => setNewTags(e.target.value)} placeholder="Comma-separated tags" />
          <Textarea label="Content" value={newContent} onChange={(e) => setNewContent(e.target.value)} rows={15} placeholder="Write your page content (Markdown supported)..." />
          <div className="flex justify-end gap-2">
            <Button onClick={() => setShowCreateModal(false)} variant="outline">Cancel</Button>
            <Button onClick={handleCreatePage} disabled={!newTitle || !newContent || submitting}>Create Page</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
