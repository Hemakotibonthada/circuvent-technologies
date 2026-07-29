import { createStore, type Severity } from "../../../enterprise";

export type LocalAuditAction =
  | "role.changed"
  | "user.deleted"
  | "device.provisioned"
  | "broadcast.sent"
  | "settings.updated"
  | "local.storage.cleared";

export interface LocalAuditEntry {
  id: string;
  action: LocalAuditAction;
  title: string;
  body: string;
  actorUid: number | null;
  actorEmail: string | null;
  targetId?: string;
  targetLabel?: string;
  ts: string;
  severity: Severity;
  payload?: Record<string, unknown>;
}

interface AuditState {
  entries: LocalAuditEntry[];
}

const MAX_ENTRIES = 500;
export const auditStore = createStore<AuditState>("enterprise-admin-local-audit-v1", { entries: [] });

export async function getLocalAudit(): Promise<LocalAuditEntry[]> {
  const state = await auditStore.load();
  return [...(state.entries || [])].sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

export async function recordAdminAction(entry: Omit<LocalAuditEntry, "id" | "ts"> & { ts?: string }): Promise<void> {
  const state = await auditStore.load();
  const next: LocalAuditEntry = {
    ...entry,
    id: `${Date.now()}-${(state.entries || []).length}-${entry.action}`, 
    ts: entry.ts ?? new Date().toISOString(),
  };
  await auditStore.save({ entries: [next, ...(state.entries || [])].slice(0, MAX_ENTRIES) });
}

export async function clearLocalAudit(): Promise<void> {
  await auditStore.save({ entries: [] });
}
