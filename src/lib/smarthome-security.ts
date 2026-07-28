// Security Center — local "mode" preference (home/away/night) layered on top
// of live device data. Client-side only; no new server storage needed.

const KEY = "cv-console-security-mode";

export type SecurityMode = "home" | "away" | "night";

export function getMode(): SecurityMode {
  if (typeof window === "undefined") return "home";
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "away" || v === "night" ? v : "home";
  } catch {
    return "home";
  }
}

export function setMode(mode: SecurityMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    /* ignore */
  }
}
