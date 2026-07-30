// The assistant orchestrator: prompt, tool loop, and a deterministic fallback.
//
// The loop is the standard one — ask the model, run any tools it requested,
// give it the results, ask again — with two properties that matter here:
//
//   • It is bounded. A model that keeps asking for tools stops after a few
//     rounds rather than billing indefinitely.
//   • It degrades instead of failing. If no provider is configured, or the
//     provider is down, the assistant still answers questions it can answer
//     arithmetically, because analysis.ts needs no model at all.
//
// SERVER ONLY.

import { logger } from "../logger";
import { complete, aiConfigured, AiUnavailableError } from "./provider";
import { systemPrompt } from "./prompts";
import { toolsFor, runTool } from "./tools";
import { analyseHome, analysisToPromptContext } from "./analysis";
import type { AssistantContext, ChatMessage, AssistantReply } from "./types";
import type { Device } from "../control-plane";

/** How many times the model may ask for tools before we make it answer. */
const MAX_TOOL_ROUNDS = 4;

/** Cap on conversation history, to bound both cost and prompt-injection surface. */
const MAX_HISTORY = 12;

export async function ask(
  history: ChatMessage[],
  ctx: AssistantContext,
  opts: { signal?: AbortSignal } = {},
): Promise<AssistantReply> {
  const trimmed = history.slice(-MAX_HISTORY);

  if (!aiConfigured()) {
    return degradedReply(trimmed, ctx, "no provider configured");
  }

  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt(ctx) },
    ...trimmed,
  ];

  const tools = toolsFor(ctx);
  const usedTools: string[] = [];
  const data: Record<string, unknown> = {};

  try {
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      // On the final round, withhold the tools so the model has to produce
      // prose instead of asking for yet another lookup.
      const lastRound = round === MAX_TOOL_ROUNDS;
      const result = await complete({
        messages,
        tools: lastRound ? undefined : tools,
        signal: opts.signal,
      });

      if (result.toolCalls.length === 0) {
        return { text: result.text.trim(), usedTools, data };
      }

      messages.push({ role: "assistant", content: result.text, toolCalls: result.toolCalls });

      for (const call of result.toolCalls) {
        const out = await runTool(call.name, call.arguments, ctx);
        usedTools.push(call.name);
        if (out.data && typeof out.data === "object") Object.assign(data, out.data);
        messages.push({ role: "tool", content: out.content, toolCallId: call.id });
      }
    }

    // Ran out of rounds without the model settling. Rather than return nothing,
    // fall back to something factual.
    return degradedReply(trimmed, ctx, "tool loop did not converge");
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      logger.warn("ai.unavailable", { reason: err.message, persona: ctx.persona });
      return degradedReply(trimmed, ctx, err.message);
    }
    throw err;
  }
}

/* ------------------------------------------------------------------ */
/* Deterministic fallback                                              */
/* ------------------------------------------------------------------ */

/**
 * An answer with no model involved.
 *
 * This is not an error message dressed up as help. For the questions people
 * actually ask an assistant in a smart-home app — "is everything ok", "what's
 * using power", "is anything offline" — the arithmetic in analysis.ts produces
 * a genuinely useful answer on its own. The model adds phrasing, not facts, so
 * losing it costs less than it might seem.
 */
async function degradedReply(
  history: ChatMessage[],
  ctx: AssistantContext,
  reason: string,
): Promise<AssistantReply> {
  const question = [...history].reverse().find((m) => m.role === "user")?.content ?? "";
  const q = question.toLowerCase();

  const wantsHome =
    /\b(device|home|offline|online|status|wrong|ok|okay|power|energy|watt|electric|consum|usage|problem|issue|check)\b/.test(q);

  if (wantsHome && ctx.consoleToken) {
    const devices = await fetchDevices(ctx);
    if (devices) {
      const analysis = analyseHome({ devices });
      return {
        text: renderAnalysis(analysis),
        usedTools: ["home_analysis"],
        data: { analysis },
        degraded: true,
      };
    }
  }

  logger.info("ai.degraded", { reason, persona: ctx.persona });
  return {
    text:
      "The assistant is offline at the moment, so I can't answer that in full. " +
      (ctx.persona === "guest"
        ? "You can browse the catalogue at /shop in the meantime."
        : "Your devices and orders are all still available in the app."),
    usedTools: [],
    data: {},
    degraded: true,
  };
}

async function fetchDevices(ctx: AssistantContext): Promise<Device[] | null> {
  const base = (
    process.env.CONTROL_PLANE_URL ||
    process.env.NEXT_PUBLIC_CONTROL_PLANE_URL ||
    "https://api.circuvent.com"
  ).replace(/\/$/, "");
  try {
    const res = await fetch(`${base}/devices`, {
      headers: { authorization: `Bearer ${ctx.consoleToken}` },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    return (await res.json()) as Device[];
  } catch {
    return null;
  }
}

/** Turns an analysis into prose without a model. */
function renderAnalysis(a: ReturnType<typeof analyseHome>): string {
  const parts: string[] = [];
  parts.push(
    `You have ${a.counts.total} device${a.counts.total === 1 ? "" : "s"}, ` +
      `${a.counts.online} online and ${a.counts.offline} offline.`,
  );

  if (a.energy.meteredDevices > 0) {
    parts.push(
      `They are drawing ${a.energy.totalWatts} W right now — about ` +
        `${a.energy.estimatedKWhPerDay} kWh a day if that holds steady.`,
    );
    const top = a.energy.topConsumers[0];
    if (top) parts.push(`${top.name} is the biggest at ${top.watts} W (${top.sharePct}%).`);
  }

  if (a.findings.length === 0) {
    parts.push("Nothing looks wrong.");
  } else {
    parts.push("");
    for (const f of a.findings.slice(0, 5)) {
      parts.push(`• ${f.title}. ${f.detail}${f.suggestion ? ` ${f.suggestion}` : ""}`);
    }
    if (a.findings.length > 5) parts.push(`…and ${a.findings.length - 5} more.`);
  }

  return parts.join("\n");
}

export { analysisToPromptContext };
