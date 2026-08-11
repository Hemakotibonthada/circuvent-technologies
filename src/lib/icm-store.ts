/**
 * Persistence for incidents.
 *
 * The model in icm.ts is pure — it takes an incident and returns the next one.
 * This is the part that remembers, and the part that hands out IDs.
 *
 * SERVER ONLY.
 */
import { createFileStore } from "./data-file";
import { planFromAlerts } from "./icm-bridge";
import type { Alert } from "./anomaly-monitor";
import {
  createIncident,
  queue,
  stats,
  type Filters,
  type Incident,
  type NewIncident,
} from "./icm";

interface IcmDB {
  incidents: Incident[];
  /** Monotonic counter behind the human-facing ID. */
  seq: number;
  teams: string[];
}

/*
 * Seeded with the teams this platform actually has, so the routing dropdown is
 * not empty on first use. Editable from the UI; the list is only a convenience.
 */
const DEFAULT_TEAMS = [
  "Platform",
  "Control Plane",
  "Firmware",
  "Mobile",
  "Web",
  "Networking",
  "Data",
  "Support",
];

const store = createFileStore<IcmDB>("admin-icm.json", () => ({
  incidents: [],
  seq: 0,
  teams: [...DEFAULT_TEAMS],
}));

/**
 * Incident IDs are sequential and human-quotable: INC-1043.
 *
 * People read these out on calls and paste them into chat, so a UUID would be
 * actively hostile. The counter lives in the same document as the incidents, so
 * it cannot drift from them.
 */
function nextId(db: IcmDB): string {
  db.seq += 1;
  return `INC-${String(db.seq).padStart(4, "0")}`;
}

export function listIncidents(): Incident[] {
  return store.read().incidents;
}

export function getIncident(id: string): Incident | null {
  return store.read().incidents.find((i) => i.id === id) ?? null;
}

export function listTeams(): string[] {
  return store.read().teams;
}

export function fileIncident(input: NewIncident, now = new Date().toISOString()): Incident {
  return store.mutate((db) => {
    const inc = createIncident(nextId(db), input, now);
    /* Newest first in storage as well as in the queue, so a truncated read
       still shows the incidents anybody is likely to want. */
    db.incidents.unshift(inc);
    if (inc.owningTeam && !db.teams.includes(inc.owningTeam)) db.teams.push(inc.owningTeam);
    return inc;
  });
}

/**
 * Applies a transition from icm.ts and persists the result.
 *
 * The caller supplies the pure function; this only handles finding the record,
 * writing it back, and reporting what happened. Keeping the decision out here
 * is what lets every rule in icm.ts be tested without a filesystem.
 */
export function updateIncident(
  id: string,
  apply: (inc: Incident) => { incident: Incident; error: string }
): { incident: Incident | null; error: string } {
  return store.mutate((db) => {
    const idx = db.incidents.findIndex((i) => i.id === id);
    if (idx < 0) return { incident: null, error: "No such incident." };

    const result = apply(db.incidents[idx]);
    if (result.error) return { incident: db.incidents[idx], error: result.error };

    db.incidents[idx] = result.incident;
    if (result.incident.owningTeam && !db.teams.includes(result.incident.owningTeam)) {
      db.teams.push(result.incident.owningTeam);
    }
    return { incident: result.incident, error: "" };
  });
}

/** The queue plus the headline numbers, which is what the panel loads. */
export function icmView(filters: Filters, now = new Date().toISOString()) {
  const all = listIncidents();
  return {
    incidents: queue(all, filters, now),
    stats: stats(all, now),
    teams: listTeams(),
    now,
  };
}

/**
 * Files and closes incidents from a set of monitor alerts.
 *
 * The judgement lives in icm-bridge.ts, which is pure; this is only the part
 * that reads and writes. Returns what changed so a caller — a cron sweep, an
 * admin action — can report it rather than guess.
 */
export function syncFromAlerts(
  alerts: Alert[],
  opts: { owningTeam?: string; now?: string; autoResolve?: boolean } = {}
): { filed: Incident[]; resolved: Incident[] } {
  const now = opts.now ?? new Date().toISOString();
  const plan = planFromAlerts(alerts, listIncidents(), { ...opts, now });

  const filed = plan.toFile.map((input) => fileIncident(input, now));

  const resolved: Incident[] = [];
  for (const next of plan.toUpdate) {
    /*
     * Written back by id rather than wholesale, so a change made by a person
     * between the plan being computed and applied is not silently overwritten —
     * the transition is recomputed against whatever is in the store now.
     */
    const r = updateIncident(next.id, (current) =>
      current.acknowledgedAt
        ? { incident: current, error: "Somebody picked it up while this ran." }
        : { incident: next, error: "" }
    );
    if (r.incident && !r.error) resolved.push(r.incident);
  }

  return { filed, resolved };
}

export function isDurable(): boolean {
  return store.isDurable();
}
