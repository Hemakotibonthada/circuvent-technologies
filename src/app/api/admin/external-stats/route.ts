import { NextRequest, NextResponse } from "next/server";
import { appCache } from "@/lib/cache";
import { visitorTracker } from "@/lib/visitor-tracker";

// CORS headers for cross-origin access from CV-365
function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "x-api-key, Content-Type",
  };
}

// OPTIONS — CORS preflight
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

// GET — External stats endpoint (protected by API key)
export async function GET(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  const expectedKey = process.env.ADMIN_API_KEY;

  if (!expectedKey || apiKey !== expectedKey) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: corsHeaders() }
    );
  }

  const visitors = visitorTracker.getSnapshot();
  const cache = appCache.getStats();
  const memUsage = process.memoryUsage();

  return NextResponse.json(
    {
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
    },
    { headers: corsHeaders() }
  );
}
