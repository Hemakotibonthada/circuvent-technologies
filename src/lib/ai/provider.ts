// Language-model access for the Circuvent assistant.
//
// Talks the OpenAI chat-completions wire format over plain fetch rather than
// through a vendor SDK. That is deliberate:
//   • no dependency to keep current, and nothing to break at build time
//   • the same code reaches OpenAI, Azure OpenAI, Together, Groq, or a
//     self-hosted Ollama / vLLM — they all speak this shape
//   • the marketing site argues for local inference; this leaves that door open
//     with an env var rather than a rewrite
//
// SERVER ONLY. The API key must never reach a browser.

import { logger } from "../logger";
import type { ChatMessage, ToolDefinition, ToolCall } from "./types";

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

/** Where to send completions. Any OpenAI-compatible endpoint works. */
function baseUrl(): string {
  return (process.env.AI_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
}

function apiKey(): string {
  return (process.env.AI_API_KEY || process.env.OPENAI_API_KEY || "").trim();
}

/** The model id. `OPENAI_MODEL` is honoured because it already exists. */
export function modelName(): string {
  return (process.env.AI_MODEL || process.env.OPENAI_MODEL || "gpt-4o-mini").trim();
}

/**
 * Whether the assistant can talk at all.
 *
 * A self-hosted endpoint often needs no key, so a configured base URL is
 * enough on its own. Everything downstream checks this and degrades to the
 * deterministic analysis rather than erroring.
 */
export function aiConfigured(): boolean {
  return apiKey().length > 0 || !!process.env.AI_BASE_URL;
}

/** How long to wait before giving up on a completion. */
const TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 45000);

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/* ------------------------------------------------------------------ */
/* Wire types                                                          */
/* ------------------------------------------------------------------ */

interface WireMessage {
  role: string;
  content: string | null;
  name?: string;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

interface Completion {
  choices: {
    message: {
      role: string;
      content: string | null;
      tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
    };
    finish_reason: string;
  }[];
  usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
}

export interface CompletionResult {
  text: string;
  toolCalls: ToolCall[];
  finishReason: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

function toWire(m: ChatMessage): WireMessage {
  if (m.role === "tool") {
    return { role: "tool", content: m.content, tool_call_id: m.toolCallId };
  }
  if (m.role === "assistant" && m.toolCalls?.length) {
    return {
      role: "assistant",
      content: m.content || null,
      tool_calls: m.toolCalls.map((t) => ({
        id: t.id,
        type: "function" as const,
        function: { name: t.name, arguments: JSON.stringify(t.arguments) },
      })),
    };
  }
  return { role: m.role, content: m.content };
}

/* ------------------------------------------------------------------ */
/* Completion                                                          */
/* ------------------------------------------------------------------ */

export async function complete(opts: {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}): Promise<CompletionResult> {
  if (!aiConfigured()) {
    throw new AiUnavailableError("No AI provider is configured.");
  }

  const body: Record<string, unknown> = {
    model: modelName(),
    messages: opts.messages.map(toWire),
    // Low by default: this assistant reports facts about someone's home and
    // their orders. Creative variation is not a feature here.
    temperature: opts.temperature ?? 0.2,
    max_tokens: opts.maxTokens ?? 900,
  };

  if (opts.tools?.length) {
    body.tools = opts.tools.map((t) => ({
      type: "function",
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
    body.tool_choice = "auto";
  }

  // Combine the caller's abort signal with our own timeout, so a hung provider
  // cannot hold a request open indefinitely.
  const timer = new AbortController();
  const timeout = setTimeout(() => timer.abort(), TIMEOUT_MS);
  const onAbort = () => timer.abort();
  opts.signal?.addEventListener("abort", onAbort);

  try {
    const headers: Record<string, string> = { "content-type": "application/json" };
    const key = apiKey();
    if (key) headers.authorization = `Bearer ${key}`;

    const res = await fetch(`${baseUrl()}/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: timer.signal,
    });

    if (!res.ok) {
      const detail = (await res.text()).slice(0, 400);
      // Never log the response body at error level without truncating: provider
      // errors sometimes echo the request, which contains the user's data.
      logger.error("ai.provider_error", { status: res.status });
      throw new AiUnavailableError(
        res.status === 401 || res.status === 403
          ? "The AI provider rejected our credentials."
          : res.status === 429
            ? "The AI provider is rate-limiting us."
            : `The AI provider returned ${res.status}. ${detail.slice(0, 120)}`,
      );
    }

    const data = (await res.json()) as Completion;
    const choice = data.choices?.[0];
    if (!choice) throw new AiUnavailableError("The AI provider returned no choices.");

    return {
      text: choice.message.content ?? "",
      toolCalls: (choice.message.tool_calls ?? []).map((t) => ({
        id: t.id,
        name: t.function.name,
        arguments: safeParse(t.function.arguments),
      })),
      finishReason: choice.finish_reason,
      usage: data.usage && {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
    };
  } catch (err) {
    if (err instanceof AiUnavailableError) throw err;
    if ((err as Error)?.name === "AbortError") {
      throw new AiUnavailableError("The AI provider took too long to answer.");
    }
    logger.error("ai.request_failed", {}, err);
    throw new AiUnavailableError("Could not reach the AI provider.");
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Models occasionally emit tool arguments that are not valid JSON. An empty
 * object lets the tool's own validation produce a useful error, which is far
 * better than the whole turn collapsing.
 */
function safeParse(s: string): Record<string, unknown> {
  try {
    const v = JSON.parse(s || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
