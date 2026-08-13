import { NextResponse } from "next/server";
import nextPkg from "next/package.json";
import { isDbConfigured, validateEnv } from "@/lib/config";
import { currentBuild } from "@/lib/deployments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Liveness/readiness probe for monitoring. Lightweight — reports process,
 * database configuration and environment-validation status without performing
 * an expensive database round-trip (see /api/health/db for that).
 */
export async function GET() {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  const env = validateEnv();
  const dbConfigured = isDbConfigured();

  const status = env.ok ? "healthy" : "degraded";

  return NextResponse.json(
    {
      status,
      version: "1.0.0",
      /*
       * Which build is actually serving.
       *
       * `version` above is a constant nobody bumps, so it cannot answer "is my
       * change live yet" or "are these two hosts running the same code". That
       * gap is not academic: diagnosing an Office outage meant downloading the
       * minified bundle from each host and comparing filename hashes, because
       * nothing else distinguished them.
       *
       * Null when there is no git metadata — running locally, or built
       * somewhere that does not provide it. Saying null is better than
       * inventing a value that looks authoritative.
       */
      build: (() => {
        const b = currentBuild();
        return b
          ? { sha: b.shortSha, branch: b.branch, environment: b.environment }
          : null;
      })(),
      timestamp: new Date().toISOString(),
      uptime: {
        seconds: Math.round(uptime),
        formatted: formatUptime(uptime),
      },
      memory: {
        heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)}MB`,
        heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
        rss: `${Math.round(memoryUsage.rss / 1024 / 1024)}MB`,
      },
      environment: process.env.NODE_ENV || "development",
      nextVersion: nextPkg.version,
      database: {
        configured: dbConfigured,
        mode: dbConfigured ? "postgres" : "file",
      },
      env: {
        ok: env.ok,
        missing: env.missing.length,
        warnings: env.warnings.length,
      },
      features: {
        githubSync: !!process.env.GITHUB_TOKEN,
        payments: !!process.env.RAZORPAY_KEY_ID,
        email: !!process.env.SMTP_HOST || !!process.env.RESEND_API_KEY,
      },
    },
    { status: status === "healthy" ? 200 : 503 }
  );
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  parts.push(`${secs}s`);

  return parts.join(" ");
}
