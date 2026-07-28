import { NextResponse } from "next/server";
import { guard } from "@/lib/admin-auth";
import {
  listPosts,
  getPost,
  upsertPost,
  setStatus,
  restoreRevision,
  deletePost,
  reconcileSchedule,
  cmsStats,
  type CmsContentType,
  type CmsStatus,
} from "@/lib/admin-cms";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/cms?type=&status=&q=&id= — list, filter, or fetch one post (+ stats). */
export async function GET(request: Request) {
  const me = guard(request, "cms");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  reconcileSchedule();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (id) {
    const post = getPost(id);
    if (!post) return NextResponse.json({ success: false, message: "Not found" }, { status: 404 });
    return NextResponse.json({ success: true, post });
  }
  const type = (searchParams.get("type") as CmsContentType | null) || undefined;
  const status = (searchParams.get("status") as CmsStatus | null) || undefined;
  const q = searchParams.get("q") || undefined;
  return NextResponse.json({ success: true, posts: listPosts({ type, status, q }), stats: cmsStats() });
}

/** POST /api/admin/cms — create or update (pass `id` to update) a post. */
export async function POST(request: Request) {
  const me = guard(request, "cms");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (!b?.title || !b?.type) {
      return NextResponse.json({ success: false, message: "Title and type are required." }, { status: 400 });
    }
    const post = upsertPost(
      {
        id: b.id,
        type: b.type,
        slug: b.slug || b.title,
        title: b.title,
        excerpt: b.excerpt || "",
        body: b.body || "",
        coverImage: b.coverImage,
        tags: Array.isArray(b.tags) ? b.tags.map(String) : [],
        category: b.category || "General",
        author: b.author || me.name,
        status: b.status || "draft",
        publishAt: b.publishAt,
        seoTitle: b.seoTitle,
        seoDescription: b.seoDescription,
      },
      me.name
    );
    return NextResponse.json({ success: true, post });
  } catch {
    return NextResponse.json({ success: false, message: "Could not save content." }, { status: 500 });
  }
}

/** PATCH /api/admin/cms — { id, status } to change status, or { id, restoreRevisionId }. */
export async function PATCH(request: Request) {
  const me = guard(request, "cms");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const b = await request.json();
    if (!b?.id) return NextResponse.json({ success: false, message: "id is required." }, { status: 400 });

    if (b.restoreRevisionId) {
      const post = restoreRevision(b.id, b.restoreRevisionId, me.name);
      if (!post) return NextResponse.json({ success: false, message: "Not found." }, { status: 404 });
      return NextResponse.json({ success: true, post });
    }
    if (b.status) {
      const post = setStatus(b.id, b.status);
      if (!post) return NextResponse.json({ success: false, message: "Not found." }, { status: 404 });
      return NextResponse.json({ success: true, post });
    }
    return NextResponse.json({ success: false, message: "Nothing to update." }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, message: "Could not update content." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const me = guard(request, "cms");
  if (!me) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const ok = deletePost(id);
  return NextResponse.json({ success: ok });
}
