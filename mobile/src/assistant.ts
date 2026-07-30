import { SITE_URL } from "./config";
import { getToken } from "./api";

/**
 * Assistant + home analysis client.
 *
 * These two endpoints live on the website rather than the control plane, so
 * they are called with an absolute URL instead of going through `api.ts`. The
 * console token is sent in the body (not as a bearer header) because the site
 * treats it as a credential *for the control plane* that it forwards on the
 * user's behalf — it is not the site's own session.
 *
 * Nothing here interprets the payload. The analysis is computed server-side by
 * one tested implementation so that the app, the web console and the assistant
 * can never disagree about what a reading means.
 */

const TIMEOUT_MS = 20000;

export type Severity = "critical" | "warning" | "info";

export interface Finding {
  id: string;
  severity: Severity;
  title: string;
  detail: string;
  deviceIds: string[];
  evidence: Record<string, number | string | boolean>;
  suggestion?: string;
}

export interface HomeAnalysis {
  findings: Finding[];
  energy: {
    totalWatts: number;
    meteredDevices: number;
    estimatedKWhPerDay: number;
    estimatedKWhPerMonth: number;
    topConsumers: { id: string; name: string; watts: number; sharePct: number }[];
  };
  counts: { total: number; online: number; offline: number };
  generatedAt: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; needsAuth?: boolean };

async function post<T>(path: string, body: Record<string, unknown>): Promise<Result<T>> {
  // React Native's fetch has no built-in timeout, so a stalled request would
  // otherwise leave the UI spinning forever.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(SITE_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.success) {
      if (res.status === 401) {
        return { ok: false, error: "Your session expired. Sign in again.", needsAuth: true };
      }
      if (res.status === 429) {
        return { ok: false, error: "Too many requests. Give it a moment." };
      }
      return { ok: false, error: data?.message ?? "That did not work." };
    }
    return { ok: true, data: data as T };
  } catch (e: any) {
    if (e?.name === "AbortError") return { ok: false, error: "The request timed out." };
    return { ok: false, error: "Could not reach Circuvent." };
  } finally {
    clearTimeout(timer);
  }
}

/** Deterministic analysis of the signed-in user's home. No language model involved. */
export async function fetchHomeAnalysis(): Promise<Result<HomeAnalysis>> {
  const token = await getToken();
  if (!token) return { ok: false, error: "Sign in to see insights.", needsAuth: true };

  const res = await post<{ analysis: HomeAnalysis }>("/api/ai/analyze", { consoleToken: token });
  return res.ok ? { ok: true, data: res.data.analysis } : res;
}

/**
 * Sends a conversation turn.
 *
 * Only user and assistant turns are ever sent. The persona is derived
 * server-side from the token — the app cannot request one, and asking for it
 * here would simply be ignored.
 */
export async function sendChat(
  messages: ChatMessage[],
  surface: string = "mobile",
): Promise<Result<{ message: string; persona: string }>> {
  const token = await getToken();
  const clean = messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({ role: m.role, content: String(m.content ?? "").slice(0, 4000) }))
    .slice(-12);

  if (clean.length === 0) return { ok: false, error: "Nothing to send." };

  return post<{ message: string; persona: string }>("/api/ai/chat", {
    messages: clean,
    surface,
    ...(token ? { consoleToken: token } : {}),
  });
}
