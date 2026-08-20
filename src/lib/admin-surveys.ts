// NPS / Customer Feedback Surveys — collects a 0-10 satisfaction score plus
// an optional comment, and computes the standard Net Promoter Score
// (%promoters - %detractors). Submission is intentionally public/anonymous
// (no admin auth) since real customers submit it; only the aggregated
// GET view requires the "crm" admin area.
//
// SERVER ONLY.

import { createFileStore, shortId } from "./data-file";

export interface SurveyResponse {
  id: string;
  email?: string;
  score: number; // 0-10
  comment?: string;
  at: string;
}

const store = createFileStore<{ responses: SurveyResponse[] }>("admin-surveys.json", () => ({ responses: [] }), { durable: true });

/** Loads the authoritative copy before a request reads or writes. Every route awaits this first. */
export async function revalidateSurveys(): Promise<void> {
  await store.hydrate();
}

/** Waits for the pending database write to land — awaited before responding, not fired and forgotten. */
export async function flushSurveys(): Promise<void> {
  await store.flush();
}

export function submitResponse(score: number, comment?: string, email?: string): SurveyResponse {
  return store.mutate((db) => {
    const response: SurveyResponse = { id: shortId("nps"), email, score: Math.max(0, Math.min(10, Math.round(score))), comment, at: new Date().toISOString() };
    db.responses.unshift(response);
    return response;
  });
}

export function listResponses(limit = 200): SurveyResponse[] {
  return store.read().responses.slice(0, limit);
}

export interface NpsBreakdown {
  total: number;
  promoters: number;
  passives: number;
  detractors: number;
  score: number; // -100 to 100
}

export function npsScore(): NpsBreakdown {
  const rows = store.read().responses;
  const promoters = rows.filter((r) => r.score >= 9).length;
  const detractors = rows.filter((r) => r.score <= 6).length;
  const passives = rows.length - promoters - detractors;
  const score = rows.length ? Math.round(((promoters - detractors) / rows.length) * 100) : 0;
  return { total: rows.length, promoters, passives, detractors, score };
}
