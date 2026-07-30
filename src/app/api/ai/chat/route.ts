import { NextResponse } from "next/server";
import { clientIp } from "@/lib/client-ip";
import { rateLimit, rateLimitIdentity } from "@/lib/rate-limit";
import { tokenFromRequest, verifyToken } from "@/lib/account";
import { getAccount, revalidate } from "@/lib/store";
import { adminFromRequest } from "@/lib/admin-auth";
import { ask } from "@/lib/ai/assistant";
import { resolveConsoleIdentity, mergePersona } from "@/lib/ai/console-identity";
import { logger } from "@/lib/logger";
import type { ChatMessage, AssistantContext, Persona } from "@/lib/ai/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bounds both cost and the prompt-injection surface. */
const MAX_MESSAGES = 20;
const MAX_CHARS = 4000;

/**
 * POST /api/ai/chat — one assistant turn.
 *
 * The client sends conversation history; the server decides *who the user is*
 * from their session cookie and token, never from the request body. A client
 * that claims `persona: "admin"` is ignored.
 */
export async function POST(request: Request) {
  try {
    const ip = clientIp(request);
    const { ok, retryAfter } = rateLimit("ai", ip);
    if (!ok) {
      return NextResponse.json(
        { success: false, message: "Too many requests. Please wait a moment." },
        { status: 429, headers: { "Retry-After": String(retryAfter) } },
      );
    }

    // A malformed body is the caller's mistake, not ours. Parsing it inside
    // the catch-all would report it as a server error and bury a client bug.
    let body: { messages?: { role?: string; content?: string }[]; surface?: string; consoleToken?: string };
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ success: false, message: "Request body must be valid JSON." }, { status: 400 });
    }
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, message: "Request body must be a JSON object." }, { status: 400 });
    }

    const incoming = Array.isArray(body.messages) ? body.messages : [];
    if (incoming.length === 0) {
      return NextResponse.json({ success: false, message: "No message provided." }, { status: 400 });
    }

    // Only user and assistant turns are accepted. A client-supplied "system"
    // message would be a direct instruction-injection channel.
    const messages: ChatMessage[] = incoming
      .slice(-MAX_MESSAGES)
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: String(m.content ?? "").slice(0, MAX_CHARS),
      }))
      .filter((m) => m.content.trim().length > 0);

    if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
      return NextResponse.json({ success: false, message: "The last message must be from the user." }, { status: 400 });
    }

    // ---- identity, decided server-side ----
    let persona: Persona = "guest";
    let email: string | undefined;

    const accountEmail = verifyToken(tokenFromRequest(request));
    if (accountEmail) {
      await revalidate(["accounts"]);
      const acc = getAccount(accountEmail);
      if (acc && !acc.blocked && !acc.deletedAt) {
        persona = "customer";
        email = acc.email;
      }
    }

    if (adminFromRequest(request)) persona = "admin";

    // Mobile (and any console-only client) authenticates against the control
    // plane, not this site, so there is no account cookie to read. Ask the
    // control plane who the token belongs to rather than assuming a guest —
    // otherwise a signed-in app user gets no access to their own home.
    const consoleToken = typeof body.consoleToken === "string" ? body.consoleToken : undefined;
    if (consoleToken && persona !== "admin") {
      persona = mergePersona(persona, await resolveConsoleIdentity(consoleToken));
    }

    // A signed-in user gets a tighter per-identity limit than the shared IP one.
    if (email) {
      const perUser = rateLimitIdentity("ai", email, 30);
      if (!perUser.ok) {
        return NextResponse.json(
          { success: false, message: "Too many requests. Please wait a moment." },
          { status: 429, headers: { "Retry-After": String(perUser.retryAfter) } },
        );
      }
    }

    const ctx: AssistantContext = {
      persona,
      email,
      // The console token is the user's own control-plane credential, held by
      // the browser. Passing it through lets the assistant read their devices
      // with their own permissions rather than a service account's.
      consoleToken,
      surface: normaliseSurface(body.surface),
    };

    const reply = await ask(messages, ctx, { signal: request.signal });

    return NextResponse.json({
      success: true,
      message: reply.text,
      usedTools: reply.usedTools,
      data: reply.data,
      degraded: reply.degraded ?? false,
      persona,
    });
  } catch (err) {
    logger.error("ai.chat_failed", {}, err);
    return NextResponse.json(
      { success: false, message: "The assistant could not answer that. Please try again." },
      { status: 500 },
    );
  }
}

function normaliseSurface(v: unknown): AssistantContext["surface"] {
  const s = String(v ?? "");
  return s === "shop" || s === "smarthome" || s === "admin" || s === "mobile" || s === "site" ? s : undefined;
}
