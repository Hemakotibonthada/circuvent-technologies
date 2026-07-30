/**
 * Fleet analysis — correlation across every device on the platform.
 *
 * This is deliberately NOT the same thing as `useFleetInsights` in the admin
 * console, which counts devices by type/room/firmware/owner. Counts describe;
 * this module *correlates*, and the difference matters operationally:
 *
 *   "42 devices offline"                        <- a count. Now what?
 *   "all 6 of alice@x.com's devices are offline" <- her site is down, not our fleet
 *   "camera on 1.2.0 is 71% offline vs 8% fleet" <- that release is bad, roll it back
 *
 * Every finding is arithmetic over fields the control plane actually returns
 * (GET /admin/devices). No model is involved and nothing is inferred that the
 * data cannot support.
 *
 * The thresholds below exist to stop the panel crying wolf. A group of two
 * devices that both happen to be offline is not evidence of a systemic fault,
 * so subgroup rules require a minimum sample AND a rate meaningfully above the
 * fleet baseline before they fire.
 */

import type { AdminDevice } from "@/lib/control-plane";
import type { Finding, Severity } from "./analysis";

/** A device claiming to be online that has not reported for this long is lying. */
export const STALE_MINUTES = 30;
/** Smallest subgroup we are willing to call "systemic". */
export const MIN_GROUP = 4;
/** A subgroup must be at least this bad in absolute terms. */
export const GROUP_FAIL_RATE = 0.5;
/** ...and this many times worse than the rest of the fleet. */
export const GROUP_FAIL_MULTIPLE = 2;
/** Fleet-wide offline rate that suggests infrastructure rather than devices. */
export const FLEET_DEGRADED_RATE = 0.35;

/** State keys that indicate the device is reporting an active fault. */
const FAULT_FLAGS = ["fault", "error", "tamper", "leak", "overcurrent", "overheat"];

export interface FleetAnalysis {
  findings: Finding[];
  counts: {
    total: number;
    online: number;
    offline: number;
    stale: number;
    neverSeen: number;
    owners: number;
    firmwareVersions: number;
  };
  generatedAt: string;
}

function minutesSince(iso: string | null | undefined, now: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return null;
  return Math.max(0, (now - t) / 60000);
}

function activeFaults(state: Record<string, unknown> | undefined): string[] {
  if (!state) return [];
  return FAULT_FLAGS.filter((f) => state[f] === true);
}

