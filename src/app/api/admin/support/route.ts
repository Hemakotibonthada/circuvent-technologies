import { NextResponse, after } from "next/server";
import { listTickets, addTicketMessage, setTicketStatus } from "@/lib/store";
import { sendMail } from "@/lib/order-core";
import { adminFromRequest, requireArea } from "@/lib/admin-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function verifyAdmin(request: Request): boolean {
  return requireArea(adminFromRequest(request), "support");
}

export async function GET(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ success: true, tickets: listTickets() });
}

/** PATCH /api/admin/support { id, action: reply|close|open, message? } */
export async function PATCH(request: Request) {
  if (!verifyAdmin(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const { id, action, message } = await request.json();
    if (!id) return NextResponse.json({ success: false, message: "id is required." }, { status: 400 });

    if (action === "reply") {
      const t = addTicketMessage(id, "admin", String(message || ""));
      if (!t) return NextResponse.json({ success: false, message: "Ticket not found." }, { status: 404 });
      after(async () => {
        await sendMail(
          t.email,
          `Re: ${t.subject} — Circuvent Support`,
          `<div style="font-family:system-ui,sans-serif"><p>${String(message || "").replace(/</g, "&lt;")}</p><p style="color:#94a3b8;font-size:12px">Reply to this email or visit your account to continue the conversation.</p></div>`,
          undefined,
          { type: "support", related: t.email }
        );
      });
      return NextResponse.json({ success: true, ticket: t });
    }
    if (action === "close" || action === "open") {
      const t = setTicketStatus(id, action === "close" ? "closed" : "open");
      if (!t) return NextResponse.json({ success: false, message: "Ticket not found." }, { status: 404 });
      return NextResponse.json({ success: true, ticket: t });
    }
    return NextResponse.json({ success: false, message: "Unknown action." }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, message: "Could not update the ticket." }, { status: 500 });
  }
}
