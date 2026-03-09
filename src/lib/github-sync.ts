/**
 * GitHub API Sync Logic
 * 
 * This module provides functions to keep the Projects section
 * dynamically synced with the GitHub API directly.
 * 
 * Usage:
 *   - In ISR (Incremental Static Regeneration) mode with `revalidate`
 *   - Or via API route for client-side fetching
 */

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_ORG = "Hemakotibonthada";

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  homepage: string | null;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  topics: string[];
  updated_at: string;
  created_at: string;
  pushed_at: string;
  archived: boolean;
  fork: boolean;
  visibility: string;
}

/**
 * Fetch all repositories from GitHub for the organization.
 * Uses ISR to revalidate every hour.
 */
export async function fetchGitHubRepos(): Promise<GitHubRepo[]> {
  const repos: GitHubRepo[] = [];
  let page = 1;
  const perPage = 100;

  while (true) {
    const response = await fetch(
      `${GITHUB_API_BASE}/users/${GITHUB_ORG}/repos?per_page=${perPage}&page=${page}&sort=updated`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          ...(process.env.GITHUB_TOKEN
            ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
            : {}),
        },
        next: { revalidate: 3600 }, // ISR: revalidate every hour
      }
    );

    if (!response.ok) break;

    const data: GitHubRepo[] = await response.json();
    if (data.length === 0) break;

    repos.push(...data.filter((r) => !r.fork && !r.archived));
    if (data.length < perPage) break;
    page++;
  }

  return repos;
}

/**
 * Fetch languages for a specific repository
 */
export async function fetchRepoLanguages(
  repoName: string
): Promise<Record<string, number>> {
  const response = await fetch(
    `${GITHUB_API_BASE}/repos/${GITHUB_ORG}/${repoName}/languages`,
    {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
      next: { revalidate: 86400 }, // Revalidate daily
    }
  );

  if (!response.ok) return {};
  return response.json();
}

/**
 * Calculate an "Impact Score" based on GitHub metrics.
 * Score is 0-100 based on stars, forks, recency, and language diversity.
 */
export function calculateImpactScore(repo: GitHubRepo): number {
  const now = new Date();
  const lastPush = new Date(repo.pushed_at);
  const daysSinceUpdate = Math.floor(
    (now.getTime() - lastPush.getTime()) / (1000 * 60 * 60 * 24)
  );

  // Score components
  const starScore = Math.min(repo.stargazers_count * 5, 30); // Max 30
  const forkScore = Math.min(repo.forks_count * 3, 20); // Max 20
  const recencyScore = Math.max(0, 25 - daysSinceUpdate / 7); // Max 25
  const topicScore = Math.min(repo.topics.length * 3, 15); // Max 15
  const descScore = repo.description ? 10 : 0; // Max 10

  return Math.round(
    Math.min(starScore + forkScore + recencyScore + topicScore + descScore, 100)
  );
}

/**
 * Map GitHub language to tech stack icon/badge
 */
export function mapLanguageToStack(language: string): string {
  const mapping: Record<string, string> = {
    TypeScript: "TypeScript",
    JavaScript: "JavaScript",
    Python: "Python",
    Dart: "Flutter/Dart",
    "C++": "C++/Arduino",
    Java: "Java",
    Kotlin: "Kotlin",
    Swift: "Swift",
    Rust: "Rust",
    Go: "Go",
    HTML: "HTML",
    CSS: "CSS",
    Shell: "Shell/Bash",
    Dockerfile: "Docker",
  };
  return mapping[language] || language;
}

/**
 * Example: Next.js API route handler for GitHub sync
 * 
 * Create this at: src/app/api/github/route.ts
 * 
 * ```typescript
 * import { NextResponse } from "next/server";
 * import { fetchGitHubRepos, calculateImpactScore } from "@/lib/github-sync";
 * 
 * export async function GET() {
 *   const repos = await fetchGitHubRepos();
 *   const enrichedRepos = repos.map((repo) => ({
 *     ...repo,
 *     impactScore: calculateImpactScore(repo),
 *   }));
 *   
 *   return NextResponse.json(enrichedRepos);
 * }
 * 
 * // Revalidate every hour
 * export const revalidate = 3600;
 * ```
 * 
 * Then in your Projects page, use ISR:
 * 
 * ```typescript
 * // src/app/projects/page.tsx
 * import { fetchGitHubRepos } from "@/lib/github-sync";
 * 
 * export const revalidate = 3600;
 * 
 * export default async function ProjectsPage() {
 *   const repos = await fetchGitHubRepos();
 *   // merge with local project data for descriptions, etc.
 * }
 * ```
 */
