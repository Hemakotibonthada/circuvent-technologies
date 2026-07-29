import { NextRequest, NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { visitorTracker } from "@/lib/visitor-tracker";

// POST — visitor connect / heartbeat / disconnect
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, visitorId, page, referrer } = body;

    if (!visitorId || !action) {
      return NextResponse.json({ error: "Missing visitorId or action" }, { status: 400 });
    }

    const ip = clientIp(request);
    const userAgent = request.headers.get("user-agent") ?? "unknown";

    switch (action) {
      case "connect":
        visitorTracker.connect(visitorId, page ?? "/", referrer ?? "", userAgent, ip);
        break;
      case "heartbeat":
        visitorTracker.heartbeat(visitorId, page ?? "/");
        break;
      case "disconnect":
        visitorTracker.disconnect(visitorId);
        break;
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }
}

// GET — snapshot of current visitors
export async function GET() {
  return NextResponse.json(visitorTracker.getSnapshot());
}
