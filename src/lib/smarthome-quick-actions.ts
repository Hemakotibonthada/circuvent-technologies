// Quick Actions Launcher — customizable shortcut tiles that immediately send
// a device command or activate a scene, one tap. Distinct from the Command
// Center's informational widgets: these are action buttons only.

const KEY = "cv-console-quick-actions";

export type QuickActionTarget = { kind: "scene"; sceneId: number } | { kind: "command"; deviceId: string; command: Record<string, unknown> };

export interface QuickAction {
  id: string;
  label: string;
  icon: string; // emoji, kept simple and local
  target: QuickActionTarget;
}

export function listActions(): QuickAction[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as QuickAction[]) : [];
  } catch {
    return [];
  }
}

function write(actions: QuickAction[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(actions));
  } catch {
    /* ignore */
  }
}

export function createAction(input: Omit<QuickAction, "id">): QuickAction {
  const action: QuickAction = { ...input, id: `qa_${Date.now().toString(36)}` };
  write([...listActions(), action]);
  return action;
}

export function deleteAction(id: string): void {
  write(listActions().filter((a) => a.id !== id));
}

export function reorder(ids: string[]): void {
  const actions = listActions();
  const byId = new Map(actions.map((a) => [a.id, a]));
  write(ids.map((id) => byId.get(id)).filter((a): a is QuickAction => !!a));
}
