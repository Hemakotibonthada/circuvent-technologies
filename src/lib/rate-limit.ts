const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS: Record<string, number> = {
  contact: 5,
  newsletter: 5,
};

export function rateLimit(key: string, identifier: string): { ok: boolean; retryAfter?: number } {
  const route = MAX_REQUESTS[key] ? key : "default";
  const limit = MAX_REQUESTS[route] ?? 10;
  const id = `${route}:${identifier}`;
  const now = Date.now();
  const entry = rateLimitMap.get(id);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(id, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true };
  }

  if (entry.count >= limit) {
    return { ok: false, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  entry.count++;
  return { ok: true };
}
