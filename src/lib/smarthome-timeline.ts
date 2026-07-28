// Activity Timeline — richer client-side filtering/grouping on top of the
// existing events API (controlPlane.events()), distinct from the
// alert-oriented Notifications page: this groups by day and lets you filter
// by device and event kind for a browsable history.

import type { AppEvent } from "./control-plane";

export interface TimelineGroup {
  dateLabel: string;
  events: AppEvent[];
}

export function filterEvents(events: AppEvent[], opts: { deviceId?: string; kind?: string; query?: string }): AppEvent[] {
  return events.filter((e) => {
    if (opts.deviceId && e.device_id !== opts.deviceId) return false;
    if (opts.kind && opts.kind !== "all" && e.kind !== opts.kind) return false;
    if (opts.query) {
      const q = opts.query.toLowerCase();
      if (!e.title.toLowerCase().includes(q) && !e.body.toLowerCase().includes(q)) return false;
    }
    return true;
  });
}

export function groupByDay(events: AppEvent[]): TimelineGroup[] {
  const groups = new Map<string, AppEvent[]>();
  for (const e of events) {
    const label = new Date(e.ts).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(e);
  }
  return Array.from(groups.entries()).map(([dateLabel, evs]) => ({ dateLabel, events: evs }));
}
