// Solar & Renewable Offset Tracker — logs manually-entered (or meter-read)
// daily solar production and compares it against real grid consumption from
// control-plane.ts's energySummary, to estimate self-consumption offset.
// No solar inverter integration exists in this product line yet, so entries
// are logged by the user (e.g. from their inverter's own display).

const KEY = "cv-console-solar-log";

export interface SolarEntry {
  date: string; // "YYYY-MM-DD"
  producedKwh: number;
}

export function listEntries(): SolarEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SolarEntry[]) : [];
  } catch {
    return [];
  }
}

export function logEntry(date: string, producedKwh: number): SolarEntry {
  const entries = listEntries().filter((e) => e.date !== date);
  const entry: SolarEntry = { date, producedKwh };
  entries.unshift(entry);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(entries.slice(0, 90)));
    } catch {
      /* ignore */
    }
  }
  return entry;
}

export function deleteEntry(date: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(listEntries().filter((e) => e.date !== date)));
}

export interface OffsetResult {
  producedKwh: number;
  consumedKwh: number;
  offsetPct: number;
}

export function computeOffset(producedKwh: number, consumedKwh: number): OffsetResult {
  const offsetPct = consumedKwh > 0 ? Math.min(100, Math.round((producedKwh / consumedKwh) * 100)) : 0;
  return { producedKwh, consumedKwh, offsetPct };
}
