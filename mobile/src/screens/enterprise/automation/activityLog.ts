import { createStore } from "../../../enterprise";

export type ActivityKind = "create" | "update" | "delete" | "enable" | "disable" | "scene-create" | "scene-update" | "scene-delete" | "scene-activate";
export interface LocalActivityEntry {
  id: string;
  ts: string;
  kind: ActivityKind;
  ruleId?: number;
  sceneId?: number;
  name: string;
  detail?: string;
}
interface ActivityStoreShape { entries: LocalActivityEntry[] }

const store = createStore<ActivityStoreShape>("automation-activity-v1", { entries: [] });

export async function loadActivity(): Promise<LocalActivityEntry[]> {
  return (await store.load()).entries.sort((a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime());
}

export async function recordActivity(entry: Omit<LocalActivityEntry, "id" | "ts">): Promise<void> {
  const current = await store.load();
  const next: LocalActivityEntry = {
    ...entry,
    id: `${Date.now()}-${current.entries.length}`,
    ts: new Date().toISOString(),
  };
  await store.save({ entries: [next, ...current.entries].slice(0, 300) });
}
