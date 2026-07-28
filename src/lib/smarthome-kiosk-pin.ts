// Kiosk / Guest PIN Lock — a lightweight, client-side PIN policy for shared
// household tablets. This defines WHICH console routes should be treated as
// sensitive and stores a SHA-256 hash of a 4-6 digit PIN (never the PIN
// itself) via the Web Crypto API. It is a deterrent for casual access on a
// shared screen, not a real security boundary — the UI says so.

const HASH_KEY = "cv-console-kiosk-pin-hash";
const ROUTES_KEY = "cv-console-kiosk-routes";
const UNLOCKED_KEY = "cv-console-kiosk-unlocked-until";

export const KIOSK_CANDIDATE_ROUTES = [
  "/smarthome/security",
  "/smarthome/developer",
  "/smarthome/backup",
  "/smarthome/settings",
  "/smarthome/away-mode",
] as const;

async function sha256(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function setPin(pin: string): Promise<void> {
  if (typeof window === "undefined") return;
  const hash = await sha256(pin);
  window.localStorage.setItem(HASH_KEY, hash);
}

export function hasPin(): boolean {
  if (typeof window === "undefined") return false;
  return !!window.localStorage.getItem(HASH_KEY);
}

export async function verifyPin(pin: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(HASH_KEY);
  if (!stored) return false;
  return (await sha256(pin)) === stored;
}

export function clearPin(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(HASH_KEY);
}

export function getProtectedRoutes(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ROUTES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

export function setProtectedRoutes(routes: string[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ROUTES_KEY, JSON.stringify(routes));
}

/** Marks the session unlocked for `minutes` (default 15). */
export function unlockSession(minutes = 15): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(UNLOCKED_KEY, String(Date.now() + minutes * 60_000));
}

export function isSessionUnlocked(): boolean {
  if (typeof window === "undefined") return false;
  const until = Number(window.localStorage.getItem(UNLOCKED_KEY) || 0);
  return Date.now() < until;
}

export function lockSession(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(UNLOCKED_KEY);
}
