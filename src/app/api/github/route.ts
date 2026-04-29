import { NextResponse } from "next/server";
import {
  fetchGitHubRepos,
  calculateImpactScore,
  mapLanguageToStack,
  type GitHubRepo,
} from "@/lib/github-sync";
import { projects } from "@/lib/projects-data";
import { appCache } from "@/lib/cache";

/**
 * GET /api/github
 * 
 * Fetches and enriches GitHub repository data.
 * Uses ISR with 1-hour revalidation.
 * 
 * Query Parameters:
 *   - sort: "impact" | "stars" | "updated" | "name" (default: "impact")
 *   - limit: number (default: 50)
 *   - language: string (filter by primary language)
 *   - topic: string (filter by topic)
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const sort = searchParams.get("sort") || "impact";
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const language = searchParams.get("language");
    const topic = searchParams.get("topic");

    const cacheKey = `github:${sort}:${limit}:${language}:${topic}`;
    const cached = appCache.get(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Check for GitHub token
    const hasToken = !!process.env.GITHUB_TOKEN;

    if (!hasToken) {
      // Return local project data when no GitHub token is configured
      const localProjects = projects.map((p) => ({
        id: p.id,
        name: p.name,
        tagline: p.tagline,
        description: p.description,
        category: p.category,
        techStack: p.techStack,
        impactScore: p.impactScore,
        stars: p.stars,
        status: p.status,
        featured: p.featured,
        icon: p.icon,
        gradient: p.gradient,
        source: "local" as const,
      }));

      return NextResponse.json({
        projects: localProjects,
        meta: {
          source: "local",
          count: localProjects.length,
          message: "Using local project data. Add GITHUB_TOKEN for live GitHub sync.",
          lastUpdated: new Date().toISOString(),
        },
      });
    }

    // Fetch from GitHub API
    let repos = await fetchGitHubRepos();

    // Apply filters
    if (language) {
      repos = repos.filter(
        (r) => r.language?.toLowerCase() === language.toLowerCase()
      );
    }

    if (topic) {
      repos = repos.filter((r) =>
        r.topics.some((t) => t.toLowerCase().includes(topic.toLowerCase()))
      );
    }

    // Enrich with impact scores
    const enrichedRepos = repos.map((repo) => ({
      id: repo.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description || "No description",
      htmlUrl: repo.html_url,
      homepage: repo.homepage,
      language: repo.language,
      topics: repo.topics,
      stars: repo.stargazers_count,
      forks: repo.forks_count,
      impactScore: calculateImpactScore(repo),
      techStack: [
        repo.language ? mapLanguageToStack(repo.language) : null,
        ...repo.topics.slice(0, 5),
      ].filter(Boolean),
      updatedAt: repo.updated_at,
      createdAt: repo.created_at,
      pushedAt: repo.pushed_at,
      source: "github" as const,
    }));

    // Sort
    switch (sort) {
      case "stars":
        enrichedRepos.sort((a, b) => b.stars - a.stars);
        break;
      case "updated":
        enrichedRepos.sort(
          (a, b) => new Date(b.pushedAt).getTime() - new Date(a.pushedAt).getTime()
        );
        break;
      case "name":
        enrichedRepos.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "impact":
      default:
        enrichedRepos.sort((a, b) => b.impactScore - a.impactScore);
        break;
    }

    // Limit
    const limitedRepos = enrichedRepos.slice(0, limit);

    const result = {
      projects: limitedRepos,
      meta: {
        source: "github",
        count: limitedRepos.length,
        totalRepos: enrichedRepos.length,
        sort,
        filters: {
          language: language || null,
          topic: topic || null,
        },
        lastUpdated: new Date().toISOString(),
      },
    };

    // Cache GitHub data for 1 hour
    appCache.set(cacheKey, result, 3_600_000);

    return NextResponse.json(result);
  } catch (error) {
    console.error("GitHub API error:", error);

    // Fallback to local data on error
    const localProjects = projects.map((p) => ({
      id: p.id,
      name: p.name,
      tagline: p.tagline,
      description: p.description,
      category: p.category,
      techStack: p.techStack,
      impactScore: p.impactScore,
      stars: p.stars,
      status: p.status,
      featured: p.featured,
      source: "local-fallback" as const,
    }));

    return NextResponse.json(
      {
        projects: localProjects,
        meta: {
          source: "local-fallback",
          count: localProjects.length,
          error: "GitHub API unavailable. Serving cached local data.",
          lastUpdated: new Date().toISOString(),
        },
      },
      { status: 200 }
    );
  }
}

// Revalidate every hour
export const revalidate = 3600;