function groupBy<T>(rows: T[], key: (r: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const cur = m.get(k);
    if (cur) cur.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/**
 * Owners whose entire estate is dark.
 *
 * When every device at one site is offline the common cause is that site's
 * internet or power, not N independent device failures. Surfacing it this way
 * stops support chasing individual devices. Single-device owners are excluded
 * because one offline device is not a pattern.
 */
export function findSiteOutages(devices: AdminDevice[]): Finding[] {
  const owned = devices.filter((d) => d.owner_id !== null);
  const out: Finding[] = [];
  for (const [email, rows] of groupBy(owned, (d) => d.owner_email ?? `owner:${d.owner_id}`)) {
    if (rows.length < 2) continue;
    if (rows.some((d) => d.online)) continue;
    out.push({
      id: `fleet-site-outage:${email}`,
      severity: rows.length >= 4 ? "critical" : "warning",
      title: `All ${rows.length} devices offline for ${email}`,
      detail:
        `Every device registered to ${email} is offline at once. That points at connectivity ` +
        `or power at the site rather than ${rows.length} independent device failures.`,
      deviceIds: rows.map((d) => d.id),
      evidence: { devices: rows.length, owner: email },
      suggestion: "Check the site's internet before dispatching hardware replacements.",
    });
  }
  return out.sort((a, b) => b.deviceIds.length - a.deviceIds.length);
}

/**
 * Subgroups failing far more than the rest of the fleet.
 *
 * The comparison is against the *rest* of the fleet, not the whole fleet —
 * including the suspect group in its own baseline dilutes exactly the signal
 * being tested for, and the effect gets worse the bigger the problem is.
 */
export function findConcentratedFailures(
  devices: AdminDevice[],
  key: (d: AdminDevice) => string,
  label: string,
  idPrefix: string,
): Finding[] {
  if (devices.length < MIN_GROUP) return [];
  const out: Finding[] = [];

  for (const [group, rows] of groupBy(devices, key)) {
    if (rows.length < MIN_GROUP) continue;
    const offline = rows.filter((d) => !d.online);
    if (offline.length < 3) continue;

    const rate = offline.length / rows.length;
    if (rate < GROUP_FAIL_RATE) continue;

    const others = devices.filter((d) => key(d) !== group);
    // With no comparison group there is no baseline, so there is nothing to
    // call "concentrated" — a single-group fleet is just the fleet.
    if (others.length === 0) continue;
    const baseline = others.filter((d) => !d.online).length / others.length;
    if (rate < baseline * GROUP_FAIL_MULTIPLE) continue;

    out.push({
      id: `${idPrefix}:${group}`,
      severity: "critical",
      title: `${label} "${group}" is failing at ${Math.round(rate * 100)}%`,
      detail:
        `${offline.length} of ${rows.length} devices with ${label.toLowerCase()} "${group}" are offline ` +
        `(${Math.round(rate * 100)}%), against ${Math.round(baseline * 100)}% across the rest of the fleet. ` +
        `A failure this concentrated is usually systemic rather than coincidental.`,
      deviceIds: offline.map((d) => d.id),
      evidence: {
        group,
        offline: offline.length,
        inGroup: rows.length,
        groupOfflinePct: Math.round(rate * 100),
        fleetOfflinePct: Math.round(baseline * 100),
      },
      suggestion:
        idPrefix === "fleet-bad-firmware"
          ? "Compare against the previous firmware and consider halting or rolling back this release."
          : "Check whether these units share a hardware revision, gateway or broker route.",
    });
  }
  return out;
}

/**
 * Devices flagged online that stopped reporting.
 *
 * This is a contradiction in our own data: the broker believes the session is
 * alive while the device has gone quiet. It usually means a last-will message
 * was never delivered, so the console shows a device as controllable when it
 * is not — worse than showing it offline.
 */
export function findStaleSessions(devices: AdminDevice[], now = Date.now()): Finding[] {
  const stale = devices.filter((d) => {
    if (!d.online) return false;
    const mins = minutesSince(d.last_seen, now);
    return mins !== null && mins > STALE_MINUTES;
  });
  if (stale.length === 0) return [];
  const worst = Math.round(
    Math.max(...stale.map((d) => minutesSince(d.last_seen, now) ?? 0)),
  );
  return [{
    id: "fleet-stale-sessions",
    severity: stale.length >= 5 ? "critical" : "warning",
    title: `${stale.length} ${stale.length === 1 ? "device is" : "devices are"} marked online but silent`,
    detail:
      `These devices are flagged online yet have not reported for over ${STALE_MINUTES} minutes ` +
      `(worst: ${worst} minutes). The console will offer controls that cannot reach them.`,
    deviceIds: stale.map((d) => d.id),
    evidence: { devices: stale.length, worstMinutes: worst, thresholdMinutes: STALE_MINUTES },
    suggestion: "Check broker last-will handling and the keepalive interval in firmware.",
  }];
}

/** Registered devices that have never once reported — provisioning that never completed. */
export function findNeverSeen(devices: AdminDevice[]): Finding[] {
  const never = devices.filter((d) => !d.last_seen);
  if (never.length === 0) return [];
  return [{
    id: "fleet-never-seen",
    severity: "info",
    title: `${never.length} ${never.length === 1 ? "device has" : "devices have"} never reported`,
    detail:
      `These devices exist in the database but have never sent telemetry, so provisioning ` +
      `most likely stopped after registration and before the first connection.`,
    deviceIds: never.map((d) => d.id),
    evidence: { devices: never.length },
    suggestion: "Confirm these units were actually shipped and completed Wi-Fi setup.",
  }];
}

/** Devices actively reporting a fault flag in their own state. */
export function findFaultedDevices(devices: AdminDevice[]): Finding[] {
  const faulted = devices
    .map((d) => ({ d, faults: activeFaults(d.state) }))
    .filter((x) => x.faults.length > 0);
  if (faulted.length === 0) return [];
  const kinds = [...new Set(faulted.flatMap((x) => x.faults))].sort();
  return [{
    id: "fleet-faults",
    severity: "critical",
    title: `${faulted.length} ${faulted.length === 1 ? "device is" : "devices are"} reporting a fault`,
    detail: `Active fault flags across the fleet: ${kinds.join(", ")}.`,
    deviceIds: faulted.map((x) => x.d.id),
    evidence: { devices: faulted.length, flags: kinds.join(",") },
    suggestion: "Triage tamper and leak flags first — those are safety-relevant.",
  }];
}

/** Whole-fleet degradation, which points at our infrastructure rather than devices. */
export function findFleetDegradation(devices: AdminDevice[]): Finding[] {
  if (devices.length < MIN_GROUP) return [];
  const offline = devices.filter((d) => !d.online).length;
  const rate = offline / devices.length;
  if (rate < FLEET_DEGRADED_RATE) return [];
  return [{
    id: "fleet-degraded",
    severity: rate >= 0.6 ? "critical" : "warning",
    title: `${Math.round(rate * 100)}% of the fleet is offline`,
    detail:
      `${offline} of ${devices.length} devices are offline simultaneously. At this scale the ` +
      `common cause is usually the broker, DNS or certificates rather than the devices.`,
    deviceIds: [],
    evidence: { offline, total: devices.length, offlinePct: Math.round(rate * 100) },
    suggestion: "Check broker reachability and TLS certificate expiry before triaging devices.",
  }];
}

/** Firmware spread — a long tail makes every future rollout riskier. */
export function findFirmwareFragmentation(devices: AdminDevice[]): Finding[] {
  const versions = new Map<string, number>();
  for (const d of devices) {
    const v = (d.fw_version || "").trim();
    if (!v) continue;
    versions.set(v, (versions.get(v) ?? 0) + 1);
  }
  if (versions.size < 4) return [];
  const sorted = [...versions.entries()].sort((a, b) => b[1] - a[1]);
  return [{
    id: "fleet-fw-fragmentation",
    severity: "info",
    title: `${versions.size} firmware versions in the field`,
    detail:
      `The fleet is spread across ${versions.size} firmware versions. The most common is ` +
      `${sorted[0][0]} on ${sorted[0][1]} devices. Every extra version is another combination ` +
      `to support and regression-test.`,
    deviceIds: [],
    evidence: {
      versions: versions.size,
      mostCommon: sorted[0][0],
      mostCommonCount: sorted[0][1],
    },
    suggestion: "Run an OTA campaign to consolidate the long tail.",
  }];
}

const RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };

export function analyseFleet(devices: AdminDevice[], now = Date.now()): FleetAnalysis {
  const rows = Array.isArray(devices) ? devices : [];

  const findings = [
    ...findFleetDegradation(rows),
    ...findFaultedDevices(rows),
    ...findSiteOutages(rows),
    ...findConcentratedFailures(rows, (d) => d.fw_version || "unknown", "Firmware", "fleet-bad-firmware"),
    ...findConcentratedFailures(rows, (d) => d.type || "unknown", "Device type", "fleet-bad-type"),
    ...findStaleSessions(rows, now),
    ...findNeverSeen(rows),
    ...findFirmwareFragmentation(rows),
  ].sort((a, b) => RANK[a.severity] - RANK[b.severity]);

  const owners = new Set(rows.map((d) => d.owner_email ?? `owner:${d.owner_id}`).filter(Boolean));
  const fwVersions = new Set(rows.map((d) => (d.fw_version || "").trim()).filter(Boolean));

  return {
    findings,
    counts: {
      total: rows.length,
      online: rows.filter((d) => d.online).length,
      offline: rows.filter((d) => !d.online).length,
      stale: rows.filter((d) => {
        if (!d.online) return false;
        const m = minutesSince(d.last_seen, now);
        return m !== null && m > STALE_MINUTES;
      }).length,
      neverSeen: rows.filter((d) => !d.last_seen).length,
      owners: owners.size,
      firmwareVersions: fwVersions.size,
    },
    generatedAt: new Date(now).toISOString(),
  };
}

/** Compact text rendering for the admin assistant's prompt context. */
export function fleetToPromptContext(a: FleetAnalysis): string {
  const lines = [
    `Fleet: ${a.counts.total} devices, ${a.counts.online} online, ${a.counts.offline} offline, ` +
    `${a.counts.owners} owners, ${a.counts.firmwareVersions} firmware versions.`,
  ];
  if (a.counts.stale > 0) lines.push(`${a.counts.stale} devices are online but silent.`);
  if (a.counts.neverSeen > 0) lines.push(`${a.counts.neverSeen} devices have never reported.`);
  if (a.findings.length === 0) lines.push("No fleet-level findings.");
  else {
    lines.push("Findings:");
    for (const f of a.findings) lines.push(`- [${f.severity}] ${f.title}. ${f.detail}`);
  }
  return lines.join("\n");
}
