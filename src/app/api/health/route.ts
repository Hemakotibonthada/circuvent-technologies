import { NextResponse } from "next/server";

/**
 * GET /api/health
 * 
 * Health check endpoint for monitoring.
 * Returns application status, version, and uptime information.
 */
export async function GET() {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();

  return NextResponse.json({
    status: "healthy",
    version: "1.0.0",
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
    nextVersion: "16.1.6",
    features: {
      githubSync: !!process.env.GITHUB_TOKEN,
      analytics: false,
      newsletter: false,
    },
  });
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
