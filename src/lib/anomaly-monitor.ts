/**
 * Turn one-shot detection into monitoring.
 *
 * The detectors in ai/analysis.ts are good and they are pull-only: analyseHome
 * runs when somebody opens a page and asks. So a hub can be offline for three
 * days and the system will describe it perfectly — the first time anyone looks.
 * Detection that nobody is present for is not monitoring.
 *
 * What is missing between a finding and an alert is state. Without it, polling
 * every few minutes means either re-announcing the same dead device forever, or
 * announcing nothing because the finding is not new. So each finding gets a
 * stable fingerprint, and the same underlying problem stays one alert across
 * every evaluation: raised once, counted while it persists, and closed by
 * itself when the finding stops appearing.
 *
 * Auto-resolution is the part worth being careful about. An alert a human has
 * to dismiss becomes an alert everybody ignores; if the device came back, the
 * alert should close on its own and say when. But absence of a finding is not
 * always recovery — it is also what a failed evaluation looks like — so a
 * sweep that produced nothing at all resolves nothing.
 *
 * Pure and storage-agnostic: it takes the previous state and the current
 * findings and returns the next state. Nothing here reads a clock it was not
 * given or writes a file.
 */
import type { Finding, Severity } from "./ai/analysis";

export type AlertState = "open" | "acknowledged" | "resolved";

export interface Alert {
  /** Stable across evaluations for the same underlying problem. */
  fingerprint: string;
  severity: Severity;
  title: string;
  detail: string;
  deviceIds: string[];
  evidence: Record<string, number | string | boolean>;
  suggestion?: string;

  state: AlertState;
  firstSeenAt: string;
  lastSeenAt: string;
  /** How many evaluations have seen it. A stuck problem is more urgent than a flapping one. */
  occurrences: number;
  resolvedAt?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  /** When a notification was last sent, so a persistent alert does not notify on every sweep. */
  notifiedAt?: string;
}

export interface SweepResult {
  alerts: Alert[];
  /** Alerts raised for the first time in this sweep. */
  opened: Alert[];
  /** Alerts that closed because the finding stopped appearing. */
  resolved: Alert[];
  /** Alerts whose severity increased since the last sweep. */
  escalated: Alert[];
  /** Alerts that should produce a notification now. */
  toNotify: Alert[];
}

const SEVERITY_RANK: Record<Severity, number> = { info: 0, warning: 1, critical: 2 };

/** Don't notify about the same ongoing alert more often than this. */
export const RENOTIFY_AFTER_MS = 12 * 60 * 60 * 1000;

/** Keep resolved alerts visible for a while so a fixed problem is still reviewable. */
export const RESOLVED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Identify a problem, not an occurrence of it.
 *
 * The finding id alone is not enough: several detectors emit ids that include
 * a timestamp or an index, so the same dead device would fingerprint
 * differently on every sweep and alert forever. Keying on the detector plus the
 * devices it is about means "hub-a1b2c3 is offline" is one problem whether it
 * is seen once or a thousand times.
 */
