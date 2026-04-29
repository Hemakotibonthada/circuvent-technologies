import { NextRequest, NextResponse } from "next/server";
import { appCache } from "@/lib/cache";
import { visitorTracker } from "@/lib/visitor-tracker";

function verifyToken(request: NextRequest): boolean {
  const token = request.headers.get("x-admin-token");
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || !token) return false;
  const expected = Buffer.from(`${adminPassword}:${new Date().toDateString()}`).toString("base64");
  return token === expected;
}

// GET — Admin stats: visitors + cache (protected)
export async function GET(request: NextRequest) {
  if (!verifyToken(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const visitors = visitorTracker.getSnapshot();
  const cache = appCache.getStats();

  const memUsage = process.memoryUsage();

  return NextResponse.json({
    visitors,
    cache,
    server: {
      uptime: `${Math.round(process.uptime())}s`,
      memory: {
        heapUsed: `${(memUsage.heapUsed / 1048576).toFixed(1)}MB`,
        heapTotal: `${(memUsage.heapTotal / 1048576).toFixed(1)}MB`,
        rss: `${(memUsage.rss / 1048576).toFixed(1)}MB`,
      },
      nodeVersion: process.version,
      platform: process.platform,
    },
    timestamp: new Date().toISOString(),
  });
}
