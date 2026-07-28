// Backup & Restore — bundles rooms/scenes/automations (already fetched from
// the control plane) into one downloadable JSON file, and keeps a small local
// history of backups taken. Restore re-creates each item via the existing
// create* control-plane calls (best-effort; new ids are assigned by the
// server, exactly like creating them by hand would).

import type { AutomationAction, AutomationTrigger } from "./control-plane";

const KEY = "cv-console-backup-history";

export interface BackupRecord {
  id: string;
  at: string;
  roomsCount: number;
  scenesCount: number;
  automationsCount: number;
}

export interface BackupBundle {
  version: 1;
  exportedAt: string;
  rooms: { name: string; icon: string }[];
  scenes: { name: string; icon: string; actions: { deviceId: string; command: Record<string, unknown> }[] }[];
  automations: { name: string; enabled: boolean; trigger: AutomationTrigger; action: AutomationAction }[];
}

export function listHistory(): BackupRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as BackupRecord[]) : [];
  } catch {
    return [];
  }
}

export function recordBackup(counts: { roomsCount: number; scenesCount: number; automationsCount: number }): BackupRecord {
  const record: BackupRecord = { id: `bkp_${Date.now().toString(36)}`, at: new Date().toISOString(), ...counts };
  const list = [record, ...listHistory()].slice(0, 20);
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(list));
    } catch {
      /* ignore */
    }
  }
  return record;
}

export function downloadJson(filename: string, data: unknown): void {
  if (typeof window === "undefined") return;
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
