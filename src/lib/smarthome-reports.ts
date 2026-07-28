// Data Export & Reports Center — client-side CSV builders for the data the
// console already fetches (devices, events, energy) plus saved "what to
// include" report configs. No server changes: exports are generated and
// downloaded entirely in the browser.

const KEY = "cv-console-report-configs";

export interface SavedReportConfig {
  id: string;
  name: string;
  includeDevices: boolean;
  includeEvents: boolean;
  includeEnergy: boolean;
  createdAt: string;
}

export function listConfigs(): SavedReportConfig[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SavedReportConfig[]) : [];
  } catch {
    return [];
  }
}

export function saveConfig(input: Omit<SavedReportConfig, "id" | "createdAt">): SavedReportConfig {
  const config: SavedReportConfig = { ...input, id: `rpt_${Date.now().toString(36)}`, createdAt: new Date().toISOString() };
  const list = [config, ...listConfigs()];
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }
  return config;
}

export function deleteConfig(id: string): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(listConfigs().filter((c) => c.id !== id)));
  } catch {
    /* ignore */
  }
}

function toCsvRows(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => headers.map((h) => escape(r[h])).join(","))].join("\n");
}

export function devicesToCsv(devices: { id: string; name: string; type: string; room?: string; online: boolean }[]): string {
  return toCsvRows(devices.map((d) => ({ id: d.id, name: d.name, type: d.type, room: d.room || "", online: d.online })));
}

export function eventsToCsv(events: { id: number; kind: string; title: string; body: string; ts: string }[]): string {
  return toCsvRows(events.map((e) => ({ id: e.id, kind: e.kind, title: e.title, body: e.body, ts: e.ts })));
}

/** Triggers a browser download of `text` as a file named `filename`. */
export function downloadCsv(filename: string, text: string): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
