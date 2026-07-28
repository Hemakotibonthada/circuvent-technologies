// Scene Scheduler Calendar — a weekly day×time grid mapping to scene
// activations. Persists the grid locally, and "Enable schedule" creates REAL
// time-based automations (one per populated cell) via the existing
// control-plane automations API, storing the returned ids so the schedule
// can be cleanly disabled later — mirrors the away-mode module's approach.

const KEY = "cv-console-scene-schedule";

export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
export const WEEKDAYS: Weekday[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

export interface ScheduleCell {
  day: Weekday;
  time: string; // "HH:MM"
  sceneId: number;
  sceneName: string;
}

export interface SceneSchedule {
  enabled: boolean;
  cells: ScheduleCell[];
  automationIds: number[];
}

function defaults(): SceneSchedule {
  return { enabled: false, cells: [], automationIds: [] };
}

export function getSchedule(): SceneSchedule {
  if (typeof window === "undefined") return defaults();
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...defaults(), ...(JSON.parse(raw) as Partial<SceneSchedule>) } : defaults();
  } catch {
    return defaults();
  }
}

export function saveSchedule(schedule: SceneSchedule): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(schedule));
  } catch {
    /* ignore */
  }
}

export function setCell(schedule: SceneSchedule, day: Weekday, time: string, sceneId: number | null, sceneName?: string): SceneSchedule {
  const cells = schedule.cells.filter((c) => !(c.day === day && c.time === time));
  if (sceneId !== null && sceneName) cells.push({ day, time, sceneId, sceneName });
  const next = { ...schedule, cells };
  saveSchedule(next);
  return next;
}
