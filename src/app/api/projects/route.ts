import { NextResponse } from "next/server";
import { projects, getProjectsByCategory, type ProjectCategory } from "@/lib/projects-data";
import { appCache } from "@/lib/cache";

/**
 * GET /api/projects
 * 
 * Returns project data with optional filtering.
 * 
 * Query Parameters:
 *   - category: ProjectCategory (default: "All")
 *   - search: string
 *   - status: "production" | "beta" | "alpha" | "concept"
 *   - sort: "impact" | "name" | "status" (default: "impact")
 *   - featured: "true" to return only featured projects
 *   - limit: number (default: all)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = (searchParams.get("category") || "All") as ProjectCategory;
    const search = searchParams.get("search") || "";
    const status = searchParams.get("status");
    const sort = searchParams.get("sort") || "impact";
    const featured = searchParams.get("featured") === "true";
    const limit = searchParams.get("limit")
      ? parseInt(searchParams.get("limit")!, 10)
      : undefined;

    const cacheKey = `projects:${category}:${search}:${status}:${sort}:${featured}:${limit}`;
    const cached = appCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    let filteredProjects = getProjectsByCategory(category);

    // Status filter
    if (status) {
      filteredProjects = filteredProjects.filter((p) => p.status === status);
    }

    // Featured filter
    if (featured) {
      filteredProjects = filteredProjects.filter((p) => p.featured);
    }

    // Search
    if (search) {
      const query = search.toLowerCase();
      filteredProjects = filteredProjects.filter(
        (p) =>
          p.name.toLowerCase().includes(query) ||
          p.tagline.toLowerCase().includes(query) ||
          p.description.toLowerCase().includes(query) ||
          p.techStack.some((t) => t.toLowerCase().includes(query)) ||
          p.category.toLowerCase().includes(query)
      );
    }

    // Sort
    switch (sort) {
      case "name":
        filteredProjects.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "status":
        const statusOrder = { production: 0, beta: 1, alpha: 2, concept: 3 };
        filteredProjects.sort(
          (a, b) => statusOrder[a.status] - statusOrder[b.status]
        );
        break;
      case "impact":
      default:
        filteredProjects.sort((a, b) => b.impactScore - a.impactScore);
        break;
    }

    // Limit
    if (limit) {
      filteredProjects = filteredProjects.slice(0, limit);
    }

    // Aggregate stats
    const stats = {
      total: filteredProjects.length,
      production: filteredProjects.filter((p) => p.status === "production").length,
      beta: filteredProjects.filter((p) => p.status === "beta").length,
      alpha: filteredProjects.filter((p) => p.status === "alpha").length,
      concept: filteredProjects.filter((p) => p.status === "concept").length,
      avgImpactScore: Math.round(
        filteredProjects.reduce((sum, p) => sum + p.impactScore, 0) /
          filteredProjects.length
      ),
      categories: [...new Set(filteredProjects.map((p) => p.category))],
      uniqueTechs: [...new Set(filteredProjects.flatMap((p) => p.techStack))].length,
    };

    const result = {
      projects: filteredProjects,
      stats,
      meta: {
        category,
        search: search || null,
        status: status || null,
        sort,
        featured,
        limit: limit || "all",
      },
    };

    // Cache for 5 minutes
    appCache.set(cacheKey, result, 300_000);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Projects API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch projects." },
      { status: 500 }
    );
  }
}