export function fingerprint(f: Finding): string {
  const kind = String(f.id || "")
    .replace(/[0-9]{6,}/g, "") // embedded timestamps
    .replace(/[:#][0-9]+$/g, "") // trailing indices
    .replace(/-+$/g, "")
    .trim();
  const devices = [...(f.deviceIds || [])].map((d) => String(d).trim().toLowerCase()).sort().join(",");
  return `${kind || "finding"}::${devices}`;
}

function alertFromFinding(f: Finding, now: string): Alert {
  return {
    fingerprint: fingerprint(f),
    severity: f.severity,
    title: f.title,
    detail: f.detail,
    deviceIds: [...(f.deviceIds || [])],
    evidence: { ...(f.evidence || {}) },
    suggestion: f.suggestion,
    state: "open",
    firstSeenAt: now,
    lastSeenAt: now,
    occurrences: 1,
  };
}

/**
 * Fold this evaluation's findings into the alerts already known.
 *
 * `sweepProducedFindings` distinguishes "everything is fine" from "the
 * evaluation did not run": a detector that threw, a device list that failed to
 * load, or a control plane that timed out all produce zero findings, and
 * closing every open alert on that basis would report a fleet-wide recovery
 * that did not happen.
 */
export function sweep(
  previous: Alert[],
  findings: Finding[],
  opts: { now?: number; sweepProducedFindings?: boolean; renotifyAfterMs?: number } = {}
): SweepResult {
  const nowMs = opts.now ?? Date.now();
  const now = new Date(nowMs).toISOString();
  const renotifyAfter = opts.renotifyAfterMs ?? RENOTIFY_AFTER_MS;
  // Default to trusting the sweep only when it actually found something; a
  // caller that knows the evaluation succeeded can say so explicitly.
  const trustEmpty = opts.sweepProducedFindings ?? findings.length > 0;

  const byFingerprint = new Map<string, Alert>();
  for (const a of previous) byFingerprint.set(a.fingerprint, { ...a });

  const seen = new Set<string>();
  const opened: Alert[] = [];
  const escalated: Alert[] = [];

  for (const f of findings) {
    const fp = fingerprint(f);
    seen.add(fp);
    const existing = byFingerprint.get(fp);

    if (!existing || existing.state === "resolved") {
      // A problem that comes back after being resolved is a new alert, not a
      // continuation — otherwise "first seen" would point at an incident that
      // was genuinely fixed weeks ago.
      const fresh = alertFromFinding(f, now);
      byFingerprint.set(fp, fresh);
      opened.push(fresh);
      continue;
    }

    const before = existing.severity;
    existing.lastSeenAt = now;
    existing.occurrences += 1;
    existing.severity = f.severity;
    existing.title = f.title;
    existing.detail = f.detail;
    existing.evidence = { ...(f.evidence || {}) };
    existing.suggestion = f.suggestion;
    existing.deviceIds = [...(f.deviceIds || [])];

    if (SEVERITY_RANK[f.severity] > SEVERITY_RANK[before]) {
      // Getting worse re-opens an acknowledged alert: somebody accepted the
      // warning, not the critical it turned into.
      if (existing.state === "acknowledged") {
        existing.state = "open";
        existing.acknowledgedAt = undefined;
        existing.acknowledgedBy = undefined;
      }
      escalated.push(existing);
    }
  }

  const resolved: Alert[] = [];
  if (trustEmpty) {
    for (const a of byFingerprint.values()) {
      if (a.state !== "resolved" && !seen.has(a.fingerprint)) {
        a.state = "resolved";
        a.resolvedAt = now;
        resolved.push(a);
      }
    }
  }

  // Notify for anything newly open or newly worse, and for a persistent alert
  // whose reminder has come due. Info-level findings never page anybody.
  const toNotify: Alert[] = [];
  for (const a of byFingerprint.values()) {
    if (a.state !== "open") continue;
    if (a.severity === "info") continue;
    const isNew = opened.includes(a);
    const isWorse = escalated.includes(a);
    const due = !a.notifiedAt || nowMs - new Date(a.notifiedAt).getTime() >= renotifyAfter;
    if (isNew || isWorse || due) {
      a.notifiedAt = now;
      toNotify.push(a);
    }
  }

  const alerts = [...byFingerprint.values()].filter(
    (a) => a.state !== "resolved" || nowMs - new Date(a.resolvedAt || a.lastSeenAt).getTime() < RESOLVED_RETENTION_MS
  );

  return { alerts: sortAlerts(alerts), opened, resolved, escalated, toNotify };
}

/** Worst and freshest first — the order somebody triaging would want. */
export function sortAlerts(alerts: Alert[]): Alert[] {
  return [...alerts].sort((a, b) => {
    if (a.state !== b.state) {
      const rank = { open: 0, acknowledged: 1, resolved: 2 } as const;
      return rank[a.state] - rank[b.state];
    }
    if (a.severity !== b.severity) return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    return b.lastSeenAt.localeCompare(a.lastSeenAt);
  });
}

/** Acknowledge an alert. Silences the reminder without pretending it is fixed. */
export function acknowledge(alerts: Alert[], fingerprintValue: string, by: string, now = Date.now()): Alert[] {
  return alerts.map((a) =>
    a.fingerprint === fingerprintValue && a.state === "open"
      ? { ...a, state: "acknowledged" as const, acknowledgedAt: new Date(now).toISOString(), acknowledgedBy: by }
      : a
  );
}

export interface AlertSummary {
  open: number;
  critical: number;
  warning: number;
  acknowledged: number;
  resolved: number;
  worst: Severity | null;
}

export function summarise(alerts: Alert[]): AlertSummary {
  const open = alerts.filter((a) => a.state === "open");
  return {
    open: open.length,
    critical: open.filter((a) => a.severity === "critical").length,
    warning: open.filter((a) => a.severity === "warning").length,
    acknowledged: alerts.filter((a) => a.state === "acknowledged").length,
    resolved: alerts.filter((a) => a.state === "resolved").length,
    worst: open.length ? open.reduce((w, a) => (SEVERITY_RANK[a.severity] > SEVERITY_RANK[w] ? a.severity : w), "info" as Severity) : null,
  };
}

/** How long an alert has been going on, for display. */
export function alertAgeMs(a: Alert, now = Date.now()): number {
  return Math.max(0, now - new Date(a.firstSeenAt).getTime());
}
