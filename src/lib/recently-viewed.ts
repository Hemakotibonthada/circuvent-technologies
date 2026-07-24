// Recently-viewed products — client-side, stored in localStorage so it works
// without an account and never touches the server. Most-recent first.

const KEY = "circuvent-recently-viewed";
const MAX = 12;

export function recordView(id: string): void {
  if (typeof window === "undefined" || !id) return;
  try {
    const prev = getRecentlyViewedIds().filter((x) => x !== id);
    const next = [id, ...prev].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
    // Let same-tab listeners (rails) react immediately.
    window.dispatchEvent(new CustomEvent("recently-viewed-changed"));
  } catch {
    /* storage unavailable — ignore */
  }
}

export function getRecentlyViewedIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function clearRecentlyViewed(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(KEY);
    window.dispatchEvent(new CustomEvent("recently-viewed-changed"));
  } catch {
    /* ignore */
  }
}
