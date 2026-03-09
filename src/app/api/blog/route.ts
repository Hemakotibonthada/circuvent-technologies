import { NextResponse } from "next/server";
import { blogPosts, getBlogPostsByCategory, type BlogCategory } from "@/lib/blog-data";

/**
 * GET /api/blog
 * 
 * Returns blog posts with optional filtering and pagination.
 * 
 * Query Parameters:
 *   - category: BlogCategory (default: "All")
 *   - search: string (search in title, tags, excerpt)
 *   - page: number (default: 1)
 *   - limit: number (default: 10)
 *   - featured: "true" to return only featured posts
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = (searchParams.get("category") || "All") as BlogCategory;
    const search = searchParams.get("search") || "";
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const featured = searchParams.get("featured") === "true";

    let posts = getBlogPostsByCategory(category);

    // Filter featured
    if (featured) {
      posts = posts.filter((p) => p.featured);
    }

    // Search
    if (search) {
      const query = search.toLowerCase();
      posts = posts.filter(
        (p) =>
          p.title.toLowerCase().includes(query) ||
          p.excerpt.toLowerCase().includes(query) ||
          p.tags.some((t) => t.toLowerCase().includes(query)) ||
          p.category.toLowerCase().includes(query)
      );
    }

    // Pagination
    const total = posts.length;
    const totalPages = Math.ceil(total / limit);
    const offset = (page - 1) * limit;
    const paginatedPosts = posts.slice(offset, offset + limit);

    // Remove content field for listing (it's large)
    const postsWithoutContent = paginatedPosts.map(({ content, ...rest }) => rest);

    return NextResponse.json({
      posts: postsWithoutContent,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
      meta: {
        category,
        search: search || null,
        featured,
      },
    });
  } catch (error) {
    console.error("Blog API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch blog posts." },
      { status: 500 }
    );
  }
}
