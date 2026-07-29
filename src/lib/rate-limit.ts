const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

const WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS: Record<string, number> = {
  contact: 5,
  newsletter: 5,
  // Credential and one-time-code surfaces: low enough that online guessing is
  // not viable, high enough for a real person who mistypes a few times.
  account: 8,
  payments: 10,
  orders: 20,
  track: 20,
  questions: 10,
};

/** Bound the map so a key flood can't grow it without limit. */
const MAX_ENTRIES = 50_000;

function sweep(now: number) {
  if (rateLimitMap.size < MAX_ENTRIES) return;
  for (const [k, v] of rateLimitMap) {
    if (now > v.resetAt) rateLimitMap.delete(k);
  }
  if (rateLimitMap.size >= MAX_ENTRIES) rateLimitMap.clear();
}

export function rateLimit(key: string, identifier: string): { ok: boolean; retryAfter?: number } {
  const route = MAX_REQUESTS[key] ? key : "default";
  const limit = MAX_REQUESTS[route] ?? 10;
  const id = `${route}:${identifier}`;
  const now = Date.now();
  sweep(now);
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

/**
 * Second limiter keyed on the account being targeted rather than the caller.
 *
 * An IP limit alone does not protect one account from a distributed guessing
 * run, and it does not stop OTP-mail flooding of a single address from many
 * source IPs. Both limits must pass.
 */
export function rateLimitIdentity(
  key: string,
  identity: string,
  limit = 10
): { ok: boolean; retryAfter?: number } {
  const id = `id:${key}:${identity.trim().toLowerCase()}`;
  const now = Date.now();
  sweep(now);
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
