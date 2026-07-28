// Maintenance Reminders — recurring upkeep tasks (e.g. "Replace AquaGuard
// filter every 90 days"), optionally linked to a device id. Purely local;
// due dates are computed from the last-done date + interval.

const KEY = "cv-console-maintenance-tasks";

export interface MaintenanceTask {
  id: string;
  title: string;
  deviceId?: string;
  intervalDays: number;
  lastDoneAt?: string;
}

export function listTasks(): MaintenanceTask[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as MaintenanceTask[]) : [];
  } catch {
    return [];
  }
}

function write(tasks: MaintenanceTask[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(tasks));
  } catch {
    /* ignore */
  }
}

export function createTask(input: Omit<MaintenanceTask, "id">): MaintenanceTask {
  const task: MaintenanceTask = { ...input, id: `mt_${Date.now().toString(36)}` };
  write([task, ...listTasks()]);
  return task;
}

export function markDone(id: string): void {
  write(listTasks().map((t) => (t.id === id ? { ...t, lastDoneAt: new Date().toISOString() } : t)));
}

export function deleteTask(id: string): void {
  write(listTasks().filter((t) => t.id !== id));
}

export function computeNextDue(task: MaintenanceTask): { dueAt: Date; overdue: boolean; daysLeft: number } {
  const base = task.lastDoneAt ? new Date(task.lastDoneAt) : new Date();
  const due = new Date(base.getTime() + task.intervalDays * 86_400_000);
  const daysLeft = Math.ceil((due.getTime() - Date.now()) / 86_400_000);
  return { dueAt: due, overdue: daysLeft < 0, daysLeft };
}
