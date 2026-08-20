/**
 * The two decisions in an OTA rollout that determine what happens to hardware.
 *
 * Kept out of the page because they are the parts worth testing: a wrong
 * canary size means a bad build reaches more devices than intended, and a
 * wrong rollback classification means an operator believes they have undone a
 * release that some units are still running.
 */

/**
 * How many devices a canary goes to.
 *
 * A tenth of the matching fleet, never fewer than one and never more than
 * five. The cap matters more than the ratio: the point of a canary is that if
 * the build is bad you have broken a handful of devices you can go and fix,
 * not a tenth of every unit in the field.
 */
export function canarySize(total: number): number {
  if (total <= 0) return 0;
  return Math.max(1, Math.min(5, Math.round(total * 0.1)));
}

export interface RollbackCandidate {
  id: string;
  name: string;
  /** The version this device was on before the push being undone. */
  priorVersion?: string;
}

export interface RollbackBuild {
  deviceType: string;
  version: string;
  url?: string;
}

export interface RollbackPlan {
  can: { id: string; name: string; to: string; url: string }[];
  cannot: { id: string; name: string; why: string }[];
}

/**
 * Which devices can actually return to their previous build, and which cannot.
 *
 * Rolling back needs two things: the version the device was on before the push
 * — snapshotted at push time, because once devices report in it is gone — and
 * a build in the catalogue that still serves it. The second can simply be
 * absent: old builds get deleted, and then there is no artefact to send.
 *
 * Those devices are named rather than dropped. Silently rolling back "most" of
 * a fleet leaves an operator believing a bad release is undone while some units
 * still run it, which is the worst of the three options; refusing the whole
 * rollback because one device is unrecoverable would block recovering all the
 * others, which is the second worst.
 */
export function classifyRollback(
  devices: RollbackCandidate[],
  deviceType: string,
  catalogue: RollbackBuild[]
): RollbackPlan {
  const can: RollbackPlan["can"] = [];
  const cannot: RollbackPlan["cannot"] = [];

  for (const d of devices) {
    const name = d.name || d.id;
    if (!d.priorVersion) {
      cannot.push({ id: d.id, name, why: "was not reporting a version when this went out" });
      continue;
    }
    const build = catalogue.find((f) => f.deviceType === deviceType && f.version === d.priorVersion);
    if (!build?.url) {
      cannot.push({ id: d.id, name, why: `${d.priorVersion} is no longer in the catalogue` });
      continue;
    }
    can.push({ id: d.id, name, to: d.priorVersion, url: build.url });
  }

  return { can, cannot };
}
