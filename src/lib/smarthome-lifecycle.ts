// Device Lifecycle Tracker — records each device's purchase date and an
// expected lifespan (years), computed locally, so users get a heads-up
// before something old fails rather than after. Independent of the admin
// side's warranty/RMA system (different auth domain — console users aren't
// authenticated against the shop's admin API).

const KEY = "cv-console-device-lifecycle";

export interface LifecycleEntry {
  deviceId: string;
  purchaseDate: string;
  expectedLifespanYears: number;
}

export function listEntries(): LifecycleEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as LifecycleEntry[]) : [];
  } catch {
    return [];
  }
}

export function setEntry(deviceId: string, purchaseDate: string, expectedLifespanYears: number): LifecycleEntry {
  const entries = listEntries().filter((e) => e.deviceId !== deviceId);
  const entry: LifecycleEntry = { deviceId, purchaseDate, expectedLifespanYears };
  entries.push(entry);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(entries));
    } catch {
      /* ignore */
    }
  }
  return entry;
}

export function removeEntry(deviceId: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(listEntries().filter((e) => e.deviceId !== deviceId)));
}

export interface LifecycleStatus {
  ageYears: number;
  remainingYears: number;
  pctUsed: number;
  status: "new" | "aging" | "replace-soon" | "overdue";
}

export function computeStatus(entry: LifecycleEntry): LifecycleStatus {
  const ageMs = Date.now() - new Date(entry.purchaseDate).getTime();
  const ageYears = ageMs / (365.25 * 86_400_000);
  const remainingYears = entry.expectedLifespanYears - ageYears;
  const pctUsed = Math.max(0, Math.min(150, Math.round((ageYears / entry.expectedLifespanYears) * 100)));
  const status: LifecycleStatus["status"] = pctUsed >= 100 ? "overdue" : pctUsed >= 80 ? "replace-soon" : pctUsed >= 40 ? "aging" : "new";
  return { ageYears: Math.round(ageYears * 10) / 10, remainingYears: Math.round(remainingYears * 10) / 10, pctUsed, status };
}
